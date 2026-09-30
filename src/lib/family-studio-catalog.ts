/**
 * 가족 사진관 — 가족 단체 사진 뒤에 고를 수 있는 배경과 붙일 수 있는 스티커 목록(설정 한 곳).
 *
 * 사장님 2026-09-30: "가족사진 뒤에 배경도 고객이 직접 지정할수 있게해주자", "기본은 우리 동화속 배경이지만
 * 지정할수도 있게 까지", "우리가 가지고 있는 아이콘들도 … 스티커로 저쪽에 배치해서 꾸밀수 있게", "너무 투머치이면
 * 말려줘도 되" → 가벼운 판으로 정했다: 배경 고르기 + 스티커(붙이기·옮기기·크기·떼기). 돌리기·겹침 순서·
 * 마음대로 적는 글자는 없다.
 * 같은 날 2차(사장님): 전용 배경 25장, "스티커 만들었거든"(29장), "실제 스티커 크기 좌우로 해서 좀더 디테일하게
 * 줄이기도"(밀대·두 손가락 — lib/family-studio), "글자스티커도 있으면 좋을것같아"(정해 둔 한국어 문구 — 아래).
 *
 * 배경
 *  - 기본은 지금 나라 배경(theme.background) 그대로다 — 아무것도 안 고르면 예전과 똑같이 보인다.
 *  - 고르기 목록 = 사장님이 만든 **가족사진 전용 배경 25장**(fam-…, 1536×1024). cafe24 `dapp/family-bg/` 에 올라가 있고
 *    주소 끝 ?v= 는 파일 md5 앞 8자다(cafe24 는 ?v 를 무시한다 — 그림을 바꿀 때는 파일을 덮어쓰고 v 를 바꾼다).
 *    원본 목록: scratch-art/가족사진배경목록.json(저장소 밖 — 있으면 시험이 주소를 견준다).
 *    무리(group)는 사장님이 붙인 갈래 그대로(우리 집·우리 동네·나들이·계절·특별한 날·상상 나라).
 *    이름은 사장님 이름에서 괄호만 뺐다('벚꽃 공원 (낮)' → '벚꽃 공원 낮') — 작은 칸 두 줄에 들게.
 *  - 그 전에 창고(src/data/backgrounds.json)에서 골라 쓰던 22곳은 **숨겨서 남겨 둔다**(hidden: true, 목록 아래쪽).
 *  - **목록에서 지우지 말고 hidden: true 로 숨긴다.** 고객이 이미 고른 배경이 목록에서 사라지면 불러올 때
 *    (lib/family-studio normalizeStudio) 모르는 배경이라 말없이 기본으로 돌아간다. 숨긴 배경은 고른 사람에게만 계속 보인다.
 *  - 배경 그림은 가로로 넓다(전용 3:2, 예전 4:3). 사진은 object-cover 로 잘라 채우고 STUDIO_BG_POSITION(가로 가운데·
 *    세로 70%)을 쓴다 — 나라 배경처럼 맨 아래(100%)에 맞추면 태블릿(2.3:1)에서 바닥만 보이고 위가 잘려 나간다.
 *  - 고르기 칸의 작은 그림은 public/family-studio/bg/<slug>.webp(320×180 — 같은 50%/70% 로 자름).
 *    원본을 폰에서 한꺼번에 받으면 수 MB 라서. 새 배경을 넣으면 `node scripts/family-studio-thumbs.mts` 로 같이 만든다
 *    (cafe24 그림 받기만 — 돈 드는 호출 없음).
 *
 * 스티커(그림) — 칸 순서 그대로, 무리(STICKER_GROUPS)별로 고르기 화면에 선다.
 *  - 사장님 스티커 84장(public/family-studio/stickers/<이름>.webp, 564×564 투명, 흰 테두리 입체 그림)이 먼저 —
 *    축하 · 꾸미기 · 사랑 · 날씨·계절 · 특별한 날 · 동물 · 소품. 29장은 사장님이 만든 것, 55장(09-30)은 힉스필드로 같은 결에 맞춰 뽑음.
 *    꾸미기(머리띠·모자·안경·나비넥타이)는 얼굴 없이 그려 캐릭터 머리 위에 얹는 용도. 예전 아이콘과 이름이 겹친 4장은
 *    저장값이 섞이지 않게 space-rocket·rabbit·doggy·baby-whale 로 붙였다.
 *  - 그 뒤에 예전 아이콘 스티커 24개('동화 아이콘' — public/icons/chips, 256×256). **지우지 않는다** — 이미 붙인
 *    사람이 있고, 모르는 아이콘은 불러올 때 말없이 빠진다. 뺀 것(사람·나쁜 기분·어색한 물건)은 예전 그대로 없다.
 *  - label 은 화면 읽기용 이름이다(글자로 보이지 않는다).
 *
 * 글자 스티커 — 정해 둔 한국어 문구 12개(STUDIO_TEXT_STICKERS). 그림이 아니라 앱이 글꼴(주아 — 레이아웃에서 이미
 * 싣는 --font-jua)로 그린다: 한글 글자가 늘 바르고, 크기를 바꿔도 또렷하다. 파스텔 글자색 + 두꺼운 흰 테두리 + 옅은
 * 그림자(components/family/StudioStickers TextStickerFace) — 그림 스티커와 같은 '붙인' 느낌.
 * 마음대로 적는 칸은 없다(가볍게 — 사장님과 정함). 저장값은 문구가 아니라 id(txt-…)라 문구를 다듬어도 붙인 스티커가
 * 따라온다. 그림·글자 합쳐 STUDIO_MAX 개까지(lib/family-studio).
 *
 * 브라우저가 부르는 순수 데이터 — sharp·fetch 없음. 이 파일은 prefs 를 부르지 않는다(prefs → family-studio → 여기).
 */

export type StudioGroup = "home" | "town" | "outing" | "season" | "special" | "fantasy";

/** 고르기 화면의 무리 순서. 보일 배경이 없는 무리는 화면에 안 나온다. */
export const STUDIO_GROUPS: readonly { id: StudioGroup; label: string }[] = [
  { id: "home", label: "우리 집" },
  { id: "town", label: "우리 동네" },
  { id: "outing", label: "나들이" },
  { id: "season", label: "계절" },
  { id: "special", label: "특별한 날" },
  { id: "fantasy", label: "상상 나라" },
];

export type StudioBackground = {
  /** 전용 배경은 fam-…, 예전(숨김)은 backgrounds.json 의 slug — 저장되는 값 */
  slug: string;
  /** 칸 아래 이름(1~9자, 두 줄까지) */
  label: string;
  group: StudioGroup;
  /** 사진에 깔 원본(cafe24) */
  src: string;
  /** 새로 고를 수 없게 숨김 — 이미 고른 사람에게는 계속 보인다(지우지 말 것, 위 머리말) */
  hidden?: boolean;
  /** 움직이는 배경(사장님 2026-09-30 "움직이는 배경 몇 개") — 같은 그림이 살짝 움직이는 반복 영상(public, 소리 없음).
   *  src 그림을 첫 장면(poster)으로 쓰고, 움직임 줄이기 설정이면 그림만 깐다. */
  video?: string;
};

/** 가족사진 전용 배경(사장님 25장) */
export const FAMILY_BG_BASE = "https://yogibo.openhost.cafe24.com/app/img/dapp/family-bg/";
/** 예전 배경 창고(숨김 22곳) */
const CAFE = "https://yogibo.openhost.cafe24.com/app/img/dapp/bg/";

/** 움직이는 배경이 있는 전용 배경 — public/family-studio/bg-video/<slug>.mp4(힉스필드 Wan 3.0, 시작=끝 같은 그림이라 끊김 없이 돈다).
 *  cafe24 는 mp4 를 못 올려서(ftp-550) 사이트(public)에 둔다. 1280 폭 · 4.7초 · 230~750KB. */
export const STUDIO_MOVING_BG: ReadonlySet<string> = new Set([
  "fam-cherry-park-day",
  "fam-snowy-yard",
  "fam-starry-hill",
  "fam-christmas-living-room",
  "fam-sandy-beach",
  "fam-riverside-sunset",
  "fam-campsite",
  "fam-sunflower-field",
  "fam-birthday-party",
  "fam-castle-clouds",
  "fam-chuseok-moon-yard",
  "fam-seollal-hanok-hall",
  "fam-pajama-party-room",
]);
export const STUDIO_BG_VIDEO_DIR = "/family-studio/bg-video/";

const fam = (slug: string, label: string, group: StudioGroup, v: string): StudioBackground => ({
  slug,
  label,
  group,
  src: `${FAMILY_BG_BASE}${slug}.webp?v=${v}`,
  ...(STUDIO_MOVING_BG.has(slug) ? { video: `${STUDIO_BG_VIDEO_DIR}${slug}.mp4` } : {}),
});
const old = (slug: string, label: string, group: StudioGroup, file: string): StudioBackground => ({
  slug,
  label,
  group,
  src: CAFE + file,
  hidden: true,
});

export const STUDIO_BACKGROUNDS: readonly StudioBackground[] = [
  // ── 가족사진 전용(사장님 2026-09-30) — 고르기 목록 ──
  // 우리 집
  fam("fam-sunny-living-room", "햇살 드는 거실", "home", "5b5b446f"),
  fam("fam-cozy-kids-room", "아늑한 아이 방", "home", "c8ab758c"),
  fam("fam-evening-kitchen", "저녁 부엌", "home", "af1cd218"),
  // 우리 동네
  fam("fam-park-lawn", "공원 잔디밭", "town", "c0c8767b"),
  fam("fam-apartment-playground", "아파트 놀이터", "town", "254b6e78"),
  fam("fam-flower-alley", "꽃 화분 골목", "town", "40340e40"),
  // 나들이
  fam("fam-sandy-beach", "바닷가", "outing", "b2230bd3"),
  fam("fam-campsite", "캠핑장", "outing", "85ec2226"),
  fam("fam-amusement-park", "놀이공원", "outing", "c54456c0"),
  fam("fam-mountain-view", "산 정상 전망", "outing", "d0e94b3f"),
  fam("fam-riverside-sunset", "강변 노을", "outing", "c32e3ce0"),
  // 계절 — 봄에서 겨울로
  fam("fam-park-early-spring", "초봄 공원", "season", "9aa04531"),
  fam("fam-cherry-park-day", "벚꽃 공원 낮", "season", "b245ffe6"),
  fam("fam-cherry-park-sunset", "벚꽃 공원 노을", "season", "bae0d52e"),
  fam("fam-cherry-park-night", "벚꽃 공원 밤", "season", "85ce0c23"),
  fam("fam-sunflower-field", "해바라기 밭", "season", "83489994"),
  fam("fam-autumn-maple-path", "가을 단풍길", "season", "bebf3f52"),
  fam("fam-snowy-yard", "눈 내린 마당", "season", "5aa54568"),
  // 특별한 날
  fam("fam-birthday-party", "생일 파티", "special", "dc6bda2e"),
  fam("fam-christmas-living-room", "크리스마스 거실", "special", "67e9872d"),
  fam("fam-photo-studio", "사진관 스튜디오", "special", "c5dd94b7"),
  // 테마 배경(09-30, 힉스필드 — 옷 갈아입히기 테마 세트와 짝: 추석 한복·설날 색동·잠옷 파티)
  fam("fam-chuseok-moon-yard", "추석 보름달 마당", "special", "81b7cdf5"),
  fam("fam-seollal-hanok-hall", "설날 대청마루", "special", "da97c40c"),
  fam("fam-pajama-party-room", "잠옷 파티 밤", "special", "e271e326"),
  // 상상 나라
  fam("fam-castle-clouds", "구름 위 성", "fantasy", "791e6207"),
  fam("fam-mushroom-forest", "버섯 마을 숲", "fantasy", "041c99ef"),
  fam("fam-starry-hill", "별이 빛나는 언덕", "fantasy", "f792a6ed"),
  fam("fam-friendly-planet", "우주 행성", "fantasy", "b83cdcdc"),

  // ── 예전 22곳(배경 창고에서 고른 것) — 숨김. 이미 고른 사람에게만 보인다(지우지 말 것) ──
  old("living-room", "거실", "home", "living-room.webp?v=a4849d9e"),
  old("kids-bedroom", "아이 방", "home", "kids-bedroom.webp?v=13ff83a2"),
  old("playground", "놀이터", "town", "playground.webp"),
  old("han-river-park", "한강 공원", "town", "han-river-park.webp?v=9923c5bf"),
  old("colorful-hill-village", "언덕 마을", "town", "colorful-hill-village.webp?v=beaa4830"),
  old("country-hanok-yard", "시골 마당", "town", "country-hanok-yard.webp?v=9be456d9"),
  old("sandy-beach", "바닷가", "outing", "sandy-beach.webp?v=1a7ce468"),
  old("lighthouse", "등대", "outing", "lighthouse.webp?v=378d1d1b"),
  old("amusement-park", "놀이공원", "outing", "amusement-park.webp?v=26854074"),
  old("campsite", "캠핑장", "outing", "campsite.webp?v=466b1883"),
  old("old-palace", "고궁", "outing", "old-palace.webp?v=2983255b"),
  old("cherry-blossom-path", "봄 벚꽃길", "season", "cherry-blossom-path.webp?v=863d24a0"),
  old("canola-field-path", "봄 유채꽃길", "season", "canola-field-path.webp?v=226e883c"),
  old("tree-lined-road", "여름 가로수길", "season", "tree-lined-road.webp?v=7fed8686"),
  old("autumn-forest-path", "가을 단풍길", "season", "autumn-forest-path.webp?v=c106c908"),
  old("snowy-alley", "겨울 눈길", "season", "snowy-alley.webp?v=ffe1b992"),
  old("im-magic-castle-on-the-clouds", "구름 위 성", "fantasy", "im-magic-castle-on-the-clouds.webp?v=aae6d582"),
  old("im-princess-topiary-avenue-castle", "성 가는 길", "fantasy", "im-princess-topiary-avenue-castle.webp?v=f6e56e8b"),
  old("im-magic-sweets-garden", "과자 나라", "fantasy", "im-magic-sweets-garden.webp?v=46fb0901"),
  old("im-space-crystal-plain-ringed-planet", "우주 행성", "fantasy", "im-space-crystal-plain-ringed-planet.webp?v=ab537ee2"),
  old("im-sea-before-undersea-palace", "바닷속 궁전", "fantasy", "im-sea-before-undersea-palace.webp?v=944521d4"),
  old("im-magic-tulip-house-village-green", "튤립 마을", "fantasy", "im-magic-tulip-house-village-green.webp?v=7da33c3b"),
];

/** 고르기 칸의 작은 그림(320×180) */
export const studioThumb = (slug: string) => `/family-studio/bg/${slug}.webp`;

/** 고른 배경의 object-position — 나라 배경(기본)은 예전처럼 object-bottom 그대로(위 머리말) */
export const STUDIO_BG_POSITION = "50% 70%";

/* ─────────────────────────────── 스티커 ─────────────────────────────── */

export type StickerGroup = "party" | "dressup" | "love" | "weather" | "holiday" | "animal" | "props" | "icons";

/** 스티커 고르기 화면의 무리 순서 — 사장님 스티커가 먼저, 예전 아이콘은 맨 뒤 */
export const STICKER_GROUPS: readonly { id: StickerGroup; label: string }[] = [
  { id: "party", label: "축하" },
  { id: "dressup", label: "꾸미기" },
  { id: "love", label: "사랑" },
  { id: "weather", label: "날씨·계절" },
  { id: "holiday", label: "특별한 날" },
  { id: "animal", label: "동물" },
  { id: "props", label: "소품" },
  { id: "icons", label: "동화 아이콘" },
];

/** 그림 스티커 하나 — icon 이 저장되는 값(겹치지 않게) */
export type StudioStickerDef = { kind: "image"; icon: string; label: string; group: StickerGroup; src: string };

/** 사장님 스티커(투명 webp 564×564) */
export const OWN_STICKER_DIR = "/family-studio/stickers/";
const own = (icon: string, label: string, group: StickerGroup): StudioStickerDef => ({
  kind: "image",
  icon,
  label,
  group,
  src: `${OWN_STICKER_DIR}${icon}.webp`,
});
/** 예전 아이콘 스티커(public/icons/chips 투명 webp 256×256) */
const chip = (icon: string, label: string): StudioStickerDef => ({
  kind: "image",
  icon,
  label,
  group: "icons",
  src: `/icons/chips/${icon}.webp`,
});

/** 스티커 칸 순서 그대로 */
export const STUDIO_STICKERS: readonly StudioStickerDef[] = [
  // 축하
  own("balloons", "풍선", "party"),
  own("party-hat", "고깔모자", "party"),
  own("cake", "케이크", "party"),
  own("confetti", "꽃가루", "party"),
  own("garland", "깃발 줄", "party"),
  own("crown", "황금 왕관", "party"),
  own("sparkles", "반짝반짝", "party"),
  own("trophy", "트로피", "party"),
  own("gold-medal", "금메달", "party"),
  own("fireworks", "불꽃놀이", "party"),
  own("gift-box", "선물 상자", "party"),
  // 꾸미기 — 캐릭터 머리·얼굴에 얹는 것(얼굴 없는 그림)
  own("bunny-ears-headband", "토끼 머리띠", "dressup"),
  own("cat-ears-headband", "고양이 머리띠", "dressup"),
  own("pirate-hat", "해적 모자", "dressup"),
  own("wizard-hat", "마법사 모자", "dressup"),
  own("princess-tiara", "티아라", "dressup"),
  own("flower-hairpin", "꽃 머리핀", "dressup"),
  own("star-sunglasses", "별 선글라스", "dressup"),
  own("heart-sunglasses", "하트 선글라스", "dressup"),
  own("bow-tie", "나비넥타이", "dressup"),
  own("paper-crown", "생일 왕관", "dressup"),
  own("tiger-hat", "호랑이 모자", "dressup"),
  own("chef-hat", "요리사 모자", "dressup"),
  // 사랑
  own("double-hearts", "겹친 하트", "love"),
  own("heart-balloon", "하트 풍선", "love"),
  own("bouquet", "꽃다발", "love"),
  own("bow", "리본", "love"),
  own("teddy-bear", "곰돌이", "love"),
  own("flower-crown", "꽃 화관", "love"),
  own("carnation", "카네이션", "love"),
  own("baby-footprints", "아기 발자국", "love"),
  // 날씨·계절
  own("sun", "해님", "weather"),
  own("cloud", "구름", "weather"),
  own("rainbow", "무지개", "weather"),
  own("moon", "초승달", "weather"),
  own("cherry-petals", "벚꽃잎", "weather"),
  own("sunflower", "해바라기", "weather"),
  own("maple-leaves", "단풍잎", "weather"),
  own("snowflake", "눈송이", "weather"),
  own("snowman", "눈사람", "weather"),
  own("four-leaf-clover", "네잎클로버", "weather"),
  own("rainbow-umbrella", "무지개 우산", "weather"),
  own("watermelon", "수박", "weather"),
  own("sandcastle", "모래성", "weather"),
  // 특별한 날 — 명절·기념일
  own("songpyeon", "보름달 송편", "holiday"),
  own("pumpkin-lantern", "호박 등불", "holiday"),
  own("christmas-tree", "크리스마스트리", "holiday"),
  own("santa-hat", "산타 모자", "holiday"),
  own("christmas-stocking", "크리스마스 양말", "holiday"),
  own("lucky-pouch", "복주머니", "holiday"),
  own("korean-kite", "방패연", "holiday"),
  own("tteokguk", "떡국", "holiday"),
  own("yut-sticks", "윷", "holiday"),
  own("hanbok", "한복", "holiday"),
  own("taegeuk-fan", "태극선", "holiday"),
  // 동물
  own("kitten", "아기 고양이", "animal"),
  own("chick", "병아리", "animal"),
  own("penguin", "펭귄", "animal"),
  own("butterfly", "나비", "animal"),
  own("ladybug", "무당벌레", "animal"),
  own("dinosaur-egg", "공룡 알", "animal"),
  own("unicorn", "유니콘", "animal"),
  own("baby-dinosaur", "아기 공룡", "animal"),
  own("doggy", "아기 강아지", "animal"),
  own("rabbit", "아기 토끼", "animal"),
  own("squirrel", "다람쥐", "animal"),
  own("panda", "판다", "animal"),
  own("baby-whale", "아기 고래", "animal"),
  // 소품
  own("camera", "사진기", "props"),
  own("speech-bubble", "말풍선", "props"),
  own("paper-plane", "종이비행기", "props"),
  own("hot-air-balloon", "열기구", "props"),
  own("photo-frame", "사진 액자", "props"),
  own("picnic-basket", "소풍 바구니", "props"),
  own("ice-cream", "아이스크림", "props"),
  own("toy-train", "장난감 기차", "props"),
  own("soap-bubbles", "비눗방울", "props"),
  own("star-wand", "별 요술봉", "props"),
  own("crayons", "크레파스", "props"),
  own("building-blocks", "블록", "props"),
  own("robot-toy", "로봇", "props"),
  own("space-rocket", "우주 로켓", "props"),
  own("school-backpack", "책가방", "props"),
  own("baby-tooth", "아기 이", "props"),
  // 동화 아이콘 — 예전 스티커(지우지 말 것)
  chip("heart", "하트"),
  chip("star", "별"),
  chip("gift", "선물"),
  chip("magic", "요술봉"),
  chip("princess", "왕관"),
  chip("rocket", "로켓"),
  chip("sleep", "달님"),
  chip("sprout", "새싹"),
  chip("bunny", "토끼"),
  chip("puppy", "강아지"),
  chip("fox", "여우"),
  chip("dinosaur", "공룡"),
  chip("whale", "고래"),
  chip("zoo", "사자"),
  chip("daycare", "곰 인형"),
  chip("outing", "나무"),
  chip("forest", "전나무"),
  chip("home", "우리 집"),
  chip("playground", "회전목마"),
  chip("map", "보물 지도"),
  chip("write", "무지개 연필"),
  chip("joyful", "하하"),
  chip("excited", "두근두근"),
  chip("relieved", "방긋"),
];

/* ─────────────────────────────── 글자 스티커 ─────────────────────────────── */

/**
 * 글자 스티커 하나 — icon(txt-…)이 저장되는 값, text 가 보이는 문구, fill 은 글자색(파스텔 — 흰 테두리 위에서도
 * 읽히게 너무 옅지 않은 색, 시험이 흰색과의 대비를 본다).
 */
export type TextStickerDef = { kind: "text"; icon: string; label: string; text: string; fill: string };

/** 글자 스티커 글꼴 — 주아(둥근 한글 제목 글꼴). 레이아웃(app/layout)이 --font-jua 로 이미 싣는다(미리 받기 없음). */
export const TEXT_STICKER_FONT = "var(--font-jua), 'Pretendard Variable', Pretendard, sans-serif";

/** 파스텔 글자색 — 딸기·하늘·귤·민트·라벤더·산호 */
const PINK = "#ff6f9f";
const SKY = "#4fa8f0";
const ORANGE = "#f7892a";
const MINT = "#35b98a";
const LAVENDER = "#9a7cf0";
const CORAL = "#ff7a6b";

const txt = (icon: string, text: string, fill: string): TextStickerDef => ({ kind: "text", icon, label: text, text, fill });

/** 글자 칸 순서 그대로 */
export const STUDIO_TEXT_STICKERS: readonly TextStickerDef[] = [
  txt("txt-family", "우리 가족", PINK),
  txt("txt-love", "사랑해", CORAL),
  txt("txt-happy", "행복해", ORANGE),
  txt("txt-best", "최고야", SKY),
  txt("txt-thanks", "고마워", MINT),
  txt("txt-together", "함께라서 좋아", LAVENDER),
  txt("txt-birthday", "생일 축하해", PINK),
  txt("txt-xmas", "메리 크리스마스", MINT),
  txt("txt-picnic", "소풍 가는 날", ORANGE),
  txt("txt-sparkle", "오늘도 반짝", SKY),
  txt("txt-home", "우리 집 최고", CORAL),
  txt("txt-dream", "꿈나라 가자", LAVENDER),
];

/** 그림·글자 스티커 정의 하나 */
export type AnyStickerDef = StudioStickerDef | TextStickerDef;

/** 그림 스티커 주소 — 모르는 아이콘이면 undefined */
export const stickerSrc = (icon: string): string | undefined => STUDIO_STICKERS.find((s) => s.icon === icon)?.src;
