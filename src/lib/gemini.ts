import sharp from "sharp";

/**
 * Gemini 2.5 Flash Image ("Nano Banana") — 삽화 생성.
 *
 * 인수인계 문서의 원가 근거가 이 모델이다: 장당 약 $0.039(₩55), 8쪽 책이
 * 캐릭터 시트 포함 9장 ≈ ₩500. 문서의 경고대로 첫 라이브 호출에서 응답 파싱이
 * 어긋날 수 있어, 파싱을 관대하게(inlineData/inline_data 양쪽) 잡아둔다.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * 그림을 어느 엔진으로 그릴지 — .env.local의 IMAGE_PROVIDER. 안 적으면 gemini.
 * openai면 openai-image.ts(gpt-image-1)로 간다. 라우트·스크립트는 그대로 generateImage를 부른다.
 */
export function imageProvider(): "gemini" | "openai" {
  return process.env.IMAGE_PROVIDER?.trim().toLowerCase() === "openai" ? "openai" : "gemini";
}

export class GeminiError extends Error {
  readonly status?: number;
  /** 서버가 "이만큼 뒤에 다시 오라"고 알려준 값(초). 재시도 간격에 쓴다. */
  retryAfter?: string | null;
  /**
   * 하루치 할당량을 다 쓴 경우.
   *
   * 같은 429라도 '지금 몰림(분당 한도)'은 조금 기다리면 되지만, '오늘 다 씀(일일 한도)'은
   * 몇 번을 기다려도 안 된다. 구분하지 않으면 될 리 없는 재시도로 시간만 버리고,
   * 부모에게는 "왜 안 되는지" 아무 말도 못 해 준다.
   */
  quotaExhausted?: boolean;
  /**
   * 그림 없이 끝난 답 — 안전 검사로 멈췄거나(finishReason IMAGE_SAFETY·PROHIBITED_CONTENT …) 글만 왔다.
   * 값은 finishReason(없으면 'NO_IMAGE'). 가족 캐릭터 사진 그리기가 '이 사진으로는 못 그렸어요'를 가르는 데 쓴다.
   */
  noImage?: string;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = "GeminiError";
  }
}

export type GeneratedImage = {
  mimeType: string;
  /** base64 원문. 클라이언트에는 data URL로 내려준다. */
  data: string;
};

export type IllustrationCheck = {
  /** 검사에서 잘못을 찾지 못했나. checked=false면 이 값은 '모름'이라는 뜻이다. */
  ok: boolean;
  /**
   * 검사를 **실제로 했나**.
   *
   * 예전엔 키가 없거나·서버가 5xx를 주거나·답을 못 읽어도 `ok: true`로 돌려줘서
   * '검사 통과'와 '검사 못 함'이 구분되지 않았다. 그 그림이 책 전체의 그림체·장소
   * 기준이 되어 오류가 6쪽으로 번졌다. 이제 못 한 것은 못 했다고 말한다.
   */
  checked: boolean;
  issues: string;
};

/** 가장자리의 연속된 흰색 띠를 픽셀로 검사한다. 구름·하늘 같은 부분적 흰색은 통과한다. */
export async function detectBlankCanvasBorder(image: GeneratedImage): Promise<string | null> {
  try {
    const { data, info } = await sharp(Buffer.from(image.data, "base64"))
      // 투명한 띠도 흰 띠로 본다 — removeAlpha 는 투명 칸을 검정으로 남겨 못 잡았다.
      // 화면에서는 투명 칸이 뒤 바탕(흰색)으로 비쳐 똑같이 흰 테두리로 보인다.
      .flatten({ background: "#ffffff" })
      .resize(160, 120, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const white = (x: number, y: number) => {
      const at = (y * info.width + x) * channels;
      const r = data[at];
      const g = data[at + 1];
      const b = data[at + 2];
      return r >= 238 && g >= 238 && b >= 238 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;
    };
    const rowWhiteRatio = (y: number) => {
      let count = 0;
      for (let x = 0; x < info.width; x++) if (white(x, y)) count++;
      return count / info.width;
    };
    const colWhiteRatio = (x: number) => {
      let count = 0;
      for (let y = 0; y < info.height; y++) if (white(x, y)) count++;
      return count / info.height;
    };
    const band = (length: number, ratioAt: (n: number) => number, reverse = false) => {
      let continuous = 0;
      const limit = Math.ceil(length * 0.12);
      for (let n = 0; n < limit; n++) {
        const at = reverse ? length - 1 - n : n;
        if (ratioAt(at) < 0.92) break;
        continuous++;
      }
      return continuous;
    };
    const edges = [
      ["top", band(info.height, rowWhiteRatio)],
      ["bottom", band(info.height, rowWhiteRatio, true)],
      ["left", band(info.width, colWhiteRatio)],
      ["right", band(info.width, colWhiteRatio, true)],
    ] as const;
    const broken = edges.filter(([, pixels]) => pixels >= 2).map(([edge]) => edge);
    return broken.length > 0
      ? `Unpainted white canvas band detected on the ${broken.join(", ")} edge(s). The artwork must reach every canvas edge.`
      : null;
  } catch {
    return null;
  }
}

/**
 * 감지된 흰 테두리를 잘라낸 뒤 원래 픽셀 크기와 비율로 **확대해** 채운다. 추가 AI 호출은 없다.
 *
 * **띠만 정확히 잰다.** 예전엔 sharp.trim 으로 잘랐는데, trim 은 흰 띠 옆의 밝은 크림색 벽·냉장고·
 * 흐린 하늘까지 이어서 먹는다. 그러면 잘림이 상한(12%)을 넘어 '원본 유지'로 빠졌고, 흰 띠가
 * 그대로 책에 들어갔다(2026-09-15 하온이 소풍 1쪽 — 왼쪽·위 흰 띠, 옆이 크림색 부엌 벽).
 * 이제 가장자리부터 **줄 전체가 거의 다 흰(또는 투명한) 줄**만 세어 띠 두께를 정한다 —
 * 줄 한가운데 그림이 조금이라도 있으면 거기서 멈추므로 밝은 벽을 띠로 먹지 않는다.
 *
 * **상한은 여전히 둔다.** 띠가 한 변의 20%를 넘으면 확대로 가리기엔 그림이 너무 많이 잘린다
 * (가장자리 아이가 사라진다). 그때는 손대지 않고, 부르는 쪽이 다시 그리게 한다.
 */
const MAX_BORDER_TRIM_RATIO = 0.2;
/** 띠 경계의 흐릿한 줄(안티앨리어싱)까지 가리려고 띠보다 조금 더 자른다 — 한 변의 0.6%. */
const BORDER_TRIM_MARGIN_RATIO = 0.006;

/** 가장자리마다 '거의 다 흰 줄'이 몇 픽셀 이어지나 — 원본 해상도로 센다. */
export async function measureBlankBands(
  image: GeneratedImage,
): Promise<{ width: number; height: number; top: number; bottom: number; left: number; right: number } | null> {
  try {
    const { data, info } = await sharp(Buffer.from(image.data, "base64"))
      .flatten({ background: "#ffffff" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const white = (x: number, y: number) => {
      const at = (y * width + x) * channels;
      const r = data[at];
      const g = data[at + 1];
      const b = data[at + 2];
      return r >= 236 && g >= 236 && b >= 236 && Math.max(r, g, b) - Math.min(r, g, b) <= 14;
    };
    const rowBlank = (y: number) => {
      let n = 0;
      for (let x = 0; x < width; x++) if (white(x, y)) n++;
      return n / width >= 0.97;
    };
    const colBlank = (x: number) => {
      let n = 0;
      for (let y = 0; y < height; y++) if (white(x, y)) n++;
      return n / height >= 0.97;
    };
    // 한 변의 절반까지만 센다 — 통째로 흰 그림에서 끝없이 돌지 않게.
    const run = (length: number, blank: (n: number) => boolean, reverse: boolean) => {
      let count = 0;
      while (count < Math.floor(length / 2) && blank(reverse ? length - 1 - count : count)) count++;
      return count;
    };
    return {
      width,
      height,
      top: run(height, rowBlank, false),
      bottom: run(height, rowBlank, true),
      left: run(width, colBlank, false),
      right: run(width, colBlank, true),
    };
  } catch {
    return null;
  }
}

export async function repairBlankCanvasBorder(image: GeneratedImage): Promise<GeneratedImage> {
  try {
    const bands = await measureBlankBands(image);
    if (!bands) return image;
    const { width, height } = bands;
    if (!bands.top && !bands.bottom && !bands.left && !bands.right) return image; // 자를 게 없었다
    const pad = (band: number, side: number) => (band > 0 ? Math.ceil(band + side * BORDER_TRIM_MARGIN_RATIO) : 0);
    const top = pad(bands.top, height);
    const bottom = pad(bands.bottom, height);
    const left = pad(bands.left, width);
    const right = pad(bands.right, width);
    if (
      left + right > width * MAX_BORDER_TRIM_RATIO ||
      top + bottom > height * MAX_BORDER_TRIM_RATIO
    ) {
      // 여백이 너무 두껍다 — 확대하면 가장자리 인물이 잘린다. 다시 그리게 둔다.
      console.warn("[repairBlankCanvasBorder] 흰 여백이 너무 두꺼워 원본 유지", { ...bands });
      return image;
    }
    const repaired = await sharp(Buffer.from(image.data, "base64"))
      .flatten({ background: "#ffffff" })
      .extract({ left, top, width: width - left - right, height: height - top - bottom })
      // 원래 크기·비율로 확대해 채운다. 잘린 양이 가로·세로 다르면 cover 가 가운데를 기준으로 맞춘다.
      .resize(width, height, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    return { mimeType: "image/png", data: repaired.toString("base64") };
  } catch {
    return image;
  }
}

type Part = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

/* ── 일시적 실패 재시도 ──
 * 예전엔 재시도가 없어서, Gemini가 429(요청 몰림)를 한 번만 뱉어도 그 쪽 그림이
 * 그대로 실패했다. 동시에 세 장씩 요청하는 구조라 429는 드물지 않다.
 * 실패한 호출은 과금되지 않으므로, 다시 부르는 것은 비용이 늘지 않는다.
 */
const IMAGE_ATTEMPTS = 5;
const RETRY_BASE_MS = 800;
/** 한 장이 이보다 오래 붙들려 있지 않게 — 다시 시도하다 만들기가 통째로 늘어지면 안 된다. */
const RETRY_DEADLINE_MS = 60_000;
/*
 * 몰림(429)은 따로 잰다.
 *
 * 예전엔 429도 0.8초 → 1.6초로 세 번 걸고 포기했다. 그런데 Gemini의 분당 한도는
 * "30초쯤 뒤에 다시 오라"고 답한다 — 3초 만에 포기하니 될 일이 안 됐다.
 * 실제로 이것 때문에 한 권의 2쪽 이후가 통째로 빈 채로 저장됐다.
 */
const RATE_LIMIT_MAX_WAIT_MS = 45_000;
const RATE_LIMIT_DEADLINE_MS = 150_000;

/**
 * 다시 걸어 볼 만한 실패인지.
 *
 * 몰림(429)·서버 문제(5xx)·타임아웃은 잠시 뒤면 되지만, 키가 틀렸거나(401·403)
 * 요청이 잘못됐거나(400) 안전필터에 걸린 것(422)은 몇 번을 해도 같다 — 기다리기만 손해다.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status < 600);
}

/**
 * 다음 시도까지 기다릴 시간(ms).
 *
 * 서버가 Retry-After로 알려주면 그 말을 따르되 10초로 묶는다(더 기다리면 만들기가
 * 멈춘 것처럼 보인다). 없으면 0.8초에서 두 배씩 늘리고, 여러 장이 동시에 실패했을 때
 * 똑같은 순간에 다시 몰리지 않도록 ±30% 흔든다.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter?: string | null,
  maxMs = 10_000,
): number {
  // Gemini는 Retry-After 헤더 대신 본문에 "35s" 꼴로 알려준다 — 그것도 받아들인다.
  const told = parseFloat(String(retryAfter ?? ""));
  if (Number.isFinite(told) && told > 0) return Math.min(told * 1000, maxMs);
  const base = RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 429 응답 본문에서 "얼마나 기다려야 하는지"와 "하루치를 다 썼는지"를 읽는다.
 *
 * 구글은 이 정보를 헤더가 아니라 본문에 넣어 준다:
 *   error.details[] 안에 RetryInfo(retryDelay: "35s")와
 *   QuotaFailure(violations[].quotaId: "...PerMinute" / "...PerDay")가 들어 있다.
 * 이걸 안 읽으면 "그냥 실패"로만 보여서, 기다리면 될 일과 오늘은 안 될 일을 못 가른다.
 */
export function readQuotaHint(body: string): { retryDelay?: string; daily: boolean; spendCap: boolean } {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; details?: Record<string, unknown>[] };
    };
    const details = parsed.error?.details ?? [];
    const typeOf = (d: Record<string, unknown>) => String(d["@type"] ?? "");
    const retryInfo = details.find((d) => typeOf(d).endsWith("RetryInfo"));
    const retryDelay =
      typeof retryInfo?.retryDelay === "string" ? retryInfo.retryDelay : undefined;
    const quotaFailure = details.find((d) => typeOf(d).endsWith("QuotaFailure"));
    const violations = (quotaFailure?.violations ?? []) as Record<string, unknown>[];
    const daily = violations.some((v) =>
      /per\s*day|perday/i.test(`${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`),
    );
    /*
     * 지출 한도·결제 막힘 — 이것도 기다려서 풀리지 않는다.
     *
     * 2026-09-15 운영에서 실제로 났다: "Your project has exceeded its monthly spending cap."
     * 429 RESOURCE_EXHAUSTED 인데 details 가 비어 있어 PerDay 로도 안 걸렸고, 앱은 '잠깐 몰림'으로
     * 읽어 13초씩 헛되이 다시 시도하다 포기했다. 이 경우는 사장님이 AI Studio 에서 한도를 올려야 풀린다.
     */
    const spendCap = /spend(ing)?\s*cap|billing|prepay|credit|exceeded your current quota/i.test(
      String(parsed.error?.message ?? ""),
    );
    return { retryDelay, daily, spendCap };
  } catch {
    // 본문이 JSON이 아니면(프록시 오류 페이지 등) 판단하지 않는다 — 기본 재시도로 간다.
    return { daily: false, spendCap: false };
  }
}

/**
 * Gemini 가 한도·결제로 막혔을 때 OpenAI(gpt-image)로 대신 그릴지.
 *
 * 사장님 요청(2026-09-15): "제미나이가 토큰이 부족하면 GPT 로 생성되게." 막힌 사이 부모의 만들기가
 * 통째로 멈추는 것보다, 값이 조금 더 드는 GPT 로라도 그려 주는 편이 낫다(장당 약 60~100원, Gemini ≈54원).
 * 몰림(분당 한도)·안전필터·요청 오류는 GPT 로 넘기지 않는다 — 기다리면 되거나 GPT 도 같은 결과다.
 * IMAGE_FALLBACK=off 면 넘기지 않는다. OpenAI 키가 없으면 넘길 수 없다.
 */
export function shouldFallbackToOpenAI(
  err: unknown,
  env: { openaiKey?: string | undefined; fallback?: string | undefined },
): boolean {
  return openAIFallbackAvailable(env) && err instanceof GeminiError && err.quotaExhausted === true;
}

/** GPT 로 넘길 수 있는 설정인가 — 키가 있고 IMAGE_FALLBACK=off 가 아니다. */
export function openAIFallbackAvailable(env: { openaiKey?: string | undefined; fallback?: string | undefined }): boolean {
  if (env.fallback?.trim().toLowerCase() === "off") return false;
  return Boolean(env.openaiKey?.trim());
}

/*
 * 한 번 막히면 한동안 Gemini 를 건너뛴다 — 쪽마다 막힌 곳을 다시 두드려 시간을 버리지 않게.
 * 서버 인스턴스 안에서만 기억한다(다른 인스턴스는 한 번 두드려 보고 같은 판단을 한다).
 * 30분 뒤엔 다시 Gemini 를 먼저 해 본다 — 사장님이 한도를 올렸으면 원래대로 돌아가야 한다.
 */
const GEMINI_BLOCK_MS = 30 * 60 * 1000;
let geminiBlockedUntil = 0;
export function geminiBlocked(now = Date.now()): boolean {
  return now < geminiBlockedUntil;
}
/** 시험에서만 쓴다 — 막힘 기억을 지운다. */
export function resetImageFallbackForTests(): void {
  geminiBlockedUntil = 0;
}

export async function generateImage(input: {
  prompt: string;
  /** 참조 이미지(캐릭터 시트 등). 인물 일관성의 핵심이라 매 쪽 재주입한다. */
  references?: GeneratedImage[];
  /** 4:3=태블릿(가로), 3:4=핸드폰(세로), 1:1=캐릭터 시트. Gemini가 네이티브로 지원하는 비율. */
  aspectRatio: "4:3" | "3:4" | "1:1";
  /**
   * 엔진을 이 호출만 못박는다. 'gemini' 를 적으면 IMAGE_PROVIDER 와 상관없이 Gemini 로만 그리고,
   * 한도에 막혀도 GPT 로 넘어가지 않는다(던진다). 안 적으면 지금처럼 IMAGE_PROVIDER + 폴백.
   * 가족 캐릭터가 이렇게 쓴다 — 사장님 결정(2026-09-28): 캐릭터는 제미나이로.
   */
  provider?: "gemini";
  /**
   * 그림 없이 끝난 답(안전 검사 멈춤·글만 옴)을 몇 번까지 해 볼지. 안 적으면 지금처럼 다른 일시적 실패와 같이
   * 다시 건다(IMAGE_ATTEMPTS). 가족 캐릭터를 사진으로 그릴 때 1 을 준다 — 사진을 거절한 답은 몇 번을 해도
   * 대개 같아서, 45초를 다 쓰는 대신 곧바로 사진 없이 대신 그리기로 넘어간다(api/family/portrait).
   */
  noImageAttempts?: number;
  /**
   * 이 시각(Date.now 기준)이 지나면 새 요청(다시 걸기)을 시작하지 않는다. 부른 쪽이 제한 시간(withTimeout)으로 기다림을
   * 끊어도 이 함수는 뒤에서 몰림·서버 오류 뒤 다시 걸기를 이어 가, 버릴 그림에 구글 값(약 95원)이 나갈 수 있다 — 그 길을 막는다.
   * 이미 나간 요청은 멈추지 못한다. 안 적으면 지금처럼(RETRY_DEADLINE_MS 까지). 가족 캐릭터(api/family/portrait)가 준다.
   */
  until?: number;
}): Promise<GeneratedImage> {
  const provider = input.provider ?? imageProvider();
  const key = process.env.GEMINI_API_KEY;
  if (provider === "gemini" && !key) {
    throw new GeminiError(
      "GEMINI_API_KEY가 설정되지 않았습니다. .env.local에 키를 넣어주세요.",
      503,
    );
  }

  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

  const parts: unknown[] = [
    ...(input.references ?? []).map((r) => ({
      inlineData: { mimeType: r.mimeType, data: r.data },
    })),
    { text: input.prompt },
  ];

  /** Gemini를 한 번 부른다. 다시 걸어 볼 만하면 retryable을 붙여 던진다. */
  const attemptGemini = async (): Promise<GeneratedImage> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key ?? "",
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: input.aspectRatio },
          },
        }),
      });
    } catch (e) {
      // 네트워크가 끊겼거나 이름을 못 찾은 경우 — 잠시 뒤면 되는 일이다.
      throw new GeminiError(`Gemini에 닿지 못했습니다: ${(e as Error).message}`, 503);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        /*
         * 부모가 볼 말로 바꾼다.
         *
         * 예전엔 구글이 준 영어 JSON을 300자 잘라 그대로 올렸다. 어차피 화면에서는
         * 통째로 삼켜져 아무 데도 안 보였고, 결국 "2쪽부터 그림이 안 나온다"는
         * 제보만 남고 이유는 아무도 몰랐다.
         */
        const hint = readQuotaHint(body);
        const err = new GeminiError(
          hint.spendCap
            ? "그림 예산 한도에 닿았어요. 결제 설정을 확인해 주세요."
            : hint.daily
              ? "오늘 그릴 수 있는 그림 수를 다 썼어요. 내일 다시 하시거나 결제 설정을 확인해 주세요."
              : "그림 요청이 한꺼번에 몰렸어요. 잠시 뒤 다시 그려 볼게요.",
          429,
        );
        err.retryAfter = res.headers.get("retry-after") ?? hint.retryDelay ?? null;
        err.quotaExhausted = hint.daily || hint.spendCap;
        throw err;
      }
      const err = new GeminiError(
        `Gemini 호출 실패 (HTTP ${res.status}): ${body.slice(0, 300)}`,
        res.status,
      );
      err.retryAfter = res.headers.get("retry-after");
      // 결제가 꺼졌거나 막힌 경우(403 등) — 이것도 기다려서 풀리지 않으니 한도 소진과 같이 본다.
      if (res.status === 403 && /billing|spend(ing)?\s*cap|prepay|credit/i.test(body)) {
        err.quotaExhausted = true;
      }
      throw err;
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    if (json.promptFeedback?.blockReason) {
      // 아동 콘텐츠 안전필터. 프롬프트에 wholesome 계열 순화 문구를 넣어 예방하지만,
      // 그래도 걸리면 이유를 그대로 올려 재시도(문구 조정) 판단을 할 수 있게 한다.
      // 같은 프롬프트로 다시 걸어도 결과가 같으므로 재시도 대상이 아니다.
      throw new GeminiError(`안전필터에 걸렸습니다: ${json.promptFeedback.blockReason}`, 422);
    }

    for (const part of json.candidates?.[0]?.content?.parts ?? []) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      if (data) {
        return {
          mimeType:
            (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || "image/png",
          data,
        };
      }
    }

    // 그림 없이 글만 돌아오는 일이 가끔 있다 — 같은 요청을 다시 하면 대개 나온다.
    // 안전 검사로 멈춘 답(finishReason IMAGE_SAFETY 등)도 그림이 없다 — 이유를 붙여 둔다(noImageAttempts 가 센다).
    const finish = json.candidates?.[0]?.finishReason;
    const noImage = new GeminiError(
      `응답에 이미지가 없습니다. (${finish && finish !== "STOP" ? finish : "모델이 텍스트만 반환"})`,
      502,
    );
    noImage.noImage = finish || "NO_IMAGE";
    throw noImage;
  };

  /** OpenAI 로 한 번 부른다. 순환 import(openai-image → gemini)를 피하려고 여기서 불러온다. */
  const attemptOpenAI = async (): Promise<GeneratedImage> => {
    const { generateImageOpenAI } = await import("./openai-image.ts");
    return generateImageOpenAI(input);
  };

  /** 한 엔진을 정해진 규칙대로 몇 번 다시 걸어 본다. */
  const withRetries = async (attemptOnce: () => Promise<GeneratedImage>): Promise<GeneratedImage> => {
    const startedAt = Date.now();
    let lastError: unknown;
    let noImages = 0;
    for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt++) {
      try {
        return await attemptOnce();
      } catch (e) {
        lastError = e;
        const err = e instanceof GeminiError ? e : null;
        if (!err || err.status === undefined) break;
        // 오늘치를 다 썼거나 지출 한도에 닿았으면 기다려도 소용없다 — 바로 알리는 편이 낫다.
        if (err.quotaExhausted) break;
        // 그림 없는 답을 정해 준 횟수만큼 받았다(사진 거절 등) — 더 걸지 않는다.
        if (err.noImage && input.noImageAttempts !== undefined && ++noImages >= input.noImageAttempts) break;
        if (!isRetryableStatus(err.status) || attempt === IMAGE_ATTEMPTS) break;
        const crowded = err.status === 429;
        const delay = retryDelayMs(
          attempt,
          err.retryAfter,
          crowded ? RATE_LIMIT_MAX_WAIT_MS : 10_000,
        );
        const deadline = crowded ? RATE_LIMIT_DEADLINE_MS : RETRY_DEADLINE_MS;
        if (Date.now() - startedAt + delay > deadline) break;
        // 부른 쪽이 이미 기다리기를 멈췄을 때다 — 다시 걸어 그려도 버려진다(값만 나간다).
        if (input.until !== undefined && Date.now() + delay >= input.until) break;
        await sleep(delay);
      }
    }
    throw lastError;
  };

  if (provider === "openai") return withRetries(attemptOpenAI);
  // 엔진을 못박은 호출은 GPT 로 물러서지 않는다 — 막히면 그대로 실패시켜 부른 쪽이 값을 돌려준다.
  if (input.provider === "gemini") return withRetries(attemptGemini);

  const fallbackEnv = { openaiKey: process.env.OPENAI_API_KEY, fallback: process.env.IMAGE_FALLBACK };
  // 방금 막힌 게 확인됐으면 Gemini 를 다시 두드리지 않고 곧장 GPT 로.
  if (openAIFallbackAvailable(fallbackEnv) && geminiBlocked()) return withRetries(attemptOpenAI);

  try {
    return await withRetries(attemptGemini);
  } catch (e) {
    if (!shouldFallbackToOpenAI(e, fallbackEnv)) throw e;
    geminiBlockedUntil = Date.now() + GEMINI_BLOCK_MS;
    // 서버 로그(Vercel)에 남긴다 — 사장님이 "왜 GPT 그림이 섞였지?" 할 때 찾을 수 있게.
    console.warn("[image] Gemini 한도·결제 막힘 → 30분 동안 OpenAI(gpt-image)로 그립니다:", (e as Error).message);
    return withRetries(attemptOpenAI);
  }
}

/** 검수에 넘기는 것 — validateIllustration 과 illustrationCheckParts 가 같이 쓴다. */
export type IllustrationCheckInput = {
  image: GeneratedImage;
  reference?: GeneratedImage | null;
  styleReference?: GeneratedImage | null;
  /** 장소 기준 그림(인물 없는 장소판). 있으면 장소가 이것과 같은지까지 본다. */
  locationReference?: GeneratedImage | null;
  /**
   * 고정 가족의 **원본** 그림(우리 가족 캐릭터 portrait 참고용 JPEG) — 이 쪽에 보이는 사람만, 쪽 그림에 붙인 것 그대로.
   * 있으면 얼굴·머리를 시트가 아니라 이 원본과 견줘, 얼굴형·눈·머리 모양·길이·앞머리·안경·나이가 확실히 다르면 떨어뜨린다
   * (2026-09-29 사장님 "얼굴이 달라 특히"). 없으면 검수 글은 예전과 한 글자도 다르지 않다.
   */
  portraits?: readonly { name: string; image: GeneratedImage }[];
  /**
   * 인물 시트에 선 순서(왼쪽부터) — 원본 픽셀로 짠 시트만(lib/sheet-compose). 섞인 시트는 고정 가족이 먼저 서고
   * AI 덩어리가 끝에 서서 이야기 순서와 다를 수 있다 — 검수가 칸을 이름에 잘못 짝짓지 않게. 없으면 글은 예전 그대로.
   */
  sheetOrder?: readonly string[] | null;
  /**
   * 옷 카드로 이 책의 옷을 입은 고정 가족(2026-09-29 저녁~, lib/page-refs readSheetOutfits) — 시트의 그 사람 칸 위는
   * 사람 없는 옷뿐이다. 그 옷과 견주라고 칸 순서 줄에 덧붙인다. 없으면 글은 예전 그대로.
   */
  sheetOutfits?: readonly string[] | null;
  /** 실내 장소인가(true) — 실내가 바깥에 그려지거나 바깥과 합쳐지면 떨어뜨린다. */
  indoor?: boolean | null;
  scene: string;
  expectedLocation?: string;
  cast: { name: string; description: string }[];
  stylePrompt: string;
  /**
   * 이 쪽에만 해당하는 FAIL 규칙(주인공 성별·머리, 벨트, 탈것에서 내린 뒤) — illustration-rules.ts 의 checkRuleLines.
   *
   * 예전 검수엔 성별 대조도 벨트 규칙도 없어서, 남자아이가 꽃핀을 달고 버스 좌석에 벨트를 맨
   * 궁궐 마당 그림이 그대로 통과했다(my-mu0issap 5쪽).
   */
  extraRules?: string[];
};

/**
 * 검수의 시트 칸 설명(괄호 안) — 옷 카드로 입은 사람이 없으면 예전 글 그대로.
 * 모두 입었으면 칸 위는 옷, 아래는 얼굴. 일부면 그 사람들만 칸 위가 옷이다.
 */
function sheetColumnsNote(order: readonly string[], outfits: readonly string[]): string {
  const worn = outfits.filter((n) => order.includes(n));
  if (worn.length === 0) return "each column: full figure on top, close-up below";
  if (order.every((n) => worn.includes(n))) {
    return "each column: on top only the clothes that person wears in this book, laid out with no person in them, and their face close-up below — judge their outfit against those clothes";
  }
  return `each column: full figure on top, close-up below; for ${worn.join(", ")} the top of the column is only the clothes they wear in this book — judge their outfit against those clothes`;
}

/** 검수 붙임 그림 '몇 번째' — 쪽 1 + 시트 1 + 얼굴 최대 4 + 승인 쪽 1 + 장소 1 = 8, 넉넉히 열까지. */
const CHECK_ORDINALS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH"];

/**
 * 검수 요청의 parts(붙임 그림 + 글) — 부르지 않고 만들기만 한다(시험용으로 떼어 냄, gemini.test.ts).
 * 붙이는 순서: 검사할 쪽 → 인물 시트 → 고정 가족 원본(있으면) → 승인 쪽 → 장소 시트.
 */
export function illustrationCheckParts(input: IllustrationCheckInput): unknown[] {
  const expected = input.cast.length;
  const cast = input.cast.map((c, i) => `${i + 1}. ${c.name}: ${c.description}`).join("\n");
  const portraits = input.portraits ?? [];
  // 붙이는 그림의 순서와 역할을 함께 적는다 — 어느 것이 몇 번째인지 틀리면 검사가 엉뚱해진다.
  const ordinal = CHECK_ORDINALS;
  const attached: { image: GeneratedImage; role: string }[] = [
    { image: input.image, role: "the generated page to check" },
  ];
  if (input.reference) attached.push({ image: input.reference, role: "the whole-book character reference sheet" });
  for (const p of portraits) {
    attached.push({
      image: p.image,
      role: `the ORIGINAL approved portrait of "${p.name}" — the identity reference for ${p.name}'s face and hair (ignore its white background, standing pose and clothing)`,
    });
  }
  if (input.styleReference) {
    attached.push({ image: input.styleReference, role: "a previously approved page from this same book — the authoritative rendering-style reference" });
  }
  if (input.locationReference) {
    attached.push({ image: input.locationReference, role: "the LOCATION reference sheet for this page's place (the place itself, with no people) — its architecture, ground, landmark and colours are mandatory" });
  }
  return [
    ...attached.map((a) => ({ inlineData: { mimeType: a.image.mimeType, data: a.image.data } })),
    {
      text: [
        "You are checking a generated children's-book page for factual illustration errors.",
        attached.map((a, i) => `The ${ordinal[i]} attached image is ${a.role}.`).join(" "),
        // 빈 칸("")을 넣지 않는다 — 이 목록은 거르지 않고 이어 붙여, 빈 칸 하나가 예전 요청에 빈 줄을 더한다.
        ...(input.reference && input.sheetOrder?.length
          ? [
              `The character reference sheet shows, left to right: ${input.sheetOrder.map((n, i) => `${i + 1}. ${n}`).join(", ")} (${sheetColumnsNote(input.sheetOrder, input.sheetOutfits ?? [])}). Match each person on the page to their own column by this order.`,
            ]
          : []),
        `Scene instruction: ${input.scene}`,
        input.expectedLocation
          ? `MANDATORY EXPECTED LOCATION: ${input.expectedLocation}. The generated page must visibly depict this exact kind of place.`
          : "",
        `Expected visible people: exactly ${expected}.`,
        expected > 0 ? `Expected cast:\n${cast}` : "No person should be visible.",
        `Required illustration style: ${input.stylePrompt}.`,
        "FAIL for any readable or pseudo-readable writing inside the artwork: captions, subtitles, story sentences, English or Korean letters, numbers, labels, signs, logos, signatures, speech bubbles or watermarks. The page must be image-only.",
        "FAIL if the setting contradicts the mandatory expected location. A home/playroom cannot be shown as a forest path, park, hanok courtyard, classroom or generic outdoor landscape. A park cannot be shown as an indoor room. Do not accept a metaphorical or merely pretty substitute for the named place.",
        input.indoor === true
          ? "The expected location is INDOORS. FAIL if the scene is drawn outdoors, on a street or sidewalk, in front of a shop, or if indoor shelves/furniture stand outside, or if the inside and the outside of a building are combined in one picture (more than a small window view of outdoors)."
          : input.indoor === false
            ? "The expected location is OUTDOORS. FAIL if the scene is drawn inside a room or building."
            : "",
        "For a recurring place, FAIL if its fixed architecture, wall/floor colours, windows, large furniture or play equipment visibly change from the approved same-location reference.",
        input.locationReference
          ? "A LOCATION reference sheet is attached: the page must clearly be the same place as that sheet — same kind of ground, same big landmark, same wall/floor colours and layout. A different camera angle is fine; a different place, a different landmark or different colours is a FAIL."
          : "",
        "FAIL for wrong number of people, an extra/background person, a duplicated person, a missing expected person, identities/outfits swapped, or any visible change from the character reference in face construction, hair shape/colour, clothing design/colour, shoes or accessories.",
        /*
         * 고정 가족 얼굴 — 원본 그림과 견준다(2026-09-29). '확실히' 다를 때만: 자세·표정·각도·옷·붓 질감으로는 떨어뜨리지 않는다
         * (떨어지면 권당 다시 그리기 예산을 쓴다 — 헛떨어짐이 예산을 먹으면 정작 틀린 쪽을 못 고친다).
         */
        ...(portraits.length
          ? [
              `FIXED FAMILY FACES — an approved ORIGINAL portrait is attached for: ${portraits.map((p) => p.name).join(", ")}. FAIL if any of them is visible with a face or hair that clearly differs from their portrait: a different face shape or eye shape, a different hairstyle, hair length, fringe or parting, a different hair colour or straight/curly texture, glasses or a beard added or removed, or a clearly different apparent age (looks older or younger). Do NOT fail for pose, expression, head angle or a mirrored/turned view (a parting or fringe that falls on the other side because the head is turned), lighting, size, brush texture, the portrait's white background or standing pose, clothing (clothing is judged against the reference sheet), or hair that is covered, tucked, tied up or wet because the scene gives them a hat, hood, helmet, scarf, swim cap, bath or bed — judge only the hair that is visible. If a face is too small, hidden or turned away to judge, do not fail on it. When you fail on this, name the person and the exact feature to fix.`,
            ]
          : []),
        "FAIL for any rendering-style drift from the references: 3D/clay to flat 2D, 2D to 3D, watercolor to vector/anime, different line quality, texture, shading, saturation or finish. Treat the approved-page style as mandatory, not optional.",
        "FAIL if a named character performs or occupies the clearly wrong action or place.",
        ...(input.extraRules ?? []),
        // 실제로 나온 그림: 본문은 "둘이 집으로 돌아왔어요"인데 아이는 방 안, 엄마는
        // 비 오는 창밖에서 안을 들여다보고 있었다. 인원 수도 장소도 어긴 게 없어서
        // 위 검사 어디에도 안 걸렸다. 아이 책에서는 따뜻한 장면이 아니라 무서운 장면이다.
        "FAIL if the characters are split across a barrier: one indoors and another outdoors, one behind glass looking in, or separated by a window frame, doorway, fence or railing — unless the scene explicitly says they are apart. They must share one space.",
        "Also FAIL if the artwork is presented as a page, print, card, panel, framed picture or smaller image inside the canvas; if any white/unpainted margin, border, gutter, strip, rounded-corner frame or letterbox is visible at ANY outer edge; or if the illustration does not fill the canvas edge to edge.",
        "Do not fail for harmless camera-angle or minor pose differences, but location identity, character identity, readable text and rendering medium are never harmless.",
        `Before replying, check in this order: (1) no writing, (2) exact people, (3) exact named location, (4) character match${portraits.length ? " (fixed family faces against their attached portraits)" : ""}, (5) rendering-style match, (6) everyone in one shared space, (7) the main-child and seat-belt rules above. Reply PASS only if all seven pass. Otherwise reply FAIL: followed by a short concrete correction instruction in English.`,
      ].join("\n"),
    },
  ];
}

/**
 * 완성 삽화의 인원·정체성·행동 구도를 저렴한 멀티모달 모델로 검사한다.
 * 그림체 취향은 평가하지 않고, 책의 내용과 어긋나는 명백한 오류만 실패시킨다.
 */
export async function validateIllustration(input: IllustrationCheckInput): Promise<IllustrationCheck> {
  const key = process.env.GEMINI_API_KEY;
  /*
   * Gemini 가 한도·결제로 막힌 동안엔 검수를 건너뛴다(검사 못 함).
   * 검수도 같은 Gemini 프로젝트라 어차피 막혀 있고, 쪽마다 몇 번씩 다시 시도하며 기다리면
   * GPT 로 넘어가 그린 그림까지 늦어진다.
   */
  if (!key || geminiBlocked()) return { ok: true, checked: false, issues: "" };

  /*
   * 검수 모델. gemini-2.5-flash 는 2026-08 기준 신규 사용이 막혀 404를 돌려준다 —
   * 그동안 검사가 통째로 죽어 있었는데 옛 코드가 장애를 "통과"로 바꿔 아무도 몰랐다.
   * 별칭(gemini-flash-latest)을 쓰면 모델이 바뀌어도 따라간다.
   */
  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-flash-latest";
  const parts = illustrationCheckParts(input);

  /*
   * 검사도 다시 걸어 본다. 그림 그리기(generateImage)에는 5회 재시도가 있는데 검사는
   * 한 번뿐이라, 몰림(429)이나 서버 문제 한 번에 '검사 못 함'이 됐다. 여기서 몇 번만
   * 더 해 보면 대부분 실제로 검사된다.
   */
  const VALIDATE_ATTEMPTS = 3;
  let unchecked: IllustrationCheck = { ok: true, checked: false, issues: "" };
  for (let attempt = 1; attempt <= VALIDATE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0 } }),
      });
      if (!res.ok) {
        // 검수 장애가 책 생성을 막지는 않는다 — 다만 '통과'라고 하지도 않는다.
        if (isRetryableStatus(res.status) && attempt < VALIDATE_ATTEMPTS) {
          await sleep(retryDelayMs(attempt, res.headers.get("retry-after"), 8_000));
          continue;
        }
        console.warn("[validateIllustration] 검사 못 함", { status: res.status, attempt });
        return unchecked;
      }
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
      };
      const candidate = json.candidates?.[0];
      // 안전필터 등으로 잘린 답은 판정으로 쓸 수 없다.
      if (candidate?.finishReason && candidate.finishReason !== "STOP") {
        console.warn("[validateIllustration] 검사 못 함", { finishReason: candidate.finishReason });
        return unchecked;
      }
      const answer = (candidate?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join(" ")
        .trim();
      // 모델이 "**FAIL:**", "FAIL —", "> FAIL:" 처럼 꾸며서 답하는 일이 잦다 — 장식을 걷어낸다.
      const verdict = answer.replace(/^[\s*#>_`-]+/, "");
      if (/^FAIL\b/i.test(verdict)) {
        return {
          ok: false,
          checked: true,
          issues: verdict.replace(/^FAIL\s*[:\-—]*\s*/i, "").slice(0, 500),
        };
      }
      if (/^PASS\b/i.test(verdict)) return { ok: true, checked: true, issues: "" };
      // PASS도 FAIL도 아닌 답 — 읽지 못한 것이지 통과가 아니다.
      console.warn("[validateIllustration] 판정을 읽지 못함", { head: verdict.slice(0, 80) });
      return unchecked;
    } catch (e) {
      if (attempt < VALIDATE_ATTEMPTS) {
        await sleep(retryDelayMs(attempt, null, 8_000));
        continue;
      }
      console.warn("[validateIllustration] 검사 못 함", { error: (e as Error).message });
      unchecked = { ok: true, checked: false, issues: "" };
    }
  }
  return unchecked;
}

/**
 * 참조로 쓸 그림을 작게 줄인다 — **요청 본문 한도(4.5MB)를 지키기 위한 필수 단계다.**
 *
 * 실제로 난 사고(2026-08-29): 그림 모델을 gemini-3.1-flash-image로 올린 뒤 시트 한 장이
 * 2~3MB가 됐다. 쪽 그림을 그릴 때는 캐릭터 시트와 장소 시트를 **둘 다** 참조로 보내므로
 * 요청이 4.5MB를 넘었고, 그 장소를 쓰는 쪽이 **통째로** 실패했다. 6쪽 책 두 권에서
 * 각각 한 장소의 세 쪽이 전부 빈 채로 저장됐다.
 *
 * 참조 그림은 "얼굴이 어떻게 생겼나 / 이 방이 어떻게 생겼나"를 보여 주는 용도라
 * 1024px JPEG면 충분하다(2~3MB → 150~300KB). 실패하면 원본을 그대로 둔다.
 */
export async function shrinkForReference(
  image: GeneratedImage,
  maxSide = 1024,
  quality = 82,
): Promise<GeneratedImage> {
  try {
    const buf = await sharp(Buffer.from(image.data, "base64"))
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    return { mimeType: "image/jpeg", data: buf.toString("base64") };
  } catch {
    return image;
  }
}

export function toDataUrl(img: GeneratedImage): string {
  return `data:${img.mimeType};base64,${img.data}`;
}

export function fromDataUrl(url: string): GeneratedImage | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

/**
 * 참조 그림을 받아 온다 — data URL이면 그대로 풀고, 주소면 내려받는다.
 *
 * 삽화를 cafe24로 옮긴 뒤로 책에 저장된 그림은 data URL이 아니라 주소다. 주소를
 * fromDataUrl에 그냥 넣으면 null이 되어 '참조 없음'으로 조용히 넘어가고, 한 쪽만
 * 다시 그릴 때 그림체가 어긋난다(실제 발생). 서버에서 받아 오면 브라우저의
 * 교차 출처 제한도 걸리지 않는다.
 */
export async function loadReferenceImage(url: string): Promise<GeneratedImage | null> {
  const inline = fromDataUrl(url);
  if (inline) return inline;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // 5MB가 넘으면 참조로 쓰기엔 과하다 — 없이 그리는 편이 낫다.
    if (buf.byteLength > 5 * 1024 * 1024) return null;
    return {
      mimeType: res.headers.get("content-type") || "image/webp",
      data: buf.toString("base64"),
    };
  } catch {
    return null;
  }
}
