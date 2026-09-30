/**
 * 약관 문서 시험 — 글 → 덩어리(HTML 이 새지 않나), 지금 판·다음 판 고르기, 게시 검사, 뼈대, 초안.
 * 그리고 원문 검사: 약관을 그리는 부품(components/legal · 관리실 사업자 정보 화면)에 날것의 HTML 넣기가 없나.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  addDaysYmd,
  daysBetweenYmd,
  defaultEffectiveDate,
  formatDateKoLong,
  hasControlChar,
  isLegalKind,
  isValidYmd,
  kstToday,
  LEGAL_BODY_MAX,
  LEGAL_DOCS,
  LEGAL_KINDS,
  LEGAL_MAX_BLOCKS,
  legalDraftKey,
  legalMetaFromRow,
  legalSkeleton,
  legalVersionFromRow,
  noticeWarning,
  parseLegalDraft,
  parseLegalMarkdown,
  parsePublishInput,
  pickLegalDocs,
  withObjectParticle,
} from "./legal-doc.ts";

describe("parseLegalMarkdown — 글자로만 나눈다", () => {
  it("제목 · 작은 제목 · 문단 · 가로줄", () => {
    assert.deepEqual(parseLegalMarkdown("# 큰\n## 제1조 (목적)\n### 작은\n본문 한 줄\n둘째 줄\n\n다음 문단\n---\n끝"), [
      { t: "h2", text: "큰" },
      { t: "h2", text: "제1조 (목적)" },
      { t: "h3", text: "작은" },
      { t: "p", text: "본문 한 줄\n둘째 줄" },
      { t: "p", text: "다음 문단" },
      { t: "hr" },
      { t: "p", text: "끝" },
    ]);
  });
  it("목록 — '- ' '* ' '· ' 는 한 목록, 번호 목록은 번호를 떼고 첫 번호가 1이 아니면 start", () => {
    assert.deepEqual(parseLegalMarkdown("- 가\n* 나\n· 다"), [{ t: "ul", items: ["가", "나", "다"] }]);
    assert.deepEqual(parseLegalMarkdown("1. 하나\n2) 둘"), [{ t: "ol", items: ["하나", "둘"] }]);
    assert.deepEqual(parseLegalMarkdown("3. 셋\n4. 넷"), [{ t: "ol", items: ["셋", "넷"], start: 3 }]);
    // 빈 줄로 떨어진 번호 목록 — 두 번째는 제 번호에서 시작해 번호가 이어져 보인다
    assert.deepEqual(parseLegalMarkdown("1. 하나\n\n2. 둘"), [
      { t: "ol", items: ["하나"] },
      { t: "ol", items: ["둘"], start: 2 },
    ]);
  });
  it("목록 아래 들여 쓴 줄은 그 항목에 이어지고, 들여 쓰지 않은 줄은 새 문단", () => {
    assert.deepEqual(parseLegalMarkdown("- 긴 항목\n  이어지는 줄\n그냥 글"), [
      { t: "ul", items: ["긴 항목\n이어지는 줄"] },
      { t: "p", text: "그냥 글" },
    ]);
  });
  it("목록 종류가 바뀌면 목록을 새로 연다", () => {
    assert.deepEqual(parseLegalMarkdown("- 가\n1. 하나"), [
      { t: "ul", items: ["가"] },
      { t: "ol", items: ["하나"] },
    ]);
  });
  it("CRLF · CR 줄바꿈도 같게", () => {
    assert.deepEqual(parseLegalMarkdown("## 가\r\n본문\r\r다음"), [
      { t: "h2", text: "가" },
      { t: "p", text: "본문" },
      { t: "p", text: "다음" },
    ]);
  });
  it("HTML · 링크 · 스크립트는 글자 그대로 문단에 남는다", () => {
    const xss = "<script>alert(1)</script>";
    const link = "[x](javascript:alert(1))";
    const img = '<img src=x onerror="alert(1)">';
    assert.deepEqual(parseLegalMarkdown(xss), [{ t: "p", text: xss }]);
    assert.deepEqual(parseLegalMarkdown(link), [{ t: "p", text: link }]);
    assert.deepEqual(parseLegalMarkdown(`- ${img}`), [{ t: "ul", items: [img] }]);
    assert.deepEqual(parseLegalMarkdown(`## ${xss}`), [{ t: "h2", text: xss }]);
  });
  it("제목 표시만 있고 글이 없으면 글자 그대로 · '-' 하나도 글자", () => {
    assert.deepEqual(parseLegalMarkdown("##\n-"), [{ t: "p", text: "##\n-" }]);
  });
  it("빈 글 · 빈 줄만 → 덩어리 없음", () => {
    assert.deepEqual(parseLegalMarkdown(""), []);
    assert.deepEqual(parseLegalMarkdown("\n\n   \n"), []);
    assert.deepEqual(parseLegalMarkdown(undefined as unknown as string), []);
  });
  it("길이·덩어리 수 상한", () => {
    const long = "가".repeat(LEGAL_BODY_MAX + 500);
    const blocks = parseLegalMarkdown(long);
    assert.equal(blocks.length, 1);
    assert.equal((blocks[0] as { text: string }).text.length, LEGAL_BODY_MAX);
    const many = parseLegalMarkdown("가\n\n".repeat(LEGAL_MAX_BLOCKS + 200));
    assert.equal(many.length, LEGAL_MAX_BLOCKS);
  });
});

describe("날짜(한국)", () => {
  it("kstToday — 한국 자정에서 바뀐다", () => {
    assert.equal(kstToday(Date.parse("2026-09-30T14:59:59Z")), "2026-09-30");
    assert.equal(kstToday(new Date("2026-09-30T15:00:00Z")), "2026-10-01");
  });
  it("isValidYmd · addDaysYmd · daysBetweenYmd · formatDateKoLong", () => {
    assert.ok(isValidYmd("2028-02-29"));
    assert.ok(!isValidYmd("2027-02-29"));
    assert.ok(!isValidYmd("2026-13-01"));
    assert.ok(!isValidYmd("2026-9-1"));
    assert.ok(!isValidYmd(20261001));
    assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
    assert.equal(addDaysYmd("2026-10-01", 366), "2027-10-02");
    assert.equal(daysBetweenYmd("2026-09-30", "2026-10-07"), 7);
    assert.ok(Number.isNaN(daysBetweenYmd("x", "2026-10-07")));
    assert.equal(formatDateKoLong("2026-10-01"), "2026년 10월 1일");
    assert.equal(formatDateKoLong("엉터리"), "엉터리");
  });
});

describe("판 고르기", () => {
  const v = (version: number, effectiveDate: string) => ({ version, effectiveDate });
  it("지금 판 = 오늘 이하 중 가장 새 것, 다음 판 = 가장 가까운 앞날", () => {
    const rows = [v(1, "2026-09-01"), v(2, "2026-09-20"), v(3, "2026-10-07"), v(4, "2026-11-01")];
    const p = pickLegalDocs(rows, "2026-09-30");
    assert.equal(p.current?.version, 2);
    assert.equal(p.upcoming?.version, 3);
  });
  it("오늘 시행하는 판은 지금 판이다", () => {
    assert.equal(pickLegalDocs([v(1, "2026-09-30")], "2026-09-30").current?.version, 1);
  });
  it("같은 날 두 판이면 번호 큰 판(오타를 고쳐 다시 게시)", () => {
    const p = pickLegalDocs([v(1, "2026-09-01"), v(3, "2026-09-01"), v(2, "2026-09-01"), v(4, "2026-10-10"), v(5, "2026-10-10")], "2026-09-30");
    assert.equal(p.current?.version, 3);
    assert.equal(p.upcoming?.version, 5);
  });
  it("번호가 커도 시행일이 앞선 판이 지금 판이 되지는 않는다(시행일 먼저)", () => {
    const p = pickLegalDocs([v(5, "2026-08-01"), v(2, "2026-09-10")], "2026-09-30");
    assert.equal(p.current?.version, 2);
  });
  it("없음 · 앞날 판만 있음", () => {
    assert.deepEqual(pickLegalDocs([], "2026-09-30"), { current: null, upcoming: null });
    const p = pickLegalDocs([v(1, "2026-10-01")], "2026-09-30");
    assert.equal(p.current, null);
    assert.equal(p.upcoming?.version, 1);
  });
  it("날짜가 이상한 줄은 건너뛴다", () => {
    assert.equal(pickLegalDocs([v(9, "엉터리"), v(1, "2026-09-01")], "2026-09-30").current?.version, 1);
  });
});

describe("DB 줄 → 판", () => {
  it("legalVersionFromRow", () => {
    const r = legalVersionFromRow({
      id: 7,
      kind: "terms",
      version: 2,
      title: "이용약관",
      body: "본문",
      effective_date: "2026-10-01",
      published_at: "2026-09-30T05:00:00Z",
      note: "숨은 칸은 옮기지 않는다",
    });
    assert.deepEqual(r, {
      id: 7,
      kind: "terms",
      version: 2,
      title: "이용약관",
      body: "본문",
      effectiveDate: "2026-10-01",
      publishedAt: "2026-09-30T05:00:00Z",
    });
    assert.equal(legalVersionFromRow({ kind: "x", effective_date: "2026-10-01" }), null);
    assert.equal(legalVersionFromRow({ kind: "terms", effective_date: "없음" }), null);
    assert.equal(legalVersionFromRow(null), null);
  });
  it("legalMetaFromRow", () => {
    const m = legalMetaFromRow({
      id: "3",
      version: 1,
      title: "t",
      effective_date: "2026-10-01",
      published_at: "2026-09-30T05:00:00Z",
      published_by_username: "yogico",
      note: "",
      body_length: 1200,
    });
    assert.deepEqual(m, {
      id: 3,
      version: 1,
      title: "t",
      effectiveDate: "2026-10-01",
      publishedAt: "2026-09-30T05:00:00Z",
      publishedByUsername: "yogico",
      note: null,
      bodyLength: 1200,
    });
  });
});

describe("게시 검사", () => {
  const today = "2026-09-30";
  const ok = { kind: "terms", title: " 이용약관 ", body: "## 제1조\r\n본문\n\n\n", effectiveDate: "2026-10-07", note: " 처음 " };
  it("맞는 요청 — 제목은 다듬고, 본문 줄바꿈은 \\n, 끝 빈 줄은 뗀다", () => {
    const r = parsePublishInput(ok, today);
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.value, { kind: "terms", title: "이용약관", body: "## 제1조\n본문", effectiveDate: "2026-10-07", note: "처음" });
    }
  });
  it("오늘 · 366일 뒤는 된다, 어제 · 367일 뒤는 안 된다", () => {
    assert.ok(parsePublishInput({ ...ok, effectiveDate: today }, today).ok);
    assert.ok(parsePublishInput({ ...ok, effectiveDate: addDaysYmd(today, 366) }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, effectiveDate: "2026-09-29" }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, effectiveDate: addDaysYmd(today, 367) }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, effectiveDate: "2026-02-30" }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, effectiveDate: undefined }, today).ok);
  });
  it("종류 · 제목 · 본문 · 사유 길이", () => {
    assert.ok(!parsePublishInput({ ...ok, kind: "x" }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, title: "  " }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, title: "가".repeat(101) }, today).ok);
    assert.ok(parsePublishInput({ ...ok, title: "가".repeat(100) }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, title: "두\n줄" }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, body: " \n " }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, body: "가".repeat(LEGAL_BODY_MAX + 1) }, today).ok);
    assert.ok(parsePublishInput({ ...ok, body: "가".repeat(LEGAL_BODY_MAX) }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, note: "가".repeat(501) }, today).ok);
    assert.ok(!parsePublishInput({ ...ok, note: 3 }, today).ok);
    const noNote = parsePublishInput({ ...ok, note: "  " }, today);
    assert.ok(noNote.ok && noNote.value.note === null);
    assert.ok(!parsePublishInput(null, today).ok);
    assert.ok(!parsePublishInput([ok], today).ok);
  });
  it("부드러운 경고 — 시행 중인 약관·방침을 7일 안에 바꿀 때만", () => {
    assert.ok(noticeWarning("terms", "2026-10-06", today));
    assert.ok(noticeWarning("privacy", today, today));
    assert.equal(noticeWarning("terms", "2026-10-07", today), null);
    assert.equal(noticeWarning("refund", today, today), null);
    assert.equal(noticeWarning("terms", today, today, false), null);
  });
  it("시행일 기본값", () => {
    assert.equal(defaultEffectiveDate("terms", false, today), today);
    assert.equal(defaultEffectiveDate("terms", true, today), "2026-10-07");
    assert.equal(defaultEffectiveDate("privacy", true, today), "2026-10-07");
    assert.equal(defaultEffectiveDate("refund", true, today), today);
  });
});

describe("뼈대 · 이름 · 초안", () => {
  it("뼈대는 제목과 〔채워 주세요〕 자리만 — 지어낸 법률 문장이 없다", () => {
    for (const k of LEGAL_KINDS) {
      const s = legalSkeleton(k, "요기코퍼레이션");
      assert.ok(s.includes("〔채워 주세요〕"), k);
      assert.ok(s.includes("요기코퍼레이션"), k);
      for (const b of parseLegalMarkdown(s)) {
        if (b.t === "p") assert.ok(b.text.length <= 40, `${k}: 긴 문장 "${b.text}"`);
      }
      assert.doesNotMatch(s, /합니다|한다\.|하여야|아니한다/);
    }
    assert.ok(legalSkeleton("terms", " ").includes("회사"));
  });
  it("문서 종류", () => {
    assert.deepEqual([...LEGAL_KINDS], ["terms", "privacy", "refund"]);
    assert.equal(LEGAL_DOCS.refund.path, "/refund");
    assert.ok(isLegalKind("privacy"));
    assert.ok(!isLegalKind("Terms"));
  });
  it("을/를", () => {
    assert.equal(withObjectParticle("이용약관"), "이용약관을");
    assert.equal(withObjectParticle("개인정보처리방침"), "개인정보처리방침을");
    assert.equal(withObjectParticle("환불·청약철회 안내"), "환불·청약철회 안내를");
    assert.equal(withObjectParticle("FAQ"), "FAQ을(를)");
  });
  it("제어 글자", () => {
    assert.ok(hasControlChar("a\nb"));
    assert.ok(hasControlChar("a\tb"));
    assert.ok(!hasControlChar("평범한 글 · 10:00~18:00"));
  });
  it("초안 — 열쇠 · 모양 검사", () => {
    assert.equal(legalDraftKey("privacy"), "admin-legal-draft:v1:privacy");
    const d = { title: "이용약관", body: "본문", effectiveDate: "2026-10-07", savedAt: "2026-09-30T05:00:00Z" };
    assert.deepEqual(parseLegalDraft(JSON.stringify(d)), d);
    assert.deepEqual(parseLegalDraft({ ...d, effectiveDate: "" }), { ...d, effectiveDate: "" });
    assert.equal(parseLegalDraft("{깨진"), null);
    assert.equal(parseLegalDraft({ ...d, effectiveDate: "2026-02-30" }), null);
    assert.equal(parseLegalDraft({ ...d, title: " ", body: "" }), null);
    assert.equal(parseLegalDraft({ ...d, body: 3 }), null);
    assert.equal(parseLegalDraft(null), null);
  });
});

describe("원문 검사 — 약관을 그리는 부품에 날것의 HTML 넣기가 없다", () => {
  const SRC = new URL("../", import.meta.url);
  const list = (dirRel: string) => {
    const dir = new URL(`${dirRel}/`, SRC);
    if (!existsSync(dir)) return [];
    return (readdirSync(dir, { recursive: true }) as unknown[])
      .map((f) => String(f).replace(/\\/g, "/"))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => `${dirRel}/${f}`);
  };
  it("components/legal · components/admin/business · 공개 문서 화면", () => {
    const files = [...list("components/legal"), ...list("components/admin/business"), "app/terms/page.tsx", "app/privacy/page.tsx", "app/refund/page.tsx"];
    assert.ok(files.includes("components/legal/LegalDocView.tsx"));
    assert.ok(files.length >= 5);
    for (const f of files) {
      const src = readFileSync(new URL(f, SRC), "utf8");
      for (const w of ["dangerouslySetInnerHTML", "innerHTML", "eval("]) assert.ok(!src.includes(w), `${f}: ${w}`);
    }
  });
  it("공개 문서 화면은 5분마다 새로 그리고, 준비 중이면 색인하지 않는다", () => {
    for (const k of LEGAL_KINDS) {
      const src = readFileSync(new URL(`app/${k}/page.tsx`, SRC), "utf8");
      assert.match(src, /export const revalidate = 300;/, k);
      assert.ok(src.includes(`legalMetadata("${k}")`), k);
      assert.ok(src.includes(`<LegalPage kind="${k}" />`), k);
    }
    const page = readFileSync(new URL("components/legal/LegalPage.tsx", SRC), "utf8");
    assert.match(page, /robots: current \? undefined : \{ index: false, follow: true \}/);
  });
});
