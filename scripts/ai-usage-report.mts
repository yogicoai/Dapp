/**
 * AI 호출 기록(ai_usage)을 기간으로 끌어와 모델·용도·곳·날짜·회원별로 합친다. 읽기만 한다.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/ai-usage-report.mts --month 2026-10
 *   node --experimental-strip-types --env-file=.env.local scripts/ai-usage-report.mts --from 2026-10-01 --to 2026-10-13
 *   … --csv 파일.csv   (줄마다 내려받기)   … --rate 1400   (원화로 바꿀 환율, 안 적으면 1,400)
 *
 * 날짜는 한국 시각이고 --to 날도 들어간다. 금액은 기록할 때 구글 공식 가격표로 계산한 달러다(lib/ai-usage) —
 * 구글 청구서의 원화는 구글이 정한 환율이라 조금 다를 수 있다. 가격표에 없던 모델은 '단가 모름'으로 따로 센다.
 * 서비스 키(.env.local 의 SUPABASE_SERVICE_ROLE_KEY)로 읽는다.
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Row = {
  id: number;
  at: string;
  owner: string | null;
  env: string;
  route: string;
  kind: string;
  provider: string;
  model: string;
  asked: string;
  outcome: string;
  tokens_in: number;
  tokens_out: number;
  tokens_image_out: number;
  images: number;
  usd: number | string | null;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const KST = 9 * 3600 * 1000;
/** 한국 날짜(YYYY-MM-DD)의 0시를 UTC 시각으로 */
function kstDay(day: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`날짜는 2026-10-01 꼴로 적어 주세요: ${day}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - KST);
}
const dayOf = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);

/** 읽을 기간 — from 부터 until 앞까지 */
function period(): { from: Date; until: Date } {
  const month = arg("month");
  if (month) {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw new Error("--month 는 2026-10 꼴로 적어 주세요");
    return {
      from: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) - KST),
      until: new Date(Date.UTC(Number(m[1]), Number(m[2]), 1) - KST),
    };
  }
  const f = arg("from");
  if (!f) throw new Error("--month 2026-10 또는 --from 2026-10-01 [--to 2026-10-13] 이 필요합니다");
  return { from: kstDay(f), until: new Date(kstDay(arg("to") ?? dayOf(new Date().toISOString())).getTime() + 86_400_000) };
}

/** 한 번에 1,000줄씩 끝까지 읽는다(원문 raw 는 빼고) */
async function readRows(db: SupabaseClient, from: Date, until: Date): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("ai_usage")
      .select("id,at,owner,env,route,kind,provider,model,asked,outcome,tokens_in,tokens_out,tokens_image_out,images,usd")
      .gte("at", from.toISOString())
      .lt("at", until.toISOString())
      .order("id", { ascending: true })
      .range(start, start + 999);
    if (error) {
      throw new Error(
        /ai_usage/.test(error.message) && /(does not exist|schema cache|find the table)/i.test(error.message)
          ? "ai_usage 표가 아직 없어요 — Supabase SQL Editor 에서 supabase-ai-usage.sql 을 먼저 돌려 주세요."
          : `읽지 못했어요: ${error.message}`,
      );
    }
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return rows;
  }
}

type Sum = { calls: number; images: number; tin: number; tout: number; timg: number; usd: number; unknown: number };
const zero = (): Sum => ({ calls: 0, images: 0, tin: 0, tout: 0, timg: 0, usd: 0, unknown: 0 });
function add(s: Sum, r: Row): void {
  s.calls++;
  s.images += r.images;
  s.tin += r.tokens_in;
  s.tout += r.tokens_out;
  s.timg += r.tokens_image_out;
  if (r.usd === null) s.unknown++;
  else s.usd += Number(r.usd);
}
function group(rows: Row[], keyOf: (r: Row) => string): [string, Sum][] {
  const m = new Map<string, Sum>();
  for (const r of rows) {
    const k = keyOf(r);
    let s = m.get(k);
    if (!s) m.set(k, (s = zero()));
    add(s, r);
  }
  return [...m.entries()];
}

async function main(): Promise<void> {
  const { from, until } = period();
  const rate = Number(arg("rate") ?? 1400);
  const won = (usd: number) => `${Math.round(usd * rate).toLocaleString("ko-KR")}원`;
  const usdText = (usd: number) => `$${usd.toFixed(4)}`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(".env.local 에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const rows = await readRows(db, from, until);

  // 회원 이름(있으면)
  const names = new Map<string, string>();
  // 관리자 계정(yogico 회사 마스터 · fe 개발 시험 계정) — 사장님 2026-10-19 "fe 에서 생기는 그림 비용은 관리자 단에서 안 보이게".
  // 고객 몫과 개발·관리 몫을 나눠 보여 준다(스크립트로 그린 것도 개발 몫).
  const masters = new Set<string>();
  const owners = [...new Set(rows.map((r) => r.owner).filter((o): o is string => Boolean(o)))];
  if (owners.length) {
    const { data } = await db.from("profiles").select("id,username,is_master").in("id", owners);
    for (const p of (data ?? []) as { id: string; username: string | null; is_master: boolean | null }[]) {
      names.set(p.id, p.username ?? "");
      if (p.is_master) masters.add(p.id);
    }
  }
  const memberOf = (r: Row) => (r.owner ? names.get(r.owner) || r.owner.slice(0, 8) : "(스크립트)");

  const table = (title: string, entries: [string, Sum][], byName = false): void => {
    console.log(`\n■ ${title}`);
    const sorted = byName ? entries.sort((a, b) => a[0].localeCompare(b[0])) : entries.sort((a, b) => b[1].usd - a[1].usd);
    for (const [k, s] of sorted) {
      console.log(
        `  ${k.padEnd(34)} ${String(s.calls).padStart(5)}번  그림 ${String(s.images).padStart(4)}장  ${usdText(s.usd).padStart(10)}  ${won(s.usd).padStart(10)}` +
          (s.unknown ? `  (단가 모름 ${s.unknown}번)` : ""),
      );
    }
  };

  const total = zero();
  for (const r of rows) add(total, r);
  const lastDay = dayOf(new Date(until.getTime() - 1).toISOString());
  console.log(`AI 호출 기록  ${dayOf(from.toISOString())} ~ ${lastDay} (한국 시각)   환율 1달러 = ${rate.toLocaleString("ko-KR")}원`);
  console.log(
    `합계: ${total.calls}번 · 그림 ${total.images}장 · ${usdText(total.usd)} · 약 ${won(total.usd)}` +
      (total.unknown ? ` · 단가 모름 ${total.unknown}번(금액에 안 들어감)` : ""),
  );
  console.log(
    `토큰: 입력 ${total.tin.toLocaleString("ko-KR")} · 글 출력 ${total.tout.toLocaleString("ko-KR")} · 그림 출력 ${total.timg.toLocaleString("ko-KR")}`,
  );

  if (rows.length) {
    const isDev = (r: Row) => !r.owner || masters.has(r.owner);
    const cust = zero();
    const dev = zero();
    for (const r of rows) add(isDev(r) ? dev : cust, r);
    console.log(`  └ 고객 몫: ${cust.calls}번 · 그림 ${cust.images}장 · ${usdText(cust.usd)} · 약 ${won(cust.usd)}`);
    console.log(`  └ 개발·관리 몫(fe·yogico·스크립트): ${dev.calls}번 · 그림 ${dev.images}장 · ${usdText(dev.usd)} · 약 ${won(dev.usd)}`);
    table("모델별", group(rows, (r) => `${r.provider} ${r.model}`));
    table("용도별 (image 그림 · check 검수 · head-check 머리 비율 · photo-card 사진 특징표)", group(rows, (r) => r.kind));
    table("부른 곳별 (vercel 운영 · local 개발 PC · script 스크립트)", group(rows, (r) => `${r.env} · ${r.route}`));
    table("결과별 (no-image·blocked 는 그림 없이 값만 나간 호출)", group(rows, (r) => r.outcome));
    table("회원별", group(rows, memberOf));
    table("날짜별", group(rows, (r) => dayOf(r.at)), true);
  }

  const csv = arg("csv");
  if (csv) {
    const head = ["id", "at_kst", "member", "env", "route", "kind", "provider", "model", "asked", "outcome", "tokens_in", "tokens_out", "tokens_image_out", "images", "usd"];
    const lines = rows.map((r) =>
      [
        r.id,
        new Date(Date.parse(r.at) + KST).toISOString().replace("T", " ").slice(0, 19),
        r.owner ? names.get(r.owner) || r.owner : "",
        r.env,
        r.route,
        r.kind,
        r.provider,
        r.model,
        r.asked,
        r.outcome,
        r.tokens_in,
        r.tokens_out,
        r.tokens_image_out,
        r.images,
        r.usd ?? "",
      ].join(","),
    );
    // 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다
    fs.writeFileSync(csv, "﻿" + [head.join(","), ...lines].join("\n"), "utf8");
    console.log(`\n줄마다 내려받음: ${csv} (${rows.length}줄)`);
  }
}

try {
  await main();
} catch (e) {
  // 긴 오류 더미 대신 한 줄로 — 사장님께 그대로 전할 수 있게
  console.error((e as Error).message);
  process.exitCode = 1;
}
