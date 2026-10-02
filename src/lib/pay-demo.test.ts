import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PLAN_TERMS, PLANS, formatDateKo } from "./plans.ts";
import {
  CONSENTS,
  EMPTY_DEMO,
  PAY_METHODS,
  applyDemoOrder,
  canBuyExtra,
  checkParentAnswer,
  clearDemoState,
  demoKey,
  demoOrderId,
  doneEligibility,
  failCopy,
  initialConsents,
  isDemoOrderId,
  parentQuestion,
  parseFailCode,
  parseMethod,
  parsePlan,
  payDemoMode,
  readDemoState,
  writeDemoState,
  type DemoPass,
  type DemoPending,
  type DemoState,
} from "./pay-demo.ts";

/** 가짜 저장소(Map) */
function memKV() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const NOW = new Date(2026, 8, 30, 10, 0, 0);
const OID = "DEMO-20260930-7K2Q9X";

function pending(over: Partial<DemoPending> = {}): DemoPending {
  return { orderId: OID, plan: "monthly", method: "card", amountWon: 19_900, at: NOW.toISOString(), ...over };
}
function state(over: Partial<DemoState> = {}): DemoState {
  return { v: 1, pending: null, pass: null, receipts: [], ...over };
}
function pass(over: Partial<DemoPass> = {}): DemoPass {
  return { plan: "monthly", startedAt: NOW.toISOString(), nextBillingAt: new Date(2026, 9, 30).toISOString(), booksLeft: 6, ...over };
}

describe("스위치 — off 일 때만 off", () => {
  it("값이 없거나 다른 값이면 on", () => {
    for (const v of [undefined, "", "on", "ON", "yes"]) assert.equal(payDemoMode(v), "on", String(v));
  });
  it("off (공백·대소문자 무시)", () => {
    assert.equal(payDemoMode("off"), "off");
    assert.equal(payDemoMode(" OFF "), "off");
  });
});

describe("주소 값 정리", () => {
  it("parsePlan", () => {
    assert.equal(parsePlan("monthly"), "monthly");
    assert.equal(parsePlan("yearly"), "yearly");
    assert.equal(parsePlan("extra3"), "extra3");
    for (const v of ["MONTHLY", ["monthly"], "weekly", 1, undefined, null]) assert.equal(parsePlan(v), null, String(v));
  });
  it("parseMethod — 휴대폰 결제 없음", () => {
    assert.equal(parseMethod("kakaopay"), "kakaopay");
    assert.equal(parseMethod("phone"), null);
    assert.equal(parseMethod(["card"]), null);
  });
  it("결제 수단 목록", () => {
    assert.deepEqual(
      PAY_METHODS.map((m) => m.id),
      ["card", "kakaopay", "naverpay", "tosspay"],
    );
    for (const m of PAY_METHODS) assert.doesNotMatch(m.label, /휴대폰|폰|phone/i);
  });
  it("실패 코드 — 모르는 값은 UNKNOWN, 문구는 늘 있다", () => {
    assert.equal(parseFailCode("x"), "UNKNOWN");
    assert.equal(parseFailCode(undefined), "UNKNOWN");
    assert.equal(parseFailCode("REJECT_CARD_COMPANY"), "REJECT_CARD_COMPANY");
    assert.equal(parseFailCode("PAY_PROCESS_CANCELED"), "PAY_PROCESS_CANCELED");
    for (const c of ["PAY_PROCESS_CANCELED", "REJECT_CARD_COMPANY", "UNKNOWN"] as const) assert.ok(failCopy(c).length > 0);
    assert.equal(failCopy("UNKNOWN"), "잠시 연결이 고르지 않았어요. 조금 뒤에 다시 해 주세요.");
  });
});

describe("시연 주문번호", () => {
  it("모양", () => {
    assert.match(demoOrderId(new Date(2026, 8, 30), () => 0), /^DEMO-20260930-[A-HJ-NP-Z2-9]{6}$/);
    assert.match(demoOrderId(new Date(2026, 0, 5), () => 0.9999), /^DEMO-20260105-[A-HJ-NP-Z2-9]{6}$/);
    assert.match(demoOrderId(NOW, Math.random), /^DEMO-20260930-[A-HJ-NP-Z2-9]{6}$/);
    assert.ok(isDemoOrderId(demoOrderId(NOW, () => 1)));
  });
  it("isDemoOrderId 가 거절하는 것", () => {
    assert.equal(isDemoOrderId(OID), true);
    for (const v of ["demo-20260930-7K2Q9X", "DEMO-2026093-AAAAAA", "DEMO-20260930-AAAAA0", " DEMO-20260930-AAAAAA", "DEMO-20260930-AAAAAA ", 20260930, null]) {
      assert.equal(isDemoOrderId(v), false, String(v));
    }
  });
});

describe("어른 확인", () => {
  it("parentQuestion 범위", () => {
    assert.deepEqual(parentQuestion(() => 0), { a: 12, b: 3 });
    assert.deepEqual(parentQuestion(() => 0.999), { a: 19, b: 9 });
    assert.deepEqual(parentQuestion(() => 1), { a: 19, b: 9 });
  });
  it("checkParentAnswer", () => {
    const q = { a: 13, b: 4 };
    assert.equal(checkParentAnswer(q, "52"), true);
    assert.equal(checkParentAnswer(q, " 52 "), true);
    for (const v of ["52a", "", "5 2", "51", "-52", "52.0"]) assert.equal(checkParentAnswer(q, v), false, v);
  });
});

describe("동의", () => {
  it("2개, 처음엔 체크 안 됨", () => {
    assert.deepEqual(initialConsents(), [false, false]);
    assert.equal(CONSENTS.length, 2);
  });
  it("구독과 추가 3권의 문구가 다르다", () => {
    assert.match(CONSENTS[0].label(PLANS.monthly), /자동 결제/);
    assert.doesNotMatch(CONSENTS[0].label(PLANS.extra3), /자동 결제/);
    assert.ok(CONSENTS[0].sheetBody(PLANS.monthly).join(" ").includes("19,900원"));
    assert.ok(CONSENTS[0].sheetBody(PLANS.yearly).join(" ").includes("199,000원"));
    assert.ok(CONSENTS[0].sheetBody(PLANS.extra3).join(" ").includes("9,900원"));
  });
});

describe("시연 기록 읽고 쓰기", () => {
  it("한 바퀴", () => {
    const kv = memKV();
    const s = state({ pending: pending(), pass: pass(), receipts: [] });
    writeDemoState("u1", s, kv);
    assert.ok(kv.m.has(demoKey("u1")));
    assert.equal(demoKey("u1"), "voice-storybook:pay-demo:v1:u1");
    assert.deepEqual(readDemoState("u1", kv), s);
    assert.deepEqual(readDemoState("u2", kv), EMPTY_DEMO);
    clearDemoState("u1", kv);
    assert.deepEqual(readDemoState("u1", kv), EMPTY_DEMO);
  });
  it("저장소가 던지거나 JSON 이 깨지면 빈 기록", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(readDemoState("u1", throwing), EMPTY_DEMO);
    assert.doesNotThrow(() => writeDemoState("u1", state(), throwing));
    assert.doesNotThrow(() => clearDemoState("u1", throwing));
    const kv = memKV();
    kv.setItem(demoKey("u1"), "{not json");
    assert.deepEqual(readDemoState("u1", kv), EMPTY_DEMO);
    kv.setItem(demoKey("u1"), JSON.stringify({ v: 2, receipts: [] }));
    assert.deepEqual(readDemoState("u1", kv), EMPTY_DEMO);
  });
  it("모양이 틀린 칸은 버린다", () => {
    const kv = memKV();
    kv.setItem(
      demoKey("u1"),
      JSON.stringify({
        v: 1,
        pending: { orderId: "not-demo", plan: "monthly", method: "card", amountWon: 1, at: NOW.toISOString() },
        pass: { plan: "weekly", startedAt: "x", nextBillingAt: "y", booksLeft: 6 },
        receipts: [{ orderId: OID, plan: "monthly", amountWon: 12900, method: "phone", at: NOW.toISOString() }],
      }),
    );
    assert.deepEqual(readDemoState("u1", kv), EMPTY_DEMO);
  });
  it("저장소가 없으면(서버) 빈 기록", () => {
    assert.deepEqual(readDemoState("u1", null), EMPTY_DEMO);
    assert.deepEqual(readDemoState("", memKV()), EMPTY_DEMO);
  });
});

describe("완료 화면 자격", () => {
  it("대기 주문과 번호·요금제가 같으면 fresh", () => {
    assert.equal(doneEligibility(state({ pending: pending() }), OID, "monthly"), "fresh");
    assert.equal(doneEligibility(state({ pending: pending() }), OID, "monthly", "card"), "fresh");
  });
  it("요금제·수단이 다르면 no", () => {
    assert.equal(doneEligibility(state({ pending: pending() }), OID, "yearly"), "no");
    assert.equal(doneEligibility(state({ pending: pending() }), OID, "monthly", "kakaopay"), "no");
  });
  it("이미 반영한 번호면 again", () => {
    const s = applyDemoOrder(state({ pending: pending() }), NOW);
    assert.equal(doneEligibility(s, OID, "monthly"), "again");
  });
  it("번호가 없거나 모양이 틀리면 no", () => {
    assert.equal(doneEligibility(state({ pending: pending() }), null, "monthly"), "no");
    assert.equal(doneEligibility(state({ pending: pending() }), OID, null), "no");
    assert.equal(doneEligibility(state(), OID, "monthly"), "no");
  });
  it("가족 패스 없이 추가 3권은 no", () => {
    const p = pending({ plan: "extra3", amountWon: 9900 });
    assert.equal(doneEligibility(state({ pending: p }), OID, "extra3"), "no");
    assert.equal(doneEligibility(state({ pending: p, pass: pass() }), OID, "extra3"), "fresh");
  });
});

describe("applyDemoOrder", () => {
  it("월간 — 남은 책 4권(가족 패스 2026-10-01 확정), 다음 결제일 한 달 뒤, 대기 비움", () => {
    const s = applyDemoOrder(state({ pending: pending() }), NOW);
    assert.equal(s.pending, null);
    assert.equal(s.pass?.plan, "monthly");
    assert.equal(s.pass?.booksLeft, 4);
    assert.equal(formatDateKo(new Date(s.pass?.nextBillingAt ?? "")), "2026. 10. 30.");
    assert.equal(s.receipts.length, 1);
    assert.equal(s.receipts[0].amountWon, 19_900);
  });
  it("연간 — 다음 결제일 한 해 뒤", () => {
    const s = applyDemoOrder(state({ pending: pending({ plan: "yearly", amountWon: 199_000 }) }), NOW);
    assert.equal(s.pass?.plan, "yearly");
    assert.equal(formatDateKo(new Date(s.pass?.nextBillingAt ?? "")), "2027. 9. 30.");
  });
  it("남은 책 수는 관리실 요금제 값을 따른다(월간·연간 따로, 2026-10-02)", () => {
    const terms = {
      ...DEFAULT_PLAN_TERMS,
      monthly: { ...DEFAULT_PLAN_TERMS.monthly, booksPerMonth: 6 },
      yearly: { ...DEFAULT_PLAN_TERMS.yearly, booksPerMonth: 8 },
    };
    assert.equal(applyDemoOrder(state({ pending: pending() }), NOW, terms).pass?.booksLeft, 6);
    const y = applyDemoOrder(state({ pending: pending({ plan: "yearly", amountWon: 199_000 }) }), NOW, terms);
    assert.equal(y.pass?.booksLeft, 8);
  });
  it("가족 패스 없이 추가 3권 → 아무것도 바뀌지 않음", () => {
    const before = state({ pending: pending({ plan: "extra3", amountWon: 9900 }) });
    assert.deepEqual(applyDemoOrder(before, NOW), before);
  });
  it("가족 패스가 있으면 추가 3권 → 9권", () => {
    const s = applyDemoOrder(state({ pending: pending({ plan: "extra3", amountWon: 9900 }), pass: pass() }), NOW);
    assert.equal(s.pass?.booksLeft, 9);
    assert.equal(s.receipts.length, 1);
  });
  it("같은 번호를 두 번 넣어도 영수증은 1개, 책도 한 번만", () => {
    const once = applyDemoOrder(state({ pending: pending({ plan: "extra3", amountWon: 9900 }), pass: pass() }), NOW);
    const twice = applyDemoOrder({ ...once, pending: pending({ plan: "extra3", amountWon: 9900 }) }, NOW);
    assert.equal(twice.receipts.length, 1);
    assert.equal(twice.pass?.booksLeft, 9);
    assert.equal(twice.pending, null);
  });
  it("영수증은 최대 10개", () => {
    let s = state({ pass: pass() });
    for (let i = 0; i < 12; i++) {
      const id = `DEMO-20260930-AAAAA${"23456789ABCDEF"[i]}`;
      s = applyDemoOrder({ ...s, pending: pending({ orderId: id, plan: "extra3", amountWon: 9900 }) }, NOW);
    }
    assert.equal(s.receipts.length, 10);
    assert.equal(s.receipts[0].orderId, "DEMO-20260930-AAAAAD"); // 마지막(12번째)이 맨 앞
  });
  it("대기 주문이 없으면 그대로", () => {
    const s = state({ pass: pass() });
    assert.equal(applyDemoOrder(s, NOW), s);
  });
});

describe("canBuyExtra", () => {
  it("가족 패스가 있어야", () => {
    assert.equal(canBuyExtra(state()), false);
    assert.equal(canBuyExtra(state({ pass: pass() })), true);
  });
});
