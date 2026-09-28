/**
 * 캐스팅 견본 굽기 — 배역마다 **그 인물이 실제로 하는 대사**로 한 줄씩 구워 둔다.
 *
 * 왜 그 책 대사로 굽나: 성우 목록의 공통 견본("안녕, 이야기 들려줄게")으로는
 * 이 배역에 맞는지 알 수 없다. 야수가 "누군가는 이 성에 남아야 한다"를 어떻게
 * 읽는지를 들어야 고를 수 있다.
 *
 *   node --experimental-strip-types --env-file=.env.local .bake-casting-samples.mjs
 *
 * public/casting/sample-<책>-<배역>-<성우>.mp3 로 저장한다. 성우를 바꿔 가며 더 구워도
 * 파일명이 겹치지 않아, 보드에서 나란히 들어볼 수 있다.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { synthesize } = await import(pathToFileURL(path.resolve("src/lib/typecast.ts")).href);

const BOARD = "C:/Users/YOGIBO~1/AppData/Local/Temp/claude/c--Users-Yogibo-Design-Desktop-Dong/f0d0f72c-8637-4ba5-993a-4f2d651a2bb7/scratchpad/review-board.html";
const RE = /(<script id="data" type="application\/json">)([\s\S]*?)(<\/script>)/;
const board = JSON.parse(RE.exec(fs.readFileSync(BOARD, "utf8"))[2]);

/** voices.ts 에서 성우 정보를 읽는다 */
const src = fs.readFileSync("src/lib/voices.ts", "utf8");
const V = {};
for (const m of src.matchAll(/id: "(tc-[a-z0-9]+)", label: "([^"]+)"[\s\S]{0,240}?voiceId: "(tc_[a-f0-9]+)"[\s\S]{0,80}?model: "([^"]+)"/g)) {
  V[m[1]] = { label: m[2], voiceId: m[3], model: m[4] };
}

/** 어느 책의 어느 배역을 어떤 대사로 들려줄지 — 그 인물이 제일 그 인물다운 줄로 고른다. */
const PLAN = {
  "신데렐라": {
    slug: "cinderella",
    lines: {
      "신데렐라": ["저… 저도 신어 봐도 될까요?", "normal"],
      "언니": ["그동안… 우리가 너무 못되게 굴었어. 미안해.", "sad"],
      "새어머니": ["흥, 넌 할 일이 산더미잖니!", "normal"],
      "요정 대모": ["울지 마렴, 신데렐라야. 너도 무도회에 갈 수 있단다!", "normal"],
      "왕자": ["저와 춤을 추시겠어요?", "normal"],
      "신하": ["왕자님의 무도회에 온 나라 아가씨를 초대합니다!", "toneup"],
    },
  },
  "미녀와 야수": {
    slug: "beauty",
    lines: {
      "벨": ["제가 가겠어요, 아버지.", "normal"],
      "야수": ["그 장미는 내가 아끼던 것이다. 꺾어 갔으니 그냥 보낼 수는 없다. 누군가는 이 성에 남아야 한다.", "normal"],
      "아버지": ["그러면 딸들에게 작별 인사만 하게 해 주세요.", "sad"],
      "언니": ["저는 비단 드레스요!", "toneup"],
    },
  },
};

const OUT = "public/casting";
fs.mkdirSync(OUT, { recursive: true });

let made = 0, chars = 0;
const rows = [];
for (const [title, spec] of Object.entries(PLAN)) {
  const b = board.find((x) => x.title === title);
  if (!b) { console.log(`✗ ${title} 를 검토대에서 못 찾음`); continue; }
  for (const [role, [text, emotion]] of Object.entries(spec.lines)) {
    const id = b.pick?.[role];
    if (!id) { console.log(`  ✗ ${title} ${role}: 추천 성우가 없습니다`); continue; }
    const v = V[id];
    if (!v) { console.log(`  ✗ ${title} ${role}: ${id} 를 voices.ts 에서 못 찾음`); continue; }
    const file = path.join(OUT, `sample-${spec.slug}-${roleSlug(role)}-${id}.mp3`);
    if (fs.existsSync(file)) { rows.push({ title, role, id, label: v.label, text, file, skipped: true }); continue; }
    const r = await synthesize({ text, voiceId: v.voiceId, model: v.model, emotion, intensity: 0.4, format: "mp3" });
    fs.writeFileSync(file, Buffer.from(r.audio));
    made++; chars += text.length;
    rows.push({ title, role, id, label: v.label, text, file });
    console.log(`  구움 ${title} · ${role} → ${v.label}  (${(fs.statSync(file).size / 1024).toFixed(0)}KB)`);
  }
}

function roleSlug(k) {
  return ({ "신데렐라": "cinderella", "언니": "sister", "새어머니": "stepmom", "요정 대모": "fairy", "왕자": "prince", "신하": "servant", "벨": "belle", "야수": "beast", "아버지": "father" })[k] ?? k;
}

fs.writeFileSync(
  path.join(OUT, "samples.json"),
  JSON.stringify(rows.map((r) => ({ book: r.title, role: r.role, voice: r.id, label: r.label, text: r.text, src: "/" + r.file.replace(/^public[\\/]/, "").replace(/\\/g, "/") })), null, 2) + "\n",
  "utf8",
);
console.log(`\n견본 ${rows.length}개 (새로 구운 것 ${made}개 · ${chars}자)`);
console.log("목록: public/casting/samples.json");
