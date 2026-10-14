/**
 * 동화 만들기 칩 글자 → 스티커 아이콘(public/icons/chips/<이름>.webp).
 *
 * 2026-09-28 칩의 이모지를 힉스필드로 뽑은 말랑한 3D 스티커로 바꿨다(사장님 요청). 칩 표(create/page.tsx)를
 * 하나하나 고치지 않고 글자로 찾는다 — 성별로 바뀌는 형제 호칭(형/오빠)이나 새로 생긴 '직접 입력' 칩도 저절로 붙는다.
 * 표에 없는 칩은 예전처럼 이모지를 쓴다. 원본 목록·프롬프트는 scripts/chip-icons.json.
 */
const CHIP_ICON_NAME: Record<string, string> = {
  // 상상 — 신나는·동화나라·좋은 습관
  공룡: "dinosaur",
  우주: "rocket",
  바다: "whale",
  "동물 친구": "bunny",
  마법: "magic",
  "숲속 모험": "forest",
  "공주님 이야기": "princess",
  "왕자님 이야기": "prince",
  이솝우화처럼: "fox",
  "일상 이야기": "home",
  "밥 잘 먹기": "meal",
  잠자기: "sleep",
  양치질: "toothbrush",
  "배변 훈련": "potty",
  "친구와 나누기": "sharing",
  심부름: "errand",
  // 상상 — 무슨 일이 생길까요
  "신나는 모험을 떠나요": "map",
  "무언가를 찾으러 가요": "search",
  "새 친구를 만나요": "new-friend",
  "어려움을 이겨내요": "strong",
  "실수하고 뉘우쳐요": "sprout",
  "소중한 걸 배워요": "gift",
  // 오늘 — 어디에서
  유치원: "kindergarten",
  어린이집: "daycare",
  놀이터: "playground",
  집: "home",
  "할머니 댁": "grandma-house",
  마트: "mart",
  병원: "hospital",
  동물원: "zoo",
  "바깥 나들이": "outing",
  // 누구랑
  혼자서: "alone",
  친구랑: "friend",
  선생님이랑: "teacher",
  엄마랑: "mom",
  아빠랑: "dad",
  "엄마 아빠랑": "mom-dad",
  할머니랑: "grandma",
  할아버지랑: "grandpa",
  // 두 분 함께(2026-10-14) — 새로 뽑지 않고 위 두 스티커를 나란히 붙여 만든 그림(grandparents.webp)
  "할머니 할아버지랑": "grandparents",
  "동물 친구랑": "puppy",
  형이랑: "older-brother",
  오빠랑: "older-brother",
  누나랑: "older-sister",
  언니랑: "older-sister",
  남동생이랑: "baby-brother",
  여동생이랑: "baby-sister",
  // 기분 · 끝 · 감정
  신났어요: "joyful",
  속상했어요: "sad",
  무서웠어요: "scared",
  뿌듯했어요: "proud",
  화났어요: "angry",
  긴장했어요: "nervous",
  서운했어요: "hurt",
  "잘 해결됐어요": "relieved",
  칭찬받았어요: "star",
  혼났어요: "scolded",
  "아직 속상해요": "sad",
  좋아해요: "heart",
  "화가 나요": "angry",
  무서워요: "scared",
  슬퍼요: "sad",
  "샘이 나요": "jealous",
  부끄러워요: "shy",
  속상해요: "upset",
  외로워요: "lonely",
  걱정돼요: "worried",
  답답해요: "frustrated",
  서운해요: "hurt",
  미안해요: "sorry",
  뿌듯해요: "proud",
  설레요: "excited",
  심심해요: "bored",
  // 감정 — 언제 그런 마음이
  "엄마 아빠가 꼭 안아줬을 때": "family-hug",
  "좋아하는 친구와 함께 놀 때": "play-together",
  "귀여운 동물 친구를 만났을 때": "puppy",
  "동생이 장난감을 뺏었을 때": "daycare",
  "친구가 같이 안 놀아줘서": "sitting-alone",
  "엄마 아빠한테 혼나서": "sad",
  "깜깜한 밤이 무서워서": "sleep",
  "유치원에 처음 가는 날": "kindergarten",
  "동생만 예뻐하는 것 같아서": "baby-brother",
  "잘하고 싶은데 잘 안 돼서": "trying-hard",
  // 새로 생긴 '직접 입력' 칩
  "직접 입력": "write",
};

export function chipIcon(label: string): string | undefined {
  const name = CHIP_ICON_NAME[label.trim()];
  return name ? `/icons/chips/${name}.webp` : undefined;
}
