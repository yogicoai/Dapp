/**
 * 예전 그림 기록 채우기(family_portrait_pics) — 기록이 생기기 전에 그린 가족 그림을 cafe24 폴더에서 읽어 넣는다(2026-10-14).
 *
 * 왜: 배포 서버(Vercel)가 cafe24 폴더 목록 읽기에 실패해(502) '예전 그림으로 돌아가기'가 안 떴다. 같은 서버에서 그림 올리기는
 * 되고 이 PC 에서는 목록이 읽히는데, 서버 기록을 볼 수 없어 원인을 못 가렸다. 그래서 목록은 DB 기록(family_pictures)을 먼저
 * 읽게 바꿨다(api/family/portrait/history). 새로 그린 그림은 서버가 적는다('받았음' · 마스터는 record_master_family_picture).
 * 그 전에 그린 그림은 이 스크립트가 한 번 채운다 — 이 PC 에서 폴더를 읽어 넣는다.
 *
 * 무엇을 넣나: family/<회원 id>/<사람 id>-<ms>-<32자>.png 와 -ref.jpg 가 둘 다 있는 그림. at 은 파일 이름의 그린 때.
 *   탈퇴해 회원이 없는 폴더는 건너뛴다(표가 auth.users 를 가리킨다). 옷 갈아입기 그림(.webp)은 아니다.
 *   이미 있는 줄은 그대로 둔다(몇 번을 돌려도 같다).
 *
 * 쓰는 법(먼저 supabase-2026-10-14.sql 을 돌려 표가 있어야 한다):
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-family-pictures.mts          (세기만)
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-family-pictures.mts --apply  (넣기)
 * 서비스 키를 쓴다(스크립트만 — 서버 코드는 안 쓴다). 그림 파일은 읽기만 한다.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("basic-ftp") as typeof import("basic-ftp");
const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");
const clean = (v: string | undefined) => (v ?? "").replace(/[\r\n]/g, "").trim();
const need = (name: string) => {
  const v = clean(process.env[name]);
  if (!v) throw new Error(`${name} 가 .env.local 에 없습니다`);
  return v;
};

/** lib/family-history 와 같은 파일 이름 규칙 */
const FILE = /^([a-z0-9-]{1,40})-(\d{10,16})-([a-f0-9]{32})(\.png|-ref\.jpg)$/;
const UID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

type Row = { owner: string; member_id: string; name: string; at: string };

/** 한 폴더의 파일 이름들 → 넣을 줄(두 장이 다 있는 그림만) */
function rowsOf(owner: string, names: readonly string[]): Row[] {
  const set = new Set(names);
  const rows: Row[] = [];
  for (const name of names) {
    const m = FILE.exec(name);
    if (!m || m[4] !== ".png") continue;
    if (!set.has(`${m[1]}-${m[2]}-${m[3]}-ref.jpg`)) continue;
    const ms = Number(m[2]);
    if (!Number.isFinite(ms)) continue;
    rows.push({ owner, member_id: m[1], name, at: new Date(ms).toISOString() });
  }
  return rows;
}

const ftp = new Client(20_000);
const folders: { uid: string; names: string[] }[] = [];
try {
  await ftp.access({
    host: need("CAFE24_FTP_HOST"),
    port: Number(process.env.CAFE24_FTP_PORT ?? 21),
    user: need("CAFE24_FTP_USER"),
    password: need("CAFE24_FTP_PASS"),
    secure: clean(process.env.CAFE24_FTP_SECURE) === "true",
  });
  const home = (await ftp.pwd()).replace(/\/+$/, "");
  const base = clean(process.env.CAFE24_UPLOAD_DIR).replace(/^\/+|\/+$/g, "");
  const root = `${home}/${[base, "family"].filter(Boolean).join("/")}`;
  for (const dir of await ftp.list(root)) {
    if (!dir.isDirectory || !UID.test(dir.name)) continue;
    const files = await ftp.list(`${root}/${dir.name}`);
    folders.push({ uid: dir.name, names: files.filter((f) => !f.isDirectory).map((f) => f.name) });
  }
} finally {
  ftp.close();
}

const db = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
// 지금 있는 회원만 — 탈퇴한 회원의 폴더는 건너뛴다
const uids = folders.map((f) => f.uid);
const alive = new Set<string>();
for (let i = 0; i < uids.length; i += 100) {
  const { data, error } = await db.from("profiles").select("id").in("id", uids.slice(i, i + 100));
  if (error) throw new Error(`회원 확인 실패: ${error.message}`);
  for (const r of (data ?? []) as { id: string }[]) alive.add(r.id);
}

let total = 0;
let skipped = 0;
const rows: Row[] = [];
for (const f of folders) {
  const r = rowsOf(f.uid, f.names);
  if (!alive.has(f.uid)) {
    skipped += r.length;
    continue;
  }
  rows.push(...r);
  total += r.length;
}
const people = new Set(rows.map((r) => `${r.owner}/${r.member_id}`)).size;
console.log(`폴더 ${folders.length}개 · 회원 ${alive.size}명 · 그림 ${total}장(가족 ${people}명) · 탈퇴 회원 폴더라 건너뛸 그림 ${skipped}장`);

if (!APPLY) {
  console.log("세기만 했습니다 — 넣으려면 --apply");
} else {
  let put = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db.from("family_portrait_pics").upsert(chunk, { onConflict: "owner,name", ignoreDuplicates: true });
    if (error) throw new Error(`넣기 실패(${i}번째부터): ${error.message}`);
    put += chunk.length;
  }
  const { count } = await db.from("family_portrait_pics").select("*", { count: "exact", head: true });
  console.log(`넣음 ${put}장(이미 있던 줄은 그대로) · 지금 기록 ${count ?? "?"}줄`);
}
