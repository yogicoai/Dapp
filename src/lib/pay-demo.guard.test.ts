/**
 * 결제 시연 안전장치 — 원문 검사.
 *
 * 시연 파일(app/plans · app/checkout · app/billing · components/pay · lib/plans · lib/pay-demo · lib/business-info)이
 *  G1 정해 둔 것만 import 하고, G2 서버·DB·잔액·결제사로 가는 글자를 한 줄도 담지 않으며,
 *  G3 시연 기록이 다른 화면으로 새지 않고, G4 옛 '충전' 지급 길이 되돌아오지 않고, G5 완료·동의·어른 확인 장치가 빠지지 않았는지 본다.
 * 파일 이름이 바뀌어 시험이 헛도는 일이 없게 꼭 있어야 할 파일부터 확인한다(G-T0).
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SRC = new URL("../", import.meta.url); // src/
const at = (rel: string) => new URL(rel, SRC);
const read = (rel: string) => readFileSync(at(rel), "utf8");

function listFiles(dirRel: string): string[] {
  const dir = at(`${dirRel}/`);
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as unknown[])
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `${dirRel}/${f}`);
}

const DEMO_DIRS = ["app/plans", "app/checkout", "app/billing", "components/pay"];
const DEMO_LIBS = ["lib/plans.ts", "lib/pay-demo.ts", "lib/business-info.ts"];
const DEMO_FILES = [...DEMO_DIRS.flatMap(listFiles), ...DEMO_LIBS.filter((f) => existsSync(at(f)))];
const PAY_COMPONENTS = new Set(listFiles("components/pay").map((f) => f.replace(/^components\/pay\//, "").replace(/\.(ts|tsx)$/, "")));

describe("G-T0 시연 파일이 제자리에 있다", () => {
  it("목록이 비어 있지 않고, 꼭 있어야 할 9개가 있다", () => {
    assert.ok(DEMO_FILES.length > 0);
    for (const f of [
      "app/plans/page.tsx",
      "app/checkout/page.tsx",
      "app/checkout/done/page.tsx",
      "app/checkout/fail/page.tsx",
      "app/billing/page.tsx",
      "components/pay/CheckoutDemo.tsx",
      "components/pay/DoneDemo.tsx",
      "lib/plans.ts",
      "lib/pay-demo.ts",
    ]) {
      assert.ok(DEMO_FILES.includes(f), `${f} 가 없어요`);
    }
  });
});

/* ── G1 import 허용 목록 ── */
const ALLOWED = new Set([
  "react",
  "next",
  "next/link",
  "next/navigation",
  "@/components/ThemeProvider",
  "@/components/family/ui",
  "@/components/family/icons",
  "@/components/family/Sheet",
  "@/lib/plans",
  "@/lib/pay-demo",
  "@/lib/business-info",
  "@/lib/auth", // 아래에서 모양을 따로 본다(loadSession 하나만)
  "@/lib/site-info-client", // 사업자 정보·약관 링크는 관리실에서 바꾼다 — 공개 정보 GET 하나뿐인 읽기 전용 훅만 허용
  "@/lib/scroll-lock", // 처리 가림막이 떠 있는 동안 뒤 화면 잠금 — 브라우저 모양만 바꾸고 서버·돈과 무관
  // 무료·스타트팩 권수와 크레딧 값은 관리실에서 바꾼다 — 요금제 서버 화면이 공개 값을 읽기만 하는 파일(G-T7 이 모양을 지킨다)
  "@/lib/offer-settings-server",
]);
const IMPORT_RE = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g;

function specifiers(src: string): string[] {
  return [...src.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]);
}

function importAllowed(file: string, spec: string): boolean {
  if (ALLOWED.has(spec)) return true;
  const pay = /^@\/components\/pay\/([\w-]+)$/.exec(spec);
  if (pay) return PAY_COMPONENTS.has(pay[1]);
  // 같은 폴더 상대 경로 — components/pay 안에서만, 그 폴더에 있는 파일만
  const relPay = /^\.\/([\w-]+)$/.exec(spec);
  if (relPay && file.startsWith("components/pay/")) return PAY_COMPONENTS.has(relPay[1]);
  // lib/pay-demo.ts → ./plans.ts
  if (spec === "./plans.ts" && file === "lib/pay-demo.ts") return true;
  return false;
}

describe("G-T1 시연 파일은 정해 둔 것만 import 한다", () => {
  for (const f of DEMO_FILES) {
    it(f, () => {
      const src = read(f);
      for (const spec of specifiers(src)) assert.ok(importAllowed(f, spec), `${f}: 허용 밖 import "${spec}"`);
      // @/lib/auth 는 `import { loadSession } from "@/lib/auth"` 모양만
      const authAll = src.match(/from\s*["']@\/lib\/auth["']/g)?.length ?? 0;
      const authOk = src.match(/import\s*\{\s*loadSession\s*\}\s*from\s*"@\/lib\/auth"/g)?.length ?? 0;
      assert.equal(authAll, authOk, `${f}: @/lib/auth 에서는 loadSession 하나만`);
    });
  }
});

/* ── G2 금지 글자 ── */
const FORBIDDEN_TEXT = [
  "fetch(",
  "authedFetch",
  '"/api/',
  "'/api/",
  "`/api/",
  ".rpc(",
  ".insert(",
  ".upsert(",
  ".update({",
  ".delete()",
  "getSupabase",
  "@/lib/supabase",
  "createClient",
  "grantTokens",
  "spendTokens",
  "refundTokens",
  "chargeIllustration",
  "localStorage",
  "XMLHttpRequest",
  "sendBeacon",
  "WebSocket",
  "EventSource",
  "next/script",
  "<Script",
  "SECRET",
  "SERVICE_ROLE",
];
const FORBIDDEN_SDK = /tosspayments|portone|iamport|inicis|nicepay/i;

describe("G-T2 시연 파일에 서버·DB·잔액·결제사로 가는 글자가 없다(주석 포함)", () => {
  for (const f of DEMO_FILES) {
    it(f, () => {
      const src = read(f);
      for (const w of FORBIDDEN_TEXT) assert.ok(!src.includes(w), `${f}: 금지 글자 "${w}"`);
      assert.doesNotMatch(src, FORBIDDEN_SDK, `${f}: 결제사 SDK 이름`);
    });
  }
});

describe("새 화면은 '권'으로 — 앱 안의 내부 화폐 이름이 없다", () => {
  for (const f of DEMO_FILES) {
    it(f, () => {
      // 고객에게 보이는 단위 이름은 "가족 그리기 토큰"과 "크레딧"(단품 구매) 둘뿐이다(2026-10-01 사장님 확정).
      // 앱 안의 옛 내부 단위(토큰)·쿠키는 여전히 쓰지 않는다 — 동화는 "권"으로 센다.
      assert.doesNotMatch(read(f).replace(/가족 그리기 토큰/g, ""), /토큰|쿠키/, f);
    });
  }
});

describe("시연 기록은 정해진 곳만 만진다", () => {
  const TOUCH = /\b(readDemoState|writeDemoState|clearDemoState)\s*\(/;
  const MAY_TOUCH = new Set([
    "lib/pay-demo.ts",
    "components/pay/CheckoutDemo.tsx",
    "components/pay/DoneDemo.tsx",
    "components/pay/BillingDemo.tsx",
  ]);
  for (const f of DEMO_FILES) {
    it(f, () => {
      const src = read(f);
      if (!MAY_TOUCH.has(f)) assert.doesNotMatch(src, TOUCH, `${f}: 시연 기록을 만지면 안 돼요`);
      if (f !== "lib/pay-demo.ts") assert.ok(!src.includes("sessionStorage"), `${f}: 저장소는 pay-demo 만`);
    });
  }
  it("결제하기 화면은 어른 확인을 지난 뒤(onParentPass)에만 대기 주문을 적는다", () => {
    const src = read("components/pay/CheckoutDemo.tsx");
    const writes = src.match(/writeDemoState\s*\(/g)?.length ?? 0;
    assert.equal(writes, 1);
    const pass = src.indexOf("function onParentPass");
    const write = src.indexOf("writeDemoState(");
    const nextFn = src.indexOf("\n  function ", pass + 1);
    assert.ok(pass > 0 && write > pass && (nextFn < 0 || write < nextFn), "writeDemoState 는 onParentPass 안에만");
  });
});

/* ── G3 격리 ── */
function allSrcFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as unknown[])
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f));
}

describe("G-T3 시연 기록·시연 모듈은 시연 파일 밖으로 새지 않는다", () => {
  it("나머지 src 는 pay-demo 를 import 하지 않고 시연 기록 키도 모른다", () => {
    const demo = new Set(DEMO_FILES);
    const leaks: string[] = [];
    for (const f of allSrcFiles()) {
      if (demo.has(f) || f.endsWith(".test.ts")) continue;
      const src = read(f);
      for (const w of ["@/lib/pay-demo", "./pay-demo", "pay-demo:v1"]) if (src.includes(w)) leaks.push(`${f}: ${w}`);
    }
    assert.deepEqual(leaks, []);
  });
});

/* ── G4 입구와 되돌림 방지 ── */
describe("G-T4 입구는 /plans 로, 옛 지급 길은 없다", () => {
  it("설정 — grantTokens·topUp 없음, 요금제·내 결제 링크 있음", () => {
    const src = read("app/settings/page.tsx");
    assert.ok(!src.includes("grantTokens"));
    assert.ok(!src.includes("topUp"));
    assert.ok(src.includes('href="/plans"'));
    assert.ok(src.includes('href="/billing"'));
  });
  it("가족 — 충전 단추가 설정으로 가지 않는다", () => {
    const src = read("app/family/page.tsx");
    assert.ok(!src.includes('onCharge={() => router.push("/settings")}'));
    assert.ok(src.includes('onCharge={() => router.push("/plans")}'));
  });
  it("만들기 — '설정에서 충전' 대신 요금제 링크", () => {
    const src = read("app/create/page.tsx");
    assert.ok(!src.includes("설정에서 충전할 수 있어요"));
    assert.ok(src.includes('href="/plans"'));
  });
  it("결제사 SDK 패키지를 넣지 않았다", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", SRC), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    assert.deepEqual(names.filter((n) => /toss|portone|iamport|inicis|nicepay/i.test(n)), []);
  });
});

/* ── G6 시연 파일이 쓰는 사이트 정보 훅 ── */
describe("G-T6 사이트 정보 훅은 공개 정보 GET 하나만", () => {
  const src = read("lib/site-info-client.ts");
  it("부르는 곳은 하나, 그것도 /api/site-info", () => {
    assert.equal(src.match(/\bfetch\s*\(/g)?.length ?? 0, 1);
    assert.match(src, /fetch\(\s*"\/api\/site-info"\s*\)/);
    assert.equal(src.match(/\/api\//g)?.length ?? 0, 1, "다른 /api/ 경로가 있다");
  });
  it("GET 말고는 없다", () => {
    for (const m of src.matchAll(/method\s*:\s*["'`](\w+)["'`]/g)) assert.equal(m[1].toUpperCase(), "GET");
    assert.ok(!/method\s*:/.test(src), "method 를 적지 않는다(기본 GET)");
  });
  it("로그인·DB·저장소·비밀 값에 닿지 않는다", () => {
    for (const w of [
      "authedFetch",
      "getSupabase",
      "@/lib/supabase",
      "createClient",
      ".rpc(",
      ".insert(",
      ".upsert(",
      ".update(",
      ".delete(",
      "localStorage",
      "sessionStorage",
      "SERVICE_ROLE",
      "SECRET",
      "Authorization",
    ]) {
      assert.ok(!src.includes(w), `site-info-client: 금지 글자 "${w}"`);
    }
  });
  it("가져오는 것은 react 와 같은 폴더의 site-info 뿐", () => {
    assert.deepEqual(specifiers(src).sort(), ["./site-info.ts", "react"]);
  });
  it("맨 아래 줄은 훅을 거쳐 값을 받는다(사업자 정보 상수를 바로 그리지 않는다)", () => {
    const footer = read("components/pay/SiteFooter.tsx");
    assert.ok(footer.includes("useSiteInfo("));
    assert.ok(!footer.includes("BUSINESS_INFO"));
  });
});

/* ── G7 요금제 서버 화면이 읽는 관리실 설정 ── */
describe("G-T7 요금제 설정 읽기는 공개 값 읽기 하나만", () => {
  const src = read("lib/offer-settings-server.ts");
  it("서버 page 넷만 가져온다(브라우저 쪽 시연 파일은 값을 넘겨받기만)", () => {
    const users = DEMO_FILES.filter((f) => read(f).includes("@/lib/offer-settings-server")).sort();
    assert.deepEqual(users, ["app/billing/page.tsx", "app/checkout/done/page.tsx", "app/checkout/page.tsx", "app/plans/page.tsx"]);
    for (const f of users) assert.ok(!read(f).startsWith('"use client"'), `${f}: 서버 page 여야 해요`);
  });
  it("표 하나를 select 로만 읽는다", () => {
    assert.equal(src.match(/\.from\(/g)?.length ?? 0, 1);
    assert.match(src, /\.from\("app_offer_settings"\)/);
    assert.equal(src.match(/\.select\(/g)?.length ?? 0, 1);
  });
  it("바꾸는 호출·로그인·비밀 값이 없다", () => {
    for (const w of [
      ".rpc(",
      ".insert(",
      ".upsert(",
      ".update(",
      ".delete(",
      "authedFetch",
      "getSupabase",
      "@/lib/supabase",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "SERVICE_ROLE",
      "SECRET",
      "Authorization",
    ]) {
      assert.ok(!src.includes(w), `offer-settings-server: 금지 글자 "${w}"`);
    }
  });
  it("비회원 열쇠(anon)만 쓴다", () => {
    assert.match(src, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.equal(src.match(/process\.env\.\w+/g)?.filter((e) => !/NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)$/.test(e)).length ?? 0, 0);
  });
  it("가져오는 것은 정해 둔 다섯 가지뿐", () => {
    assert.deepEqual(specifiers(src).sort(), [
      "./library-catalog.ts",
      "./offer-settings.ts",
      "./plans.ts",
      "@supabase/supabase-js",
      "react",
    ]);
  });
});

/* ── G5 화면 장치 ── */
describe("G-T5 완료 자격·동의·어른 확인이 빠지지 않았다", () => {
  it("완료 화면은 자격 확인을 지난다", () => {
    assert.ok(read("components/pay/DoneDemo.tsx").includes("doneEligibility("));
  });
  it("결제하기 — 어른 확인, 빈 동의로 시작, 미리 체크 없음", () => {
    const src = read("components/pay/CheckoutDemo.tsx");
    assert.ok(src.includes("ParentCheck"));
    assert.ok(src.includes("initialConsents"));
    assert.ok(!src.includes("defaultChecked"));
    assert.ok(!/checked=\{\s*true\s*\}/.test(src));
  });
  it("결제하기 — 어른 확인을 지나도 동의 2개를 다시 본다(창이 열린 채 동의를 풀 수 있어서)", () => {
    const src = read("components/pay/CheckoutDemo.tsx");
    const pass = src.indexOf("function onParentPass");
    const write = src.indexOf("writeDemoState(", pass);
    const body = src.slice(pass, write);
    assert.match(body, /!consents\[0\]\s*\|\|\s*!consents\[1\]/, "onParentPass 첫머리에 동의 확인");
    assert.match(src, /inert=\{covered\}/, "시트가 떠 있는 동안 뒤 화면은 inert");
  });
  it("결제하기의 ← 는 /plans 를 새로 쌓지 않는다(뒤로 가기가 /plans ↔ /checkout 을 맴돌지 않게)", () => {
    const src = read("components/pay/CheckoutDemo.tsx");
    assert.ok(!src.includes('router.push("/plans")'));
    assert.ok(src.includes('useGoBack("/plans")'));
  });
  it("완료 page 는 결제사 결제 키가 오면 멈춘다", () => {
    const src = read("app/checkout/done/page.tsx");
    assert.ok(src.includes("paymentKey"));
    assert.ok(src.includes("PgNotConnected"));
  });
  it("실패 page 는 주소의 설명 글을 읽지 않는다", () => {
    const src = read("app/checkout/fail/page.tsx");
    assert.ok(!/sp\.message|\["message"\]/.test(src));
  });
  it("결제·구독 화면은 검색에서 뺀다", () => {
    for (const f of ["app/checkout/layout.tsx", "app/billing/layout.tsx"]) {
      assert.match(read(f), /index:\s*false/, f);
    }
  });
});
