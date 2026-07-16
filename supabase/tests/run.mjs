/**
 * 마이그레이션과 RLS를 진짜 Postgres에 돌려서 검증한다. `npm run test:db`
 *
 * Supabase 프로젝트 없이 도는 게 목적이다. 맨 postgres 컨테이너를 띄우고,
 * Supabase가 미리 만들어 두는 것들(auth.users, auth.uid, storage.*)을 00_stub.sql로
 * 흉내낸 뒤 우리 마이그레이션을 얹는다. 스텁은 검증용이며 프로젝트에는 올라가지 않는다.
 *
 * 여기서 잡히는 것: DDL 오류, 제약조건, 그리고 RLS가 실제로 남의 데이터를 막는지.
 * 여기서 못 잡는 것: Supabase 실제 storage 정책 동작, JWT 발급 경로.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(HERE, "..", "migrations");
const CONTAINER = "voice-storybook-db-test";
const IMAGE = "postgres:16";

const docker = (args, opts = {}) =>
  spawnSync("docker", args, { encoding: "utf8", ...opts });

function psql(sql, label) {
  const run = docker(
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: sql },
  );

  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.status !== 0) {
    console.error(out.trim());
    throw new Error(`${label} 실패`);
  }
  return out;
}

function cleanup() {
  docker(["rm", "-f", CONTAINER], { stdio: "ignore" });
}

try {
  execFileSync("docker", ["info"], { stdio: "ignore" });
} catch {
  console.error("Docker가 필요합니다. Docker Desktop을 켜고 다시 실행하세요.");
  process.exit(1);
}

cleanup();
console.log(`${IMAGE} 기동...`);
docker(["run", "--rm", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=x", IMAGE], {
  stdio: "ignore",
});

process.on("exit", cleanup);

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * postgres 이미지는 초기화 중에 임시 서버를 띄웠다 껐다가 다시 켠다. pg_isready는 그
 * 임시 서버에도 "준비됨"이라 답하므로, 진짜 쿼리가 연속으로 두 번 통해야 인정한다.
 */
let streak = 0;
for (let i = 0; i < 60 && streak < 2; i++) {
  const probe = docker(
    ["exec", CONTAINER, "psql", "-U", "postgres", "-tAc", "select 1"],
    { stdio: "ignore" },
  );
  streak = probe.status === 0 ? streak + 1 : 0;
  if (streak < 2) sleep(500);
}
if (streak < 2) {
  console.error("Postgres가 뜨지 않았습니다.");
  process.exit(1);
}

psql(readFileSync(path.join(HERE, "00_stub.sql"), "utf8"), "Supabase 스텁");
console.log("✓ Supabase 스텁");

for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
  psql(readFileSync(path.join(MIGRATIONS, file), "utf8"), file);
  console.log(`✓ ${file}`);
}

let failed = false;
for (const file of readdirSync(HERE).filter((f) => /^\d+_.*\.sql$/.test(f) && f !== "00_stub.sql").sort()) {
  const out = psql(readFileSync(path.join(HERE, file), "utf8"), file);
  for (const line of out.split("\n")) {
    const m = line.match(/(PASS|FAIL)\s+(.*)$/);
    if (!m) continue;
    console.log(`  ${m[1] === "PASS" ? "✓" : "✗"} ${m[2].trim()}`);
    if (m[1] === "FAIL") failed = true;
  }
}

console.log(failed ? "\n실패한 검사가 있습니다." : "\n전부 통과.");
process.exit(failed ? 1 : 0);
