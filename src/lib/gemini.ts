/**
 * Gemini 2.5 Flash Image ("Nano Banana") — 삽화 생성.
 *
 * 인수인계 문서의 원가 근거가 이 모델이다: 장당 약 $0.039(₩55), 8쪽 책이
 * 캐릭터 시트 포함 9장 ≈ ₩500. 문서의 경고대로 첫 라이브 호출에서 응답 파싱이
 * 어긋날 수 있어, 파싱을 관대하게(inlineData/inline_data 양쪽) 잡아둔다.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export type GeneratedImage = {
  mimeType: string;
  /** base64 원문. 클라이언트에는 data URL로 내려준다. */
  data: string;
};

type Part = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

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

  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiError(
      `Gemini 호출 실패 (HTTP ${res.status}): ${body.slice(0, 300)}`,
      res.status,
    );
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: Part[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    // 아동 콘텐츠 안전필터. 프롬프트에 wholesome 계열 순화 문구를 넣어 예방하지만,
    // 그래도 걸리면 이유를 그대로 올려 재시도(문구 조정) 판단을 할 수 있게 한다.
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

  throw new GeminiError("응답에 이미지가 없습니다. (모델이 텍스트만 반환)", 502);
}

export function toDataUrl(img: GeneratedImage): string {
  return `data:${img.mimeType};base64,${img.data}`;
}

export function fromDataUrl(url: string): GeneratedImage | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  return m ? { mimeType: m[1], data: m[2] } : null;
}
