/**
 * 합성한 쪽 그림을 cafe24 에 올리고, fe 계정 책이 새 그림을 가리키게 바꾼다.
 *
 *   node --experimental-strip-types --import ./.ts-loader.mjs --env-file=.env.local \
 *        scripts/composite/fe-apply.mts [--dry]
 *
 * - 새 파일 이름(p1-c0928.webp …)으로 올린다 → 옛 그림은 cafe24 에 그대로 남아 되돌릴 수 있다.
 *   이름이 새로우니 cafe24 캐시(주소 통째로가 열쇠)에도 걸리지 않는다.
 * - 올린 뒤 그 주소를 실제로 받아 MD5 를 대조한다. 하나라도 어긋나면 DB 는 건드리지 않는다.
 * - DB 는 data.pages[i].image 와 data.coverImage 만 바꾼다. 나머지는 손대지 않는다.
 * - 원본 행 전체는 scratch-art/fe-백업/<id>.json 에 이미 있다.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { uploadToCafe24 } from "../../src/lib/cafe24.ts";

const DRY = process.argv.includes("--dry");
const argOf = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TAG = argOf("tag", "c0928");
const SP = argOf("src", "C:/Users/YOGIBO~1/AppData/Local/Temp/claude/c--Users-Yogibo-Design-Desktop-Dong/f0d0f72c-8637-4ba5-993a-4f2d651a2bb7/scratchpad/fe/pages");
// 원본이 png 여도 앱과 같은 webp(가로 1280 이하, q82)로 바꿔 올린다.
const toWebp = (p: string) => sharp(fs.readFileSync(p)).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
const srcOf = (dir: string, n: number) => ["webp", "png"].map((e) => `${dir}/p${n}.${e}`).find((p) => fs.existsSync(p));
const BOOKS = ["my-muf9rkxl-1j3uvd", "my-mu28fusx-qw03vj", "my-mu0issap"];
const OWNER_FOLDER = "fe";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");

async function fetchOk(url: string): Promise<Buffer> {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch {}
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error(`받기 실패: ${url}`);
}

for (const id of BOOKS) {
  const { data: row, error } = await db.from("books").select("id,title,data").eq("id", id).single();
  if (error) throw new Error(`${id} 읽기 실패: ${error.message}`);
  const pages = row.data.pages as { image?: string }[];
  console.log(`\n■ ${row.title} (${pages.length}쪽)`);

  // 올릴 파일들: 쪽 + 표지(1쪽을 420px 로)
  const files: { name: string; buf: Buffer; kind: "page" | "cover"; i?: number }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = srcOf(`${SP}/${id}`, i + 1);
    if (!p) throw new Error(`그림 없음: ${SP}/${id}/p${i + 1}`);
    files.push({ name: `p${i + 1}-${TAG}`, buf: await toWebp(p), kind: "page", i });
  }
  const cover = await sharp(fs.readFileSync(srcOf(`${SP}/${id}`, 1)!)).resize(420).webp({ quality: 80 }).toBuffer();
  files.push({ name: `cover-${TAG}`, buf: cover, kind: "cover" });

  if (DRY) {
    for (const f of files) {
      const old = f.kind === "cover" ? row.data.coverImage : pages[f.i!].image;
      const oldShow = (old ?? "").startsWith("data:") ? `(DB 안 base64 ${Math.round((old ?? "").length / 1024)}KB)` : (old ?? "").split("/").slice(-1)[0];
      console.log(`  ${f.name.padEnd(12)} ${String(Math.round(f.buf.length / 1024)).padStart(4)}KB   전: ${oldShow}`);
    }
    continue;
  }

  // 1) 올리고 2) 받아서 대조
  const urls: Record<string, string> = {};
  for (const f of files) {
    const { url } = await uploadToCafe24(`books/${OWNER_FOLDER}/${id}/${f.name}.webp`, f.buf);
    const got = await fetchOk(url);
    if (md5(got) !== md5(f.buf)) throw new Error(`MD5 불일치 — DB 안 바꿈: ${url}`);
    urls[f.name] = url;
    console.log(`  올림·대조 OK  ${f.name}.webp  ${Math.round(f.buf.length / 1024)}KB`);
  }

  // 3) 책 데이터에서 그림 주소만 바꾼다 — 방금 읽은 최신 행 위에서
  const next = structuredClone(row.data);
  next.pages.forEach((p: { image?: string }, i: number) => (p.image = urls[`p${i + 1}-${TAG}`]));
  next.coverImage = urls[`cover-${TAG}`];
  const { error: upErr } = await db.from("books").update({ data: next }).eq("id", id);
  if (upErr) throw new Error(`${id} 저장 실패: ${upErr.message}`);
  console.log(`  책에 반영 완료 — 쪽 ${pages.length} + 표지`);
}
console.log(DRY ? "\n(미리보기 — 아무것도 안 바꿈)" : "\n끝.");
