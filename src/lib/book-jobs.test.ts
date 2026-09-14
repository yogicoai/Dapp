import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canReopenForRewrite,
  capFailures,
  chargeProblem,
  interpretBookSave,
  isJobId,
  judgeSpendAfterError,
  looksNetworkish,
  jobWriteProblem,
  pickWritable,
  planFromJob,
  readPaidMarker,
  recoverFromChargeRefusal,
  sameDrawing,
  storyManuscript,
  stripEmbeddedArt,
  waitAtMost,
  type JobRow,
} from "./book-jobs.ts";

const B64 = "data:image/webp;base64,AAAA";
const URL1 = "https://cafe24.example/books/fe/my-x/p1.webp";

describe("stripEmbeddedArt — 원고에서 base64 그림 걷어내기", () => {
  it("그림 자리의 base64 는 null 로, 올린 주소는 그대로 둔다", () => {
    const book = {
      id: "my-abc",
      coverImage: B64,
      characterSheet: URL1,
      locationSheets: [{ key: "k", name: "숲", description: "", image: B64 }],
      pages: [{ text: "하나", image: URL1 }, { text: "둘", image: B64 }, { text: "셋", image: null }],
    };
    const out = stripEmbeddedArt(book);
    assert.equal(out.manuscript.coverImage, null);
    assert.equal(out.manuscript.characterSheet, URL1);
    assert.equal(out.manuscript.locationSheets[0].image, null);
    assert.equal(out.manuscript.pages[0].image, URL1);
    assert.equal(out.manuscript.pages[1].image, null);
    assert.equal(out.stripped, 3);
    assert.deepEqual(out.pages, [2]);
  });

  it("원본 책은 건드리지 않는다 — 저장은 원본으로 한다", () => {
    const book = { coverImage: B64, pages: [{ text: "a", image: B64 }] };
    stripEmbeddedArt(book);
    assert.equal(book.coverImage, B64);
    assert.equal(book.pages[0].image, B64);
  });

  it("그림 자리가 아닌 곳의 base64 도 지운다 — 남으면 DB 가 쓰기 전체를 거절한다", () => {
    const out = stripEmbeddedArt({ drawing: B64, pages: [], note: "평범한 글" });
    assert.equal((out.manuscript as Record<string, unknown>).drawing, null);
    assert.equal(out.manuscript.note, "평범한 글");
    assert.equal(out.stripped, 0);
    assert.doesNotMatch(JSON.stringify(out.manuscript), /base64/);
  });

  it("undefined 칸은 빠진다(jsonb 에 못 들어간다)", () => {
    const out = stripEmbeddedArt({ a: undefined, b: 1 });
    assert.deepEqual(out.manuscript, { b: 1 });
  });
});

describe("storyManuscript — 대본 단계 원고", () => {
  it("쪽마다 글·지시문·목소리를 담고 그림은 null", () => {
    const m = storyManuscript({
      title: "제목",
      summary: "요약",
      characters: [{ name: "하온", description: "다섯 살" }],
      pages: [{ text: "첫 쪽", imagePrompt: "숲", voiceDirection: { narration: "normal" } }],
    });
    assert.equal(m.title, "제목");
    assert.deepEqual(m.cast, [{ name: "하온", description: "다섯 살" }]);
    assert.deepEqual(m.pages, [
      { text: "첫 쪽", imagePrompt: "숲", voiceDirection: { narration: "normal" }, image: null },
    ]);
  });
});

describe("pickWritable — 쓸 수 있는 칸만", () => {
  it("권한 없는 칸(saved_at·master_note)과 undefined 는 뺀다", () => {
    const out = pickWritable({ status: "saved", saved_at: "x", master_note: "y", error: undefined });
    assert.deepEqual(out, { status: "saved" });
  });
  it("owner 는 insert 때만", () => {
    assert.deepEqual(pickWritable({ owner: "u", status: "writing" }), { status: "writing" });
    assert.deepEqual(pickWritable({ owner: "u", status: "writing" }, true), { owner: "u", status: "writing" });
  });
});

describe("capFailures — DB 상한 안으로", () => {
  it("최근 것만 남기고 긴 이유는 자르고 그림 데이터는 가린다", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ page: i, stage: "draw" as const, reason: "x" }));
    const out = capFailures(many);
    assert.equal(out.length, 60);
    assert.equal(out[0].page, 20);
    const [one] = capFailures([{ stage: "upload", reason: `실패 ${B64} ${"가".repeat(500)}` }]);
    assert.doesNotMatch(one.reason, /base64/);
    assert.ok(one.reason.length <= 300);
  });
});

describe("jobWriteProblem — 기록 쓰기 오류의 뜻", () => {
  it("표가 없으면 missing", () => {
    assert.equal(jobWriteProblem({ code: "42P01", message: 'relation "public.book_jobs" does not exist' }), "missing");
    assert.equal(jobWriteProblem({ code: "PGRST205", message: "Could not find the table" }), "missing");
  });
  it("상한·거절·권한·네트워크를 가른다", () => {
    assert.equal(jobWriteProblem(null), "none");
    assert.equal(jobWriteProblem({ code: "54000", message: "오늘 만들기 기록이 너무 많습니다" }), "limit");
    assert.equal(jobWriteProblem({ code: "22023", message: "원고가 너무 큽니다" }), "invalid");
    assert.equal(jobWriteProblem({ code: "42501", message: "이미 정해진 책 id 는 바꿀 수 없습니다." }), "denied");
    assert.equal(jobWriteProblem({ code: "", message: "TypeError: Failed to fetch" }), "network");
  });
});

describe("chargeProblem — 그림 값 받기 거절의 뜻", () => {
  it("함수가 없으면 물러선다", () => {
    assert.equal(chargeProblem({ code: "PGRST202", message: "Could not find the function public.charge_illustration" }), "missing");
    assert.equal(chargeProblem({ code: "42883", message: "function does not exist" }), "missing");
  });
  it("SQL 이 돌려주는 문구로 가린다", () => {
    assert.equal(chargeProblem({ code: "22023", message: "이미 그림 값이 붙은 기록입니다. 새 기록을 만들어 주세요." }), "already-charged");
    assert.equal(chargeProblem({ code: "22023", message: "이 기록에는 이미 다른 책 id 가 정해져 있습니다." }), "other-book");
    assert.equal(chargeProblem({ code: "22023", message: "만들기 기록이 없습니다." }), "no-job");
    assert.equal(chargeProblem({ code: "22003", message: "토큰이 부족합니다." }), "insufficient");
    assert.equal(chargeProblem({ code: "42501", message: "로그인이 필요합니다." }), "login");
    assert.equal(chargeProblem({ code: "", message: "Failed to fetch" }), "other");
  });
});

describe("interpretBookSave — 책 저장 결과 해석", () => {
  it("줄이 실제로 남았을 때만 성공", () => {
    assert.deepEqual(interpretBookSave({ uid: "u", error: null, rows: [{ id: "my-a" }] }), { ok: true });
  });
  it("로그인이 풀렸으면 성공인 척하지 않는다", () => {
    const r = interpretBookSave({ uid: null, error: null, rows: null });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "no-session");
      assert.equal(r.retryable, false);
    }
  });
  it("오류 없이 0줄이면(RLS) 실패", () => {
    const r = interpretBookSave({ uid: "u", error: null, rows: [] });
    assert.equal(r.ok, false);
  });
  it("권한 오류는 다시 해도 소용없다, 네트워크는 다시 해 볼 만하다", () => {
    const denied = interpretBookSave({ uid: "u", error: { code: "42501", message: "new row violates row-level security policy" }, rows: null });
    const net = interpretBookSave({ uid: "u", error: { code: "", message: "TypeError: Failed to fetch" }, rows: null });
    assert.equal(denied.ok || denied.retryable, false);
    assert.equal(!net.ok && net.retryable, true);
  });
  it("부모가 읽는 이유 문구가 비지 않는다", () => {
    const r = interpretBookSave({ uid: "u", error: { code: "XX000", message: "boom" }, rows: null });
    assert.ok(!r.ok && r.reason.length > 5);
  });
});

describe("readPaidMarker — 값은 냈는데 못 넣은 책 표시", () => {
  const now = 1_800_000_000_000;
  it("올바른 표시를 읽는다", () => {
    const raw = JSON.stringify({ bookId: "my-abc", jobId: "123e4567-e89b-12d3-a456-426614174000", at: now - 1000 });
    assert.deepEqual(readPaidMarker(raw, now), { bookId: "my-abc", jobId: "123e4567-e89b-12d3-a456-426614174000", at: now - 1000 });
  });
  it("이레가 지났거나 모양이 틀리면 버린다", () => {
    assert.equal(readPaidMarker(JSON.stringify({ bookId: "my-abc", at: now - 8 * 86400_000 }), now), null);
    assert.equal(readPaidMarker(JSON.stringify({ bookId: "book-1", at: now }), now), null);
    assert.equal(readPaidMarker("{깨짐", now), null);
    assert.equal(readPaidMarker(null, now), null);
  });
  it("jobId 모양이 틀리면 null 로", () => {
    assert.equal(readPaidMarker(JSON.stringify({ bookId: "my-a", jobId: "x", at: now }), now)?.jobId, null);
  });
});

describe("planFromJob — 기록을 이어 쓸까", () => {
  it("끝난 기록은 새로", () => {
    for (const status of ["saved", "restored", "cancelled"] as const) {
      assert.equal(planFromJob({ status, book_id: "my-a", illustration_entry: "e" }).reuse, false);
    }
  });
  it("값을 받고 저장에 실패한 기록은 같은 책 id 로, 다시 받지 않는다", () => {
    assert.deepEqual(planFromJob({ status: "failed", book_id: "my-a", illustration_entry: "e" }), {
      reuse: true,
      bookId: "my-a",
      alreadyPaid: true,
    });
  });
  it("책 id 만 있고 값이 없으면(마스터·글만) id 만 이어 쓴다", () => {
    assert.deepEqual(planFromJob({ status: "saving", book_id: "my-a", illustration_entry: null }), {
      reuse: true,
      bookId: "my-a",
      alreadyPaid: false,
    });
  });
  it("대본 단계 기록은 그대로 이어 쓴다", () => {
    assert.deepEqual(planFromJob({ status: "script", book_id: null, illustration_entry: null }), {
      reuse: true,
      bookId: null,
      alreadyPaid: false,
    });
    assert.equal(planFromJob(null).reuse, false);
  });
});

describe("isJobId", () => {
  it("uuid 만", () => {
    assert.equal(isJobId("123e4567-e89b-12d3-a456-426614174000"), true);
    assert.equal(isJobId("my-abc"), false);
    assert.equal(isJobId(undefined), false);
  });
});

describe("jobWriteProblem — 문구만으로는 '표 없음'으로 보지 않는다", () => {
  it("지워진 회원 JWT·스키마 캐시 오류는 missing 이 아니다", () => {
    assert.notEqual(jobWriteProblem({ code: "", message: "User from sub claim in JWT does not exist" }), "missing");
    assert.notEqual(jobWriteProblem({ code: "PGRST204", message: "Could not find the 'drawn' column" }), "missing");
  });
  it("시간 초과로 끊긴 요청은 network(모름)", () => {
    assert.equal(jobWriteProblem({ code: "", message: "AbortError: signal timed out" }), "network");
  });
});

const TEXTS = ["하나", "둘"];
const NOW = { pageTexts: TEXTS, artStyleId: "watercolor" };
const MS_SAME = { pages: [{ text: "하나" }, { text: "둘" }], artStyleId: "watercolor" };
function job(over: Partial<JobRow>): JobRow {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    book_id: null,
    status: "script",
    page_count: 2,
    story_entry: null,
    illustration_entry: null,
    manuscript: null,
    ...over,
  };
}

describe("sameDrawing — 값 면제는 같은 그림일 때만", () => {
  it("본문·그림체가 같으면 같다", () => {
    assert.equal(sameDrawing(MS_SAME, NOW), true);
  });
  it("그림체가 다르거나 본문·쪽수가 다르면 다르다", () => {
    assert.equal(sameDrawing({ ...MS_SAME, artStyleId: "crayon" }, NOW), false);
    assert.equal(sameDrawing({ pages: [{ text: "하나" }, { text: "셋" }] }, NOW), false);
    assert.equal(sameDrawing({ pages: [{ text: "하나" }] }, NOW), false);
  });
  it("원고에 쪽이 없으면 모름 — 같은 것으로 본다(이중 과금 쪽으로 기울지 않게)", () => {
    assert.equal(sameDrawing({}, NOW), true);
    assert.equal(sameDrawing(null, NOW), true);
  });
});

describe("planFromJob — 다른 그림이면 값 낸 기록을 쓰지 않는다", () => {
  it("그림체를 바꿔 새로 그렸으면 새 줄·새 값", () => {
    const paid = job({ status: "failed", book_id: "my-a", illustration_entry: "e", manuscript: { ...MS_SAME, artStyleId: "crayon" } });
    assert.deepEqual(planFromJob(paid, NOW), { reuse: false, bookId: null, alreadyPaid: false });
  });
  it("같은 그림이면 저장만 다시", () => {
    const paid = job({ status: "failed", book_id: "my-a", illustration_entry: "e", manuscript: MS_SAME });
    assert.deepEqual(planFromJob(paid, NOW), { reuse: true, bookId: "my-a", alreadyPaid: true });
  });
});

describe("recoverFromChargeRefusal — '이미 값이 붙음' 거절 뒤", () => {
  it("기록을 못 읽으면 받지 않고 멈춘다", () => {
    assert.deepEqual(recoverFromChargeRefusal({ ok: false }, NOW), { action: "stop" });
    assert.deepEqual(recoverFromChargeRefusal({ ok: true, job: null }, NOW), { action: "stop" });
  });
  it("같은 그림에 값이 붙은 열린 기록이면 받지 않고 그 책 id 로", () => {
    const read = { ok: true as const, job: job({ status: "uploading", book_id: "my-a", illustration_entry: "e", manuscript: MS_SAME }) };
    assert.deepEqual(recoverFromChargeRefusal(read, NOW), { action: "already-paid", bookId: "my-a" });
  });
  it("값 없이 책 id 만 있으면(마스터) 그 책 id 로 다시", () => {
    const read = { ok: true as const, job: job({ status: "uploading", book_id: "my-m", manuscript: MS_SAME }) };
    assert.deepEqual(recoverFromChargeRefusal(read, NOW), { action: "retry-same-job", bookId: "my-m" });
  });
  it("끝난 기록·다른 그림은 새 책 — 새 줄", () => {
    const saved = { ok: true as const, job: job({ status: "saved", book_id: "my-a", illustration_entry: "e", manuscript: MS_SAME }) };
    const other = { ok: true as const, job: job({ status: "failed", book_id: "my-a", illustration_entry: "e", manuscript: { pages: [{ text: "딴" }, { text: "것" }] } }) };
    assert.deepEqual(recoverFromChargeRefusal(saved, NOW), { action: "new-job" });
    assert.deepEqual(recoverFromChargeRefusal(other, NOW), { action: "new-job" });
  });
});

describe("canReopenForRewrite — 다시 쓰기가 되열어도 되는 줄", () => {
  it("값·책 id 가 없는 대본 단계 줄만", () => {
    assert.equal(canReopenForRewrite(job({ status: "script" })), true);
    assert.equal(canReopenForRewrite(job({ status: "failed" })), true);
    assert.equal(canReopenForRewrite(job({ status: "failed", book_id: "my-a", illustration_entry: "e" })), false);
    assert.equal(canReopenForRewrite(job({ status: "uploading", book_id: "my-m" })), false);
    assert.equal(canReopenForRewrite(job({ status: "saved" })), false);
    assert.equal(canReopenForRewrite(null), false);
  });
});

describe("waitAtMost — 보조 요청은 정해진 시간까지만", () => {
  it("늦으면 대신 값을, 제때 오면 그 값을", async () => {
    const slow = new Promise<string>((r) => setTimeout(() => r("늦음"), 200));
    assert.equal(await waitAtMost(slow, 10, "넘김"), "넘김");
    assert.equal(await waitAtMost(Promise.resolve("옴"), 100, "넘김"), "옴");
    assert.equal(await waitAtMost(Promise.reject(new Error("x")), 100, "넘김"), "넘김");
  });
});

describe("planFromJob — 환불된 값 · 모르는 원고", () => {
  it("그림 값이 환불된 기록은 값 낸 기록이 아니다 — 새 줄에서 받는다", () => {
    const refunded = { ...job({ status: "failed", book_id: "my-a", illustration_entry: "e", manuscript: MS_SAME }), illustration_refunded: true };
    assert.deepEqual(planFromJob(refunded, NOW), { reuse: false, bookId: null, alreadyPaid: false });
    assert.deepEqual(recoverFromChargeRefusal({ ok: true, job: refunded }, NOW), { action: "new-job" });
  });
  it("환불 여부를 모르면(못 읽음) 예전처럼 값 낸 것으로 — 두 번 받지 않게", () => {
    const unknown = { ...job({ status: "failed", book_id: "my-a", illustration_entry: "e", manuscript: MS_SAME }), illustration_refunded: null };
    assert.deepEqual(planFromJob(unknown, NOW), { reuse: true, bookId: "my-a", alreadyPaid: true });
  });
  it("값이 붙었는데 원고에 쪽이 없으면 — 받지도 공짜로 저장하지도 않고 멈춘다", () => {
    const blank = job({ status: "failed", book_id: "my-a", illustration_entry: "e", manuscript: { outline: {} } });
    const plan = planFromJob(blank, NOW);
    assert.equal(plan.needsCheck, true);
    assert.equal(plan.alreadyPaid, false);
    assert.deepEqual(recoverFromChargeRefusal({ ok: true, job: blank }, NOW), { action: "stop" });
  });
  it("값 없이 책 id 만 있고 원고가 비었으면(마스터·글만) 예전처럼 이어 쓴다", () => {
    const blank = job({ status: "saving", book_id: "my-m", illustration_entry: null, manuscript: {} });
    assert.deepEqual(planFromJob(blank, NOW), { reuse: true, bookId: "my-m", alreadyPaid: false });
  });
});

describe("judgeSpendAfterError — 옛 방식 결제가 오류로 돌아왔을 때", () => {
  const before = [{ id: "old", amount: 50, refunded_at: null }];
  it("서버가 분명히 거절했으면 안 나갔다(다시 눌러도 안전)", () => {
    assert.deepEqual(judgeSpendAfterError({ before: null, after: null, cost: 50, networkish: false }), { verdict: "not-paid" });
  });
  it("끊긴 요청 — 새 그림 값 줄이 정확히 하나·같은 금액이면 나갔다", () => {
    const after = [{ id: "new", amount: 50, refunded_at: null }, ...before];
    assert.deepEqual(judgeSpendAfterError({ before, after, cost: 50, networkish: true }), { verdict: "paid", entry: "new" });
  });
  it("끊긴 요청 — 새 줄이 없거나(뒤늦게 커밋될 수 있다) 장부를 못 읽으면 모름", () => {
    assert.deepEqual(judgeSpendAfterError({ before, after: before, cost: 50, networkish: true }), { verdict: "unknown" });
    assert.deepEqual(judgeSpendAfterError({ before: null, after: before, cost: 50, networkish: true }), { verdict: "unknown" });
  });
  it("다른 탭의 다른 금액 결제가 섞이면 받았다고 보지 않는다", () => {
    const after = [{ id: "other", amount: 30, refunded_at: null }, ...before];
    assert.deepEqual(judgeSpendAfterError({ before, after, cost: 50, networkish: true }), { verdict: "unknown" });
  });
  it("네트워크 오류 문구를 알아본다", () => {
    assert.equal(looksNetworkish("TypeError: Failed to fetch"), true);
    assert.equal(looksNetworkish("토큰이 부족합니다."), false);
  });
});
