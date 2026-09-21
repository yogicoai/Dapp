/**
 * 아무도 안 듣는 소리 파일 치우기.
 *
 *   node --experimental-strip-types scripts/clean-orphan-audio.mts           목록만
 *   node --experimental-strip-types scripts/clean-orphan-audio.mts --delete  지움
 *
 * 왜 쌓이나 — 쪽을 더하거나 빼면 조각 번호가 밀리고(seg-cast-p24-4 → -5), 말풍선을
 * 떼거나 배역 성우를 바꾸면 옛 파일이 그대로 남는다. 아무도 안 가리키니 동작에는
 * 지장이 없지만 앱 용량을 그대로 먹는다 — 소리는 cafe24 가 아니라 앱에서 나간다.
 * 2026-09-21 에 처음 돌렸을 때 1,052개 630MB 가 나왔다.
 *
 * ⚠️ 파일 이름만 보고 판단하면 안 된다. BookViewer 가 재생 직전에 이름을 바꾼다:
 *
 *   page.segments[i].src  "seg-p3-0.mp3"      who==="narration" 이면 seg-<성우>-p3-0.mp3
 *                         "seg-cast-p3-1.mp3" 대사는 배역이 성우를 정하므로 그대로
 *   page.audio            "narr-p3.mp3"       ① 추천 성우로 들을 때 → narr-<성우>-p3.mp3
 *                                             ② 합성이 실패했을 때   → narr-p3.mp3 **그대로**
 *
 * ②를 빠뜨리면 크레딧이 잠겼을 때 물러날 자리를 지우게 된다(한 번 그랬다).
 * 갈아 끼울 성우는 book.narrators 안에서만 고를 수 있어서(뷰어가 먼저 확인한다),
 * 그 목록에서 빠진 성우의 파일은 앱이 절대 틀지 않는다.
 */
import fs from "node:fs";
import path from "node:path";

const DELETE = process.argv.includes("--delete");

const books = [
  ...JSON.parse(fs.readFileSync("src/data/folk-books.json", "utf8")),
  ...JSON.parse(fs.readFileSync("src/data/classic-books.json", "utf8")),
];

/** 책 → 소리 폴더. 그림 주소에서 뽑는다(…/dapp/<root>/<dir>/pN.webp). */
function dirOf(b: any) {
  const url = b.pages.find((p: any) => p.image)?.image ?? b.coverImage ?? "";
  const m = url.match(/dapp\/(folk|classic)\/([^/]+)\//);
  if (m) return `public/${m[1]}/${m[2]}`;
  const root = b.id.startsWith("folk-") ? "folk" : "classic";
  return `public/${root}/${b.id.replace(/^(folk|classic)-/, "")}`;
}

/** 이 책이 실제로 틀 수 있는 파일 이름 전부. */
function usedBy(b: any) {
  const narrators: string[] = b.narrators?.length ? b.narrators : [b.narrator].filter(Boolean);
  const used = new Set<string>();
  for (const p of b.pages) {
    for (const h of p.hotspots ?? []) if (h.audio) used.add(path.basename(h.audio));
    for (const a of p.actors ?? []) if (a.src?.endsWith(".mp3")) used.add(path.basename(a.src));
    for (const s of p.segments ?? []) {
      if (!s.src) continue;
      const base = path.basename(s.src);
      if (s.who === "narration") narrators.forEach((v) => used.add(base.replace("seg-", `seg-${v}-`)));
      else used.add(base);
    }
    if (p.audio) {
      const base = path.basename(p.audio);
      narrators.forEach((v) => used.add(base.replace("narr-", `narr-${v}-`)));
      used.add(base); // 합성 실패 시 그대로 트는 자리
    }
  }
  return used;
}

const mb = (n: number) => (n / 1048576).toFixed(1) + "MB";
let nOrphan = 0, bOrphan = 0, nMissing = 0;

for (const b of books) {
  const dir = dirOf(b);
  if (!fs.existsSync(dir)) continue;
  const used = usedBy(b);

  // 책이 가리키는데 없는 파일 — 청소보다 먼저 알아야 한다
  const missing = [...used].filter((f) => !fs.existsSync(path.join(dir, f)));

  const orphan = fs.readdirSync(dir).filter((f) => f.endsWith(".mp3") && !used.has(f));
  if (!orphan.length && !missing.length) continue;

  console.log(`\n■ ${b.title}  (${dir})`);
  if (missing.length) {
    nMissing += missing.length;
    console.log(`   ✗ 가리키는데 없는 소리 ${missing.length}개: ${missing.slice(0, 5).join(", ")}`);
  }
  if (orphan.length) {
    const bytes = orphan.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
    nOrphan += orphan.length; bOrphan += bytes;
    console.log(`   안 쓰는 것 ${orphan.length}개 (${mb(bytes)})`);
    console.log("     " + orphan.slice(0, 6).join(", ") + (orphan.length > 6 ? ` … 외 ${orphan.length - 6}개` : ""));
    if (DELETE) for (const f of orphan) fs.unlinkSync(path.join(dir, f));
  }
}

console.log(`\n안 쓰는 소리 ${nOrphan}개 · ${mb(bOrphan)}${DELETE ? " — 지웠습니다" : ""}`);
if (nMissing) console.log(`⚠ 가리키는데 없는 소리 ${nMissing}개 — 위를 확인하세요`);
if (!DELETE && nOrphan) console.log("(지우려면 --delete)");
