/**
 * 우리 가족 캐릭터 — 그린 뒤 머리 재기(사장님 승인 2026-09-29, lib/family-head ②).
 *
 * 그린 그림(흰 바탕, 지우기·올리기 전)을 값싼 글 모델(쪽 그림 검수·특징 카드와 같은 GEMINI_VISION_MODEL, 안 적으면
 * gemini-flash-latest)에 한 번 보여 머리 상자(머리카락 맨 위 ~ 턱)와 전신 상자(머리카락 맨 위 ~ 신발 바닥)를
 * [위, 왼, 아래, 오른] 0~1000 비율로 받는다. 전신 높이 ÷ 머리 높이 = 잰 비율(lib/family-head headRatioFromBoxes).
 * 표에서 많이 벗어나면(headVerdict) 시간이 넉넉할 때만 같은 쿠키로 한 번 더 그리고, 표에 더 가까운 쪽을 남긴다(evenOutHead).
 * 다시 그리기는 **처음 그림에서** 한다(사장님 승인 2026-09-29 오후 "엄마 비율이 이상해졌어"): 예전엔 같은 요청(사진 갈래면 사진 +
 * 클로즈업 + 견본 + 비율 견본)에 바로잡는 한 줄만 붙여 다시 그렸는데, 얼굴이 꽉 찬 사진(셀카)이 머리를 크게 당기는 버릇까지
 * 그대로 되풀이했다(엄마 표 7 → 처음 4.15 · 다시 4.41, 둘 다 대두). 이제 다시 그리기는 처음 그림(첫째) + 비율 견본(둘째)만
 * 들고 '같은 캐릭터를 그대로, 비율만 고쳐'로 그린다 — 사진·클로즈업·특징 카드는 다시 그리기에 쓰지 않는다
 * (lib/family-portrait-prompt headRedrawRecipe). 칩 갈래도 같다.
 *
 * 실패는 조용히 — 키 없음·한도 막힘·시간 초과·못 읽음이면 잰 값 없이(null) 오늘처럼 건넨다. 다시 걸지 않는다(시간은 그리기 몫).
 * 로그·결과에는 숫자(비율·걸린 시간)와 결과 갈래만 — 그림·프롬프트·사진·구글 답 글은 넣지 않는다.
 * 값: 그림 한 장(작게 줄여서) + 짧은 JSON 답이라 보통 한 번에 약 2~4원. 글 모델이 생각하는 모델이라 생각이 길어지면
 * 답 길이 상한(CHECK_MAX_OUTPUT_TOKENS)까지 — 한 번에 많아야 약 9원. 다시 그리면 그림 한 장 값(약 95원)과 재기 한 번이 더 든다.
 * 생각 설정(thinking)은 넣지 않았다(아래 measureHeadRatio). 첫 실제 로그에서 'timeout' 이 잦으면 모델에 맞춰 넣는다.
 *
 * 잰 상자(머리·전신)도 남긴 그림과 함께 돌려준다(evenOutHead boxes) — 그래도 머리가 크면 부른 쪽이 값 없이 몸을 늘인다
 * (lib/family-stretch, 사장님 승인 2026-09-29 밤). 상자도 숫자뿐이라 그림·사진이 아니다(그래도 로그에는 찍지 않는다).
 */

import {
  closerHead,
  headMiss,
  headRatioFromBoxes,
  headVerdict,
  readBox,
  type Box,
  type HeadBoxes,
  type HeadFix,
  type HeadVerdict,
} from "./family-head.ts";
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
export function readHeadBoxes(text: string): HeadBoxes | null {
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

/**
 * 한 번 잰 결과 — 로그에는 ratio·ms·outcome 만 찍는다.
 * boxes: 비율을 낸 머리·전신 상자(ratio 가 있을 때만) — 몸 늘이기(lib/family-stretch)가 턱선·발목선을 잡는 데 쓴다.
 */
export type HeadMeasure = { ratio: number | null; ms: number; outcome: string; boxes?: HeadBoxes };

type Part = { text?: string; thought?: boolean };

/**
 * 그린 그림 → 잰 비율(전신 ÷ 머리). 한 번만 부르고 timeoutMs 가 지나면 요청을 끊는다(AbortController).
 * 절대 던지지 않는다: 무엇이 잘못돼도 { ratio: null, outcome } 로 돌아온다. outcome 에는 구글 답 글을 넣지 않는다.
 */
export async function measureHeadRatio(image: GeneratedImage, opts: { timeoutMs: number }): Promise<HeadMeasure> {
  const startedAt = Date.now();
  const done = (ratio: number | null, outcome: string, boxes?: HeadBoxes): HeadMeasure => ({
    ratio,
    ms: Date.now() - startedAt,
    outcome,
    ...(boxes ? { boxes } : {}),
  });

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
    return ratio === null ? done(null, "bad-boxes") : done(ratio, "ok", boxes);
  } catch (e) {
    return done(null, ctrl.signal.aborted ? "timeout" : e instanceof SyntaxError ? "unreadable" : "network");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 다시 그린 그림의 재기가 이 갈래면 처음 그림을 남긴다(evenOutHead 5) — 글 모델이 그림을 보고 답했는데 한 사람 전신 상자를
 * 못 냈다: unreadable(한 사람 전신이 아니라며 null 을 줬거나 답을 못 읽음) · bad-boxes(상자가 전신·머리로 말이 안 됨).
 * 시간·통신·키·한도(no-time·timeout·http·network·no-key·gemini-blocked …)는 그림 탓이 아니라 넣지 않는다.
 */
const UNREADABLE_REDRAW = new Set(["unreadable", "bad-boxes"]);

/**
 * 두 장을 건넬 때의 비율(effective)로 견줄 때, 표에서 벗어난 정도(headMiss)가 이만큼도 안 다르면 같다고 보고 잰 비율로 견준다 —
 * 둘 다 늘여서 맞출 비율(표 × 0.8)에 닿으면 늘인 뒤 값은 반올림(0.01)만 다르다. 그때는 덜 늘여도 되는 쪽(잰 비율이 표에 더
 * 가까운 쪽)을 남긴다(1% 안팎).
 */
const EFFECTIVE_TIE = 0.01;

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
  /**
   * ok · no-time · 재기 실패 갈래(timeout·http 4xx …) · no-time-redraw · redraw-failed · redraw-unreadable · redraw-unmeasured ·
   * redraw-unmeasured-first · closer-first · closer-redraw
   */
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
 *  4. 다시 그리기 — redraw(처음 그림, 바로잡을 것(HeadFix), 남은 시간). 부른 쪽은 처음 그림을 첫째 참고 그림으로 삼아 비율만
 *     고쳐 그린다(lib/family-portrait-prompt headRedrawRecipe — 사진·클로즈업 없이). 실패·시간 초과면 처음 그림.
 *  5. 다시 잰다 — 쟀으면 표에 더 가까운 쪽(closerHead). effective 를 주면 건넬 때의 비율(몸 늘이기 뒤)로 견준다 — 머리가 큰
 *     처음 그림(4.6 → 늘여 5.6)과 너무 작게 다시 그린 그림(9.5)이면 처음 그림. 거의 같으면(EFFECTIVE_TIE) 잰 비율로.
 *     시간·통신 탓으로 못 쟀으면 다시 그린 그림을 남긴다(잰 비율 없이): 처음 그림은 이미 표에서 많이 벗어난 것을 알고, 다시
 *     그린 그림은 그걸 바로잡으라고 그린 것이라 더 나을 공산이 크다. 다만 머리가 큰 처음 그림을 늘여서 나아지면(effective 가
 *     잰 비율보다 크다) 처음 그림(redraw-unmeasured-first) — 못 잰 다시 그린 그림은 상자가 없어 늘일 수 없고 단체 사진도 못
 *     고른다. 늘인 처음 그림은 늘 같은 결과다(셀카 엄마 3.94 → 약 4.8, 4.15 → 약 5.1, 약 4.5 넘으면 5.6 — lib/family-stretch).
 *     글 모델이 보고도 한 사람 전신을 못 찾았으면(UNREADABLE_REDRAW) 처음 그림(redraw-unreadable) — 두 사람·전후 비교처럼
 *     깨진 그림일 공산이 크다.
 * 돌려주는 boxes 는 **남긴 그림**을 잰 상자다(ratio 와 같은 그림·같은 재기) — 못 쟀으면(ratio null) null.
 */
export async function evenOutHead<T>(o: {
  image: T;
  /** 이 사람의 표 비율(lib/family-head headChartRatio) */
  target: number;
  measure: (image: T, timeoutMs: number) => Promise<HeadMeasure>;
  /**
   * first(처음 그림)에서 같은 캐릭터를 비율만 fix 대로 고쳐 한 번 더 그린다(headRedrawRecipe). timeoutMs 안에 못 끝내면 던진다.
   * 처음 그림을 넘기는 까닭 — 다시 그리기가 사진·클로즈업·특징 카드 없이 처음 그림만으로 되게(부른 쪽은 그것들을 처음 그리기
   * 직후에 놓는다).
   */
  redraw: (first: T, fix: HeadFix, timeoutMs: number) => Promise<T>;
  /** 재기는 이 시각(Date.now 기준)까지 끝나야 한다 */
  checkUntil: number;
  /** 다시 그리기는 이 시각까지 끝나야 한다 */
  redrawUntil: number;
  /** 다시 그리기를 시작하려면 redrawUntil 까지 최소 이만큼 남아야 한다 */
  redrawMinMs: number;
  /**
   * 잰 그림(비율·상자) → 건넬 때의 비율. 부른 쪽이 머리가 큰 그림의 몸을 늘이면(lib/family-stretch ratioAfterStretch) 늘인 뒤
   * 비율을 준다 — 두 장을 견줄 때(5)와 못 잰 다시 그린 그림 대신 처음 그림을 남길지(5)에 쓴다. 없으면 잰 비율 그대로.
   */
  effective?: (ratio: number, boxes: HeadBoxes | null) => number;
  now?: () => number;
}): Promise<{ image: T; ratio: number | null; boxes: HeadBoxes | null; log: HeadPassLog }> {
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
  /** 처음 그림을 남긴다 — m 은 처음 그림을 잰 결과(못 쟀으면 null: 비율·상자 없이) */
  const first = (outcome: string, m: HeadMeasure | null) => {
    log.outcome = outcome;
    return { image: o.image, ratio: m?.ratio ?? null, boxes: m?.ratio != null ? (m.boxes ?? null) : null, log };
  };

  /** 건넬 때의 비율(effective 가 없으면 잰 비율 그대로) */
  const effective = (ratio: number, m: HeadMeasure) => o.effective?.(ratio, m.boxes ?? null) ?? ratio;

  const m1 = await measure(o.image);
  if (!m1) return first("no-time", null);
  if (m1.ratio === null) return first(m1.outcome, null);
  log.first = m1.ratio;
  const verdict = headVerdict(m1.ratio, o.target);
  log.verdict = verdict;
  if (verdict === "ok") return first("ok", m1);

  const left = o.redrawUntil - now();
  if (!(left >= o.redrawMinMs)) return first("no-time-redraw", m1);

  log.retried = true;
  const t0 = now();
  let second: T;
  try {
    second = await o.redraw(o.image, { target: o.target, verdict, measured: m1.ratio }, left);
  } catch {
    log.redrawMs = now() - t0;
    return first("redraw-failed", m1);
  }
  log.redrawMs = now() - t0;

  const m2 = await measure(second);
  if (m2?.ratio == null) {
    // 글 모델이 다시 그린 그림을 **보고도** 한 사람 전신을 못 찾았다(null 상자·이상한 상자) — 처음 그림을 참고로 '다시 그려'라고
    // 하면 두 사람을 나란히·전후 비교로 그리는 일이 있다. 쿠키를 낸 부모에게 깨진 그림을 건네지 않게 처음 그림(한 사람으로
    // 잰 그림)을 남긴다. 시간이 없거나 통신이 안 돼 못 잰 것(no-time·timeout·http·network …)은 그대로 다시 그린 그림.
    if (m2 && UNREADABLE_REDRAW.has(m2.outcome)) return first("redraw-unreadable", m1);
    // 머리가 큰 처음 그림은 부른 쪽이 늘여서 고친다(값 없이 늘 같은 결과) — 상자가 없어 늘일 수 없는 다시 그린 그림보다 낫다.
    // 머리가 작은 쪽(small)은 늘이기로 못 고치니(effective = 잰 비율) 다시 그린 그림 그대로.
    if (effective(m1.ratio, m1) > m1.ratio) return first("redraw-unmeasured-first", m1);
    log.kept = "redraw";
    log.outcome = "redraw-unmeasured";
    return { image: second, ratio: null, boxes: null, log };
  }
  log.second = m2.ratio;
  // 건넬 때의 비율로 견준다 — 거의 같으면(둘 다 늘여서 맞출 비율에 닿는 등) 잰 비율로(덜 늘여도 되는 쪽)
  const e1 = effective(m1.ratio, m1);
  const e2 = effective(m2.ratio, m2);
  const tie = Math.abs(headMiss(e1, o.target) - headMiss(e2, o.target)) < EFFECTIVE_TIE;
  if ((tie ? closerHead(m1.ratio, m2.ratio, o.target) : closerHead(e1, e2, o.target)) === "second") {
    log.kept = "redraw";
    log.outcome = "closer-redraw";
    return { image: second, ratio: m2.ratio, boxes: m2.boxes ?? null, log };
  }
  return first("closer-first", m1);
}
