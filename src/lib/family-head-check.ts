/**
 * 우리 가족 캐릭터 — 그린 뒤 머리 재기(사장님 승인 2026-09-29, lib/family-head ②).
 *
 * 그린 그림(흰 바탕, 지우기·올리기 전)을 값싼 글 모델(쪽 그림 검수·특징 카드와 같은 GEMINI_VISION_MODEL, 안 적으면
 * gemini-flash-latest)에 한 번 보여 머리 상자(머리카락 맨 위 ~ 턱)와 전신 상자(머리카락 맨 위 ~ 신발 바닥)를
 * [위, 왼, 아래, 오른] 0~1000 비율로 받는다. 전신 높이 ÷ 머리 높이 = 잰 비율(lib/family-head headRatioFromBoxes).
 * 표에서 많이 벗어나면(headVerdict) 시간이 넉넉할 때만 같은 쿠키로 한 번 더 그리고, 표에 더 가까운 쪽을 남긴다(evenOutHead).
 *
 * 실패는 조용히 — 키 없음·한도 막힘·시간 초과·못 읽음이면 잰 값 없이(null) 오늘처럼 건넨다. 다시 걸지 않는다(시간은 그리기 몫).
 * 로그·결과에는 숫자(비율·걸린 시간)와 결과 갈래만 — 그림·프롬프트·사진·구글 답 글은 넣지 않는다.
 * 값: 그림 한 장(작게 줄여서) + 짧은 JSON 답이라 보통 한 번에 약 2~4원. 글 모델이 생각하는 모델이라 생각이 길어지면
 * 답 길이 상한(CHECK_MAX_OUTPUT_TOKENS)까지 — 한 번에 많아야 약 9원. 다시 그리면 그림 한 장 값(약 95원)과 재기 한 번이 더 든다.
 * 생각 설정(thinking)은 넣지 않았다(아래 measureHeadRatio). 첫 실제 로그에서 'timeout' 이 잦으면 모델에 맞춰 넣는다.
 */

import { closerHead, headRatioFromBoxes, headVerdict, ratioText, readBox, type Box, type HeadVerdict } from "./family-head.ts";
import { geminiBlocked, shrinkForReference, type GeneratedImage } from "./gemini.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** 한 번 재기의 제한 — 보통 2~5초. 넘으면 끊고 잰 값 없이 간다. */
export const HEAD_CHECK_TIMEOUT_MS = 8_000;
/**
 * 재기를 시작하려면 최소 이만큼 남아야 한다 — 생각하는 모델은 보통 2~5초라 이보다 짧으면 끝나기 전에 끊겨 값·시간만 쓴다.
 * 재기 제한 시각(api/family/portrait HEAD_CHECK_DEADLINE_MS 46초)과 함께 올리기 몫(55초까지)을 지킨다.
 */
export const HEAD_CHECK_MIN_MS = 4_000;
/** 보내는 그림의 긴 변 — 상자만 재면 되니 작게(요청이 가볍고 빨라진다). 1000 칸 비율이라 이 크기로도 충분히 곱다. */
const CHECK_IMAGE_SIDE = 768;
/**
 * 답 길이 상한 — 답은 몇십 토큰인데, 생각하는 모델(2.5·3 flash)은 생각 토큰도 이 안에서 쓴다(특징 카드와 같은 까닭).
 * 이 상한이 곧 값의 상한이다.
 */
const CHECK_MAX_OUTPUT_TOKENS = 2048;

/** 글 모델에 주는 부탁 — 상자 둘만, JSON 으로. */
export const HEAD_CHECK_PROMPT = [
  "This is a full-body illustration of one person standing on a white background.",
  "Give two bounding boxes as [ymin, xmin, ymax, xmax], each value normalized to 0-1000 over the whole image:",
  '- "head": the head only — from the very top of the head (the top of the hair lying on the head; leave out tall buns, ponytails, hats and hair accessories) down to the bottom of the chin. Not the neck. Long hair, braids or pigtails hanging below the chin are NOT part of the head box — it always ends at the chin.',
  '- "figure": the whole person — from the same top of the head down to the soles of the shoes.',
  'Reply only with JSON: {"head": [ymin, xmin, ymax, xmax], "figure": [ymin, xmin, ymax, xmax]}.',
  'If there is not exactly one full-body person, reply {"head": null, "figure": null}.',
].join("\n");

/**
 * 글 모델의 답 → 머리·전신 상자. 우리가 부탁한 꼴({"head":[…],"figure":[…]})과 Gemini 가 흔히 쓰는 꼴
 * ([{"box_2d":[…],"label":"head"}, …]) 둘 다 받는다. ```json 울타리도 걷는다. 못 읽으면 null.
 */
export function readHeadBoxes(text: string): { head: Box; figure: Box } | null {
  const body = text.replace(/```(?:json)?/gi, "").trim();
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    const m = /[[{][\s\S]*[\]}]/.exec(body);
    if (!m) return null;
    try {
      data = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  let head: Box | null = null;
  let figure: Box | null = null;
  if (Array.isArray(data)) {
    const list: unknown[] = data;
    const find = (label: RegExp) => {
      const hit = list.find(
        (d): d is { box_2d?: unknown } =>
          Boolean(d) && typeof d === "object" && label.test(String((d as { label?: unknown }).label ?? "")),
      );
      return readBox(hit?.box_2d);
    };
    head = find(/^\s*head\b/i);
    figure = find(/figure|person|body|whole|full/i);
  } else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    head = readBox(d.head);
    figure = readBox(d.figure ?? d.person ?? d.body);
  }
  return head && figure ? { head, figure } : null;
}

/** 한 번 잰 결과 — 로그에는 ratio·ms·outcome 만 찍는다. */
export type HeadMeasure = { ratio: number | null; ms: number; outcome: string };

type Part = { text?: string; thought?: boolean };

/**
 * 그린 그림 → 잰 비율(전신 ÷ 머리). 한 번만 부르고 timeoutMs 가 지나면 요청을 끊는다(AbortController).
 * 절대 던지지 않는다: 무엇이 잘못돼도 { ratio: null, outcome } 로 돌아온다. outcome 에는 구글 답 글을 넣지 않는다.
 */
export async function measureHeadRatio(image: GeneratedImage, opts: { timeoutMs: number }): Promise<HeadMeasure> {
  const startedAt = Date.now();
  const done = (ratio: number | null, outcome: string): HeadMeasure => ({ ratio, ms: Date.now() - startedAt, outcome });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return done(null, "no-key");
  // 한도·결제로 막힌 동안엔 부르지 않는다 — 같은 프로젝트라 어차피 막혀 있다(lib/gemini).
  if (geminiBlocked()) return done(null, "gemini-blocked");
  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-flash-latest";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, opts.timeoutMs));
  try {
    // 줄이기도 제한 시간 안에 든다(보통 수십 ms). 실패하면 원본 그대로 보낸다(shrinkForReference).
    const small = await shrinkForReference(image, CHECK_IMAGE_SIDE, 80);
    if (ctrl.signal.aborted) return done(null, "timeout");
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: small.mimeType, data: small.data } }, { text: HEAD_CHECK_PROMPT }] }],
        // 온도 0 — 같은 그림이면 같은 상자. JSON 으로만 답하게 한다(모든 Gemini 모델이 받는 칸).
        // 생각 설정(thinking)은 모델마다 받는 칸이 달라 넣지 않았다(검수·특징 카드와 같은 설정).
        generationConfig: {
          temperature: 0,
          maxOutputTokens: CHECK_MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return done(null, `http ${res.status}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const block = json.promptFeedback?.blockReason;
    if (block) return done(null, `blocked ${String(block).slice(0, 40)}`);
    const candidate = json.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("\n");
    const boxes = readHeadBoxes(text);
    if (!boxes) {
      const finish = candidate?.finishReason;
      return done(null, finish && finish !== "STOP" ? `finish ${String(finish).slice(0, 40)}` : "unreadable");
    }
    const ratio = headRatioFromBoxes(boxes.head, boxes.figure);
    return ratio === null ? done(null, "bad-boxes") : done(ratio, "ok");
  } catch (e) {
    return done(null, ctrl.signal.aborted ? "timeout" : e instanceof SyntaxError ? "unreadable" : "network");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 다시 그릴 때 프롬프트 끝에 붙이는 한 줄 — 표 비율과 지난번에 잰 비율(숫자만)을 적는다.
 * 나머지(생김새·옷·자세·그림체)는 그대로라고 못박는다 — 머리 크기만 고치는 다시 그리기다.
 * 몸 부위 말(몸통·다리·body)은 쓰지 않는다 — 다시 그리기는 같은 참고 그림(사진 갈래면 실제 아이 사진)과 함께 가서, 사진 옆의
 * 몸 말은 안전 검사(IMAGE_SAFETY)에 걸리기 쉽다(2026-09-29 사진 거절). '전체 모습에 견주어'로만 적는다.
 */
export function headCorrectionLine(target: number, verdict: Exclude<HeadVerdict, "ok">, measured: number): string {
  const want = `the head (top of the hair to the chin) must be only ${ratioText(target)} of the full height (top of the hair to the soles of the shoes)`;
  return verdict === "big"
    ? `HEAD SIZE — IMPORTANT CORRECTION: ${want}. The previous try drew the head too big (about ${ratioText(measured)}) — paint the head clearly smaller in relation to the whole figure. Everything else stays exactly as described above.`
    : `HEAD SIZE — IMPORTANT CORRECTION: ${want.replace("must be only", "must be")}. The previous try drew the head too small (about ${ratioText(measured)}) — paint the head clearly bigger in relation to the whole figure. Everything else stays exactly as described above.`;
}

/** 머리 재기 한 번의 기록 — 숫자와 갈래뿐(로그용). */
export type HeadPassLog = {
  target: number;
  /** 처음 그림의 잰 비율(못 쟀으면 null) */
  first: number | null;
  verdict: HeadVerdict | null;
  /** 다시 그렸나 */
  retried: boolean;
  /** 다시 그린 그림의 잰 비율 */
  second: number | null;
  /** 남긴 그림 */
  kept: "first" | "redraw";
  /** ok · no-time · 재기 실패 갈래(timeout·http 4xx …) · no-time-redraw · redraw-failed · redraw-unmeasured · closer-first · closer-redraw */
  outcome: string;
  /** 재기에 쓴 시간(두 번이면 합) */
  checkMs: number;
  /** 다시 그리기에 쓴 시간 */
  redrawMs: number;
};

/**
 * 그린 그림을 재고, 머리가 표에서 많이 벗어났으면 시간이 넉넉할 때만 한 번 더 그려 표에 더 가까운 쪽을 남긴다.
 * 절대 던지지 않는다 — 재기·다시 그리기 어디서 실패해도 처음 그림(또는 다시 그린 그림)을 돌려준다.
 *
 *  1. 재기 — checkUntil 까지 HEAD_CHECK_MIN_MS 도 안 남았으면 재지 않고 처음 그림(ratio null).
 *  2. 못 쟀거나 표에 맞으면(ok) 처음 그림.
 *  3. 벗어났는데 redrawUntil 까지 redrawMinMs 가 안 남았으면 처음 그림(잰 비율은 그대로 남긴다 — 단체 사진이 쓴다).
 *  4. 다시 그리기(프롬프트 끝에 headCorrectionLine) — 실패·시간 초과면 처음 그림.
 *  5. 다시 잰다 — 쟀으면 표에 더 가까운 쪽(closerHead). 못 쟀으면 다시 그린 그림을 남긴다(잰 비율 없이):
 *     처음 그림은 이미 표에서 많이 벗어난 것을 알고, 다시 그린 그림은 그걸 바로잡으라고 그린 것이라 더 나을 공산이 크다.
 */
export async function evenOutHead<T>(o: {
  image: T;
  /** 이 사람의 표 비율(lib/family-head headChartRatio) */
  target: number;
  measure: (image: T, timeoutMs: number) => Promise<HeadMeasure>;
  /** 같은 참고 그림·프롬프트에 line 을 붙여 한 번 더 그린다. timeoutMs 안에 못 끝내면 던진다. */
  redraw: (line: string, timeoutMs: number) => Promise<T>;
  /** 재기는 이 시각(Date.now 기준)까지 끝나야 한다 */
  checkUntil: number;
  /** 다시 그리기는 이 시각까지 끝나야 한다 */
  redrawUntil: number;
  /** 다시 그리기를 시작하려면 redrawUntil 까지 최소 이만큼 남아야 한다 */
  redrawMinMs: number;
  now?: () => number;
}): Promise<{ image: T; ratio: number | null; log: HeadPassLog }> {
  const now = o.now ?? Date.now;
  const log: HeadPassLog = {
    target: o.target,
    first: null,
    verdict: null,
    retried: false,
    second: null,
    kept: "first",
    outcome: "ok",
    checkMs: 0,
    redrawMs: 0,
  };
  const measure = async (image: T): Promise<HeadMeasure | null> => {
    const left = o.checkUntil - now();
    if (!(left >= HEAD_CHECK_MIN_MS)) return null;
    try {
      const m = await o.measure(image, Math.min(HEAD_CHECK_TIMEOUT_MS, left));
      log.checkMs += m.ms;
      return m;
    } catch {
      return { ratio: null, ms: 0, outcome: "error" };
    }
  };
  const first = (outcome: string, ratio: number | null) => {
    log.outcome = outcome;
    return { image: o.image, ratio, log };
  };

  const m1 = await measure(o.image);
  if (!m1) return first("no-time", null);
  if (m1.ratio === null) return first(m1.outcome, null);
  log.first = m1.ratio;
  const verdict = headVerdict(m1.ratio, o.target);
  log.verdict = verdict;
  if (verdict === "ok") return first("ok", m1.ratio);

  const left = o.redrawUntil - now();
  if (!(left >= o.redrawMinMs)) return first("no-time-redraw", m1.ratio);

  log.retried = true;
  const t0 = now();
  let second: T;
  try {
    second = await o.redraw(headCorrectionLine(o.target, verdict, m1.ratio), left);
  } catch {
    log.redrawMs = now() - t0;
    return first("redraw-failed", m1.ratio);
  }
  log.redrawMs = now() - t0;

  const m2 = await measure(second);
  if (m2?.ratio == null) {
    log.kept = "redraw";
    log.outcome = "redraw-unmeasured";
    return { image: second, ratio: null, log };
  }
  log.second = m2.ratio;
  if (closerHead(m1.ratio, m2.ratio, o.target) === "second") {
    log.kept = "redraw";
    log.outcome = "closer-redraw";
    return { image: second, ratio: m2.ratio, log };
  }
  return first("closer-first", m1.ratio);
}
