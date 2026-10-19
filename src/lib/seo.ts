/**
 * 검색 노출(SEO) — 사이트 제목·설명·검색어·공유 그림·대표 주소·구글/네이버 소유 확인·검색 노출 켜기
 * (사장님 2026-10-19 "검색어도 잡히게 seo 태그들을 넣을 수 있는 것들도 있었으면").
 *
 * 값은 관리실 '검색 노출(SEO)'에서 바꾼다(app_seo_settings — supabase-seo.sql). 서버(app/layout · robots · sitemap)가
 * lib/seo-server 로 읽어 <head> 태그를 만든다. 표가 없거나(SQL 전) 칸이 비면 아래 기본값을 쓴다 — SQL 전에도 사이트는 그대로 뜬다.
 * 이 파일은 순수 함수만 — 모양 · 기본값 · 입력 검사 · Metadata/robots/sitemap 만들기(node --test 가 그대로 읽는다).
 */
import type { Metadata, MetadataRoute } from "next";
import { READ_ALOUD_VOICE } from "./plans.ts";

export const SITE_NAME = "우리 가족 보이스 동화";

/** 대표 주소를 아직 안 정했을 때 — 지금 쓰는 배포 주소 */
export const FALLBACK_SITE_URL = "https://dapp-three-pearl.vercel.app";

export type SeoSettings = {
  /** 검색 결과·브라우저 탭의 제목(첫 화면) */
  siteTitle: string;
  /** 검색 결과 제목 아래 설명 */
  description: string;
  /** 검색어(쉼표로 나눔) */
  keywords: string[];
  /** 카카오톡·페이스북 등 링크 공유 그림 — 절대 주소 또는 /로 시작하는 사이트 안 경로 */
  ogImage: string;
  /** 대표 주소(정식 도메인) — 비면 지금 배포 주소 */
  siteUrl: string | null;
  googleVerification: string | null;
  naverVerification: string | null;
  /** 검색 사이트에 보이기 — 끄면 모든 화면에 noindex · robots.txt 도 전부 막는다 */
  indexing: boolean;
};

/** 칸마다 최대 길이 — supabase-seo.sql 의 check 와 같다 */
export const SEO_LIMITS = {
  site_title: 70,
  description: 300,
  keywords: 500,
  og_image: 500,
  site_url: 200,
  google_verification: 200,
  naver_verification: 200,
} as const;

export type SeoColumn = keyof typeof SEO_LIMITS;

export const DEFAULT_SEO: SeoSettings = {
  siteTitle: SITE_NAME, // 사장님 10-19 "우리 가족 보이스 동화 정도로" — 검색어는 설명·검색어 칸이 맡는다
  description: `우리 아이 이름과 가족 캐릭터로 세상에 하나뿐인 그림동화를 만들어요. 세계명작·전래동화를 ${READ_ALOUD_VOICE}로 읽어 주는 가족 동화 서비스예요.`,
  keywords: [
    "AI 동화",
    "맞춤 동화",
    "그림동화",
    "동화책 만들기",
    "아이 동화",
    "유아 동화",
    "잠자리 동화",
    "동화 읽어주기",
    "오디오 동화",
    "세계명작",
    "전래동화",
    "가족 동화",
  ],
  ogImage: "/brand/og.jpg",
  siteUrl: null,
  googleVerification: null,
  naverVerification: null,
  indexing: true,
};

/** 검색 사이트가 들어오지 않게 할 곳 — 관리실·서버 경로·회원 전용 화면·내부 html */
export const PRIVATE_PATHS: readonly string[] = [
  "/admin",
  "/api/",
  "/settings",
  "/create",
  "/family",
  "/checkout",
  "/billing",
  "/feedback",
  "/casting",
  "/art-review",
  "/tts-test",
  "/*.html",
];

/** 검색 사이트에 알려 줄 공개 화면 */
export const PUBLIC_PATHS: readonly { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/plans", priority: 0.8, changeFrequency: "weekly" },
  { path: "/login", priority: 0.5, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/refund", priority: 0.3, changeFrequency: "monthly" },
];

/* ── 입력 다듬기 ───────────────────────────────────────────────────────── */

/** 검색어 — 쉼표·줄바꿈으로 나누고, 앞뒤 공백·빈 것·겹친 것을 뺀다(순서는 그대로) */
export function splitKeywords(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,\n，、]/)) {
    const k = part.trim().replace(/\s+/g, " ");
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * 소유 확인 코드 — 코드만 넣어도, 사이트가 준 <meta …> 한 줄을 통째로 붙여 넣어도 코드만 꺼낸다.
 * 코드는 영문·숫자·-_ 만(구글·네이버 코드 모양). 아니면 null.
 */
export function cleanVerification(raw: string | null | undefined): string | null {
  let s = String(raw ?? "").trim();
  const m = s.match(/content\s*=\s*["']([^"']+)["']/i);
  if (m) s = m[1].trim();
  return /^[A-Za-z0-9_-]{6,200}$/.test(s) ? s : null;
}

/** 대표 주소 — https://도메인 만(뒤 경로·슬래시는 뗀다). 아니면 null */
export function cleanSiteUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** 공유 그림 — https 절대 주소 또는 /로 시작하는 사이트 안 경로. 아니면 null */
export function cleanImageUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\/[^/]/.test(s) && !/\s/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type SeoPatch = Partial<Record<SeoColumn, string | null>> & { indexing?: boolean };

/**
 * 관리실에서 보낸 값 검사 — 모르는 칸·너무 긴 값·모양이 틀린 주소/코드는 거절(무엇이 틀렸는지 한국어로).
 * 빈 칸은 null(= 기본값으로 돌아감). 통과하면 DB 에 그대로 넣을 모양(칸 이름 = 표 칸 이름).
 */
export function parseSeoPatch(input: unknown): { ok: true; patch: SeoPatch } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "바꿀 값이 없어요." };
  const src = input as Record<string, unknown>;
  const patch: SeoPatch = {};
  const LABEL: Record<SeoColumn, string> = {
    site_title: "사이트 제목",
    description: "설명",
    keywords: "검색어",
    og_image: "공유 그림 주소",
    site_url: "대표 주소",
    google_verification: "구글 확인 코드",
    naver_verification: "네이버 확인 코드",
  };
  for (const key of Object.keys(src)) {
    if (key === "indexing") {
      if (typeof src.indexing !== "boolean") return { ok: false, error: "검색 노출 값이 이상해요." };
      patch.indexing = src.indexing;
      continue;
    }
    if (!(key in SEO_LIMITS)) return { ok: false, error: `모르는 항목이에요: ${key}` };
    const col = key as SeoColumn;
    const v = src[col];
    if (v !== null && typeof v !== "string") return { ok: false, error: `${LABEL[col]} 값은 글자여야 해요.` };
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) {
      patch[col] = null;
      continue;
    }
    let clean: string | null = s;
    if (col === "keywords") clean = splitKeywords(s).join(", ") || null;
    else if (col === "site_url") clean = cleanSiteUrl(s);
    else if (col === "og_image") clean = cleanImageUrl(s);
    else if (col === "google_verification" || col === "naver_verification") clean = cleanVerification(s);
    else clean = s.replace(/\s+/g, " ");
    if (clean === null) return { ok: false, error: `${LABEL[col]} 모양이 맞지 않아요.` };
    if (clean.length > SEO_LIMITS[col]) return { ok: false, error: `${LABEL[col]}은(는) ${SEO_LIMITS[col]}자까지 적을 수 있어요.` };
    patch[col] = clean;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "바꿀 값이 없어요." };
  return { ok: true, patch };
}

/* ── DB 줄 → 설정 ──────────────────────────────────────────────────────── */

export const SEO_SELECT =
  "site_title,description,keywords,og_image,site_url,google_verification,naver_verification,indexing,updated_at";

export type SeoRow = Partial<Record<SeoColumn, string | null>> & { indexing?: boolean | null; updated_at?: string | null };

/** DB 줄(없으면 null)을 설정으로 — 빈 칸은 기본값 */
export function mergeSeo(row: SeoRow | null | undefined): SeoSettings {
  const r = row ?? {};
  const keywords = splitKeywords(r.keywords);
  return {
    siteTitle: r.site_title?.trim() || DEFAULT_SEO.siteTitle,
    description: r.description?.trim() || DEFAULT_SEO.description,
    keywords: keywords.length ? keywords : DEFAULT_SEO.keywords,
    ogImage: cleanImageUrl(r.og_image) ?? DEFAULT_SEO.ogImage,
    siteUrl: cleanSiteUrl(r.site_url),
    googleVerification: cleanVerification(r.google_verification),
    naverVerification: cleanVerification(r.naver_verification),
    indexing: r.indexing !== false,
  };
}

/** 관리실 입력 칸에 넣을 값(빈 칸은 빈 글자 — 화면이 기본값을 회색 안내로 보여 준다) */
export function seoFormValues(row: SeoRow | null | undefined): Record<SeoColumn, string> & { indexing: boolean } {
  const r = row ?? {};
  return {
    site_title: r.site_title ?? "",
    description: r.description ?? "",
    keywords: r.keywords ?? "",
    og_image: r.og_image ?? "",
    site_url: r.site_url ?? "",
    google_verification: r.google_verification ?? "",
    naver_verification: r.naver_verification ?? "",
    indexing: r.indexing !== false,
  };
}

/** 대표 주소 — 관리실 값 → 환경변수(NEXT_PUBLIC_SITE_URL) → 지금 배포 주소 */
export function siteOrigin(s: Pick<SeoSettings, "siteUrl">, envUrl?: string | null): string {
  return s.siteUrl ?? cleanSiteUrl(envUrl) ?? FALLBACK_SITE_URL;
}

/* ── <head> · robots · sitemap ────────────────────────────────────────── */

/** 사이트 전체 <head> 태그(app/layout 의 generateMetadata). 화면마다 제목은 '제목 · 우리 가족 보이스 동화' 꼴로 붙는다. */
export function buildSiteMetadata(s: SeoSettings, origin: string): Metadata {
  const verificationOther: Record<string, string> = {};
  if (s.naverVerification) verificationOther["naver-site-verification"] = s.naverVerification;
  const image = { url: s.ogImage, width: 1200, height: 630, alt: SITE_NAME };
  return {
    metadataBase: new URL(origin),
    title: { default: s.siteTitle, template: `%s · ${SITE_NAME}` },
    description: s.description,
    keywords: s.keywords,
    applicationName: SITE_NAME,
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE_NAME,
      title: s.siteTitle,
      description: s.description,
      url: "/",
      images: [image],
    },
    twitter: { card: "summary_large_image", title: s.siteTitle, description: s.description, images: [s.ogImage] },
    robots: s.indexing ? { index: true, follow: true } : { index: false, follow: false },
    ...(s.googleVerification || s.naverVerification
      ? {
          verification: {
            ...(s.googleVerification ? { google: s.googleVerification } : {}),
            ...(s.naverVerification ? { other: verificationOther } : {}),
          },
        }
      : {}),
  };
}

export function buildRobots(s: SeoSettings, origin: string): MetadataRoute.Robots {
  if (!s.indexing) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

export function buildSitemap(s: SeoSettings, origin: string, now: Date): MetadataRoute.Sitemap {
  if (!s.indexing) return [];
  return PUBLIC_PATHS.map((p) => ({
    url: `${origin}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
