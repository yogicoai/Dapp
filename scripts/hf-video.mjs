/**
 * 힉스필드 DoP 로 쪽 그림을 "살짝 움직이는 삽화"로 만든다.
 *
 *   node scripts/hf-video.mjs <jobs.json> [--tier standard|turbo|lite] [--par 3]
 *   node scripts/hf-video.mjs --motions          카메라 움직임 목록만 (무료)
 *
 * jobs.json = [{ slug, image, prompt, seed? , out }]
 *   image  : 로컬 그림 경로 (webp 도 됨 — jpg 로 바꿔서 올린다)
 *   out    : 받은 mp4 를 둘 경로
 *
 * 왜 first-last-frame 인가 — 시작과 끝을 같은 그림으로 못박으면 영상이 그림에서
 * 출발해 그림으로 돌아온다. 그래서 반복해도 이음매가 없다. 앱은 그림을 포스터로
 * 먼저 보여 주므로 영상이 켜지는 순간 튀지도 않는다.
 *
 * 과금 — 실패·nsfw·취소는 안 깎인다(힉스필드 문서). 잔액을 읽는 API 는 없다.
 * 크레딧이 없으면 제출에서 403 이 난다. POST 가 시간 초과로 끊겨도 자동 재시도하지
 * 않는다 — 멱등 키가 없어서 두 번 깎일 수 있다.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const BASE = "https://api.higgsfield.ai";
const AUTH = { Authorization: `Key ${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_KEY_SECRET}` };
const PRICE = { lite: 2, turbo: 6.5, standard: 9 };
const STATIC = "fa3ddb7c-53ee-4383-aa17-97ae65f180e5"; // GET /v1/motions 의 "Static"

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

if (args.includes("--motions")) {
  const r = await fetch(`${BASE}/v1/motions`, { headers: AUTH });
  const list = await r.json();
  const arr = Array.isArray(list) ? list : list.items ?? list.data ?? [];
  for (const m of arr) console.log(`${m.id}  ${m.name}`);
  process.exit(0);
}

const TIER = flag("--tier", "standard");
const PAR = Number(flag("--par", "3"));
const jobs = JSON.parse(fs.readFileSync(args[0], "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 그림을 jpg 로 바꿔 힉스필드 저장소에 올리고 공개 주소를 받는다. */
async function upload(file) {
  const jpg = await sharp(file).jpeg({ quality: 92 }).toBuffer();
  const r = await fetch(`${BASE}/files/generate-upload-url`, {
    method: "POST", headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: "image/jpeg" }),
  });
  if (!r.ok) throw new Error(`업로드 주소 ${r.status} ${await r.text()}`);
  const { upload_url, public_url, upload_headers } = await r.json();
  // S3 서명에 content-type 과 x-amz-tagging 이 들어간다 — 응답이 준 헤더를 그대로 보내야 한다.
  // 하나라도 빠지거나 다르면 SignatureDoesNotMatch 로 403 이 난다.
  const put = await fetch(upload_url, { method: "PUT", headers: upload_headers ?? { "Content-Type": "image/jpeg" }, body: jpg });
  if (!put.ok) throw new Error(`업로드 ${put.status}`);
  return public_url;
}

async function run(job) {
  const t0 = Date.now();
  const img = await upload(job.image);
  const body = {
    prompt: job.prompt,
    image_url: img,
    end_image_url: img, // 처음 = 끝 → 끊김 없는 반복
    seed: job.seed ?? Math.floor(Math.random() * 999999) + 1,
    enhance_prompt: false,
    // 카메라는 고정 — 그림책 쪽이 움직이는 거지 카메라가 도는 게 아니다
    motions: [{ id: STATIC, strength: 0.8 }],
  };
  const sub = await fetch(`${BASE}/higgsfield-ai/dop/${TIER}/first-last-frame`, {
    method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const subText = await sub.text();
  if (!sub.ok) throw new Error(`제출 ${sub.status} ${subText.slice(0, 300)}`);
  const { status_url, request_id } = JSON.parse(subText);

  let st;
  for (;;) {
    await sleep(6000);
    const r = await fetch(status_url, { headers: AUTH });
    st = await r.json();
    if (["completed", "failed", "nsfw", "canceled"].includes(st.status)) break;
    if (Date.now() - t0 > 12 * 60_000) throw new Error(`12분 넘게 안 끝남 (${request_id})`);
  }
  if (st.status !== "completed") throw new Error(`${st.status} (${request_id}) ${JSON.stringify(st).slice(0, 200)}`);

  const url = st.video?.url;
  const v = await fetch(url);
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  fs.writeFileSync(job.out, Buffer.from(await v.arrayBuffer()));
  return { slug: job.slug, seed: body.seed, secs: Math.round((Date.now() - t0) / 1000), out: job.out, request_id };
}

let spent = 0, i = 0;
const done = [], failed = [];
async function worker() {
  while (i < jobs.length) {
    const job = jobs[i++];
    try {
      const r = await run(job);
      spent += PRICE[TIER];
      done.push(r);
      console.log(`✓ ${r.slug}  seed ${r.seed}  ${r.secs}s  → ${path.basename(r.out)}  (누적 ${spent}크레딧)`);
    } catch (e) {
      failed.push({ slug: job.slug, error: String(e.message ?? e) });
      console.log(`✗ ${job.slug}  ${e.message ?? e}`);
      // 크레딧이 없거나 권한 문제면 나머지도 다 같은 이유로 실패한다 — 멈춘다
      if (/제출 (401|402|403)/.test(String(e.message))) { i = jobs.length; }
    }
  }
}
await Promise.all(Array.from({ length: PAR }, worker));

const log = args[0].replace(/\.json$/, ".result.json");
fs.writeFileSync(log, JSON.stringify({ tier: TIER, spent, done, failed }, null, 2));
console.log(`\n성공 ${done.length} · 실패 ${failed.length} · 쓴 크레딧 ${spent} (${TIER} ${PRICE[TIER]}/편) · 기록 ${log}`);
