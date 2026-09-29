/**
 * 만들기 기록(book_jobs) — 부모가 동화를 한 번 만들 때마다 한 줄.
 *
 * 왜 필요한가: "토큰은 빠졌는데 책이 계정에 없다"는 컴플레인이 왔을 때, 예전엔
 * 확인할 길이 없었다. 저장이 조용히 실패하면 서버에도 기기에도 흔적이 안 남았다.
 * 이제 대본을 쓸 때부터 저장이 끝날 때까지 단계와 원고, 결제 장부 id 를 이 표에 남긴다.
 * 표·지킴이·권한은 supabase-setup.sql 섹션 15~17 에 있다.
 *
 * ⚠️ 기록 쓰기는 **보조 수단이다.** 여기서 무엇이 실패해도(표 없음·권한·네트워크) 만들기
 * 흐름은 멈추지 않는다 — 그래서 아래 DB 함수들은 절대 던지지 않고 결과만 돌려준다.
 * 반대로 **책 저장** 실패는 반드시 드러내야 한다(interpretBookSave).
 *
 * 판단(무엇을 걷어낼지·오류가 무슨 뜻인지)은 순수 함수로 두어 book-jobs.test.ts 로 시험한다.
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너가 @/ 별칭을 못 읽는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type JobStatus =
  | "writing"
  | "script"
  | "drawing"
  | "uploading"
  | "saving"
  | "saved"
  | "failed"
  | "cancelled"
  | "restored";

/** 쪽별 실패 이유. page 는 사람이 읽는 1부터 센 쪽 번호다. */
export type JobFailure = { page?: number; stage: "draw" | "upload" | "sheet" | "save"; reason: string };

/** 앱이 읽는 기록 칸. select('*') 는 칸 권한 오류가 나므로 늘 칸을 적어 읽는다. */
export type JobRow = {
  id: string;
  book_id: string | null;
  status: JobStatus;
  page_count: number | null;
  story_entry: string | null;
  illustration_entry: string | null;
  manuscript: Record<string, unknown> | null;
  /**
   * 그림 값 장부 줄이 환불됐나 — 표의 칸이 아니라 readJobResult 가 장부(token_ledger)를 따로 읽어 채운다.
   * true 환불됨 · false 안 됨 · null/없음 모름(못 읽음).
   *
   * 왜: 마스터 환불(master_refund_entry)은 장부 줄을 지우지 않고 refunded_at 만 채운다. 그래서 기록의
   * illustration_entry 는 그대로 남아, 환불받은 뒤에도 '값 냈음'으로 인정돼 같은 책을 값 없이 다시 저장했다.
   */
  illustration_refunded?: boolean | null;
};
export const JOB_READ_COLUMNS = "id,book_id,status,page_count,story_entry,illustration_entry,manuscript";

/** supabase-js 가 돌려주는 오류 모양(필요한 것만). */
export type DbError = { code?: string | null; message?: string | null } | null | undefined;

/* ── 순수 함수 ─────────────────────────────────────────────────────────── */

/** base64 로 박힌 그림인가(cafe24 에 못 올린 그림). */
export function isEmbeddedImage(v: unknown): v is string {
  return typeof v === "string" && /^\s*data:/i.test(v);
}

/** 기록 id(uuid) 모양인가 — 서버가 요청 본문의 jobId 를 믿기 전에 모양부터 본다. */
export function isJobId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * 원고에서 base64 그림을 걷어낸다 — 그림 자리는 null, 그 밖의 자리에 섞인 base64 는 지운다.
 *
 * 왜 앱에서도 하나: DB 지킴이가 그림 자리의 base64 는 비워 주지만, 그 전에 수 MB 가
 * 네트워크를 타고 간다. 게다가 그림 자리가 아닌 곳에 base64 가 하나라도 있으면
 * 쓰기 전체가 거절되어 상태·실패 장수까지 같이 사라진다. 그래서 보내기 전에 걷는다.
 * 원본 책은 건드리지 않는다(저장은 원본으로 한다).
 */
export function stripEmbeddedArt<T extends object>(
  book: T,
): { manuscript: T; stripped: number; pages: number[] } {
  // JSON 으로 한 번 돌려 깊은 복사 — undefined 칸도 함께 빠진다(jsonb 에 못 들어간다).
  const copy = JSON.parse(JSON.stringify(book)) as Record<string, unknown>;
  let stripped = 0;
  const pages: number[] = [];

  for (const key of ["coverImage", "characterSheet"]) {
    if (isEmbeddedImage(copy[key])) {
      copy[key] = null;
      stripped++;
    }
  }
  if (Array.isArray(copy.pages)) {
    copy.pages.forEach((p, i) => {
      if (p && typeof p === "object" && isEmbeddedImage((p as Record<string, unknown>).image)) {
        (p as Record<string, unknown>).image = null;
        stripped++;
        pages.push(i + 1);
      }
    });
  }
  if (Array.isArray(copy.locationSheets)) {
    copy.locationSheets.forEach((s) => {
      if (s && typeof s === "object" && isEmbeddedImage((s as Record<string, unknown>).image)) {
        (s as Record<string, unknown>).image = null;
        stripped++;
      }
    });
  }

  // 그림 자리가 아닌 곳의 base64 — 세지 않고 지운다(있으면 DB 가 쓰기를 통째로 거절한다).
  const scrub = (node: unknown): unknown => {
    if (typeof node === "string") return /data:image|;base64,/i.test(node) ? null : node;
    if (Array.isArray(node)) return node.map(scrub);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = scrub(v);
      return out;
    }
    return node;
  };
  return { manuscript: scrub(copy) as T, stripped, pages };
}

/**
 * 대본 단계 원고 — Book 과 같은 모양, 그림은 아직 없다(image: null).
 * 서버(/api/story)와 브라우저(그리기 시작)가 같은 모양으로 적게 한 곳에 둔다.
 */
export function storyManuscript(story: {
  title: string;
  summary: string;
  characters?: { name: string; description: string; outfit?: string }[];
  pages: { text: string; imagePrompt?: string; voiceDirection?: unknown }[];
}): Record<string, unknown> {
  return {
    title: story.title,
    summary: story.summary,
    // outfit — 이 책의 옷(2026-09-29~). 마스터가 되살려 다시 그릴 때도 같은 옷이 되게 남긴다. 옛 대본엔 없다.
    cast: (story.characters ?? []).map((c) => ({
      name: c.name,
      description: c.description,
      ...(c.outfit ? { outfit: c.outfit } : {}),
    })),
    pageCount: story.pages.length,
    pages: story.pages.map((p) => ({
      text: p.text,
      imagePrompt: p.imagePrompt ?? "",
      voiceDirection: p.voiceDirection ?? null,
      image: null,
    })),
  };
}

/**
 * 실패 이유 목록을 DB 상한 안으로 다듬는다.
 * 지킴이는 200개·50KB 를 넘거나 base64 가 섞이면 쓰기를 통째로 거절한다 — 그러면
 * 같이 보낸 상태·장수까지 사라지므로, 넘치면 뒤쪽(최근)만 남기고 긴 이유는 자른다.
 */
export function capFailures(list: JobFailure[], max = 60): JobFailure[] {
  return list.slice(-max).map((f) => ({
    ...f,
    reason: String(f.reason ?? "")
      .replace(/data:[^\s"]*/gi, "[그림 데이터]")
      .slice(0, 300),
  }));
}

/** 회원이 쓸 수 있는 칸(supabase-setup.sql 의 grant insert/update). 다른 칸은 권한 오류다. */
const WRITABLE = new Set([
  "owner",
  "book_id",
  "status",
  "page_count",
  "drawn",
  "draw_failed",
  "upload_failed",
  "failures",
  "error",
  "story_entry",
  "illustration_entry",
  "manuscript",
]);

/** 쓸 수 있는 칸만 남긴다 — 칸 하나가 틀려도 쓰기 전체가 권한 오류로 거절되기 때문이다. */
export function pickWritable(patch: Record<string, unknown>, forInsert = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !WRITABLE.has(k)) continue;
    if (k === "owner" && !forInsert) continue; // 주인은 update 권한이 없다
    out[k] = v;
  }
  return out;
}

export type JobWriteProblem = "none" | "missing" | "limit" | "invalid" | "denied" | "network" | "other";

/**
 * 기록 쓰기 오류의 뜻.
 *  · missing — SQL 을 아직 안 돌린 DB(표·함수 없음). 앱은 예전처럼 돈다.
 *  · limit   — 회원 하루 60줄·원고 20MB 상한(54000).
 *  · invalid — 지킴이가 값을 거절(22023).
 *  · denied  — 권한·바꿀 수 없는 칸(42501).
 */
export function jobWriteProblem(error: DbError): JobWriteProblem {
  if (!error) return "none";
  const code = String(error.code ?? "");
  const m = String(error.message ?? "").toLowerCase();
  // 코드로만 가린다(2026-09-14 고침). 예전엔 'does not exist'·'could not find' 문구로도 켰는데,
  // 지워진 회원의 JWT('User from sub claim in JWT does not exist')나 SQL 적용 직후 스키마 캐시
  // 오류(PGRST204 'Could not find the … column')까지 '표 없음'으로 보고 10분 동안 모든 기록을
  // 건너뛰었다. 브라우저에서는 그 쉼이 기록 읽기를 막아 그림 값 판단까지 흐렸다.
  if (code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205") {
    return "missing";
  }
  if (code === "54000") return "limit";
  if (code === "22023") return "invalid";
  if (code === "42501") return "denied";
  if (!code && /failed to fetch|networkerror|fetch failed|network request failed|load failed|abort|timed? ?out/.test(m)) {
    return "network";
  }
  return "other";
}

export type ChargeProblem = "missing" | "already-charged" | "other-book" | "no-job" | "insufficient" | "login" | "other";

/**
 * charge_illustration 거절의 뜻 — 무엇을 할지 부르는 쪽이 정한다.
 *  · missing         — 함수가 없는 옛 DB → spend_tokens 로 물러선다
 *  · no-job          — 기록이 없다(서버가 기록을 못 만들었다) → spend_tokens 로 물러선다
 *  · already-charged — 이 기록엔 이미 그림 값이 붙었다 → **곧바로 새로 받지 않는다.**
 *                      기록을 다시 읽어 recoverFromChargeRefusal 로 정한다(이중 과금 막기)
 *  · other-book      — 이 기록엔 다른 책 id 가 정해져 있다 → 역시 기록을 읽고 정한다
 *  · insufficient/login/other — 진짜 거절. 값을 받지 않고 멈춘다.
 * 함수가 돌려주는 문구로 가린다 — 셋 다 22023 이라 코드만으로는 못 가른다.
 */
export function chargeProblem(error: DbError): ChargeProblem {
  if (!error) return "other";
  const msg = String(error.message ?? "");
  if (jobWriteProblem(error) === "missing") return "missing";
  if (msg.includes("이미 그림 값")) return "already-charged";
  if (msg.includes("다른 책 id")) return "other-book";
  if (msg.includes("만들기 기록이 없")) return "no-job";
  if (error.code === "22003" || msg.includes("토큰이 부족")) return "insufficient";
  if (error.code === "42501" || msg.includes("로그인")) return "login";
  return "other";
}

export type SaveBookResult =
  | { ok: true }
  | { ok: false; reason: string; retryable: boolean; code: string };

/**
 * 책 저장(upsert … select id) 결과 해석.
 *
 * supabase-js 는 실패해도 던지지 않고 {error} 로 돌려준다. 그리고 RLS 에 막히면 오류 없이
 * 0줄이 오기도 한다. 그래서 오류와 '실제로 남은 줄'을 둘 다 본다(updateBookData 와 같은 교훈).
 * 로그인이 풀린 것도 성공인 척 넘기지 않고 실패로 돌려준다.
 * 문구는 부모가 읽는다 — 쉬운 말로.
 */
export function interpretBookSave(args: { uid: string | null; error: DbError; rows: unknown }): SaveBookResult {
  if (!args.uid) {
    return {
      ok: false,
      code: "no-session",
      retryable: false,
      reason: "로그인이 풀려서 책장에 넣지 못했어요. 다른 창에서 다시 로그인한 뒤 '다시 저장하기'를 눌러 주세요.",
    };
  }
  const e = args.error;
  if (e) {
    const code = String(e.code ?? "");
    const m = String(e.message ?? "").toLowerCase();
    if (code === "42501" || m.includes("row-level security")) {
      return {
        ok: false,
        code: code || "denied",
        retryable: false,
        reason: "이 책을 저장할 권한이 없다고 나왔어요. 고객센터에 알려 주세요.",
      };
    }
    if (code === "413" || code === "54000" || m.includes("too large") || m.includes("payload")) {
      return {
        ok: false,
        code: code || "too-large",
        retryable: false,
        reason: "책이 너무 커서 저장하지 못했어요. 잠시 뒤 '다시 저장하기'를 눌러 주세요.",
      };
    }
    if (jobWriteProblem(e) === "network" || code === "57014" || m.includes("timeout")) {
      return {
        ok: false,
        code: code || "network",
        retryable: true,
        reason: "인터넷 연결이 불안해서 저장하지 못했어요. 연결을 확인하고 '다시 저장하기'를 눌러 주세요.",
      };
    }
    return {
      ok: false,
      code: code || "error",
      retryable: true,
      reason: `저장 중에 문제가 생겼어요. ('다시 저장하기'를 눌러 주세요 · ${String(e.message ?? "").slice(0, 80)})`,
    };
  }
  if (!Array.isArray(args.rows) || args.rows.length === 0) {
    return {
      ok: false,
      code: "no-row",
      retryable: true,
      reason: "저장했다는 확인이 오지 않았어요. '다시 저장하기'를 눌러 주세요.",
    };
  }
  return { ok: true };
}

/**
 * '그림 값은 냈는데 책장에 못 넣은' 표시 — 이 기기의 localStorage 에 둔다.
 *
 * 왜: 저장이 실패하면 그리기 보관을 지우지 않으므로, 새로고침 뒤 '이어서 그리기'로 다시
 * 저장할 수 있다. 그런데 그대로 두면 그때 그림 값을 **또** 받는다. 이 표시가 있으면
 * 같은 책 id 로 값 없이 저장만 다시 한다. (기록 표가 있는 DB 에서는 기록으로도 가린다 —
 * 이 표시는 기록 표가 없는 옛 DB 와 기록 읽기가 실패한 경우를 위한 것이다.)
 */
export type PaidMarker = { bookId: string; jobId: string | null; at: number };
export const PAID_MARKER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 저장된 표시를 읽는다. 모양이 틀렸거나 이레가 지났으면 null. */
export function readPaidMarker(raw: string | null, now: number): PaidMarker | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PaidMarker>;
    if (typeof v?.bookId !== "string" || !/^my-[A-Za-z0-9_-]{1,77}$/.test(v.bookId)) return null;
    if (typeof v.at !== "number" || now - v.at > PAID_MARKER_TTL_MS || v.at > now + 60_000) return null;
    return { bookId: v.bookId, jobId: isJobId(v.jobId) ? v.jobId : null, at: v.at };
  } catch {
    return null;
  }
}

/** 지금 그리는 그림 — 기록의 원고와 '같은 그림인가'를 견줄 때 쓴다. */
export type DrawingNow = { pageTexts: string[]; artStyleId: string };

/**
 * 기록 원고가 지금 대본·그림체와 같은가 — 같음 · 다름 · 모름.
 *  · 쪽 본문이 하나라도 다르거나 쪽수가 다르면 다른 그림이다.
 *  · 원고에 그림체가 적혀 있으면 그것도 같아야 한다.
 *  · 원고에 쪽이 없으면(원고 쓰기가 모두 실패·90일 지나 비움) '모름'이다.
 */
export function drawingMatch(
  manuscript: Record<string, unknown> | null | undefined,
  now: DrawingNow | undefined,
): "same" | "different" | "unknown" {
  if (!now) return "same";
  const pages = manuscript && Array.isArray(manuscript.pages) ? (manuscript.pages as unknown[]) : null;
  if (!pages || pages.length === 0) return "unknown";
  if (pages.length !== now.pageTexts.length) return "different";
  for (let i = 0; i < pages.length; i++) {
    const t = pages[i] && typeof pages[i] === "object" ? (pages[i] as Record<string, unknown>).text : undefined;
    if (typeof t !== "string" || t !== now.pageTexts[i]) return "different";
  }
  const style = manuscript?.artStyleId;
  if (typeof style === "string" && style !== now.artStyleId) return "different";
  return "same";
}

/** 예전 모양 — '모름'을 같은 것으로 본다. 돈 판단은 planFromJob 이 drawingMatch 로 따로 한다. */
export function sameDrawing(manuscript: Record<string, unknown> | null | undefined, now: DrawingNow | undefined): boolean {
  return drawingMatch(manuscript, now) !== "different";
}

/**
 * 기록을 이어 써도 되나, 새로 만들어야 하나.
 *  · 끝난 기록(saved·restored·cancelled)은 이어 쓰지 않는다 — 새 줄.
 *  · 열린 기록에 책 id 가 이미 있으면 그 id 를 쓴다(지킴이가 책 id 를 못 바꾸게 한다).
 *  · 열린 기록에 그림 값까지 붙어 있으면 = 지난번에 값을 받고 저장이 실패한 것 → 다시 받지 않는다.
 *  · 단, **같은 그림일 때만.** (2026-09-14 고침) 값을 낸 기록에서 그림체를 바꾸거나 대본을
 *    바꿔 전 쪽을 새로 그리면, 예전엔 그 새 그림 한 벌을 값 없이 저장했다. 값 면제는
 *    '같은 그림으로 저장만 다시'로 좁히고, 다른 그림이면 새 기록에서 예전처럼 값을 받는다.
 *    (책 id 가 못 박힌 줄이라 새 그림을 그 줄에 이어 쓸 수도 없다 — 그래서 reuse 도 false)
 *  · 그림 값이 **환불된** 기록은 값을 낸 기록이 아니다 — 새 줄에서 받는다(환불 받고 책도 받는 길을 막는다).
 *  · 값이 붙었는데 원고에 쪽이 없어 같은 그림인지 모르면 needsCheck — 받지도, 공짜로 저장하지도 않고 멈춘다.
 *    예전엔 '모름'을 같은 것으로 봐, 그림체를 바꾼 새 그림 한 벌을 값 없이 저장할 수 있었다.
 *    (지금은 값을 받기 직전에 원고를 적으므로 이 모양은 기록 쓰기가 줄줄이 실패한 드문 경우뿐이다)
 */
export function planFromJob(
  job:
    | (Pick<JobRow, "status" | "book_id" | "illustration_entry"> & {
        manuscript?: JobRow["manuscript"];
        illustration_refunded?: boolean | null;
      })
    | null,
  now?: DrawingNow,
): {
  reuse: boolean;
  bookId: string | null;
  alreadyPaid: boolean;
  needsCheck?: true;
} {
  if (!job) return { reuse: false, bookId: null, alreadyPaid: false };
  if (job.status === "saved" || job.status === "restored" || job.status === "cancelled") {
    return { reuse: false, bookId: null, alreadyPaid: false };
  }
  if (job.illustration_entry && job.illustration_refunded === true) {
    return { reuse: false, bookId: null, alreadyPaid: false };
  }
  const bookId = job.book_id && /^my-[A-Za-z0-9_-]{1,77}$/.test(job.book_id) ? job.book_id : null;
  if (bookId || job.illustration_entry) {
    const match = drawingMatch(job.manuscript, now);
    if (match === "different") return { reuse: false, bookId: null, alreadyPaid: false };
    if (match === "unknown" && job.illustration_entry) {
      return { reuse: true, bookId, alreadyPaid: false, needsCheck: true };
    }
  }
  return { reuse: true, bookId, alreadyPaid: Boolean(bookId && job.illustration_entry) };
}

/** 기록 읽기 결과 — '못 읽음(모름)'과 '그런 기록 없음'을 가른다. 돈 판단에서 둘을 섞으면 이중 과금이 난다. */
export type JobRead = { ok: true; job: JobRow | null } | { ok: false; missing?: boolean };

export type ChargeRecovery =
  | { action: "already-paid"; bookId: string }
  | { action: "retry-same-job"; bookId: string | null }
  | { action: "new-job" }
  | { action: "stop" };

/**
 * charge_illustration 이 already-charged·other-book 으로 거절했을 때 무엇을 할까.
 *
 * 왜 따로 두나: 앞서 finish 가 '값을 낸 기록이면 다시 받지 않는다'로 정했는데도 이 거절이 왔다면,
 * 앞선 판단이 기록을 못 읽었다는 뜻이다(응답이 끊긴 결제·순간 네트워크 오류). 예전엔 여기서
 * 무조건 새 줄을 만들어 값을 한 번 더 받았다 — 같은 그림에 그림 값 두 번.
 *  · 못 읽음        → stop. 받았는지 모르니 받지 않고 멈춘다(잠시 뒤 다시).
 *  · 값 붙음·같은 그림 → already-paid. 받지 않고 기록의 책 id 로 저장한다.
 *  · 값 없이 책 id 만 → retry-same-job. 그 책 id 로 다시 받는다(마스터·글만 책이 이 모양).
 *  · 끝난 기록·다른 그림 → new-job. 새 책이니 새 줄에서 받는 것이 맞다(예전 규칙 그대로).
 */
export function recoverFromChargeRefusal(read: JobRead, now?: DrawingNow): ChargeRecovery {
  if (!read.ok || !read.job) return { action: "stop" };
  const plan = planFromJob(read.job, now);
  if (plan.needsCheck) return { action: "stop" };
  if (!plan.reuse) return { action: "new-job" };
  if (plan.alreadyPaid && plan.bookId) return { action: "already-paid", bookId: plan.bookId };
  if (read.job.illustration_entry) return { action: "stop" }; // 값은 붙었는데 책 id 모양이 이상하다 — 사람 확인
  return { action: "retry-same-job", bookId: plan.bookId };
}

/** 장부 한 줄(회원이 읽을 수 있는 칸만). */
export type LedgerRow = { id: string; amount: number; refunded_at: string | null };

/**
 * 옛 방식(spend_tokens)이 오류로 돌아왔을 때 — 정말 안 나갔나, 나갔나, 모르나.
 *
 * 예전엔 잔액 차이(전 − 후 ≥ 값)를 '받았다'의 증거로 썼다. 잔액은 계정 전체의 증감이라 다른 탭의
 * 대본 값·다른 책 그림 값이 섞이면 **값 없이 저장**됐고, 그 사이 마스터 충전·환불이 섞이거나 끊긴 요청이
 * 뒤늦게 커밋되면 '안 나갔다, 다시 누르라'고 해 **두 번 깎였다**. 이제 장부의 그림 값 줄로만 본다:
 *  · 서버가 분명히 거절했다(네트워크 끊김이 아님) → not-paid. 함수 안에서 거절되면 차감도 함께 취소된다.
 *  · 끊긴 요청이면 장부를 본다: 시작 전에 없던 그림 값 줄이 정확히 하나, 금액이 같고 환불 안 됨 → paid
 *  · 그 밖(장부를 못 읽음 · 새 줄이 없음(뒤늦게 커밋될 수 있다) · 둘 이상 · 금액이 다름) → unknown.
 *    다시 누르라고 하지 않는다.
 */
export function judgeSpendAfterError(input: {
  before: LedgerRow[] | null;
  after: LedgerRow[] | null;
  cost: number;
  networkish: boolean;
}): { verdict: "paid"; entry: string } | { verdict: "not-paid" } | { verdict: "unknown" } {
  if (!input.networkish) return { verdict: "not-paid" };
  if (!input.before || !input.after) return { verdict: "unknown" };
  const seen = new Set(input.before.map((r) => r.id));
  const fresh = input.after.filter((r) => !seen.has(r.id) && !r.refunded_at);
  if (fresh.length === 1 && fresh[0].amount === input.cost) return { verdict: "paid", entry: fresh[0].id };
  return { verdict: "unknown" };
}

/** 돈 요청 오류 문구가 '연결이 끊김'인가 — 끊겼으면 서버에서는 커밋됐을 수 있다. */
export function looksNetworkish(message: string): boolean {
  return /failed to fetch|networkerror|fetch failed|network request failed|load failed|abort|timed? ?out|timeout|연결/i.test(
    message ?? "",
  );
}

/**
 * 같은 줄거리 '다시 쓰기'가 이 기록을 되열어 고쳐도 되나(서버 /api/story 가 쓴다).
 *
 * 그림 값이나 책 id 가 붙은 줄은 안 된다(2026-09-14 고침). 값 내고 저장 못 한 기록을 되열면
 * 되살릴 원고(올린 그림 주소)가 새 대본으로 덮이고, 그 줄의 '값 냈음'이 새 대본에 옮겨 붙었다.
 * 그런 줄은 두고 새 줄을 만든다.
 */
export function canReopenForRewrite(job: Pick<JobRow, "status" | "book_id" | "illustration_entry"> | null): boolean {
  if (!job) return false;
  if (job.book_id || job.illustration_entry) return false;
  return job.status === "writing" || job.status === "script" || job.status === "drawing" || job.status === "failed";
}

/**
 * 약속을 정해진 시간까지만 기다린다 — 기록 쓰기처럼 '보조' 요청이 흐름을 붙들지 않게.
 * 시간이 넘으면 fallback 을 돌려준다(원래 요청은 뒤에서 계속 간다).
 */
export function waitAtMost<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/* ── DB 쓰기 — 절대 던지지 않는다 ─────────────────────────────────────── */

/*
 * 표가 없는 DB(SQL 미적용)에서 쪽마다 헛된 요청과 오류 로그가 쌓이지 않게,
 * 한 번 '없음'을 보면 잠시 쉰다. 영영 끄지 않는 까닭: 서버는 한 번 뜬 뒤 오래 살아 있어서,
 * 그 사이 SQL 을 돌리면 다시 쓰기 시작해야 한다.
 */
let missingUntil = 0;
const MISSING_PAUSE_MS = 10 * 60 * 1000;

/*
 * 기록 요청 하나가 끝없이 매달리지 않게 시간을 건다(2026-09-14 더함).
 * supabase-js 요청에는 기본 제한 시간이 없다. 모바일 망이 끊기지 않고 멈추면 기록 쓰기가
 * 영영 안 끝나고, 그 뒤에 줄 선 '그림 값 받기·책 저장'까지 시작을 못 했다.
 * 기록은 보조 수단이라 늦으면 버리고 흐름을 먼저 보낸다.
 */
const JOB_TIMEOUT_MS = 8000;
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

function report(where: string, error: DbError): JobWriteProblem {
  const kind = jobWriteProblem(error);
  if (kind === "missing") {
    missingUntil = Date.now() + MISSING_PAUSE_MS;
    console.warn(`[book_jobs] ${where}: 기록 표가 아직 없어요(SQL 미적용) — 기록 없이 계속합니다.`);
  } else if (kind !== "none") {
    console.error(`[book_jobs] ${where} (${kind})`, error?.code, error?.message);
  }
  return kind;
}

/** 새 기록을 만들고 id 를 돌려준다. 실패하면 null — 흐름은 계속된다. */
export async function insertJob(db: SupabaseClient | null, row: Record<string, unknown>): Promise<string | null> {
  if (!db || Date.now() < missingUntil) return null;
  try {
    let q = db.from("book_jobs").insert(pickWritable(row, true)).select("id");
    const signal = timeoutSignal(JOB_TIMEOUT_MS);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q.single();
    if (error) {
      report("insert", error);
      return null;
    }
    const id = (data as { id?: string } | null)?.id;
    return isJobId(id) ? id : null;
  } catch (e) {
    report("insert", { message: String(e) });
    return null;
  }
}

/** 기록을 고친다. 실제로 한 줄이 바뀌었으면 true. */
export async function updateJob(
  db: SupabaseClient | null,
  id: string | null | undefined,
  patch: Record<string, unknown>,
  /**
   * 이 상태일 때만 고친다 — 늦게 도착한 쓰기가 앞선 단계를 되돌리지 않게.
   * 예: 서버가 응답 뒤(after)에 적는 '대본 끝(script)'이, 그 사이 브라우저가 적은 'drawing'과 원고를 덮었다.
   */
  onlyStatus?: JobStatus[],
): Promise<boolean> {
  if (!db || !isJobId(id) || Date.now() < missingUntil) return false;
  const body = pickWritable(patch);
  if (Object.keys(body).length === 0) return false;
  try {
    let q = onlyStatus?.length
      ? db.from("book_jobs").update(body).eq("id", id).in("status", onlyStatus).select("id")
      : db.from("book_jobs").update(body).eq("id", id).select("id");
    const signal = timeoutSignal(JOB_TIMEOUT_MS);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error) {
      report(`update ${String(patch.status ?? "")}`, error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    report("update", { message: String(e) });
    return false;
  }
}

/**
 * 기록 한 줄을 읽는다(칸을 적어서).
 * {ok:false} = 못 읽음(네트워크·시간 초과·표 없음 쉼) — '모름'이다.
 * {ok:true, job:null} = 읽었는데 그런 기록이 없다(남의 것이거나 없는 id).
 * 그림 값을 받을지 정하는 자리는 둘을 반드시 갈라 봐야 한다(모를 때 받으면 이중 과금).
 */
export async function readJobResult(db: SupabaseClient | null, id: string | null | undefined): Promise<JobRead> {
  if (!isJobId(id)) return { ok: true, job: null };
  if (!db) return { ok: false };
  // missing — 기록 표가 없는 옛 DB. '못 읽음'과 달리 기다려도 안 생기므로 부르는 쪽이 예전 방식으로 간다.
  if (Date.now() < missingUntil) return { ok: false, missing: true };
  try {
    let q = db.from("book_jobs").select(JOB_READ_COLUMNS).eq("id", id);
    const signal = timeoutSignal(JOB_TIMEOUT_MS);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q.maybeSingle();
    if (error) {
      return report("read", error) === "missing" ? { ok: false, missing: true } : { ok: false };
    }
    const job = (data as unknown as JobRow | null) ?? null;
    if (job?.illustration_entry) job.illustration_refunded = await readRefunded(db, job.illustration_entry);
    return { ok: true, job };
  } catch (e) {
    report("read", { message: String(e) });
    return { ok: false };
  }
}

/** 장부 줄이 환불됐나. 못 읽으면 null(모름) — 모를 때는 예전처럼 '값 냈음'으로 둔다(두 번 받지 않게). */
async function readRefunded(db: SupabaseClient, entry: string): Promise<boolean | null> {
  try {
    let q = db.from("token_ledger").select("id,refunded_at").eq("id", entry);
    const signal = timeoutSignal(JOB_TIMEOUT_MS);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q.maybeSingle();
    if (error || !data) return null;
    return Boolean((data as { refunded_at?: string | null }).refunded_at);
  } catch {
    return null;
  }
}

/**
 * 내 그림 값 장부 줄 최근 몇 개 — 옛 방식(spend_tokens) 결제가 끊겼을 때 '나갔나'를 확인한다
 * (judgeSpendAfterError). 못 읽으면 null.
 */
export async function readRecentIllustrationLedger(db: SupabaseClient | null): Promise<LedgerRow[] | null> {
  if (!db) return null;
  try {
    let q = db
      .from("token_ledger")
      .select("id,amount,refunded_at")
      .eq("reason", "illustration")
      .order("created_at", { ascending: false })
      .limit(20);
    const signal = timeoutSignal(JOB_TIMEOUT_MS);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return null;
    return data as LedgerRow[];
  } catch {
    return null;
  }
}

/** 기록 한 줄을 읽는다. 못 읽었거나 없으면 null — 돈 판단이 아닌 자리(취소 닫기 등)에서만 쓴다. */
export async function readJob(db: SupabaseClient | null, id: string | null | undefined): Promise<JobRow | null> {
  const r = await readJobResult(db, id);
  return r.ok ? r.job : null;
}

/**
 * 같은 대본으로 새 기록을 만든다 — 앞 기록에 이미 그림 값이 붙었거나 끝난 기록일 때.
 * 대본 값 장부 id 와 원고를 옮겨 적어, 마스터가 사고 목록에서 두 줄을 같은 대본으로 알아보게 한다.
 * (대본 값은 여러 기록이 같이 가리켜도 된다 — 그림 값만 한 기록에 하나다.)
 */
export async function cloneJob(
  db: SupabaseClient | null,
  from: JobRow,
  owner: string | null,
  status: JobStatus = "drawing",
  /**
   * 새 줄에 적을 원고 — **지금 그리는** 원고를 넘긴다.
   * 옛 줄의 원고(옛 그림체·고치기 전 본문)를 그대로 물려받으면, 새 줄에 값만 붙고 원고가 안 바뀐 채 멈췄을 때
   * 다음 판단이 늘 '다른 그림'이 되어 그림 값을 한 번 더 받았다. 안 주면 예전처럼 옛 원고를 옮긴다.
   */
  manuscript?: Record<string, unknown>,
): Promise<string | null> {
  if (!owner) return null;
  const body = manuscript ?? from.manuscript ?? {};
  const copied = await insertJob(db, {
    owner,
    status,
    page_count: from.page_count,
    story_entry: from.story_entry,
    manuscript: body,
  });
  if (copied) return copied;
  // 대본 값 장부가 지워졌거나(환불) 대조에 걸리면 장부 id 없이라도 기록은 남긴다.
  return insertJob(db, { owner, status, page_count: from.page_count, manuscript: body });
}
