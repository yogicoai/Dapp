/**
 * fe-scenes.json 의 쪽들을 scene_gen.mts 로 그린다. 한 번에 N 장씩(429 방지).
 *   node scripts/composite/fe-scenes-run.mjs [동시 수=4] [--only 1권1,2권3 …]
 * 이미 그린 파일은 건너뛴다(다시 그리려면 지우고 돌린다) — 돈이 두 번 나가지 않게.
 */
import fs from "node:fs";
import { spawn } from "node:child_process";

const SP = "C:/Users/YOGIBO~1/AppData/Local/Temp/claude/c--Users-Yogibo-Design-Desktop-Dong/f0d0f72c-8637-4ba5-993a-4f2d651a2bb7/scratchpad/fe";
const LIB = "C:/Users/Yogibo Design/Desktop/bg";
const cfg = JSON.parse(fs.readFileSync("scripts/composite/fe-scenes.json", "utf8"));
const N = Number(process.argv[2]) || 4;
const fill = (s) => s.replaceAll("{SC}", `${SP}/scene`).replaceAll("{GB}", `${SP}/bg`).replaceAll("{LIB}", LIB);

const jobs = cfg.pages
  .map((p) => ({ ...p, out: `${SP}/scene/${p.book}/p${p.page}.png` }))
  .filter((p) => !fs.existsSync(p.out));
console.log(`그릴 쪽 ${jobs.length}장 (동시 ${N})`);

const run = (p) => new Promise((resolve) => {
  const c = spawn(process.execPath, [
    "--experimental-strip-types", "--env-file=.env.local", "scripts/composite/scene_gen.mts",
    "--bg", fill(p.bg), "--cast", fill(p.cast), "--people", cfg.people[p.people], "--moment", p.moment, "--out", p.out,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  c.stderr.on("data", (d) => (err += d));
  c.on("close", (code) => {
    console.log(`${code === 0 ? "✔" : "✘"} ${p.book.slice(3, 11)} p${p.page}${code === 0 ? "" : "  " + err.split("\n").filter((l) => !/Warning|trace/.test(l)).join(" ").slice(0, 160)}`);
    resolve(code === 0);
  });
});

let ok = 0;
for (let i = 0; i < jobs.length; i += N) {
  const r = await Promise.all(jobs.slice(i, i + N).map(run));
  ok += r.filter(Boolean).length;
}
console.log(`끝 — 성공 ${ok}/${jobs.length} (실패한 요청은 과금되지 않는다)`);
