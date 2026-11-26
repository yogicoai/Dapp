/**
 * 구글 플레이 결제 길 안전장치 — 원문 검사(2026-11-26 구글 결제 1단계).
 *
 *  B1 화면 쪽(결제 단추·화면 도우미)은 우리 서버의 두 경로(verify·sync)만 부르고, 비밀 값·서버 것(node:crypto)에 닿지 않으며
 *     구매 토큰을 브라우저 저장소에 두지 않는다.
 *  B2 서버 경로는 로그인한 회원(callerOf)의 권한 그대로 DB 를 부른다 — 서비스 키를 쓰지 않는다.
 *  B3 이용권을 주는 DB 함수는 서버 열쇠가 있어야 돈다 — 앱이 바로 부르는 길(화면 파일)에 그 이름이 없다.
 *  B4 요금제 화면(시연 파일)은 결제 단추를 그리기만 한다 — 앱 안일 때만, 웹 결제(시연) 단추와 따로.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SRC = new URL("../", import.meta.url); // src/
const read = (rel: string) => readFileSync(new URL(rel, SRC), "utf8");

const CLIENT_FILES = ["components/billing/GooglePlayBuy.tsx", "lib/google-play-client.ts", "components/BillingSync.tsx"];
const ROUTES = ["app/api/billing/google/verify/route.ts", "app/api/billing/google/sync/route.ts"];
const SERVER_FILES = [
  ...ROUTES,
  "app/api/billing/google/status/route.ts",
  "lib/google-play-server.ts",
  "lib/google-play-env.ts",
  "lib/google-play.ts",
];

describe("B0 파일이 제자리에 있다", () => {
  it("화면·서버 파일", () => {
    for (const f of [...CLIENT_FILES, ...SERVER_FILES, "lib/google-play-products.ts"]) assert.ok(existsSync(new URL(f, SRC)), f);
  });
});

describe("B1 화면 쪽은 우리 서버 두 경로만 부르고 비밀·서버 것에 닿지 않는다", () => {
  for (const f of CLIENT_FILES) {
    it(f, () => {
      const src = read(f);
      const paths = [...src.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1]);
      for (const p of paths) assert.ok(/^\/api\/billing\/google\/(verify|sync)$/.test(p), `${f}: 모르는 경로 ${p}`);
      for (const w of ["SERVICE_ROLE", "service_role", "GOOGLE_PLAY_SA", "billingServerKey", "node:crypto", "localStorage", ".rpc("]) {
        assert.ok(!src.includes(w), `${f}: 금지 글자 "${w}"`);
      }
      // 서버 것(google-play.ts — node:crypto)을 화면 묶음에 끌어들이지 않는다. 상품 표는 google-play-products 에서
      assert.ok(!/from\s+["'](@\/lib\/|\.\/)google-play(\.ts)?["']/.test(src), `${f}: 서버 파일 google-play 를 가져온다`);
      assert.ok(!/from\s+["'](@\/lib\/|\.\/)google-play-(server|env)(\.ts)?["']/.test(src), `${f}: 서버 파일을 가져온다`);
    });
  }
  it("구매 토큰은 서버(verify)로 바로 보낸다 — sessionStorage 에는 동기화 표시(회원 id|시각)만", () => {
    const src = read("lib/google-play-client.ts");
    const writes = [...src.matchAll(/sessionStorage\.setItem\(([^)]*)\)/g)].map((m) => m[1]);
    assert.deepEqual(writes, ["SYNC_KEY, `${uid}|${now}`"]);
    assert.match(src, /"\/api\/billing\/google\/verify"[\s\S]*purchaseToken: token/);
    assert.match(src, /supportedMethods: PLAY_BILLING_METHOD/);
    assert.match(src, /PLAY_BILLING_METHOD = "https:\/\/play\.google\.com\/billing"/);
  });
});

describe("B2 서버 경로는 회원 권한 그대로 — 서비스 키를 쓰지 않는다", () => {
  for (const f of SERVER_FILES) {
    it(f, () => {
      const src = read(f);
      assert.ok(!/SERVICE_ROLE|service_role|createClient\(/.test(src), `${f}: 서비스 키·새 클라이언트`);
    });
  }
  for (const f of ROUTES) {
    it(`${f} — 로그인 확인부터`, () => {
      const src = read(f);
      assert.match(src, /const caller = await callerOf\(request\);\s*\n\s*if \(!caller\)/);
      assert.match(src, /caller\.db/);
    });
  }
});

describe("B3 이용권을 주는 DB 함수는 서버 열쇠가 있어야 돈다", () => {
  const sql = readFileSync(new URL("../supabase-google-play.sql", SRC), "utf8");
  const fns = ["google_play_apply_subscription", "google_play_apply_product", "google_play_mark_ack", "google_play_my_purchases"];
  for (const fn of fns) {
    it(fn, () => {
      const start = sql.indexOf(`create or replace function public.${fn}(`);
      assert.ok(start >= 0, `${fn} 가 없다`);
      const body = sql.slice(start, sql.indexOf("end; $$;", start));
      assert.match(body, /if not public\.billing_server_ok\(p_key\) then\s*\n\s*raise exception '권한이 없습니다\.' using errcode = '42501';/);
      // 비회원(anon)에게는 열지 않는다
      const grants = sql.slice(sql.indexOf("end; $$;", start), sql.indexOf("end; $$;", start) + 600);
      assert.match(grants, /from public, anon;/);
      assert.ok(!/to anon/.test(grants), `${fn}: anon 에 열림`);
    });
  }
  it("열쇠 확인 함수는 앱 역할 누구에게도 열지 않는다", () => {
    assert.match(sql, /revoke all on function public\.billing_server_ok\(text\) from public, anon, authenticated;/);
    assert.ok(!/grant execute on function public\.billing_server_ok/.test(sql));
  });
  it("지문 줄이 들어 있다(자리표시가 남지 않았다)", () => {
    assert.match(sql, /insert into public\.billing_server_keys \(id, key_hash\) values \(1, '[0-9a-f]{64}'\)/);
    assert.ok(!sql.includes("__BILLING_KEY_HASH_INSERT__"));
  });
  it("화면 파일은 이 함수들을 부르지 않는다(서버만)", () => {
    for (const f of CLIENT_FILES) for (const fn of fns) assert.ok(!read(f).includes(fn), `${f}: ${fn}`);
  });
});

describe("B4 요금제 화면은 앱 안에서만 구글 결제 단추를 그린다", () => {
  const plans = read("components/pay/PlansView.tsx");
  it("단추 둘(가족 패스 · 스타트팩), 둘 다 inApp 갈래 안", () => {
    const uses = [...plans.matchAll(/<GooglePlayBuy\b/g)].length;
    assert.equal(uses, 2);
    for (const m of plans.matchAll(/\{inApp \? \(\s*<div className="mt-5">\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<GooglePlayBuy/g)) assert.ok(m);
    assert.equal([...plans.matchAll(/\{inApp \? \(\s*<div className="mt-5">\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<GooglePlayBuy/g)].length, 2);
  });
  it("지금 파는 상품만 — 크레딧 묶음 단추는 아직 없다", () => {
    const ids = [...plans.matchAll(/product=(?:\{[^}]*\}|"[^"]*")/g)].map((m) => m[0]).join(" ");
    assert.match(ids, /family_pass_yearly/);
    assert.match(ids, /family_pass"/);
    assert.match(ids, /starter_pack/);
    assert.ok(!/credit_pack/.test(plans));
  });
});
