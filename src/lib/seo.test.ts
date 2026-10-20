import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildRobots,
  buildSiteMetadata,
  buildSitemap,
  cleanImageUrl,
  cleanSiteUrl,
  cleanVerification,
  DEFAULT_SEO,
  FALLBACK_SITE_URL,
  mergeSeo,
  parseSeoPatch,
  PRIVATE_PATHS,
  SEO_LIMITS,
  siteOrigin,
  splitKeywords,
} from "./seo.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("검색 노출(SEO) — lib/seo (2026-10-19)", () => {
  it("검색어 — 쉼표·줄바꿈으로 나누고 공백·겹침을 뺀다", () => {
    assert.deepEqual(splitKeywords(" AI 동화, 맞춤  동화\n그림동화,, AI 동화 "), ["AI 동화", "맞춤 동화", "그림동화"]);
    assert.deepEqual(splitKeywords(""), []);
    assert.deepEqual(splitKeywords(null), []);
  });

  it("소유 확인 — 코드만 넣어도, <meta> 한 줄을 통째로 붙여도 코드만", () => {
    assert.equal(cleanVerification("abc123XYZ_-"), "abc123XYZ_-");
    assert.equal(cleanVerification('<meta name="naver-site-verification" content="7f1e2d3c4b5a69788776" />'), "7f1e2d3c4b5a69788776");
    assert.equal(cleanVerification("<meta name='google-site-verification' content='G-abcDEF123456'>"), "G-abcDEF123456");
    assert.equal(cleanVerification("코드 아님!"), null);
    assert.equal(cleanVerification('<script>alert(1)</script>'), null);
    assert.equal(cleanVerification(""), null);
  });

  it("대표 주소 — https 도메인만(경로·슬래시는 뗀다), 도메인만 적어도 https 를 붙인다", () => {
    assert.equal(cleanSiteUrl("https://dongwha.kr/"), "https://dongwha.kr");
    assert.equal(cleanSiteUrl("dongwha.kr/abc?x=1"), "https://dongwha.kr");
    assert.equal(cleanSiteUrl("http://dongwha.kr"), null);
    assert.equal(cleanSiteUrl("localhost"), null);
    assert.equal(cleanSiteUrl("javascript:alert(1)"), null);
    assert.equal(cleanSiteUrl(""), null);
  });

  it("공유 그림 — https 주소 또는 /로 시작하는 사이트 안 경로", () => {
    assert.equal(cleanImageUrl("/brand/og.jpg"), "/brand/og.jpg");
    assert.equal(cleanImageUrl("https://yogibo.openhost.cafe24.com/app/img/og.png"), "https://yogibo.openhost.cafe24.com/app/img/og.png");
    assert.equal(cleanImageUrl("//evil.com/x.png"), null);
    assert.equal(cleanImageUrl("http://x.com/a.png"), null);
    assert.equal(cleanImageUrl("javascript:alert(1)"), null);
  });

  it("관리실 입력 검사 — 모르는 칸·긴 값·틀린 모양은 한국어로 거절, 빈 칸은 null(기본값으로)", () => {
    const ok = parseSeoPatch({ site_title: "  우리  가족 동화 ", keywords: "a, b, a", indexing: false, naver_verification: 'content="abcdef123"' });
    assert.ok(ok.ok);
    if (ok.ok) assert.deepEqual(ok.patch, { site_title: "우리 가족 동화", keywords: "a, b", indexing: false, naver_verification: "abcdef123" });
    const cleared = parseSeoPatch({ description: "   " });
    assert.ok(cleared.ok && cleared.patch.description === null);
    for (const [bad, re] of [
      [{ hacker: "x" }, /모르는 항목/],
      [{ site_title: "가".repeat(SEO_LIMITS.site_title + 1) }, /70자/],
      [{ site_url: "http://x.com" }, /대표 주소/],
      [{ og_image: "//evil.com/a.png" }, /공유 그림/],
      [{ google_verification: "<script>" }, /구글/],
      [{ indexing: "yes" }, /검색 노출/],
      [{ description: 3 }, /글자/],
      [{}, /바꿀 값/],
    ] as const) {
      const r = parseSeoPatch(bad);
      assert.ok(!r.ok && re.test(r.error), JSON.stringify(bad));
    }
  });

  it("DB 줄 → 설정 — 빈 칸은 기본값, 이상한 값은 버림", () => {
    assert.deepEqual(mergeSeo(null), DEFAULT_SEO);
    const s = mergeSeo({ site_title: "제목", keywords: "가, 나", og_image: "javascript:x", indexing: false, google_verification: "bad code!" });
    assert.equal(s.siteTitle, "제목");
    assert.deepEqual(s.keywords, ["가", "나"]);
    assert.equal(s.ogImage, DEFAULT_SEO.ogImage);
    assert.equal(s.indexing, false);
    assert.equal(s.googleVerification, null);
    assert.equal(s.description, DEFAULT_SEO.description);
  });

  it("기본 설명에 부모 목소리 말이 없다(웹 오픈 숨김)", () => {
    assert.ok(!/엄마·아빠 목소리|가족 목소리|부모 목소리/.test(DEFAULT_SEO.description));
  });

  it("대표 주소 순서 — 관리실 값 → 환경변수 → 지금 배포 주소", () => {
    assert.equal(siteOrigin({ siteUrl: "https://a.kr" }, "https://b.kr"), "https://a.kr");
    assert.equal(siteOrigin({ siteUrl: null }, "https://b.kr/"), "https://b.kr");
    assert.equal(siteOrigin({ siteUrl: null }, undefined), FALLBACK_SITE_URL);
  });

  it("<head> — 제목 틀·설명·검색어·공유 그림·한국어·소유 확인·noindex", () => {
    const s = mergeSeo({ google_verification: "googleCode123", naver_verification: "naverCode123" });
    const m = buildSiteMetadata(s, "https://a.kr");
    assert.equal(String(m.metadataBase), "https://a.kr/");
    assert.deepEqual(m.title, { default: DEFAULT_SEO.siteTitle, template: "%s · 우리 가족 보이스 동화" });
    assert.deepEqual(m.keywords, DEFAULT_SEO.keywords);
    const og = m.openGraph as { locale?: string; images?: { url: string; width: number }[] };
    assert.equal(og.locale, "ko_KR");
    assert.equal(og.images?.[0].url, "/brand/og.jpg");
    assert.deepEqual(m.verification, { google: "googleCode123", other: { "naver-site-verification": "naverCode123" } });
    assert.deepEqual(m.robots, { index: true, follow: true });
    assert.deepEqual(buildSiteMetadata(mergeSeo({ indexing: false }), "https://a.kr").robots, { index: false, follow: false });
    assert.equal(buildSiteMetadata(mergeSeo(null), "https://a.kr").verification, undefined);
  });

  it("robots·sitemap — 관리실·서버 경로는 막고 공개 화면만, 노출을 끄면 전부 막고 비운다", () => {
    const on = buildRobots(mergeSeo(null), "https://a.kr");
    const rules = on.rules as { allow?: string; disallow?: string[] };
    for (const p of ["/admin", "/api/", "/settings", "/create", "/checkout", "/*.html"]) assert.ok(rules.disallow?.includes(p), p);
    assert.equal(on.sitemap, "https://a.kr/sitemap.xml");
    assert.deepEqual(buildRobots(mergeSeo({ indexing: false }), "https://a.kr").rules, { userAgent: "*", disallow: "/" });
    const map = buildSitemap(mergeSeo(null), "https://a.kr", new Date("2026-10-19T00:00:00Z"));
    assert.deepEqual(map.map((e) => e.url), ["https://a.kr/", "https://a.kr/plans", "https://a.kr/login", "https://a.kr/terms", "https://a.kr/privacy", "https://a.kr/refund", "https://a.kr/account-deletion"]);
    assert.ok(!map.some((e) => PRIVATE_PATHS.some((p) => !p.includes("*") && e.url.endsWith(p))));
    assert.deepEqual(buildSitemap(mergeSeo({ indexing: false }), "https://a.kr", new Date()), []);
  });

  it("길이 제한이 SQL(supabase-seo.sql) check 와 같다", () => {
    const sql = read("../../supabase-seo.sql");
    for (const [col, max] of Object.entries(SEO_LIMITS)) {
      assert.match(sql, new RegExp(`${col}\\s+text check \\(${col} is null or length\\(${col}\\) <= ${max}\\)`), col);
      assert.match(sql, new RegExp(`"${col}":${max}`), `${col} (함수)`);
    }
  });

  it("화면이 연결돼 있다 — layout 이 설정을 읽고, robots·sitemap 파일이 있고, 관리실 메뉴가 있다", () => {
    assert.ok(read("../app/layout.tsx").includes("buildSiteMetadata("));
    assert.ok(read("../app/robots.ts").includes("buildRobots("));
    assert.ok(read("../app/sitemap.ts").includes("buildSitemap("));
    assert.ok(read("../app/api/admin/seo/route.ts").includes('revalidatePath("/", "layout")'));
    assert.ok(read("./admin-console.ts").includes('href: "/admin/seo"'));
  });
});
