import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  cleanWithdrawReason,
  daysUntilPurge,
  deleteBookConfirmText,
  isRetentionDir,
  RETENTION_DAYS,
  retentionState,
  WITHDRAW_CONFIRM_WORD,
  WITHDRAW_NOTICE,
  WITHDRAW_REASON_MAX,
  withdrawConfirmed,
} from "./retention.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("탈퇴·삭제 90일 보관(lib/retention) — 2026-10-19", () => {
  it("보관 기간은 SQL(retention_interval)과 같다", () => {
    const sql = read("../../supabase-withdrawal.sql");
    assert.match(sql, new RegExp(`interval '${RETENTION_DAYS} days'`));
    assert.equal(RETENTION_DAYS, 90);
  });

  it("확인 글자는 SQL(withdraw_me)과 같은 '탈퇴' — 앞뒤 공백만 봐준다", () => {
    const sql = read("../../supabase-withdrawal.sql");
    assert.match(sql, new RegExp(`<> '${WITHDRAW_CONFIRM_WORD}'`));
    assert.equal(withdrawConfirmed("탈퇴"), true);
    assert.equal(withdrawConfirmed("  탈퇴 "), true);
    assert.equal(withdrawConfirmed("탈 퇴"), false);
    assert.equal(withdrawConfirmed("탈퇴할래요"), false);
    assert.equal(withdrawConfirmed(null), false);
  });

  it("사유는 다듬어 500자까지, 비면 null", () => {
    assert.equal(cleanWithdrawReason("  가격이 부담돼요 "), "가격이 부담돼요");
    assert.equal(cleanWithdrawReason("   "), null);
    assert.equal(cleanWithdrawReason(undefined), null);
    assert.equal(cleanWithdrawReason("가".repeat(800))?.length, WITHDRAW_REASON_MAX);
  });

  it("지워도 되는 폴더 모양만 — 책 폴더·가족 폴더 둘뿐", () => {
    assert.equal(isRetentionDir("books/fe/my-abc123"), true);
    assert.equal(isRetentionDir("books/member/my_x-1"), true);
    assert.equal(isRetentionDir("family/99f8932a-c8dc-4e5a-84f3-2311fc189a93"), true);
    for (const bad of ["", "books", "books/fe", "books/fe/", "books/fe/my/../x", "books/FE/my-a", "family/fe", "family/", "classic/oz",
      "folk/haedal", "/books/fe/my-a", "books/fe/my-a/p1.webp", "family/99f8932a-c8dc-4e5a-84f3-2311fc189a93/x", ".", "..", null, 3]) {
      assert.equal(isRetentionDir(bad), false, String(bad));
    }
  });

  it("상태 — 보관 중 · 정리할 때 · 정리함, 남은 날은 올림", () => {
    const now = new Date("2026-10-19T00:00:00Z");
    assert.equal(retentionState({ purge_after: "2026-12-01T00:00:00Z", purged_at: null }, now), "kept");
    assert.equal(retentionState({ purge_after: "2026-10-18T00:00:00Z", purged_at: null }, now), "due");
    assert.equal(retentionState({ purge_after: "2026-10-18T00:00:00Z", purged_at: "2026-10-19T00:00:00Z" }, now), "purged");
    assert.equal(daysUntilPurge("2026-10-20T01:00:00Z", now), 2);
    assert.equal(daysUntilPurge("2026-10-01T00:00:00Z", now), 0);
  });

  it("안내 문구에 90일·결제 기록 보관·재가입 토큰이 있다", () => {
    const all = WITHDRAW_NOTICE.join(" ");
    assert.ok(all.includes(`${RETENTION_DAYS}일`));
    assert.ok(all.includes("결제·환불 기록"));
    assert.ok(all.includes("가입 선물 토큰"));
    assert.ok(deleteBookConfirmText("하온이의 모험").includes(`${RETENTION_DAYS}일`));
  });

  it("화면이 탈퇴를 연결해 두었다 — 설정 단추 · 시트 · 로그인 안내 · 관리실 보관함", () => {
    assert.ok(read("../app/settings/page.tsx").includes("<WithdrawSheet"));
    assert.ok(read("../components/settings/WithdrawSheet.tsx").includes("withdrawAccount("));
    assert.ok(read("./auth.ts").includes('rpc("withdraw_me"'));
    assert.ok(read("../app/login/page.tsx").includes('get("bye")'));
    assert.ok(read("../app/api/admin/retention/route.ts").includes("masterOnly("));
    assert.ok(read("../components/admin/members/MembersPage.tsx").includes("/admin/members/retention"));
  });

  it("cafe24 폴더 지우기는 지워도 되는 모양만 본다(removeCafe24Dirs → isRetentionDir)", () => {
    const src = read("./cafe24.ts");
    const body = src.slice(src.indexOf("export async function removeCafe24Dirs"));
    assert.ok(body.includes("isRetentionDir(dir)"));
  });
});
