/**
 * OpenAI(gpt-image-1)로 그림을 그린다 — Gemini 대신 써 볼 수 있게 만든 갈아 끼우기.
 *
 * 왜 있나: 사장님이 GPT 그림을 직접 뽑아 보니 결이 좋아서, 앱 안의 그림 생성도
 * 같은 엔진으로 시험해 보고 싶어 했다(2026-09-05). 바깥(라우트·스크립트)은 그대로
 * `generateImage`를 부르고, `IMAGE_PROVIDER=openai` 일 때만 여기로 온다.
 *
 * 다른 점 두 가지:
 *  - 참고 그림(캐릭터 시트·그림체 기준·장소판)이 있으면 /images/edits 에 여러 장을
 *    함께 보낸다. gpt-image-1은 이 참고 그림들의 인물·결을 보고 그린다.
 *  - 비율은 1536x1024(가로)·1024x1536(세로)·1024x1024만 된다. 4:3은 3:2로 그려지고,
 *    앱이 쓰는 자리에서 잘라 맞춘다.
 *
 * 값(2026-09 기준, quality=medium): 장당 약 $0.04~0.07 ≈ 60~100원. Gemini(≈54원)보다 조금 비싸다.
 */
import { openaiImageUsageRow, reportAiUsage } from "./ai-usage.ts";
import { GeminiError, type GeneratedImage } from "./gemini.ts";

/** 앱의 비율 → gpt-image-1 이 받는 크기. */
export const OPENAI_IMAGE_SIZES = {
  "4:3": "1536x1024",
  "3:4": "1024x1536",
  "1:1": "1024x1024",
} as const;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** 답에서 사람이 볼 이유를 뽑는다 — OpenAI는 {error:{message,code}} 꼴로 준다. */
function readError(body: string): { message: string; code: string } {
  try {
    const j = JSON.parse(body) as { error?: { message?: string; code?: string } };
    return { message: j.error?.message ?? body.slice(0, 300), code: j.error?.code ?? "" };
  } catch {
    return { message: body.slice(0, 300), code: "" };
  }
}

export async function generateImageOpenAI(input: {
  prompt: string;
  references?: GeneratedImage[];
  aspectRatio: keyof typeof OPENAI_IMAGE_SIZES;
}): Promise<GeneratedImage> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new GeminiError("OPENAI_API_KEY가 설정되지 않았습니다. .env.local에 키를 넣어주세요.", 503);
  }
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  // low·medium·high. medium이 값과 결의 중간. 바꾸려면 .env.local의 OPENAI_IMAGE_QUALITY.
  const quality = process.env.OPENAI_IMAGE_QUALITY ?? "medium";
  const size = OPENAI_IMAGE_SIZES[input.aspectRatio];
  const refs = input.references ?? [];

  let res: Response;
  try {
    if (refs.length > 0) {
      // 참고 그림이 있으면 edits — 여러 장을 image[] 로 붙인다.
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", input.prompt);
      form.append("size", size);
      form.append("quality", quality);
      // 투명 배경 금지 — auto 면 가장자리를 투명하게 비워 둘 때가 있고, 화면에선 흰 테두리로 보인다.
      form.append("background", "opaque");
      form.append("n", "1");
      refs.forEach((r, i) => {
        const blob = new Blob([Buffer.from(r.data, "base64")], { type: r.mimeType });
        form.append("image[]", blob, `ref-${i + 1}.${EXT[r.mimeType] ?? "png"}`);
      });
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form,
      });
    } else {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: input.prompt, size, quality, background: "opaque", n: 1 }),
      });
    }
  } catch (e) {
    throw new GeminiError(`OpenAI에 닿지 못했습니다: ${(e as Error).message}`, 503);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const why = readError(body);
    if (res.status === 429) {
      const err = new GeminiError(
        /quota|billing|insufficient/i.test(why.message)
          ? "OpenAI 그림 한도(또는 잔액)를 다 썼어요. 결제 설정을 확인해 주세요."
          : "그림 요청이 한꺼번에 몰렸어요. 잠시 뒤 다시 그려 볼게요.",
        429,
      );
      err.retryAfter = res.headers.get("retry-after");
      err.quotaExhausted = /quota|billing|insufficient/i.test(why.message);
      throw err;
    }
    // 아동 안전필터 — 같은 프롬프트를 다시 보내도 같으므로 재시도 대상이 아니다(422).
    if (res.status === 400 && /moderation|safety|content_policy|policy/i.test(`${why.code} ${why.message}`)) {
      throw new GeminiError(`안전필터에 걸렸습니다: ${why.message}`, 422);
    }
    const err = new GeminiError(`OpenAI 호출 실패 (HTTP ${res.status}): ${why.message}`, res.status);
    err.retryAfter = res.headers.get("retry-after");
    throw err;
  }

  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  // Gemini 대신 그린 것도 남긴다 — 토큰만(금액은 OpenAI 사용량 화면이 기준, lib/ai-usage).
  reportAiUsage(openaiImageUsageRow(model, json));
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new GeminiError("응답에 이미지가 없습니다. (OpenAI)", 502);
  return { mimeType: "image/png", data: b64 };
}
