/**
 * 관리자 페이지 '의견·오류'(/admin/support) 시험 — 순수 함수 + 원문 검사.
 *
 *  · 사고 종류 거르기(?kind=) · 줄 열쇠 ↔ 서랍 열쇠 · 메뉴 배지를 맞추는 방식.
 *  · 서버가 관리자 계정 기록을 빼는 셈(사장님 2026-09-30 "fe 마스터니깐 … 안남아도 되").
 *  · 의견 처리 네 가지의 보낼 값·되묻기 문구.
 *  · 원문: 사고·의견 서버 경로가 관리자 기록을 빼는가, 옛 의견 화면 파일이 없어졌나,
 *    화면이 DB 를 직접 읽지 않나, 쓰던 답변을 지키나, 이모지가 없나.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  SUPPORT_TABS,
  badgePlan,
  caseKey,
  feedbackCategoryTone,
  feedbackConfirmCopy,
  feedbackDoneMessage,
  feedbackDraftDirty,
  feedbackPatch,
  feedbackPath,
  incidentCase,
  incidentKey,
  incidentsPath,
  keepCustomerIncidents,
  keepCustomerPosts,
  kindOptions,
  memberHref,
  notInFilter,
  parseKindParam,
  visibleIncidents,
} from "./admin-support.ts";

const SRC = new URL("../", import.meta.url); // src/
const at = (rel: string) => new URL(rel, SRC);
const read = (rel: string) => readFileSync(at(rel), "utf8");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER_MASTER = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const MASTERS: ReadonlySet<string> = new Set([ME, OTHER_MASTER]);

describe("주소", () => {
  it("사고 목록 — resolved · mine 은 켜졌을 때만 붙는다", () => {
    assert.equal(incidentsPath({ resolved: false, mine: false }), "/api/admin/incidents");
    assert.equal(incidentsPath({ resolved: true, mine: false }), "/api/admin/incidents?resolved=1");
    assert.equal(incidentsPath({ resolved: true, mine: true }), "/api/admin/incidents?resolved=1&mine=1");
  });
  it("의견 목록 — open · mine", () => {
    assert.equal(feedbackPath({ open: false, mine: false }), "/api/admin/feedback");
    assert.equal(feedbackPath({ open: true, mine: false }), "/api/admin/feedback?open=1");
    assert.equal(feedbackPath({ open: true, mine: true }), "/api/admin/feedback?open=1&mine=1");
    assert.equal(feedbackPath({ open: false, mine: true }), "/api/admin/feedback?mine=1");
  });
  it("탭은 사고 · 의견 둘", () => {
    assert.deepEqual([...SUPPORT_TABS], ["incidents", "feedback"]);
  });
  it("글쓴이 회원 화면 — uuid 만", () => {
    assert.equal(memberHref(MEMBER.toUpperCase()), `/admin/members/${MEMBER}`);
    assert.equal(memberHref("javascript:alert(1)"), null);
    assert.equal(memberHref(null), null);
    assert.equal(memberHref("../settings"), null);
  });
});

type Row = {
  job_id: string | null;
  story_entry: string | null;
  illustration_entry: string | null;
  member: string | null;
  kinds: string[];
  updated_at: string | null;
  resolved_at?: string | null;
  book_id?: string | null;
  created_at?: string | null;
  total_count?: number;
};
const row = (p: Partial<Row>): Row => ({
  job_id: null,
  story_entry: null,
  illustration_entry: null,
  member: MEMBER,
  kinds: [],
  updated_at: "2026-09-30T01:00:00Z",
  ...p,
});

describe("사고 종류 거르기", () => {
  it("kind 값 — 영문 소문자·밑줄만, 이상하면 전체", () => {
    assert.equal(parseKindParam("paid_not_saved"), "paid_not_saved");
    assert.equal(parseKindParam("new_kind_from_db"), "new_kind_from_db");
    assert.equal(parseKindParam(null), "");
    assert.equal(parseKindParam(""), "");
    assert.equal(parseKindParam("Paid"), "");
    assert.equal(parseKindParam("a,b"), "");
    assert.equal(parseKindParam("<script>"), "");
    assert.equal(parseKindParam("x".repeat(41)), "");
  });

  const rows = [
    row({ job_id: "a", kinds: ["stuck"], updated_at: "2026-09-30T03:00:00Z" }),
    row({ job_id: "b", kinds: ["paid_not_saved", "failed"], updated_at: "2026-09-29T03:00:00Z" }),
    row({ job_id: "c", kinds: ["failed"], updated_at: "2026-09-30T05:00:00Z" }),
  ];

  it("칩 — 전체 + 급한 순 종류와 개수", () => {
    const o = kindOptions(rows, "");
    assert.deepEqual(
      o.map((x) => [x.value, x.count]),
      [
        ["", 3],
        ["paid_not_saved", 1],
        ["failed", 2],
        ["stuck", 1],
      ],
    );
    assert.equal(o[0].label, "전체");
    assert.equal(o[1].label, "돈 냈는데 책 없음");
  });

  it("고른 종류가 0건이어도 칩은 남는다(대시보드 링크로 들어온 경우)", () => {
    const o = kindOptions(rows, "blank_pages");
    const last = o[o.length - 1];
    assert.deepEqual([last.value, last.count, last.label], ["blank_pages", 0, "그림 빈 쪽"]);
    // 이미 있는 종류는 두 번 넣지 않는다
    assert.equal(kindOptions(rows, "failed").filter((x) => x.value === "failed").length, 1);
  });

  it("보이는 줄 — 거른 뒤 급한 순 → 최근 순, 원본은 그대로", () => {
    assert.deepEqual(visibleIncidents(rows, "").map((r) => r.job_id), ["b", "c", "a"]);
    assert.deepEqual(visibleIncidents(rows, "failed").map((r) => r.job_id), ["b", "c"]);
    assert.deepEqual(visibleIncidents(rows, "blank_pages"), []);
    assert.deepEqual(rows.map((r) => r.job_id), ["a", "b", "c"]);
  });
});

describe("줄 열쇠 ↔ 서랍", () => {
  it("기록이 있으면 job, 결제만 남았으면 대본 → 그림 장부 순", () => {
    assert.deepEqual(incidentCase(row({ job_id: "J", story_entry: "S" })), { jobId: "J", entry: null });
    assert.deepEqual(incidentCase(row({ story_entry: "S", illustration_entry: "I" })), { jobId: null, entry: "S" });
    assert.deepEqual(incidentCase(row({ illustration_entry: "I" })), { jobId: null, entry: "I" });
    assert.equal(incidentCase(row({})), null);
  });
  it("줄 열쇠와 서랍 열쇠가 같은 규칙이다(열린 줄에 불이 들어온다)", () => {
    const withJob = row({ job_id: "AbC" });
    const onlyPay = row({ illustration_entry: "E1" });
    assert.equal(incidentKey(withJob), caseKey({ jobId: "abc", entry: null }));
    assert.equal(incidentKey(onlyPay), caseKey({ jobId: null, entry: "e1" }));
    assert.notEqual(incidentKey(withJob), incidentKey(onlyPay));
    assert.equal(caseKey(null), null);
    assert.equal(caseKey({ jobId: null, entry: null }), null);
  });
  it("기록·결제가 둘 다 없는 줄도 열쇠가 겹치지 않는다", () => {
    const a = incidentKey(row({ book_id: "my-1", created_at: "2026-09-30T00:00:00Z" }));
    const b = incidentKey(row({ book_id: "my-2", created_at: "2026-09-30T00:00:00Z" }));
    assert.notEqual(a, b);
    assert.ok(a.startsWith("row:"));
  });
});

describe("메뉴 배지 맞추기", () => {
  it("평소엔 목록 숫자로 바로, '내 계정 것도 보기'·'처리 끝난 것도'면 서버에 다시 세게", () => {
    assert.equal(badgePlan({ mine: false }), "set");
    assert.equal(badgePlan({ mine: false, resolved: false }), "set");
    assert.equal(badgePlan({ mine: true }), "refresh");
    assert.equal(badgePlan({ mine: false, resolved: true }), "refresh");
  });
});

describe("서버: 관리자 계정 기록 빼기", () => {
  const rows = [
    row({ job_id: "mine", member: ME, total_count: 10 }),
    row({ job_id: "other-master", member: OTHER_MASTER.toUpperCase(), total_count: 10 }),
    row({ job_id: "member", member: MEMBER, total_count: 10 }),
    row({ job_id: "deleted", member: null, total_count: 10 }),
  ];

  it("꺼짐: 내 줄·다른 관리자 줄은 빠지고 회원·탈퇴 회원 줄은 남는다, 전체 수도 덜어 낸다", () => {
    const r = keepCustomerIncidents(rows, MASTERS, false);
    assert.deepEqual(r.rows.map((x) => x.job_id), ["member", "deleted"]);
    assert.equal(r.dropped, 2);
    assert.equal(r.total, 8);
  });
  it("켜짐('내 계정 것도 보기'): 그대로", () => {
    const r = keepCustomerIncidents(rows, MASTERS, true);
    assert.equal(r.rows.length, 4);
    assert.equal(r.dropped, 0);
    assert.equal(r.total, 10);
  });
  it("전체 수는 남은 줄보다 작아지지 않는다 · 빈 목록은 0", () => {
    const r = keepCustomerIncidents([row({ member: ME, total_count: 1 }), row({ member: MEMBER, total_count: 1 })], MASTERS, false);
    assert.equal(r.total, 1);
    assert.equal(keepCustomerIncidents([], MASTERS, false).total, 0);
  });
  it("관리자 id 를 못 읽었으면(빈 집합) 아무것도 안 뺀다", () => {
    assert.equal(keepCustomerIncidents(rows, new Set(), false).rows.length, 4);
  });

  const posts = [
    { id: "1", owner: ME, handled_at: null },
    { id: "2", owner: OTHER_MASTER, handled_at: null },
    { id: "3", owner: MEMBER, handled_at: null },
    { id: "4", owner: MEMBER, handled_at: "2026-09-30T00:00:00Z" },
  ];
  it("의견: 관리자 계정 글은 목록·남은 수에서 빠진다", () => {
    const r = keepCustomerPosts(posts, MASTERS, false);
    assert.deepEqual(r.posts.map((p) => p.id), ["3", "4"]);
    assert.equal(r.openCount, 1);
    assert.equal(r.dropped, 2);
  });
  it("의견: 켜짐이면 그대로 센다", () => {
    const r = keepCustomerPosts(posts, MASTERS, true);
    assert.equal(r.posts.length, 4);
    assert.equal(r.openCount, 3);
  });

  it("not.in 값 — uuid 만, 소문자·중복 없이, 없으면 null", () => {
    assert.equal(notInFilter([ME, ME.toUpperCase(), MEMBER]), `(${ME},${MEMBER})`);
    assert.equal(notInFilter(["x),owner.eq.(y", ME]), `(${ME})`);
    assert.equal(notInFilter([]), null);
    assert.equal(notInFilter(["not-a-uuid"]), null);
  });
});

describe("의견 처리", () => {
  it("종류 색 — 모르는 종류는 회색", () => {
    assert.equal(feedbackCategoryTone("오류 신고"), "red");
    assert.equal(feedbackCategoryTone("이런 게 있으면 좋겠어요"), "blue");
    assert.equal(feedbackCategoryTone("사용 후기"), "green");
    assert.equal(feedbackCategoryTone("기타"), "gray");
    assert.equal(feedbackCategoryTone(null), "gray");
  });

  it("보낼 값 — 옛 화면의 네 가지와 같다", () => {
    assert.deepEqual(feedbackPatch("reply-close", " 고쳤어요 ", ""), { reply: "고쳤어요", handled: true });
    assert.deepEqual(feedbackPatch("reply-close", "", "메모"), { note: "메모", handled: true });
    assert.deepEqual(feedbackPatch("reply-only", "답", "메모"), { reply: "답", note: "메모" });
    assert.deepEqual(feedbackPatch("close", "쓰던 글", ""), { handled: true });
    assert.deepEqual(feedbackPatch("reopen", "", ""), { handled: false });
    assert.equal(feedbackPatch("reply-only", "  ", " "), null);
    assert.equal(feedbackPatch("reply-close", "", ""), null);
  });
  it("길이 상한 — 답변 2000 · 메모 500", () => {
    const p = feedbackPatch("reply-only", "가".repeat(2500), "나".repeat(800));
    assert.equal(p?.reply?.length, 2000);
    assert.equal(p?.note?.length, 500);
  });

  it("알림 문구", () => {
    assert.equal(feedbackDoneMessage({ reply: "x", handled: true }), "답변을 남겼어요");
    assert.equal(feedbackDoneMessage({ handled: false }), "다시 열었어요");
    assert.equal(feedbackDoneMessage({ handled: true }), "처리했어요");
    assert.equal(feedbackDoneMessage({ note: "x" }), "메모를 남겼어요");
  });

  it("되묻기 — 답변이면 '고객에게 그대로 보여요'를 먼저 말한다", () => {
    assert.match(feedbackConfirmCopy({ reply: "x" }).body, /그대로 보여요/);
    assert.equal(feedbackConfirmCopy({ reply: "x", handled: true }).confirmLabel, "답하고 처리 끝");
    assert.match(feedbackConfirmCopy({ handled: true }).body, /보이지 않아요/);
    assert.equal(feedbackConfirmCopy({ handled: false }).confirmLabel, "다시 열기");
    assert.match(feedbackConfirmCopy({ note: "x" }).body, /우리만 봐요/);
  });

  it("쓰던 답변이 있나", () => {
    assert.equal(feedbackDraftDirty("", ""), false);
    assert.equal(feedbackDraftDirty("  ", "\n"), false);
    assert.equal(feedbackDraftDirty("답", ""), true);
    assert.equal(feedbackDraftDirty("", "메모"), true);
  });
});

/* ── 원문 검사 ─────────────────────────────────────────────────────────── */

function listFiles(rel: string): string[] {
  const out: string[] = [];
  const walk = (r: string) => {
    for (const e of readdirSync(r ? at(r) : SRC, { withFileTypes: true })) {
      const p = r ? `${r}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|mts)$/.test(e.name)) out.push(p);
    }
  };
  walk(rel);
  return out;
}

describe("원문 검사", () => {
  it("사고·의견 서버 경로는 관리자 계정 기록을 빼고, 스위치(mine)로만 되살린다", () => {
    const inc = read("app/api/admin/incidents/route.ts");
    assert.ok(inc.includes("masterOwnerIds("));
    assert.ok(inc.includes("isMineFlag("));
    assert.ok(inc.includes("keepCustomerIncidents("));
    // 오늘 현황(책 수·되돌린 토큰)도 같은 규칙 — 책은 not.in, 환불은 주인 칸을 읽어 거른다
    assert.ok(inc.includes("notInFilter("));
    assert.ok(/token_ledger"\)\s*\.select\("owner,/.test(inc), "환불 읽기에 owner 칸이 없다");

    const fb = read("app/api/admin/feedback/route.ts");
    assert.ok(fb.includes("masterOwnerIds("));
    assert.ok(fb.includes("isMineFlag("));
    assert.ok(fb.includes("keepCustomerPosts("));
    // 쓰기(POST)는 그대로 — 답변·메모·처리 표시는 DB 함수 하나로만
    assert.ok(fb.includes('"master_feedback_reply"'));
  });

  it("옛 의견 화면 파일은 없어지고 의견·오류 화면으로 옮겨졌다", () => {
    assert.ok(!existsSync(at("components/admin/FeedbackSection.tsx")), "옛 FeedbackSection.tsx 가 남아 있다");
    assert.ok(existsSync(at("components/admin/support/FeedbackTab.tsx")));
    assert.ok(existsSync(at("components/admin/support/IncidentsTab.tsx")));
    for (const f of listFiles("app").concat(listFiles("components"), listFiles("lib"))) {
      if (f.endsWith(".test.ts")) continue;
      assert.ok(!read(f).includes("admin/FeedbackSection"), `${f} 가 옛 의견 화면을 가져온다`);
    }
  });

  it("의견·오류 화면 — 서버 경로로만 읽고, 쓰던 답변을 지키고, 스위치·배지 규칙을 따른다", () => {
    const files = listFiles("components/admin/support");
    assert.ok(files.length >= 3);
    for (const f of files) {
      const src = read(f);
      for (const w of ["getSupabase", "authedFetch", "@/lib/supabase", "loadSession", "router.replace(\"/\")"]) {
        assert.ok(!src.includes(w), `${f}: ${w}`);
      }
      // 관리실엔 이모지를 쓰지 않는다(선 아이콘을 쓴다)
      assert.ok(!/\p{Extended_Pictographic}/u.test(src), `${f}: 이모지`);
    }
    const page = read("components/admin/support/SupportPage.tsx");
    assert.ok(page.includes("useMineParam("));
    assert.ok(page.includes("내 계정 것도 보기"));
    const fbTab = read("components/admin/support/FeedbackTab.tsx");
    assert.ok(fbTab.includes("useUnsavedGuard("));
    assert.ok(fbTab.includes("ConfirmDialog"));
    const incTab = read("components/admin/support/IncidentsTab.tsx");
    assert.ok(incTab.includes("badgePlan("));
    assert.ok(incTab.includes("CaseDrawer"));
    assert.ok(incTab.includes("showCustomerLink"));
  });
});
