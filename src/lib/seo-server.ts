/**
 * 검색 노출(SEO) 설정을 **서버에서** 읽는다 — app/layout(generateMetadata) · app/robots · app/sitemap 이 쓴다.
 * 공개 값이라 비회원 열쇠(anon)로 부른다(supabase-seo.sql 이 공개 칸만 읽게 열어 둔다). 서비스 키는 쓰지 않는다.
 * 표가 아직 없거나(SQL 전) DB 가 느리면 기본값(lib/seo DEFAULT_SEO)으로 — 사이트가 DB 때문에 멈추지 않게.
 * 한 번 그릴 때 여러 곳이 불러도 한 번만 읽는다(React cache).
 */
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { mergeSeo, SEO_SELECT, siteOrigin, type SeoRow, type SeoSettings } from "./seo.ts";

const READ_TIMEOUT_MS = 3000;

export type SeoRead = { settings: SeoSettings; origin: string; source: "db" | "fallback" };

async function readOnce(): Promise<SeoRead> {
  const env = process.env.NEXT_PUBLIC_SITE_URL ?? null;
  const fallback = (): SeoRead => {
    const settings = mergeSeo(null);
    return { settings, origin: siteOrigin(settings, env), source: "fallback" };
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return fallback();
  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
  try {
    const { data, error } = await db.from("app_seo_settings").select(SEO_SELECT).eq("id", 1).abortSignal(ctrl.signal).maybeSingle();
    if (error || !data) return fallback();
    const settings = mergeSeo(data as SeoRow);
    return { settings, origin: siteOrigin(settings, env), source: "db" };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

export const readSeo = cache(readOnce);
