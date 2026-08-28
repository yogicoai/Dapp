/**
 * 부모가 대본 문장을 고쳤을 때, 그 쪽의 '그림 지시'도 함께 고친다.
 *
 * 왜 필요한가 — 그림은 본문이 아니라 클로드가 따로 써 둔 장면 지시(@@IMG@@)를 보고
 * 그린다. 그래서 본문만 고치면 "사과를 배로" 바꿔도 그림에는 사과가 그대로 남는다.
 * 고친 글로 그림을 만든다는 약속이 반만 지켜지는 셈이다.
 *
 * 어떻게 고치는가 — 장면 지시는 두 부분으로 되어 있다.
 *   ① 잠금 줄: `등장인물 2명: 하온, 할머니.` `장소: 계곡 — …` `물건: 아이스크림 — …`
 *   ② 그 쪽에서 일어나는 일 (자유 문장)
 * 부모가 고친 것은 ②다. ①은 책 전체의 일관성을 잡는 뼈대라 손대면 인물이 둘로
 * 늘거나 장소가 흔들린다. 그래서 **①은 그대로 두고 ②만 고친 본문으로 갈아 끼운다.**
 *
 * 새 API를 부르지 않는다. 부모가 문장 하나 고칠 때마다 돈이 나가면 마음 놓고 못 고친다.
 */

// 상대 경로 + 확장자 — node --test는 "@/" 별칭을 모르고 확장자를 요구한다(tsconfig가 허용).
import { knownPlaceFamily, locationKeyOf } from "./story-quality.ts";

/** 등장인물 잠금 줄 — 한 화면에 같은 인물이 두 번 그려지는 것을 막는 줄이다. */
const CAST_LINE = /등장인물\s*\d+\s*명(?:\s*:[^.\n]*)?\./;
/** 장소 잠금 줄 — 쪽마다 다른 계곡이 되지 않게 잡아 주는 줄. */
const LOCATION_LINE = /장소\s*:[^.\n]*\./;
/** 물건 잠금 줄 — 한 쪽에 둘까지 나올 수 있어 전부 가져온다. */
const PROP_LINE = /물건\s*:[^.\n]*\./g;

/** `장소: 이름 — 특징.`에서 이름과 특징을 따로 뽑는다. */
const NAMED_LOCK = /^(?:장소|물건)\s*:\s*([^—\-\n]+?)\s*[—-]\s*([^\n]+?)\.?$/;

/**
 * 부모가 적은 장소 칸에서 **이 쪽의 장소에 해당하는 부분만** 고른다.
 *
 * 칸은 책 전체 한 줄이다: `계곡은 회색 자갈 바닥 · 거실은 밝은 마루 · 아이스크림은 분홍색`.
 * 예전엔 이 한 줄을 모든 쪽에 통째로 넣고 "매 쪽 이 장소를 그려라"고 했다 —
 * 그러면 거실 장면에 계곡 바위가 따라 들어온다. 이제 장소 부분은 이 쪽의 장소와
 * 같은 계열만 남기고, 물건 부분(장소가 아닌 것)은 그대로 둔다.
 *
 * ' · '로 나뉘어 있지 않은 자유 문장은 손대지 않고 그대로 준다.
 */
export function pickLocationDetail(detail: string, locationName: string): string {
  const parts = detail.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return detail.trim();
  const here = locationName ? locationKeyOf(locationName) : "";
  const kept = parts.filter((part) => {
    const m = /^(.+?)(?:은|는)\s+(.+)$/.exec(part);
    if (!m) return true;
    const subject = m[1].trim();
    // 이 쪽의 장소와 같은 계열이면 남긴다.
    if (here && locationKeyOf(subject) === here) return true;
    // 목록에 있는 다른 장소면 뺀다. 목록에 없는 것은 물건일 수 있으니 둔다.
    return knownPlaceFamily(subject) === null;
  });
  return kept.join(" · ");
}

/** 받침이 있으면 '은', 없으면 '는'. (가-힣 블록에서 (코드-0xac00)%28 != 0 이면 받침) */
function topicParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "는"; // 한글이 아니면 무난한 쪽으로
  return (code - 0xac00) % 28 !== 0 ? "은" : "는";
}

/**
 * 대본에서 장소·물건 설명을 뽑아 '장소 자세히 적기' 칸의 첫 줄을 만든다.
 *
 * 왜 — 이 칸은 비워 두면 아무 일도 안 한다. 그런데 부모에게 "장소를 자세히 적어
 * 주세요"라고 빈칸을 내밀면 대부분 그냥 넘어간다. 뭘 적어야 할지 모르니까.
 * 클로드는 이미 쪽마다 `장소: 골목 — 회색 시멘트 담과 물웅덩이.`를 적어 뒀다.
 * 그걸 사람이 읽는 한 줄로 바꿔 미리 채워 두면, 부모는 고치기만 하면 된다.
 *
 * 장소는 앞의 둘, 물건도 앞의 둘까지만 담는다. 길어지면 어차피 안 읽는다.
 */
export function suggestLocationDetail(imagePrompts: string[], maxLength = 120): string {
  const places = new Map<string, string>();
  const props = new Map<string, string>();

  const take = (into: Map<string, string>, clause: string) => {
    const parsed = NAMED_LOCK.exec(clause.trim());
    if (!parsed) return;
    const name = parsed[1].trim();
    const description = parsed[2].trim().replace(/\.$/, "");
    // 처음 나온 설명이 그 책의 정답이다 — 뒤에서 달라졌어도 첫 줄을 지킨다.
    if (name && description && !into.has(name)) into.set(name, description);
  };

  for (const prompt of imagePrompts) {
    const source = (prompt ?? "").normalize("NFC");
    const location = LOCATION_LINE.exec(source);
    if (location) take(places, location[0]);
    for (const prop of source.matchAll(PROP_LINE)) take(props, prop[0]);
  }

  const parts = [...[...places].slice(0, 2), ...[...props].slice(0, 2)].map(
    ([name, description]) => `${name}${topicParticle(name)} ${description}`,
  );
  if (parts.length === 0) return "";

  /*
   * 칸이 120자라 넘치면 잘라야 하는데, 말 중간에서 자르면 뜻이 깨진다.
   * 통째로 들어가는 것까지만 담고 나머지는 버린다.
   */
  let out = "";
  for (const part of parts) {
    const next = out ? `${out} · ${part}` : part;
    if (next.length > maxLength) break;
    out = next;
  }
  return out || parts[0].slice(0, maxLength);
}

/**
 * 고친 본문에 맞춰 장면 지시를 다시 쓴다.
 *
 * castNames를 주면 등장인물 줄도 고친 본문에 맞춰 다시 센다. 안 그러면 할머니를
 * 지운 문장인데 지시에는 "등장인물 2명: 하온, 할머니."가 남아, 없어진 할머니가
 * 그림에는 그대로 그려진다.
 *
 * 잠금 줄을 하나도 못 찾으면(옛 책이나 형식이 다른 경우) 고친 본문만 돌려준다.
 * 그래도 인물은 잠긴다 — 서버가 장면과 본문에서 이름을 찾아 등장인물을 고르기 때문이다.
 */
export function rewriteScene(
  imagePrompt: string,
  editedText: string,
  castNames: string[] = [],
): string {
  const text = editedText.normalize("NFC").trim();
  if (!text) return imagePrompt;

  const source = (imagePrompt ?? "").normalize("NFC");
  const locks: string[] = [];

  const castLine = CAST_LINE.exec(source);
  /*
   * 고친 본문에 이름이 나오는 인물만 남긴다.
   *
   * 이름이 하나도 안 나오면(예: "둘은 마주 보고 웃었어요") 원래 줄을 그대로 둔다 —
   * 대명사로만 쓴 문장에서 등장인물을 0명으로 만들면 아무도 없는 그림이 나온다.
   */
  const present = castNames.map((n) => n.normalize("NFC").trim()).filter((n) => n && text.includes(n));
  if (present.length > 0) locks.push(`등장인물 ${present.length}명: ${present.join(", ")}.`);
  else if (castLine) locks.push(castLine[0].trim());

  const location = LOCATION_LINE.exec(source);
  if (location) locks.push(location[0].trim());
  for (const prop of source.matchAll(PROP_LINE)) locks.push(prop[0].trim());

  return [...locks, text].join(" ").trim();
}
