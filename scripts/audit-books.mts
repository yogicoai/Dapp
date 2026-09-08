/**
 * 책 전수 점검 — 눈으로는 못 잡는 것만 기계로 본다.
 *
 * 왜 필요한가: 이 앱의 사고는 늘 같은 자리에서 났다. 글을 고쳤는데 소리를 다시 안 구워
 * 소리와 글이 어긋나거나(장화 신은 고양이 3쪽), 조각 파일 하나가 없어 문장이 통째로
 * 조용하거나, 배역이 안 정해져 나레이션이 대신 읽거나(해님 달님 6쪽 호랑이).
 * 전부 파일과 데이터만 보면 알 수 있는 것들인데, 사람이 스물아홉 권을 다 들어 볼 수는 없다.
 *
 * 무엇을 보나:
 *   ① 없는 소리 — 조각·말풍선이 가리키는 mp3 가 실제로 있는가(고를 수 있는 성우 전부에 대해)
 *   ② 글과 소리의 어긋남 — 굽기 기록에 남은 '실제로 읽은 글'이 지금 원고와 같은가  ← 제일 중요
 *   ③ 배역 미정 — 따옴표 대사인데 읽어 줄 배역이 없는 줄
 *   ④ 속마음 — 작은따옴표 속마음을 나레이션이 읽게 된 자리
 *   ⑤ 말풍선 — 자리(box)가 0~1000 비율인가, 대사가 본문에 있는가
 *   ⑥ 그림 — 쪽마다 그림이 있는가
 *   ⑦ 성우 — 기본 나레이션이 고를 수 있는 목록 안에 있는가
 *
 * 쓰는 법:  node --experimental-strip-types scripts/audit-books.mts [--book "제목"]
 * 고치지 않는다. 무엇이 잘못됐는지만 알려 준다.
 */
import fs from "node:fs";
import path from "node:path";
import { planPageVoices, unassignedDialogue, narratedThoughts, NARRATION } from "../src/lib/story-cast.ts";
import { restAfter } from "../src/lib/reading-rest.ts";

type Seg = { who: string; src: string; text: string };
type Hot = { label: string; line: string; say?: string; box: number[]; audio?: string };
type Page = { text: string; image?: string; video?: string; unspoken?: string[]; segments?: Seg[]; hotspots?: Hot[]; lines?: { text: string; who: string; say?: string }[] };
type Book = {
  id: string; title: string; hidden?: boolean; pages: Page[];
  narrator?: string; narrators?: string[];
  voiceCast?: Record<string, string>; roleOf?: Record<string, string>;
};

const MANIFEST = "scripts/bake-manifest.json";
const recorded: Record<string, { voice: string; text: string }> = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
  : {};

const only = process.argv.includes("--book")
  ? process.argv[process.argv.indexOf("--book") + 1]
  : null;

/** 굽기 기록의 열쇠 — 소리 주소에서 그대로 뽑는다(/folk/haedal/x.mp3 → folk/haedal/x.mp3). */
const keyOf = (src: string) => src.replace(/^\//, "");
/** 파일이 실제로 있는가. */
const onDisk = (src: string) => fs.existsSync(path.join("public", src.replace(/^\//, "")));

type Issue = { book: string; page: number | null; kind: string; detail: string };
const issues: Issue[] = [];
const add = (book: string, page: number | null, kind: string, detail: string) =>
  issues.push({ book, page, kind, detail });

let books: Book[] = [];
for (const f of ["src/data/folk-books.json", "src/data/classic-books.json"]) {
  books = books.concat(JSON.parse(fs.readFileSync(f, "utf8")) as Book[]);
}
if (only) books = books.filter((b) => b.title === only);

let checkedPages = 0;
let checkedFiles = 0;
const restTotals: { title: string; seconds: number; segs: number }[] = [];

for (const b of books) {
  const cast = Object.keys(b.roleOf ?? {}).map((name) => ({ name }));
  const narrators = b.narrators?.length ? b.narrators : b.narrator ? [b.narrator] : [];

  // ⑦ 기본 나레이션이 고를 수 있는 목록 안에 있는가 — 밖에 있으면 책을 열었을 때 조용하다.
  if (b.narrator && narrators.length && !narrators.includes(b.narrator)) {
    add(b.title, null, "성우", `기본 나레이션 ${b.narrator} 가 고를 수 있는 목록에 없음 (${narrators.join(", ")})`);
  }

  let restMs = 0;
  let segCount = 0;

  b.pages.forEach((pg, idx) => {
    const n = idx + 1;
    checkedPages += 1;

    // ⑥ 그림
    if (!pg.image && !pg.video) add(b.title, n, "그림", "그림도 영상도 없음");

    // ③④ 배역 — 굽기 스크립트와 같은 규칙으로 본다.
    const plan = planPageVoices({ text: String(pg.text), lines: pg.lines, cast, roleOf: b.roleOf });
    for (const s of unassignedDialogue(plan)) {
      add(b.title, n, "배역 미정", s.text.trim().replace(/\s+/g, " ").slice(0, 60));
    }
    for (const s of narratedThoughts(plan)) {
      add(b.title, n, "속마음", `나레이션이 읽음: ${s.text.trim().slice(0, 50)}`);
    }
    for (const s of plan) {
      if (s.who !== NARRATION && b.voiceCast && !b.voiceCast[s.who]) {
        add(b.title, n, "배역 성우 없음", `${s.who} — ${s.text.trim().slice(0, 40)}`);
      }
    }

    // ①② 조각 — 파일이 있는가, 구운 글이 지금 원고와 같은가
    for (const seg of pg.segments ?? []) {
      segCount += 1;
      const srcs = seg.who === "narration"
        ? narrators.map((v) => seg.src.replace("seg-", `seg-${v}-`))
        : [seg.src];
      for (const src of srcs) {
        checkedFiles += 1;
        if (!onDisk(src)) {
          add(b.title, n, "없는 소리", `${src}  ← "${seg.text.trim().slice(0, 30)}"`);
          continue;
        }
        const rec = recorded[keyOf(src)];
        /*
         * 굽기는 앞뒤 공백을 떼고 보내므로 떼고 견준다 — 공백은 소리를 바꾸지 않는다.
         * 읽기용 표기(say)를 준 줄은 일부러 다르게 읽힌 것이라 어긋남이 아니다
         * (토끼와 거북이 6쪽 "자, 준비… 시작!" → "자아, 준비이… 시자악!").
         */
        const spokenAs = new Set(
          (pg.lines ?? []).filter((l) => l.say?.trim()).map((l) => l.say!.trim()),
        );
        /*
         * '안 읽는 말'(unspoken)이 있는 쪽은 화면 글과 읽은 글이 일부러 다르다
         * (해님 달님 7쪽 "똑똑똑." — 합성이 뭉개져서 글에만 남기고 소리에선 뺐다).
         * 그 말을 빼고 견줘야 진짜 어긋남만 걸린다.
         */
        const withoutUnspoken = (pg.unspoken ?? [])
          .reduce((t, w) => (w ? t.split(w).join(" ") : t), seg.text)
          .replace(/\s+/g, " ")
          .trim();
        if (
          rec &&
          rec.text.trim() !== seg.text.trim() &&
          rec.text.trim() !== withoutUnspoken &&
          !spokenAs.has(rec.text.trim())
        ) {
          add(b.title, n, "글과 소리 어긋남",
            `${path.basename(src)}\n      원고: ${seg.text.trim().slice(0, 60)}\n      소리: ${rec.text.trim().slice(0, 60)}`);
        }
      }
    }

    // 쉼이 얼마나 붙는지(참고용)
    const segs = pg.segments ?? [];
    segs.forEach((s, i) => {
      restMs += restAfter(s, segs[i + 1] ?? null, 1);
    });

    // ⑤ 말풍선
    for (const h of pg.hotspots ?? []) {
      const box = h.box ?? [];
      if (box.length !== 4 || box.some((v) => typeof v !== "number" || v < 0 || v > 1000)) {
        add(b.title, n, "말풍선 자리", `${h.label} box=${JSON.stringify(box)} — 0~1000 비율 네 개여야 함`);
      } else if (box[0] >= box[2] || box[1] >= box[3]) {
        add(b.title, n, "말풍선 자리", `${h.label} box=${JSON.stringify(box)} — 위>아래 또는 왼>오른`);
      }
      /*
       * 말풍선 대사가 본문에 없어도 괜찮다 — 그림 속 인물을 눌렀을 때만 나오는
       * '덤 대사'가 이 앱의 기능이다(토끼와 거북이·콩쥐 팥쥐가 그렇게 쓰고 있다).
       * 그래서 본문 대조는 하지 않는다.
       */
      if (h.audio) {
        checkedFiles += 1;
        if (!onDisk(h.audio)) {
          add(b.title, n, "없는 소리", `${h.audio} (말풍선 ${h.label})`);
        } else {
          const rec = recorded[keyOf(h.audio)];
          const spoken = h.say?.trim() || h.line;
          if (rec && rec.text.trim() !== spoken.trim()) {
            add(b.title, n, "글과 소리 어긋남",
              `${path.basename(h.audio)} (말풍선)\n      원고: ${spoken.slice(0, 60)}\n      소리: ${rec.text.slice(0, 60)}`);
          }
        }
      }
    }
  });

  if (segCount) restTotals.push({ title: b.title, seconds: restMs / 1000, segs: segCount });
}

// ── 보고
const byBook = new Map<string, Issue[]>();
for (const it of issues) {
  const list = byBook.get(it.book) ?? [];
  list.push(it);
  byBook.set(it.book, list);
}

console.log(`책 ${books.length}권 · ${checkedPages}쪽 · 소리 ${checkedFiles}개를 봤습니다.\n`);
if (!issues.length) {
  console.log("문제 없음.");
} else {
  for (const [title, list] of byBook) {
    console.log(`■ ${title} — ${list.length}건`);
    for (const it of list) {
      console.log(`   ${it.page ? `${it.page}쪽` : "책"} [${it.kind}] ${it.detail}`);
    }
    console.log("");
  }
  const kinds = new Map<string, number>();
  for (const it of issues) kinds.set(it.kind, (kinds.get(it.kind) ?? 0) + 1);
  console.log("종류별:", [...kinds].map(([k, v]) => `${k} ${v}`).join(" · "));
}

console.log("\n낭독에 더해지는 쉼(1배속 기준):");
for (const r of restTotals.sort((a, b) => b.seconds - a.seconds)) {
  console.log(`   ${r.title.padEnd(16)} ${r.seconds.toFixed(1)}초 (조각 ${r.segs}개)`);
}

process.exit(issues.length ? 1 : 0);
