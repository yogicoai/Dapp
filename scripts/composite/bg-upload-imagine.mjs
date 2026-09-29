/**
 * 상상 동화 배경을 cafe24 `bg/` 에 올리고 앱 배경 목록(src/data/backgrounds.json)에 세계별로 덧붙인다.
 *
 *   node --env-file=.env.local scripts/composite/bg-upload-imagine.mjs [--dry]
 *
 * - 목록: scratch-art/상상배경목록.json — [{no, file, world, chip, ko, slug, hold?}] (분류 검사 뒤 만든 것).
 *   hold: true 인 그림(생물·글자가 들어간 것 등)은 올리지 않는다.
 * - 원본: 바탕화면 bg/<dir>/<file> (1448x1086). dir 이 없으면 1차 폴더 상상나라, 3차(2026-09-29)는 dir "3차배경".
 *   webp q82 로 바꿔 bg/<slug>.webp 에 올린다.
 * - 일상 배경과 같은 bg/ 폴더, 이름 앞머리 im-<세계>- 로 구분한다. 일상 배경 파일은 건드리지 않는다.
 * - 주소 끝 ?v=<MD5 앞 8자리> 는 bg-upload.mjs 와 같은 이유(cafe24 는 주소 통째로 캐시, 반쪽 파일이 한동안 남음).
 * - backgrounds.json 에서 im- 로 시작하는 줄만 이번 결과로 바꾸고, 일상 배경 줄은 그대로 둔다.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { Client } from "basic-ftp";
import { Readable } from "node:stream";

const DRY = process.argv.includes("--dry");
const ROOT = "C:/Users/Yogibo Design/Desktop/bg";
const LIST = "scratch-art/상상배경목록.json";
const MANIFEST = "src/data/backgrounds.json";
const PUB = (process.env.CAFE24_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
const BASE = (process.env.CAFE24_UPLOAD_DIR ?? "").replace(/^\/+|\/+$/g, "");
const DIR = "bg";
const url = (slug) => `${PUB}/${BASE}/${DIR}/${slug}.webp`;
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

const rows = JSON.parse(fs.readFileSync(LIST, "utf8"));
const live = rows.filter((r) => !r.hold);
const slugs = live.map((r) => r.slug);
const dup = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dup.length) throw new Error(`slug 중복: ${dup.join(", ")}`);
const bad = slugs.filter((s) => !/^im-[a-z]+-[a-z0-9-]+$/.test(s));
if (bad.length) throw new Error(`im- 앞머리가 아닌 slug: ${bad.join(", ")}`);

const old = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const everyday = old.filter((e) => !String(e.slug).startsWith("im-"));
const clash = slugs.filter((s) => everyday.some((e) => e.slug === s));
if (clash.length) throw new Error(`일상 배경과 이름이 겹침: ${clash.join(", ")}`);

// patient=true 면 404 도 몇 번 기다렸다 다시 본다 — cafe24 는 '없음'도 잠깐 캐시한다.
async function fetchBuf(u, patient = false) {
  for (let i = 0; i < (patient ? 8 : 4); i++) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 404 && !patient) return null;
    } catch {}
    await sleep(patient ? 3000 : 1500);
  }
  return null;
}

let client = null;
async function connect() {
  try { client?.close(); } catch {}
  client = new Client(30_000);
  await client.access({
    host: process.env.CAFE24_FTP_HOST, port: Number(process.env.CAFE24_FTP_PORT ?? 21),
    user: process.env.CAFE24_FTP_USER, password: process.env.CAFE24_FTP_PASS,
    secure: process.env.CAFE24_FTP_SECURE === "true",
  });
  await client.cd(`${BASE}/${DIR}`);
}
async function upload(name, buf) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (!client) await connect();
      await client.uploadFrom(Readable.from(buf), name);
      return;
    } catch (e) {
      console.log(`    연결 끊김(${e.code ?? e.message}) — 다시 연결해 ${name} 재시도 ${attempt}/5`);
      client = null;
      await sleep(2000 * attempt);
    }
  }
  throw new Error(`올리기 실패: ${name}`);
}

const out = [];
let uploaded = 0, skipped = 0;
let n = Math.max(0, ...everyday.map((e) => Number(e.n) || 0));
for (const r of live) {
  const buf = await sharp(fs.readFileSync(`${ROOT}/${r.dir ?? "상상나라"}/${r.file}`)).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(buf).metadata();
  const h = md5(buf);
  const rec = {
    n: ++n, slug: r.slug, ko: r.ko, cat: "상상", world: r.world, chip: r.chip, place_no: r.no,
    url: `${url(r.slug)}?v=${h.slice(0, 8)}`, w: meta.width, h: meta.height, md5: h,
  };
  if (DRY) { out.push(rec); continue; }

  // 진짜 주소로 확인하면 없을 때 그 주소에 '없음'이 캐시된다 → 버리는 주소로 본다.
  const already = await fetchBuf(`${url(r.slug)}?pre=${Date.now()}`);
  if (already && md5(already) === h) { skipped++; out.push(rec); continue; }

  await upload(`${r.slug}.webp`, buf);
  let got = await fetchBuf(rec.url, true);
  for (let i = 0; i < 4 && got && md5(got) !== h; i++) { await sleep(3000); got = await fetchBuf(rec.url, true); }
  if (!got || md5(got) !== h) throw new Error(`대조 실패 — 목록 안 씀: ${rec.url}`);
  out.push(rec);
  uploaded++;
  if (uploaded % 10 === 0) console.log(`  … 새로 ${uploaded}장 올림·대조 OK`);
}
try { client?.close(); } catch {}

const byWorld = {};
for (const e of out) byWorld[e.world] = (byWorld[e.world] ?? 0) + 1;
if (DRY) {
  console.log(`(미리보기) 올릴 ${live.length}장 · 보류 ${rows.length - live.length}장`);
  console.log(byWorld);
} else {
  fs.writeFileSync(MANIFEST, JSON.stringify([...everyday, ...out], null, 1) + "\n");
  console.log(`\n끝 — 새로 올림 ${uploaded} · 이미 있어 대조만 ${skipped} · 보류 ${rows.length - live.length} → ${MANIFEST} (일상 ${everyday.length} + 상상 ${out.length})`);
  console.log(byWorld);
}
