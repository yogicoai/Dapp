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

/** 등장인물 잠금 줄 — 한 화면에 같은 인물이 두 번 그려지는 것을 막는 줄이다. */
const CAST_LINE = /등장인물\s*\d+\s*명(?:\s*:[^.\n]*)?\./;
/** 장소 잠금 줄 — 쪽마다 다른 계곡이 되지 않게 잡아 주는 줄. */
const LOCATION_LINE = /장소\s*:[^.\n]*\./;
/** 물건 잠금 줄 — 한 쪽에 둘까지 나올 수 있어 전부 가져온다. */
const PROP_LINE = /물건\s*:[^.\n]*\./g;

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
