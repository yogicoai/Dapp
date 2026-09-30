/**
 * 사이트 정보·약관을 **서버에서** 읽는다 — /terms · /privacy · /refund 화면과 공개 경로 /api/site-info 가 쓴다.
 * 서버 전용이다: 브라우저 화면(클라이언트 부품)에서 가져오지 않는다(브라우저는 site-info-client 의 훅을 쓴다).
 *
 * 공개 값만 읽으므로 비회원 열쇠(anon)로 부른다 — 표의 읽기 권한이 공개 칸만 열어 둔다(RLS).
 * 서비스 키는 쓰지 않는다. 표가 아직 없거나(사장님이 SQL 을 안 돌렸을 때) DB 가 느리면 기본값으로 그린다 —
 * 사이트는 SQL 전에도, DB 가 잠깐 멈춰도 지금과 똑같이 뜬다.
 */
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import {
  isLegalKind,
  kstToday,
  legalVersionFromRow,
  pickLegalDocs,
  type LegalKind,
  type LegalVersion,
} from "./legal-doc.ts";
import {
  BUSINESS_PUBLIC_SELECT,
  docsReadiness,
  FALLBACK_SITE_INFO,
  mergeBusinessInfo,
  type SiteInfo,
} from "./site-info.ts";

/** DB 가 이만큼 안에 답하지 않으면 기본값으로 그린다 — 약관 화면·맨 아래 줄이 DB 때문에 멈추지 않게. */
const READ_TIMEOUT_MS = 4000;

function publicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 지금 한국 날짜 — 시행일 비교 기준. */
export function todayKst(): string {
  return kstToday(Date.now());
}

/**
 * 사업자 정보 + 문서마다 시행 중인 판이 있나. 한쪽만 읽히면 읽힌 쪽만 DB 값을 쓴다(source 는 fallback).
 * 요청마다 새로 부른다 — 화면 캐시(revalidate)와 공개 경로의 캐시 머리글이 부르는 횟수를 줄인다.
 */
export async function readSiteInfo(): Promise<SiteInfo> {
  const db = publicDb();
  if (!db) return FALLBACK_SITE_INFO;
  try {
    const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
    const [biz, docs] = await Promise.all([
      db.from("app_business_info").select(BUSINESS_PUBLIC_SELECT).eq("id", 1).abortSignal(signal).maybeSingle(),
      db
        .from("app_legal_docs")
        .select("kind,version,effective_date")
        .order("effective_date", { ascending: false })
        .limit(300)
        .abortSignal(signal),
    ]);
    if (biz.error && docs.error) return FALLBACK_SITE_INFO;
    return {
      business: biz.error ? FALLBACK_SITE_INFO.business : mergeBusinessInfo(biz.data),
      docs: docs.error ? FALLBACK_SITE_INFO.docs : docsReadiness((docs.data as unknown[] | null) ?? [], todayKst()),
      source: biz.error || docs.error ? "fallback" : "db",
    };
  } catch {
    return FALLBACK_SITE_INFO;
  }
}

/** 한 요청 안에서 여러 번 불러도(화면 제목·본문·맨 아래 줄) DB 는 한 번만 — React cache. */
export const getSiteInfo = cache(readSiteInfo);

/**
 * 문서 하나의 지금 판과 다음 판(본문 포함). 판 목록은 본문 없이 읽고, 고른 두 판만 본문을 읽는다
 * (한 판이 6만 자까지라 판을 통째로 여럿 읽지 않는다). 못 읽으면 둘 다 null — 화면은 '준비 중'.
 */
async function readLegalPair(kind: LegalKind): Promise<{ current: LegalVersion | null; upcoming: LegalVersion | null }> {
  const none = { current: null, upcoming: null };
  if (!isLegalKind(kind)) return none;
  const db = publicDb();
  if (!db) return none;
  try {
    const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
    const list = await db
      .from("app_legal_docs")
      .select("id,version,effective_date")
      .eq("kind", kind)
      .order("effective_date", { ascending: false })
      .order("version", { ascending: false })
      .limit(50)
      .abortSignal(signal);
    if (list.error || !list.data) return none;
    const metas = (list.data as { id: number; version: number; effective_date: string }[]).map((r) => ({
      id: Number(r.id),
      version: Number(r.version) || 0,
      effectiveDate: String(r.effective_date ?? "").slice(0, 10),
    }));
    const pick = pickLegalDocs(metas, todayKst());
    const ids = [pick.current?.id, pick.upcoming?.id].filter((v): v is number => typeof v === "number");
    if (ids.length === 0) return none;
    const full = await db
      .from("app_legal_docs")
      .select("id,kind,version,title,body,effective_date,published_at")
      .in("id", ids)
      .abortSignal(signal);
    if (full.error || !full.data) return none;
    const byId = new Map<number, LegalVersion>();
    for (const row of full.data as unknown[]) {
      const v = legalVersionFromRow(row);
      if (v && v.kind === kind) byId.set(v.id, v);
    }
    return {
      current: pick.current ? (byId.get(pick.current.id) ?? null) : null,
      upcoming: pick.upcoming ? (byId.get(pick.upcoming.id) ?? null) : null,
    };
  } catch {
    return none;
  }
}

export const getLegalPair = cache(readLegalPair);
