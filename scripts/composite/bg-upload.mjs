/**
 * 배경 라이브러리를 cafe24 `bg/` 에 올리고 앱이 쓸 목록(src/data/backgrounds.json)을 만든다.
 *
 *   node --env-file=.env.local scripts/composite/bg-upload.mjs [--dry]
 *
 * - 이름은 목록의 slug 그대로: bg/<slug>.webp (1448x1086 원본 크기, webp q82).
 * - `bg/` 에는 2026-09-27 에 올라간 22장(장소 갈래 이름: kitchen·home-living·tourbus …)이 먼저 있었다.
 *   **그 22장은 절대 건드리지 않는다.** 이름이 겹치는 kitchen·playground 는 같은 그림이라 그 파일을 그대로 쓴다.
 *   tourbus(지붕 없는 2층 버스 위층)는 우리 목록에 없던 그림이라 목록에 덧붙인다.
 * - 이어 올리기: 이미 올라간 우리 파일은 주소로 받아 MD5 가 같으면 건너뛴다.
 * - cafe24 FTP 는 가끔 데이터 연결이 끊긴다(ETIMEDOUT) → 다시 연결해 그 파일부터 이어 간다.
 * - 올린 주소를 실제로 받아 MD5 를 대조한다. 하나라도 어긋나면 목록을 쓰지 않는다.
 * - 주소에는 내용에서 딴 판번호 ?v=<MD5 앞 8자리> 를 붙인다. cafe24 는 주소 통째로가 캐시 열쇠라,
 *   반쯤 올라간 파일을 한 번 받아 버리면 그 주소는 한동안 반쪽이 나온다(2026-09-28 tree-lined-road 에서 실제로 겪음).
 *   그림이 바뀌면 MD5 가 바뀌어 주소도 바뀌니 옛 캐시에 걸리지 않는다.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { Client } from "basic-ftp";
import { Readable } from "node:stream";

const DRY = process.argv.includes("--dry");
const ROOT = "C:/Users/Yogibo Design/Desktop/bg";
const PUB = (process.env.CAFE24_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
const BASE = (process.env.CAFE24_UPLOAD_DIR ?? "").replace(/^\/+|\/+$/g, "");
const DIR = "bg";
const url = (slug) => `${PUB}/${BASE}/${DIR}/${slug}.webp`;
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// 2026-09-27 에 먼저 올라가 있던 22장 — 손대지 않는다.
const PREEXISTING = new Set(["car", "corridor", "entrance", "forest", "home-living", "home-room", "hospital", "kitchen",
  "library", "playground", "pool", "restaurant", "school", "sea", "shop", "street", "tourbus", "transit", "veranda",
  "water", "yard", "zoo"]);

const rows = JSON.parse(fs.readFileSync("scratch-art/배경목록.json", "utf8"));
const slugs = rows.map((r) => r.slug);
const dup = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dup.length) throw new Error(`slug 중복: ${dup.join(", ")}`);

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

const manifest = [];
let uploaded = 0, skipped = 0, reused = 0;
for (const r of rows) {
  const name = `${r.slug}.webp`;
  const entry = { n: r.n, slug: r.slug, ko: r.ko, cat: r.cat, url: url(r.slug) };
  if (PREEXISTING.has(r.slug)) {
    reused++;
    manifest.push({ ...entry, note: "2026-09-27 에 먼저 올라가 있던 같은 그림을 그대로 씀" });
    continue;
  }
  const buf = await sharp(fs.readFileSync(`${ROOT}/${r.folder}/${r.file}`)).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(buf).metadata();
  const h = md5(buf);
  const rec = { ...entry, url: `${entry.url}?v=${h.slice(0, 8)}`, w: meta.width, h: meta.height, md5: h };
  if (DRY) { manifest.push(rec); continue; }

  // 진짜 주소(rec.url)로 확인하면 없을 때 그 주소에 '없음'이 캐시된다 → 버리는 주소로 본다.
  const already = await fetchBuf(`${entry.url}?pre=${Date.now()}`);
  if (already && md5(already) === rec.md5) { skipped++; manifest.push(rec); continue; }

  await upload(name, buf);
  let got = await fetchBuf(rec.url, true);
  for (let i = 0; i < 4 && got && md5(got) !== rec.md5; i++) { await sleep(3000); got = await fetchBuf(rec.url, true); }
  if (!got || md5(got) !== rec.md5) throw new Error(`대조 실패 — 목록 안 씀: ${rec.url}`);
  manifest.push(rec);
  uploaded++;
  if (uploaded % 10 === 0) console.log(`  … 새로 ${uploaded}장 올림·대조 OK`);
}
try { client?.close(); } catch {}

manifest.push({ n: rows.length + 1, slug: "tourbus", ko: "2층 투어버스 위층", cat: "탈것", url: url("tourbus"),
  note: "2026-09-27 에 먼저 올라가 있던 그림. 지붕 없는 2층 버스 위층(파란 좌석)" });

if (DRY) {
  console.log(`(미리보기) 올릴 대상 ${rows.length - reused} · 기존 파일 재사용 ${reused} · 목록 ${manifest.length}곳`);
} else {
  fs.writeFileSync("src/data/backgrounds.json", JSON.stringify(manifest, null, 1) + "\n");
  console.log(`\n끝 — 새로 올림 ${uploaded} · 이미 올라가 있어 대조만 ${skipped} · 기존 재사용 ${reused} · 목록 ${manifest.length}곳 → src/data/backgrounds.json`);
}
