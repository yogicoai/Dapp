/**
 * 이야기 구성 시험대 — 실제 앱과 똑같은 길로 한 편을 뽑아 본다.
 *
 * 왜 만들었나: 한 권을 6장에서 5장으로 줄이고 나서 "이야기 구성이 그래도 잘 나오나"를
 * 봐야 했다. 앱으로 만들면 그림 값까지 나가고 결과가 브라우저에만 남아 비교가 어렵다.
 * 여기서는 줄거리와 대본까지만 만들고(그림 없음) 결과를 파일로 남긴다.
 *
 * 쓰는 법:
 *   npx tsx scripts/try-story.mts --pages 5 --case bubble
 *   npx tsx scripts/try-story.mts --pages 5 --case both --pages2 6   (5장·6장 나란히)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { ChildProfile, StoryMaterial } from "../src/lib/anthropic";

// .env.local 을 손으로 읽는다 — next 없이 도는 스크립트라 자동으로 안 들어온다.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

/*
 * env 를 채운 **뒤에** 불러온다 — anthropic.ts 는 파일이 읽히는 순간 클라이언트를
 * 만들면서 키를 찾는다. 위에 평범한 import 로 두면 키가 아직 없어서 터진다.
 */
const { generateOutline, generateStory } = await import("../src/lib/anthropic");
const { validateStoryQuality, repairStoryContinuity } = await import("../src/lib/story-quality");

const arg = (k: string, d = "") => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const child: ChildProfile = {
  name: arg("name", "하온"),
  age: Number(arg("age", "5")),
  gender: arg("gender", "여자") as ChildProfile["gender"],
};

const base: Omit<StoryMaterial, "happening" | "place" | "feeling" | "ending"> = {
  kind: "today", subject: "", who: "친구들이랑", whoName: "", whoGender: "",
  friends: [], emotion: "", situation: "", extra: "",
  directMode: "", directOpening: "", directDevelopment: "", directCrisis: "", directEnding: "", directText: "",
};

/** 선생님 알림장을 그대로 재료로 넣는다 — 부모가 앱에 붙여넣는 것과 같은 상황. */
const CASES: Record<string, StoryMaterial> = {
  // ① 비눗방울 한 줄기만
  bubble: {
    ...base,
    happening:
      "피노키오 책을 함께 보다가 고래 뱃속 그림의 물방울을 보고 '비눗방울 같아!' 하며 신나게 세어 보았다. " +
      "그 모습을 보고 공원으로 나가 비눗방울 놀이를 했다. 바람을 타고 떠다니는 비눗방울을 눈으로 쫓고 손으로 잡아 보았다.",
    place: "어린이집과 공원",
    feeling: "신나요",
    ending: "비눗방울을 손으로 잡아 보며 즐겁게 놀았다",
  },
  // ② 알림장 전체 — 활동이 둘(비눗방울 + 뮤직테라피)
  both: {
    ...base,
    happening:
      "피노키오 책을 함께 보다가 고래 뱃속 그림의 물방울을 보고 '비눗방울 같아!' 하며 신나게 세어 보았다. " +
      "그 모습을 보고 공원으로 나가 비눗방울 놀이를 했다. 바람을 타고 떠다니는 비눗방울을 눈으로 쫓고 손으로 잡아 보았다. " +
      "뮤직테라피 시간에는 전래동화 '의좋은 형제'를 들으며 배려와 양보를 배웠고, 지게에 볏단을 실어 나르는 체험을 했다. " +
      "핑거심벌즈를 탐색하고 리듬에 맞춰 연주했다.",
    place: "어린이집과 공원",
    feeling: "신나요",
    ending: "비눗방울도 잡아 보고 악기도 연주하며 즐거운 하루를 보냈다",
  },
};

const key = arg("case", "bubble");
const material = CASES[key];
if (!material) throw new Error(`모르는 시험: ${key} (있는 것: ${Object.keys(CASES).join(", ")})`);

const pages = Number(arg("pages", "5"));

/*
 * --beat 로 뼈대를 못 박는다 (시험용).
 *
 * pickBeatTemplate 은 후보 중 하나를 Math.random 으로 고른다. 밖에서 고를 길이 없어서,
 * 같은 규칙으로 후보를 다시 만들고 원하는 카드가 뽑히도록 첫 난수 한 번만 바꿔 준다.
 * 앱 코드는 건드리지 않는다 — 시험할 때만 도는 장치다.
 */
const beatWanted = arg("beat", "");
if (beatWanted) {
  const { BEAT_TEMPLATES } = await import("../src/lib/story-beats");
  const pool = BEAT_TEMPLATES.filter(
    (t) => t.kinds.includes(material.kind) && t.minPages <= pages && child.age >= t.ages[0] && child.age <= t.ages[1],
  );
  const at = pool.findIndex((t) => t.id === beatWanted);
  if (at < 0) throw new Error(`${pages}장·${child.age}세에서 못 고르는 뼈대: ${beatWanted} (가능: ${pool.map((t) => t.id).join(", ")})`);
  const real = Math.random;
  let first = true;
  Math.random = () => { if (first) { first = false; return (at + 0.5) / pool.length; } return real(); };
  console.log(`뼈대 고정: ${beatWanted} (${pool[at].label})`);
}


console.log(`\n${"=".repeat(70)}`);
console.log(`시험 [${key}] · ${pages}장 · ${child.name}(${child.age}세)`);
console.log("=".repeat(70));

console.time("줄거리");
const outline = await generateOutline({ child, material, pageCount: pages, mood: "" });
console.timeEnd("줄거리");
console.log(`\n── 줄거리 (${outline.scenes.length}장면) ──`);
for (const s of outline.scenes) console.log(`  ${s.sceneNo}. ${s.text}`);

console.time("\n대본");
let story = await generateStory({ child, material, outline, narrationStyle: "natural" });
console.timeEnd("\n대본");
story = repairStoryContinuity(story);

console.log(`\n── 본문: ${story.title} ──`);
story.pages.forEach((p, i) => {
  const body = p.text.replace(/@@VOICE@@[^\n]*/g, "").trim();
  console.log(`\n[${i + 1}쪽] ${body.length}자`);
  console.log(body);
});

const issues = validateStoryQuality(story, {
  childName: child.name,
  age: child.age,
  expectedPages: pages,
  requiredTerms: ["비눗방울"],
});
console.log(`\n── 품질 검사 ──`);
console.log(issues.length ? issues.map((i) => "  ⚠ " + i).join("\n") : "  통과");

const lens = story.pages.map((p) => p.text.replace(/@@VOICE@@[^\n]*/g, "").trim().length);
console.log(`\n쪽당 글자수: ${lens.join(" / ")}  (평균 ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}자)`);

mkdirSync("tmp-stories", { recursive: true });
const out = `tmp-stories/${key}-${pages}장.json`;
writeFileSync(out, JSON.stringify({ child, material, outline, story, issues }, null, 2), "utf8");
console.log(`\n저장: ${out}`);
