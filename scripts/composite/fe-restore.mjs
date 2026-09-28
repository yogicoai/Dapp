/**
 * fe 계정 시험 3권을 합성 전 그림으로 되돌린다. (2026-09-28 백업 기준)
 *
 *   node --env-file=.env.local scripts/composite/fe-restore.mjs [--dry] [--to 원본|스티커]
 *   --to 원본(기본) = 처음 책 그림 / --to 스티커 = 스티커 합성판. 지금 앱엔 장면째 판(-s0928)이 들어 있다.
 *
 * scratch-art/fe-백업/<id>.json 에 합성 적용 직전의 books 행이 통째로 있다.
 * 그 data 를 그대로 되써서 그림·표지 주소를 원래대로 돌린다. 옛 그림 파일은 cafe24 에 그대로 남아 있다.
 * 백업 뒤에 부모가 글을 고쳤다면 그 수정도 함께 되돌아가니, 되돌리기 전에 --dry 로 확인할 것.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const toI = process.argv.indexOf("--to");
const DIR = toI > 0 && process.argv[toI + 1] === "스티커" ? "scratch-art/fe-백업-스티커" : "scratch-art/fe-백업";
const IDS = ["my-muf9rkxl-1j3uvd", "my-mu28fusx-qw03vj", "my-mu0issap"];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

for (const id of IDS) {
  const backup = JSON.parse(fs.readFileSync(`${DIR}/${id}.json`, "utf8"));
  const { data: now } = await db.from("books").select("data").eq("id", id).single();
  const textChanged = JSON.stringify(now.data.pages.map((p) => p.text)) !== JSON.stringify(backup.data.pages.map((p) => p.text));
  console.log(`${backup.title}${textChanged ? "  ⚠ 백업 뒤 글이 바뀌었음 — 되돌리면 글도 옛날로" : ""}`);
  if (DRY) continue;
  const { error } = await db.from("books").update({ data: backup.data }).eq("id", id);
  console.log(error ? `  실패: ${error.message}` : "  되돌림");
}
console.log(DRY ? "(미리보기 — 아무것도 안 바꿈)" : "끝.");
