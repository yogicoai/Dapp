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
  ok: boolean;
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

/** 감지된 흰 테두리를 잘라낸 뒤 원래 픽셀 크기와 비율로 복원한다. 추가 AI 호출은 없다. */
export async function repairBlankCanvasBorder(image: GeneratedImage): Promise<GeneratedImage> {
  try {
    const source = Buffer.from(image.data, "base64");
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) return image;
    const repaired = await sharp(source)
      .trim({ background: "#ffffff", threshold: 20 })
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
const IMAGE_ATTEMPTS = 3;
const RETRY_BASE_MS = 800;
/** 한 장이 이보다 오래 붙들려 있지 않게 — 다시 시도하다 만들기가 통째로 늘어지면 안 된다. */
const RETRY_DEADLINE_MS = 60_000;

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
export function retryDelayMs(attempt: number, retryAfter?: string | null): number {
  const told = Number(retryAfter);
  if (Number.isFinite(told) && told > 0) return Math.min(told * 1000, 10_000);
  const base = RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      if (!isRetryableStatus(err.status) || attempt === IMAGE_ATTEMPTS) break;
      const delay = retryDelayMs(attempt, err.retryAfter);
      if (Date.now() - startedAt + delay > RETRY_DEADLINE_MS) break;
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
  scene: string;
  expectedLocation?: string;
  cast: { name: string; description: string }[];
  stylePrompt: string;
}): Promise<IllustrationCheck> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: true, issues: "" };

  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash";
  const expected = input.cast.length;
  const cast = input.cast.map((c, i) => `${i + 1}. ${c.name}: ${c.description}`).join("\n");
  const parts: unknown[] = [
    { inlineData: { mimeType: input.image.mimeType, data: input.image.data } },
    ...(input.reference
      ? [{ inlineData: { mimeType: input.reference.mimeType, data: input.reference.data } }]
      : []),
    ...(input.styleReference
      ? [{ inlineData: { mimeType: input.styleReference.mimeType, data: input.styleReference.data } }]
      : []),
    {
      text: [
        "You are checking a generated children's-book page for factual illustration errors.",
        "The FIRST attached image is the generated page. If present, the SECOND is the whole-book character reference sheet. If present, the THIRD is a previously approved page from this same book and is the authoritative rendering-style reference.",
        `Scene instruction: ${input.scene}`,
        input.expectedLocation
          ? `MANDATORY EXPECTED LOCATION: ${input.expectedLocation}. The generated page must visibly depict this exact kind of place.`
          : "",
        `Expected visible people: exactly ${expected}.`,
        expected > 0 ? `Expected cast:\n${cast}` : "No person should be visible.",
        `Required illustration style: ${input.stylePrompt}.`,
        "FAIL for any readable or pseudo-readable writing inside the artwork: captions, subtitles, story sentences, English or Korean letters, numbers, labels, signs, logos, signatures, speech bubbles or watermarks. The page must be image-only.",
        "FAIL if the setting contradicts the mandatory expected location. A home/playroom cannot be shown as a forest path, park, hanok courtyard, classroom or generic outdoor landscape. A park cannot be shown as an indoor room. Do not accept a metaphorical or merely pretty substitute for the named place.",
        "For a recurring place, FAIL if its fixed architecture, wall/floor colours, windows, large furniture or play equipment visibly change from the approved same-location reference.",
        "FAIL for wrong number of people, an extra/background person, a duplicated person, a missing expected person, identities/outfits swapped, or any visible change from the character reference in face construction, hair shape/colour, clothing design/colour, shoes or accessories.",
        "FAIL for any rendering-style drift from the references: 3D/clay to flat 2D, 2D to 3D, watercolor to vector/anime, different line quality, texture, shading, saturation or finish. Treat the approved-page style as mandatory, not optional.",
        "FAIL if a named character performs or occupies the clearly wrong action or place.",
        "Also FAIL if the artwork is presented as a page, print, card, panel, framed picture or smaller image inside the canvas; if any white/unpainted margin, border, gutter, strip, rounded-corner frame or letterbox is visible at ANY outer edge; or if the illustration does not fill the canvas edge to edge.",
        "Do not fail for harmless camera-angle or minor pose differences, but location identity, character identity, readable text and rendering medium are never harmless.",
        "Before replying, check in this order: (1) no writing, (2) exact people, (3) exact named location, (4) character match, (5) rendering-style match. Reply PASS only if all five pass. Otherwise reply FAIL: followed by a short concrete correction instruction in English.",
      ].join("\n"),
    },
  ];

  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0 } }),
    });
    if (!res.ok) return { ok: true, issues: "" }; // 검수 장애가 책 생성을 막지는 않는다.
    const json = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
    const answer = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
    if (/^FAIL\s*:/i.test(answer)) {
      return { ok: false, issues: answer.replace(/^FAIL\s*:\s*/i, "").slice(0, 500) };
    }
    return { ok: true, issues: "" };
  } catch {
    return { ok: true, issues: "" };
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
