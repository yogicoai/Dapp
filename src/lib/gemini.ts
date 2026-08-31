import sharp from "sharp";

/**
 * Gemini 2.5 Flash Image ("Nano Banana") — 삽화 생성.
 *
 * 인수인계 문서의 원가 근거가 이 모델이다: 장당 약 $0.039(₩55), 8쪽 책이
 * 캐릭터 시트 포함 9장 ≈ ₩500. 문서의 경고대로 첫 라이브 호출에서 응답 파싱이
 * 어긋날 수 있어, 파싱을 관대하게(inlineData/inline_data 양쪽) 잡아둔다.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
      .removeAlpha()
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
 * 감지된 흰 테두리를 잘라낸 뒤 원래 픽셀 크기와 비율로 복원한다. 추가 AI 호출은 없다.
 *
 * **얼마나 잘렸는지에 상한을 둔다.** 감지기(detectBlankCanvasBorder)는 가장자리 12%까지만
 * 세는데 trim은 멈추지 않는다 — 밝은 크림색 벽이나 흐린 하늘이 이어지면 그림의 30%를
 * 잘라내고 남은 부분을 확대해서, 가장자리에 서 있던 아이가 통째로 사라졌다(실제로 났다).
 * 진짜 두꺼운 여백은 AI 품질검사가 잡아 다시 그리게 하는 편이 안전하다.
 */
const MAX_BORDER_TRIM_RATIO = 0.12;

export async function repairBlankCanvasBorder(image: GeneratedImage): Promise<GeneratedImage> {
  try {
    const source = Buffer.from(image.data, "base64");
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) return image;
    // 먼저 잘라만 보고 '얼마나 없어졌는지'를 잰다.
    const { data: trimmed, info } = await sharp(source)
      .trim({ background: "#ffffff", threshold: 20 })
      .toBuffer({ resolveWithObject: true });
    const cutX = metadata.width - info.width;
    const cutY = metadata.height - info.height;
    if (cutX <= 0 && cutY <= 0) return image; // 자를 게 없었다
    if (
      cutX > metadata.width * MAX_BORDER_TRIM_RATIO ||
      cutY > metadata.height * MAX_BORDER_TRIM_RATIO
    ) {
      // 밝은 벽·하늘을 여백으로 오인한 경우다 — 손대지 않는다.
      console.warn("[repairBlankCanvasBorder] 잘림이 너무 커서 원본 유지", {
        cutX,
        cutY,
        width: metadata.width,
        height: metadata.height,
      });
      return image;
    }
    const repaired = await sharp(trimmed)
      .resize(metadata.width, metadata.height, { fit: "cover", position: "centre" })
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
export function readQuotaHint(body: string): { retryDelay?: string; daily: boolean } {
  try {
    const parsed = JSON.parse(body) as {
      error?: { details?: Record<string, unknown>[] };
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
    return { retryDelay, daily };
  } catch {
    // 본문이 JSON이 아니면(프록시 오류 페이지 등) 판단하지 않는다 — 기본 재시도로 간다.
    return { daily: false };
  }
}

export async function generateImage(input: {
  prompt: string;
  /** 참조 이미지(캐릭터 시트 등). 인물 일관성의 핵심이라 매 쪽 재주입한다. */
  references?: GeneratedImage[];
  /** 4:3=태블릿(가로), 3:4=핸드폰(세로), 1:1=캐릭터 시트. Gemini가 네이티브로 지원하는 비율. */
  aspectRatio: "4:3" | "3:4" | "1:1";
}): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
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

  /** 한 번 부른다. 다시 걸어 볼 만하면 retryable을 붙여 던진다. */
  const attemptOnce = async (): Promise<GeneratedImage> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key,
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
          hint.daily
            ? "오늘 그릴 수 있는 그림 수를 다 썼어요. 내일 다시 하시거나 결제 설정을 확인해 주세요."
            : "그림 요청이 한꺼번에 몰렸어요. 잠시 뒤 다시 그려 볼게요.",
          429,
        );
        err.retryAfter = res.headers.get("retry-after") ?? hint.retryDelay ?? null;
        err.quotaExhausted = hint.daily;
        throw err;
      }
      const err = new GeminiError(
        `Gemini 호출 실패 (HTTP ${res.status}): ${body.slice(0, 300)}`,
        res.status,
      );
      err.retryAfter = res.headers.get("retry-after");
      throw err;
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: Part[] } }[];
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
    throw new GeminiError("응답에 이미지가 없습니다. (모델이 텍스트만 반환)", 502);
  };

  const startedAt = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt++) {
    try {
      return await attemptOnce();
    } catch (e) {
      lastError = e;
      const err = e instanceof GeminiError ? e : null;
      if (!err || err.status === undefined) break;
      // 오늘치를 다 썼으면 기다려도 소용없다 — 바로 알리는 편이 낫다.
      if (err.quotaExhausted) break;
      if (!isRetryableStatus(err.status) || attempt === IMAGE_ATTEMPTS) break;
      const crowded = err.status === 429;
      const delay = retryDelayMs(
        attempt,
        err.retryAfter,
        crowded ? RATE_LIMIT_MAX_WAIT_MS : 10_000,
      );
      const deadline = crowded ? RATE_LIMIT_DEADLINE_MS : RETRY_DEADLINE_MS;
      if (Date.now() - startedAt + delay > deadline) break;
      await sleep(delay);
    }
  }
  throw lastError;
}

/**
 * 완성 삽화의 인원·정체성·행동 구도를 저렴한 멀티모달 모델로 검사한다.
 * 그림체 취향은 평가하지 않고, 책의 내용과 어긋나는 명백한 오류만 실패시킨다.
 */
export async function validateIllustration(input: {
  image: GeneratedImage;
  reference?: GeneratedImage | null;
  styleReference?: GeneratedImage | null;
  /** 장소 기준 그림(인물 없는 장소판). 있으면 장소가 이것과 같은지까지 본다. */
  locationReference?: GeneratedImage | null;
  /** 실내 장소인가(true) — 실내가 바깥에 그려지거나 바깥과 합쳐지면 떨어뜨린다. */
  indoor?: boolean | null;
  scene: string;
  expectedLocation?: string;
  cast: { name: string; description: string }[];
  stylePrompt: string;
}): Promise<IllustrationCheck> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: true, checked: false, issues: "" };

  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash";
  const expected = input.cast.length;
  const cast = input.cast.map((c, i) => `${i + 1}. ${c.name}: ${c.description}`).join("\n");
  // 붙이는 그림의 순서와 역할을 함께 적는다 — 어느 것이 몇 번째인지 틀리면 검사가 엉뚱해진다.
  const ordinal = ["FIRST", "SECOND", "THIRD", "FOURTH"];
  const attached: { image: GeneratedImage; role: string }[] = [
    { image: input.image, role: "the generated page to check" },
  ];
  if (input.reference) attached.push({ image: input.reference, role: "the whole-book character reference sheet" });
  if (input.styleReference) {
    attached.push({ image: input.styleReference, role: "a previously approved page from this same book — the authoritative rendering-style reference" });
  }
  if (input.locationReference) {
    attached.push({ image: input.locationReference, role: "the LOCATION reference sheet for this page's place (the place itself, with no people) — its architecture, ground, landmark and colours are mandatory" });
  }
  const parts: unknown[] = [
    ...attached.map((a) => ({ inlineData: { mimeType: a.image.mimeType, data: a.image.data } })),
    {
      text: [
        "You are checking a generated children's-book page for factual illustration errors.",
        attached.map((a, i) => `The ${ordinal[i]} attached image is ${a.role}.`).join(" "),
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
        "FAIL for any rendering-style drift from the references: 3D/clay to flat 2D, 2D to 3D, watercolor to vector/anime, different line quality, texture, shading, saturation or finish. Treat the approved-page style as mandatory, not optional.",
        "FAIL if a named character performs or occupies the clearly wrong action or place.",
        // 실제로 나온 그림: 본문은 "둘이 집으로 돌아왔어요"인데 아이는 방 안, 엄마는
        // 비 오는 창밖에서 안을 들여다보고 있었다. 인원 수도 장소도 어긴 게 없어서
        // 위 검사 어디에도 안 걸렸다. 아이 책에서는 따뜻한 장면이 아니라 무서운 장면이다.
        "FAIL if the characters are split across a barrier: one indoors and another outdoors, one behind glass looking in, or separated by a window frame, doorway, fence or railing — unless the scene explicitly says they are apart. They must share one space.",
        "Also FAIL if the artwork is presented as a page, print, card, panel, framed picture or smaller image inside the canvas; if any white/unpainted margin, border, gutter, strip, rounded-corner frame or letterbox is visible at ANY outer edge; or if the illustration does not fill the canvas edge to edge.",
        "Do not fail for harmless camera-angle or minor pose differences, but location identity, character identity, readable text and rendering medium are never harmless.",
        "Before replying, check in this order: (1) no writing, (2) exact people, (3) exact named location, (4) character match, (5) rendering-style match, (6) everyone in one shared space. Reply PASS only if all six pass. Otherwise reply FAIL: followed by a short concrete correction instruction in English.",
      ].join("\n"),
    },
  ];

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
