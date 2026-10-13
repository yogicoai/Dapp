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
import { knownPlaceFamily, locationKeyOf, placeVehicleKind, vehicleState } from "./story-quality.ts";

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
 *
 * placeOnly — 장소 기준 그림(인물 없는 빈 무대)에 넘길 때 쓴다. 물건 부분("모자는 파란 야구 모자")을 뺀다.
 * 넣으면 빈 장소 한가운데 그 물건이 그려지고, 쪽마다 그 그림을 기준으로 따르니 늘 쓰는 모자가 탁자·의자 위에 놓인 채
 * 아이가 맨머리로 나온다(2026-10-13 my-mv6elzcs — 장소 그림 탁자 위에 파란 모자, 2·5·6쪽에서 모자를 벗고 있었다).
 */
export function pickLocationDetail(detail: string, locationName: string, placeOnly = false): string {
  const parts = detail.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  const here = locationName ? locationKeyOf(locationName) : "";
  const hereCompact = squash(locationName);
  /** 이 쪽의 장소와 같은 곳인가 — 같은 계열이거나, "경복궁"과 "경복궁 앞마당"처럼 이름이 서로를 품는다. */
  const samePlace = (subject: string) => {
    if (here && locationKeyOf(subject) === here) return true;
    const subjectCompact = squash(subject);
    return Boolean(
      hereCompact && subjectCompact && (hereCompact.includes(subjectCompact) || subjectCompact.includes(hereCompact)),
    );
  };
  const isVehicleName = (subject: string) => Boolean(placeVehicleKind(subject) ?? vehicleState(subject).kind);
  if (parts.length <= 1) {
    /*
     * 한 덩어리 칸도 '탈것은 설명' 꼴이면 거른다. 예전엔 조각이 하나면 거름을 아예 건너뛰어,
     * "2층 서울시티투어버스 위층은 노란 좌석" 한 조각이 경복궁 쪽과 장소 시트에 '가장 우선'으로 갔다.
     * 탈것만 뺀다 — "우리 동네 놀이터는 파란 미끄럼틀…" 같은 한 문장은 부모가 책 전체에 쓴 말일 수 있다.
     */
    const m = /^(.+?)(?:은|는)\s+(.+)$/.exec(parts[0] ?? "");
    if (m && isVehicleName(m[1].trim()) && !samePlace(m[1].trim()) && !(locationName && placeVehicleKind(locationName))) {
      return "";
    }
    return detail.trim();
  }
  const kept = parts.filter((part) => {
    const m = /^(.+?)(?:은|는)\s+(.+)$/.exec(part);
    if (!m) return true;
    const subject = m[1].trim();
    // 이 쪽의 장소와 같은 곳이면 남긴다.
    if (samePlace(subject)) return true;
    // 장소 기준 그림에는 이 장소 말고는 아무것도 넘기지 않는다(다른 곳도, 물건도).
    if (placeOnly) return false;
    const subjectCompact = squash(subject);
    /*
     * 다른 탈것·다른 이름난 곳은 뺀다.
     *
     * 목록에 없는 이름은 물건으로 보고 모든 쪽에 남겼는데, "2층 서울시티투어버스 위층은 노란 좌석"도
     * "경복궁은 커다란 나무 문"도 목록에 없어 **모든 쪽에 '가장 우선'으로** 들어갔다.
     * 그래서 궁궐 마당 그림에 버스 노란 좌석이, 장소 시트 한 장에 궁궐 문과 버스가 섞였다(my-mu0issap).
     */
    if (isVehicleName(subject)) return false;
    if (PLACE_NAME_END.test(subjectCompact)) return false;
    // 목록에 있는 다른 장소면 뺀다. 목록에 없는 것은 물건일 수 있으니 둔다.
    return knownPlaceFamily(subject) === null;
  });
  return kept.join(" · ");
}

/**
 * 옛 장소 시트가 섞였을 수 있나 — 장소 칸에 **다른 탈것·이름난 곳** 설명이 들어 있는가.
 *
 * 이 거름(탈것·궁·광장 빼기)을 넣기 전에 그린 장소 시트는, 장소 칸의 버스 설명과 궁궐 설명을 함께 받아
 * 경복궁 문과 2층 버스 노란 좌석을 한 장에 섞어 그렸다(my-mu0issap loc1). 그 시트는 검수를 안 받는데
 * 쪽 검수는 반드시 따를 정답으로 쓰므로, 한 쪽만 다시 그려도 섞인 그림을 또 따라간다.
 * 예전 거름이 이미 빼던 것(목록에 있는 다른 장소)은 섞임으로 치지 않는다 — 그 시트는 깨끗하다.
 */
export function detailMixesOtherPlaces(detail: string, locationName: string): boolean {
  const parts = (detail ?? "").split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const kept = new Set(pickLocationDetail(detail, locationName).split(/\s*·\s*/).map((s) => s.trim()));
  return parts.some((part) => {
    if (kept.has(part)) return false;
    const subject = /^(.+?)(?:은|는)\s+(.+)$/.exec(part)?.[1]?.trim() ?? "";
    // 탈것 이름도 예전엔 목록에서 못 알아봐(2층 버스 위층) 거르지 못했다 — 섞임으로 친다.
    return Boolean(subject) && (knownPlaceFamily(subject) === null || Boolean(placeVehicleKind(subject)));
  });
}

/** 띄어쓰기·기호를 걷어 낸 이름 — "경복궁 앞마당"이 "경복궁"을 품는지 볼 때 쓴다. */
function squash(text: string): string {
  return (text ?? "").normalize("NFC").replace(/[^가-힣A-Za-z0-9]/g, "");
}

/*
 * 이름 끝만 봐도 '장소'인 말 — 궁·광장·역·박물관. 물건 이름(장화·손전등·아이스크림)은 이렇게 끝나지 않는다.
 * 넓게 잡지 않는다: '장'·'관' 한 글자로 끝을 보면 도장·장난감 같은 물건까지 장소가 된다.
 */
const PLACE_NAME_END = /(궁|궁궐|광장|기차역|지하철역|공항|성당|사찰|박물관|미술관|기념관|전시관|정원|항구|터미널|대문|성문|광화문|타워)$/;

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
export function suggestLocationDetail(imagePrompts: string[], maxLength = 300): string {
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

  /*
   * 탈것은 뒤로 보낸다.
   *
   * 이 칸은 모든 쪽 프롬프트에 '가장 우선'으로 들어가고 장소 시트에도 들어간다. 첫 쪽이 버스라서
   * 버스 설명이 맨 앞에 서니, 궁궐 마당 쪽까지 버스 좌석이 따라 그려졌다(my-mu0issap).
   * 쪽마다 고르는 일은 pickLocationDetail 이 하지만, 잘릴 때 남는 쪽이 머무는 장소이도록 순서도 바꾼다.
   */
  // 이름만 본다 — 설명에 "버스가 지나가는 길"이 있다고 그 장소를 탈것으로 치면 안 된다.
  const isVehicle = (name: string) => ((placeVehicleKind(name) ?? vehicleState(name).kind) ? 1 : 0);
  const placeList = [...places].sort(([a], [b]) => isVehicle(a) - isVehicle(b));
  // 장소 셋·물건 둘까지 — 칸이 300자로 넓어져 세 장소도 들어간다.
  const parts = [...placeList.slice(0, 3), ...[...props].slice(0, 2)].map(
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
