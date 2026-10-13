/**
 * AI 호출 기록 — 구글(Gemini)을 부를 때마다 "어느 모델을 · 토큰 몇 개 · 얼마"를 한 줄씩 남긴다.
 *
 * 사장님 2026-10-13: "제미나이를 부를 때마다 모델·금액을 기록하게", "얼마가 나가는지에 대한 정확한 데이터를
 * 내가 끌어 달라 할 때 받아야". 그 전에는 앱에 기록이 없어 9월 금액을 cafe24 에 남은 그림 수로 거꾸로 셌다.
 *
 * 무엇을 남기나: 구글이 답에 실어 주는 usageMetadata(실제로 센 토큰)를 원문 그대로 + 아래 가격표로 계산한 달러.
 * 토큰이 사실이고 금액은 계산이다 — 가격이 바뀌거나 가격표가 틀렸으면 원문 토큰으로 다시 계산하면 된다.
 * 구글이 돈을 받지 않는 실패(429·5xx·닿지 못함)는 남기지 않는다. 답을 받지 못하고 끊긴 호출(제한 시간·서버 종료)은
 * 구글이 값을 받았어도 여기에 없다 — 달마다 구글 청구서와 맞춰 보면 그 차이가 그만큼이다.
 *
 * 어디에 남기나: 이 파일은 줄을 만들고 '보내는 곳(sink)'에 넘기기만 한다.
 *  · 서버 경로 — 부른 회원의 권한으로 log_ai_usage RPC(lib/ai-usage-db, supabase-ai-usage.sql)
 *  · 스크립트 — 서비스 키로 바로(scripts/ai-usage.mts). 서버 코드는 서비스 키를 쓰지 않는다(lib/api-auth 머리글).
 * 보내기가 실패해도 그림은 그대로 나간다 — 기록 때문에 그리기가 멈추거나 늦어지면 안 된다.
 *
 * ⚠ 단가가 들어 있다 — 서버·스크립트만 이 파일을 가져온다(브라우저 화면이 가져오면 누구나 받는 묶음에 실린다).
 */
import { AsyncLocalStorage } from "node:async_hooks";

/* ─────────────────────────── 가격표 ─────────────────────────── */

/** 달러 / 토큰 100만 개. imageOut 은 그림으로 나온 토큰(없으면 그림을 못 그리는 모델) */
export type TokenPrice = { in: number; out: number; imageOut?: number };

type PriceRow = TokenPrice & {
  /** 모델 이름 앞머리 — 더 긴 이름을 먼저 둔다(flash-lite 가 flash 보다 앞) */
  match: RegExp;
  /** 이 날(UTC)부터 이 값 — 없으면 처음부터 */
  from?: string;
};

/**
 * 구글 공식 가격표(ai.google.dev/gemini-api/docs/pricing, 2026-10-09 판 · 유료 Standard).
 * 위에서부터 맞는 줄을 찾고, 같은 모델에 날짜가 다른 줄이 여럿이면 그날에 맞는 마지막 줄을 쓴다.
 * 여기에 없는 모델은 금액을 비워 둔다(토큰은 남는다) — 틀린 값을 적는 것보다 '단가 모름'이 낫다.
 */
const GEMINI_PRICES: readonly PriceRow[] = [
  // 그림 모델 — 1K 한 장: 3.1 = 1120토큰 $0.067 · 2.5 = 1290토큰 $0.039 · nano-banana-2.1 = 1120토큰 $0.0336
  { match: /^gemini-3\.1-flash-lite-image/, in: 0.25, out: 1.5, imageOut: 30 },
  { match: /^gemini-3\.1-flash-image/, in: 0.5, out: 3, imageOut: 60 },
  { match: /^gemini-nano-banana-2\.1/, in: 1.5, out: 7.5, imageOut: 30 },
  { match: /^gemini-2\.5-flash-image/, in: 0.3, out: 2.5, imageOut: 30 },
  { match: /^gemini-3-pro-image/, in: 2, out: 12, imageOut: 120 },
  // 글 모델(검수·머리 비율·사진 특징표) — 출력 값에 생각 토큰이 들어 있다
  { match: /^gemini-3\.5-flash-lite/, in: 0.3, out: 2.5 },
  { match: /^gemini-3\.1-flash-lite/, in: 0.25, out: 1.5 },
  { match: /^gemini-2\.5-flash-lite/, in: 0.1, out: 0.4 },
  // 3.5·3.7 은 3.6·3.8 로 넘겨 답한다(2026-10-08 공지) — 값이 같다
  { match: /^gemini-3\.[5-8]-flash/, in: 0.75, out: 3.75 },
  { match: /^gemini-3\.[5-8]-flash/, in: 1.5, out: 7.5, from: "2027-01-01" },
  { match: /^gemini-3-flash/, in: 0.5, out: 3 },
  { match: /^gemini-2\.5-flash/, in: 0.3, out: 2.5 },
];

/** 이 모델의 그날 값. 가격표에 없으면 null */
export function geminiPrice(model: string, at: Date = new Date()): TokenPrice | null {
  const name = model.trim().toLowerCase().replace(/^models\//, "");
  const day = at.toISOString().slice(0, 10);
  let found: PriceRow | null = null;
  let pattern = "";
  for (const row of GEMINI_PRICES) {
    if (!row.match.test(name)) continue;
    // 먼저 맞은 줄의 모델만 본다 — 뒤에 나오는 더 느슨한 줄(flash-lite 뒤의 flash)로 넘어가지 않게
    if (pattern && row.match.source !== pattern) break;
    pattern = row.match.source;
    if (!row.from || row.from <= day) found = row;
  }
  return found ? { in: found.in, out: found.out, ...(found.imageOut !== undefined ? { imageOut: found.imageOut } : {}) } : null;
}

/* ─────────────────────────── 한 줄 만들기 ─────────────────────────── */

/** 무엇을 하려고 불렀나 */
export type AiUsageKind = "image" | "check" | "head-check" | "photo-card";

export type AiUsageRow = {
  provider: "gemini" | "openai";
  /** 실제로 답한 모델(구글이 알려 준 modelVersion) — 별칭(gemini-flash-latest)으로 불러도 진짜 이름이 남는다 */
  model: string;
  /** 우리가 부른 이름 */
  asked: string;
  kind: AiUsageKind;
  /** image(그림이 옴) · text(글 답) · no-image(그림 없이 끝남) · blocked(안전 검사로 막힘) */
  outcome: string;
  tokensIn: number;
  /** 글·생각으로 나온 토큰 */
  tokensOut: number;
  /** 그림으로 나온 토큰 */
  tokensImageOut: number;
  images: number;
  /** 가격표로 계산한 달러. 가격표에 없는 모델이면 null */
  usd: number | null;
  /** 구글이 준 usageMetadata 원문 */
  raw: unknown;
};

type TokenDetail = { modality?: string; tokenCount?: number };
type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  candidatesTokensDetails?: TokenDetail[];
};
type GeminiAnswer = {
  modelVersion?: string;
  usageMetadata?: GeminiUsage;
  promptFeedback?: { blockReason?: string };
  candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[];
};

const count = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
/** 소수 여섯 자리 달러(DB 칸과 같다) */
const micro = (usd: number): number => Math.round(usd * 1e6) / 1e6;

/**
 * 구글 답(JSON) → 기록 한 줄. 답에 usageMetadata 가 없으면 null(셀 것이 없다).
 * 그림 토큰: 구글이 종류별로 갈라 주면(candidatesTokensDetails 의 IMAGE) 그 수, 안 갈라 주면 그림이 온 답의 출력 전부.
 */
export function geminiUsageRow(asked: string, kind: AiUsageKind, answer: unknown, at: Date = new Date()): AiUsageRow | null {
  const json = (answer ?? {}) as GeminiAnswer;
  const usage = json.usageMetadata;
  if (!usage || typeof usage !== "object") return null;

  const images = (json.candidates?.[0]?.content?.parts ?? []).filter((p) => (p.inlineData ?? p.inline_data)?.data).length;
  const model = String(json.modelVersion ?? asked).trim().replace(/^models\//, "") || asked;
  const price = geminiPrice(model, at);

  const tokensIn = count(usage.promptTokenCount) + count(usage.toolUsePromptTokenCount);
  const candidates = count(usage.candidatesTokenCount);
  const split = Array.isArray(usage.candidatesTokensDetails) ? usage.candidatesTokensDetails : null;
  const imageDetail = split ? split.filter((d) => String(d.modality).toUpperCase() === "IMAGE").reduce((s, d) => s + count(d.tokenCount), 0) : null;
  const tokensImageOut = Math.min(candidates, imageDetail ?? (images > 0 ? candidates : 0));
  const tokensOut = candidates - tokensImageOut + count(usage.thoughtsTokenCount);

  const usd =
    price && (tokensImageOut === 0 || price.imageOut !== undefined)
      ? micro((tokensIn * price.in + tokensOut * price.out + tokensImageOut * (price.imageOut ?? 0)) / 1e6)
      : null;

  return {
    provider: "gemini",
    model,
    asked,
    kind,
    outcome: json.promptFeedback?.blockReason ? "blocked" : images > 0 ? "image" : kind === "image" ? "no-image" : "text",
    tokensIn,
    tokensOut,
    tokensImageOut,
    images,
    usd,
    raw: usage,
  };
}

type OpenAiImageAnswer = {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

/**
 * OpenAI 그림 답 → 기록 한 줄(Gemini 가 막혔을 때 대신 그린 것 · IMAGE_PROVIDER=openai).
 * 토큰만 남기고 금액은 비운다 — OpenAI 단가는 이 가격표에서 확인하지 않았다(OpenAI 사용량 화면이 기준).
 */
export function openaiImageUsageRow(model: string, answer: unknown): AiUsageRow | null {
  const json = (answer ?? {}) as OpenAiImageAnswer;
  const usage = json.usage;
  if (!usage || typeof usage !== "object") return null;
  const images = (json.data ?? []).filter((d) => d?.b64_json).length;
  return {
    provider: "openai",
    model,
    asked: model,
    kind: "image",
    outcome: images > 0 ? "image" : "no-image",
    tokensIn: count(usage.input_tokens),
    tokensOut: 0,
    tokensImageOut: count(usage.output_tokens),
    images,
    usd: null,
    raw: usage,
  };
}

/* ─────────────────────────── 보내기 ─────────────────────────── */

/** DB 에 들어가는 한 줄(칸 이름 그대로) */
export type AiUsageRecord = {
  env: string;
  route: string;
  kind: string;
  provider: string;
  model: string;
  asked: string;
  outcome: string;
  tokens_in: number;
  tokens_out: number;
  tokens_image_out: number;
  images: number;
  usd: number | null;
  raw: unknown;
};

/** 기록을 실제로 적는 곳. 던져도 된다 — 부른 쪽(reportAiUsage)이 삼킨다 */
export type AiUsageSink = (records: AiUsageRecord[]) => Promise<void>;

type Scope = { route: string; sink: AiUsageSink | null };
const scopes = new AsyncLocalStorage<Scope>();
/** 범위 밖(스크립트)에서 쓰는 곳 */
let fallback: { route: string; env: string; sink: AiUsageSink } | null = null;
/** 아직 다 적지 못한 기록 */
const pending = new Set<Promise<void>>();
/** 한 번 적는 데 기다리는 한도 — 이보다 늦으면 놓고 간다(그림이 먼저다) */
const WRITE_TIMEOUT_MS = 4_000;
let warned = false;

function whereRunning(): string {
  return process.env.VERCEL ? "vercel" : "local";
}

export function toRecord(row: AiUsageRow, route: string, env: string): AiUsageRecord {
  return {
    env,
    route,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    asked: row.asked,
    outcome: row.outcome,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    tokens_image_out: row.tokensImageOut,
    images: row.images,
    usd: row.usd,
    raw: row.raw,
  };
}

/**
 * 한 줄을 적어 달라고 넘긴다. 기다리지 않고 곧바로 돌아오며 절대 던지지 않는다.
 * 적을 곳이 없거나(범위 밖) 적다가 실패하면 서버 로그에 그 줄을 남긴다 — 조용히 사라지지 않게.
 */
export function reportAiUsage(row: AiUsageRow | null): void {
  if (!row) return;
  try {
    const scope = scopes.getStore();
    const sink = scope?.sink ?? fallback?.sink ?? null;
    const record = toRecord(row, scope?.route ?? fallback?.route ?? "", scope ? whereRunning() : (fallback?.env ?? whereRunning()));
    if (!sink) {
      console.log("[ai-usage] 적을 곳 없음", JSON.stringify({ ...record, raw: undefined }));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const job = Promise.race([
      sink([record]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), WRITE_TIMEOUT_MS);
      }),
    ])
      .catch((e: unknown) => {
        if (!warned) {
          warned = true;
          console.warn("[ai-usage] 기록을 적지 못했어요(supabase-ai-usage.sql 을 돌렸는지 확인):", (e as Error)?.message ?? e);
        }
        console.log("[ai-usage] 못 적은 줄", JSON.stringify({ ...record, raw: undefined }));
      })
      .finally(() => {
        clearTimeout(timer);
        pending.delete(job);
      });
    pending.add(job);
  } catch {
    // 기록은 그리기를 막지 않는다
  }
}

/** 아직 적는 중인 기록이 끝나기를 기다린다(서버가 답을 보내고 멈추기 전에 · 스크립트가 끝나기 전에) */
export async function settleAiUsage(): Promise<void> {
  if (pending.size) await Promise.allSettled([...pending]);
}

/**
 * 서버 경로 하나를 감싼다 — 이 안에서 부른 AI 호출이 route 이름으로 기록되고, 답을 돌려주기 전에 다 적는다.
 * 적을 곳은 로그인을 확인한 뒤 bindAiUsageSink 로 붙인다.
 */
export function withAiUsage<T>(route: string, work: () => Promise<T>): Promise<T> {
  return scopes.run({ route, sink: null }, async () => {
    try {
      return await work();
    } finally {
      await settleAiUsage();
    }
  });
}

/** 지금 경로의 기록을 이곳에 적는다(withAiUsage 안에서만 뜻이 있다) */
export function bindAiUsageSink(sink: AiUsageSink): void {
  const scope = scopes.getStore();
  if (scope) scope.sink = sink;
}

/** 스크립트용 — 범위 밖의 호출을 이곳에 적는다. null 이면 끈다 */
export function setDefaultAiUsageSink(target: { route: string; env: string; sink: AiUsageSink } | null): void {
  fallback = target;
}

/** 시험에서만 — 경고를 다시 켠다 */
export function resetAiUsageForTests(): void {
  warned = false;
  fallback = null;
}
