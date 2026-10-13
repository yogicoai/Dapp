/**
 * 우리 가족 캐릭터 '사진으로 할게요' — 특징 카드(사장님 승인 2026-09-29).
 *
 * 사진을 그림 모델에 넘기기 전에 값싼 글 모델에게 한 번 보여 주고, 알아볼 수 있는 생김새를 짧은 영어 줄로 받는다
 * (성별·나이대·가장 두드러진 특징·얼굴형·눈·눈썹·코·입·볼과 턱·피부·피부의 오래가는 점(주근깨·점)·머리·앞머리와 가르마·
 * 안경·수염·체형·옷 색). 모델은 쪽 그림 검수(lib/gemini
 * validateIllustration)와 같다 — GEMINI_VISION_MODEL, 안 적으면 gemini-flash-latest(별칭이라 모델이 바뀌어도 따라간다).
 * 그림 프롬프트(lib/family-portrait-prompt)는 이 카드를 '그대로 맞출 것'으로 적는다 — 얼굴이 작은 전신 그림이라 사진만
 * 붙였을 때는 덜 닮았다. 그림 모델이 사진을 거절하면 사진 없이 이 카드로 다시 그린다(api/family/portrait 대신 그리기).
 *
 * 두드러진 특징 먼저(사장님 2026-09-29 "그림만 보고도 누구다 이런 느낌 날 수 있게"): 부탁 글이 칸을 채우기 전에 '같은 나이·
 * 성별이고 대체로 닮은 사람들과 견줘 이 얼굴을 알아보게 하는 오래가는 특징 3~5개'부터 고르게 하고, 그것을 distinctive 줄
 * (세미콜론으로 나눔)에 적게 한다. 견주는 무리를 '대체로 닮은 사람들'로 적는 까닭 — 그냥 '보통 얼굴'이면 모델이 서양 얼굴을
 * 기준으로 삼아 한국 사람 대부분이 가진 것(까만 머리·홑꺼풀 …)을 가족 모두에게 '두드러진 특징'으로 적는다. 표정·화장·모자·
 * 머리핀·반창고·여드름처럼 그날만의 것은 적지 않게 하고(PASSING_TRAIT 로 한 번 더 거른다), 주근깨·점·오래된 흉터는 오래가는
 * 특징이라 적게 한다(아래 '엄마 사진'). 좌우는 image-left/right(보는 쪽)로 적게 한다.
 *
 * 엄마 사진(2026-09-30 사장님 "캐릭터 생성이 내가 올린 이미지랑 100% 비슷하단 느낌이 덜한데"): 사진은 속이 비치는 가는 앞머리를
 * 가운데로 가르고, 긴 달걀형 얼굴·좁은 턱, 가로로 길고 가는 홑꺼풀 눈, 뺨·콧등의 주근깨와 입가의 점이었는데, 그림은 두껍게
 * 일자로 자른 앞머리·동그란 얼굴·크고 둥근 눈·주근깨 없음이었다. 이 카드 쪽 까닭 둘을 고쳤다(검사 모델을 더 부르지 않는다 —
 * 사장님 "검사 넣는건 오바같아"):
 *  ① 부탁 글이 '그날만의 흠(spots)'을 적지 말라고 해 주근깨·점이 흠으로 읽혀 빠졌다 — 이제 오래가는 것이라고 적고, 따로
 *     skin marks 칸(주근깨의 양·자리, 점 하나하나의 자리)을 둔다.
 *  ② 예시 낱말이 그대로 옮겨졌다 — 예전 부탁 글의 예시 'a straight blunt fringe' 와, 머리 칸의 그냥 'fringe' 한 낱말은 단발
 *     앞머리를 두껍게 일자로 자른 앞머리로 읽게 한다. 이제 구체 예시 대신 살펴볼 갈래만 적고, 앞머리는 fringe 칸에서 종류
 *     (없음·비치는·가벼운·두꺼운 일자·옆으로 넘긴)·길이·가르마를 고르게 한다. 눈(홑꺼풀·모양·크기)·얼굴 길이·턱·콧대·
 *     입술·나이대도 고를 말(/ 로 나눈 것)을 준다 — '보통'으로 뭉개지 않고, 그림이 흔히 어긋나는 쪽을 막는 줄을
 *     그림 프롬프트가 걸 수 있게(lib/family-portrait-prompt driftGuards).
 * 이 줄만 글자 상한이 넉넉하고(DISTINCTIVE_VALUE_MAX), 넘기지 않을 말은 특징 하나씩 걸러 나머지는 살린다(keepTraits).
 * 얼굴 상자(face box): 같은 답 끝줄에 사진 속 얼굴 상자([위, 왼, 아래, 오른] 0~1000)도 받는다 — 글 모델을 더 부르지 않고
 * 얼굴 클로즈업(lib/family-closeup)을 자른다. 상자는 카드 글에 넣지 않는다(readFaceBox 가 따로 읽는다).
 *
 * 개인정보: 카드와 얼굴 상자는 사진에서 읽은 것이라 **사진과 똑같이 다룬다** — 이 요청의 메모리에만 두고 DB·결제 RPC 인자·cafe24·
 * 로그·오류 응답·성공 응답 어디에도 넣지 않는다. 로그에는 결과 갈래(outcome: ok·timeout·http 4xx …)와 걸린 시간만 찍는다.
 * 누구인지·이름은 묻지도 받지도 않는다(프롬프트가 막고, 받은 글도 정해 둔 칸만 남긴다).
 *
 * 실패는 조용히 넘어간다 — 키 없음·한도 막힘·시간 초과·거절·못 읽음이면 카드 없이(null) 그린다. 다시 걸지 않는다(시간은 그리기 몫).
 * 값: 사진 한 장 입력 + 짧은 답이라 한 번에 몇 원(Gemini flash, 2026-09 기준 약 2~6원). 얼굴 상자 줄·길어진 특징 줄은
 * 답이 몇십 토큰 느는 정도라 1원이 안 된다.
 */

import { readBox, type Box } from "./family-head.ts";
import type { PortraitPhoto } from "./family-photo.ts";
import { geminiUsageRow, reportAiUsage } from "./ai-usage.ts";
import { geminiBlocked } from "./gemini.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** 이보다 적은 칸만 읽히면 카드로 쓰지 않는다(거절·딴소리) */
export const CARD_MIN_FIELDS = 5;
/** 한 칸 글자 상한 — 사진 속 글자를 옮겨 적은 긴 글이 그림 프롬프트로 새지 않게 */
export const CARD_VALUE_MAX = 120;
/** 두드러진 특징 줄의 글자 상한 — 특징 3~5개(부탁 글 '25낱말 안팎'). 넘으면 특징 경계에서 자른다. */
export const DISTINCTIVE_VALUE_MAX = 180;

/**
 * 답 길이 상한 — 카드는 200토큰 안팎인데, 생각하는 모델(2.5·3 flash)은 생각 토큰도 이 안에서 쓴다. 너무 낮으면 생각만 하다 빈 답
 * (MAX_TOKENS)이 온다. 이 상한이 곧 값의 상한이다(출력 2048토큰 ≈ $0.006 ≈ 9원).
 */
const CARD_MAX_OUTPUT_TOKENS = 2048;

/**
 * 카드 칸 — 이름(모델이 조금 달리 적어도 받는다). 이 칸만 남기고 나머지 글은 버린다.
 * 성별 칸 이름은 'gender' — 아이 사진 프롬프트에 'sex: female' 이 아이 나이·체형 줄 옆에 놓이면 안전 검사가 오해하기 쉽다.
 * distinctive(가장 두드러진 특징) — 칸마다 '보통'만 적힌 평균 얼굴 카드가 되지 않게. 닮음은 여기서 갈린다.
 *  특징 3~5개라 글자 상한이 따로(max)고, 특징 하나씩 걸러 나머지를 살린다(traits).
 * skin marks(피부의 오래가는 점, 2026-09-30) — 주근깨·점·오래된 흉터. 여러 개라 두드러진 특징 줄처럼 상한이 넉넉하고 하나씩
 *  거른다(여드름·긁힌 자국은 DISTINCTIVE_DROP 로 빠지고 주근깨·점은 남는다). 'none' 도 남긴다(없다는 것도 닮음 — 그림에 얹지 않게).
 *  'no moles' 같은 '없다'는 특징과 얼굴이 아닌 몸 쪽 점은 뺀다(dropNegatedMarks · BODY_PART — 모두 '없다'였으면 'none').
 * fringe(앞머리와 가르마, 2026-09-30) — 머리 칸에서 떼어 종류·길이·가르마를 따로 받는다(머리글 '엄마 사진' ②).
 * 칸을 더해도 카드를 읽는 쪽은 줄 머리('- 칸: ')로만 찾으므로 그대로 맞는다.
 */
const FIELDS: { key: string; names: RegExp; max?: number; traits?: boolean }[] = [
  { key: "gender", names: /^(sex|gender)$/ },
  { key: "age", names: /^(apparent )?age( band)?$/ },
  { key: "distinctive", names: /^(most )?distinctive( (features?|traits?))?$/, max: DISTINCTIVE_VALUE_MAX, traits: true },
  { key: "face shape", names: /^face( shape)?$/ },
  { key: "eyes", names: /^eyes?( shape)?$/ },
  { key: "eyebrows", names: /^(eye)?brows?$/ },
  { key: "nose", names: /^nose$/ },
  { key: "mouth", names: /^(mouth|lips)$/ },
  { key: "cheeks and jaw", names: /^(cheeks?( and |\s*[&/]\s*)(jaw|jawline|chin)|jaw(line)?( and chin)?|cheeks?)$/ },
  { key: "skin tone", names: /^skin( tone)?$/ },
  { key: "skin marks", names: /^(skin |lasting |facial )?marks?$/, max: DISTINCTIVE_VALUE_MAX, traits: true },
  { key: "hair", names: /^hair(style)?$/ },
  { key: "fringe", names: /^(fringe|bangs)( and parting)?$/ },
  { key: "glasses", names: /^(glasses|eyewear)$/ },
  { key: "facial hair", names: /^(facial hair|beard)$/ },
  { key: "build", names: /^(build|body( build)?)$/ },
  { key: "clothing", names: /^(clothing|clothes|outfit)$/ },
];

/** 모른다는 답 — 칸을 비운다('none' 은 남긴다: 안경·수염이 없다는 것도 닮음이다) */
const UNKNOWN = /^(n\/?a|unknown|unclear|not (visible|clear|shown|applicable|determinable)|cannot|can't|unable)\b/i;
/**
 * 그림 프롬프트로 넘기지 않을 값 — 칸째 버린다(모르는 칸과 같이 — 두드러진 특징 줄만 특징 하나씩, keepTraits). 카드는 '그대로 맞출 것'으로 적히므로, 수영복·잠옷·
 * 맨살 같은 옷차림이나 안거나 든 것(다른 사람·물건)이 섞이면 사진 거절을 부르고 대신 그리기까지 같이 막힌다(여름 물놀이
 * 사진이 흔하다). 옷은 그림 프롬프트가 늘 평범한 옷으로 입힌다. 아이·아기 같은 말은 어른 프롬프트에서만 뺀다(lib/family-portrait-prompt).
 */
const UNSAFE_VALUE =
  /\b(swim\w*|bikinis?|bathing|underwear|underpants|lingerie|bras?|briefs|shirtless|topless|bare[- ]?(chest\w*|skin|shoulders?|back|torso|legs?|feet|foot|arms?|body)|naked|nude|pajamas?|pyjamas?|sleepwear|nightwear|nightgown|nightie|bathrobe|towel|diapers?|nappy|nappies|no (top|shirt)|without (a )?(top|shirt)|holding|carrying|hugging|in (his|her|their) arms)\b/i;
/**
 * 두드러진 특징 줄·피부 점 줄(skin marks)에서만 더 빼는 것 — 그날만의 것(모자·머리핀·귀걸이·화장·반창고·긁힌 자국·여드름·
 * 선글라스·마스크 …). 그림 프롬프트는 이 줄들을 '또렷이' 그리게 하므로, 섞이면 '모자는 빼라'(사진 규칙)와 부딪히고 아이 그림에
 * 상처·흠을 얹는다(아이 나이 줄 옆 상처 말은 안전 검사에도 좋지 않다). 부탁 글이 먼저 막고, 이것은 그래도 적힌 것을 거른다.
 * 머리 모양 낱말(bowl cut·hooded eyes·cupid's bow …)은 걸리지 않게 좁게 적었다. 안경은 뺀다 — 평소 안경은 닮음이다.
 * 주근깨·점(mole·beauty mark)·오래된 흉터(scar)는 넣지 않았다 — 오래가는 닮음이다(머리글 '엄마 사진' ①). 아이 그림의 흉터는
 * 그림 프롬프트 쪽(lib/family-portrait-prompt cardFor)이 뺀다.
 */
const PASSING_TRAIT =
  /\b(hats?|caps?|beanies?|hoods?|headbands?|hair ?(clips?|pins?|bands?|ties?|bows?|accessor(y|ies))|hairclips?|hairpins?|ribbons?|earrings?|necklaces?|jewell?ery|piercings?|make-?up|lipstick|eyeliner|mascara|face ?paint\w*|stickers?|plasters?|band-?aids?|bandages?|bruis\w*|scratch\w*|scabs?|wounds?|injur\w*|acne|pimples?|rash|sunburn\w*|sunglasses|masks?)\b/i;
/** 두드러진 특징 줄·피부 점 줄에서 특징 하나씩 빼는 말 = 넘기지 않을 값 + 그날만의 것(주근깨·점은 남는다) */
const DISTINCTIVE_DROP = new RegExp(`${UNSAFE_VALUE.source}|${PASSING_TRAIT.source}`, "i");

/**
 * 얼굴이 아닌 몸 부위 — 피부 점 칸은 얼굴만 묻는다(부탁 글). 그래도 적힌 몸 쪽 점·흉터('mole on the upper arm' ·
 * 'birthmark on the thigh')는 특징 하나씩 뺀다: 아이 사진 프롬프트에서 아이 나이·체형 줄 옆에 몸 부위 말이 놓이면 안전 검사에
 * 걸리기 쉽다(성별 칸을 'gender' 로 적는 것과 같은 까닭). 'bottom' 은 넣지 않았다('bottom lip' 의 점은 얼굴이다).
 * 아이 그림의 두드러진 특징 줄은 그림 프롬프트 쪽(lib/family-portrait-prompt cardFor)이 같은 말로 거른다.
 */
export const BODY_PART =
  /\b(necks?|throats?|napes?|shoulders?|collarbones?|arms?|armpits?|forearms?|elbows?|wrists?|hands?|palms?|fingers?|chest|breasts?|back|belly|tummy|stomach|abdomen|navel|waist|hips?|buttocks?|legs?|thighs?|knees?|shins?|calf|calves|ankles?|feet|foot|toes?|body|torso)\b/i;
/** 피부 점 줄에서 특징 하나씩 빼는 말 = 두드러진 특징 줄과 같은 것 + 얼굴이 아닌 몸 부위 */
const MARKS_DROP = new RegExp(`${DISTINCTIVE_DROP.source}|${BODY_PART.source}`, "i");

/** 점 말(주근깨·점·모반·흉터 …) — '없다'는 말을 걷어 낼 때 무엇이 점 말인지 */
const MARK_NOUN = String.raw`(?:freckl\w*|moles?|beauty (?:marks?|spots?)|birth ?marks?|scars?|marks?|spots?|blemish\w*|dimples?)`;
/**
 * '없다'는 점 말(2026-09-30 검토) — 'no moles' · 'no visible freckles' · 'no freckles or moles' · 'no freckles, moles or scars' ·
 * 'without freckles' · 'freckles: none' · 'mole (none)'. 앞 부정은 점 말이 바로 뒤따를 때만 걸고, 쉼표로 이은 점 말은 끝에
 * or·nor 가 있을 때만 같이 걷는다('no freckles, moles near the mouth' 의 점은 남는다). and 로는 잇지 않는다('no moles and
 * some freckles' 의 주근깨는 남는다). 뒤 부정은 점 말 바로 뒤의 none 만.
 * 이것이 없으면 'no moles' 의 moles 가 그림 프롬프트의 점 막기 줄을 켜서 없는 점을 그리게 했다(lib/family-portrait-prompt marksOf).
 */
const NEGATED_MARK = new RegExp(
  String.raw`\b(?:no|not|never|without|nor)\s+(?:(?:any|visible|obvious|noticeable|other|real)\s+)*${MARK_NOUN}(?:(?:\s*,\s*${MARK_NOUN})*\s*,?\s*\b(?:or|nor)\s+(?:(?:any|visible|other)\s+)?${MARK_NOUN})?|\b${MARK_NOUN}\s*(?:[:(—–-]\s*)?(?:none(?:\s+(?:visible|seen))?|not visible)\b\)?`,
  "gi",
);

/** 글에서 '없다'는 점 말만 걷어 낸다(NEGATED_MARK) — 그림 프롬프트가 주근깨·점 말을 찾기 전에 쓴다 */
export function stripNegatedMarks(text: string): string {
  return text.replace(NEGATED_MARK, " ");
}

/** '없다'는 말뿐인 특징인가 — 'no moles' · 'freckles: none' · 'and no moles' · 'none' */
function negatedOnly(entry: string): boolean {
  if (!entry.trim()) return false;
  const rest = stripNegatedMarks(entry).replace(/\b(none|and|but|or|nor|also|just|only|with)\b/gi, "");
  return !/[a-z0-9]/i.test(rest);
}

/**
 * 피부 점 줄의 '없다'는 특징을 하나씩 뺀다 — 'some freckles; no moles' → 'some freckles', 'freckles: none; one small mole' →
 * 'one small mole'. 세미콜론 특징째 먼저 보고('no freckles, moles or scars' 는 한 특징 — 쉼표로 먼저 쪼개면 'moles or scars'
 * 가 남아 없는 점이 생긴다), 남은 특징 안에서 쉼표 조각을 본다('clear skin, no freckles or moles' → 'clear skin').
 * 모두 '없다'였으면 'none' — 없다는 것도 닮음이다(그림에 얹지 않게).
 */
export function dropNegatedMarks(value: string): string {
  if (!value.trim()) return value;
  const kept = value.split(";").flatMap((entry) => {
    if (negatedOnly(entry)) return [];
    const parts = entry
      .split(",")
      .filter((p) => !negatedOnly(p))
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length ? [parts.join(", ")] : [];
  });
  return kept.length ? kept.join("; ") : "none";
}

/**
 * 글 모델에 주는 부탁 — 담담하게, 누구인지 묻지 않고, 정해 둔 칸만.
 * 알아보게 하는 특징(distinctive)을 먼저 고르게 하고(보통 얼굴과 견줘 3~5개, 생김새의 꼴·크기·자리만 — 잘생김·예쁨은 적지 않는다),
 * 끝줄에 얼굴 상자(face box)를 받는다.
 * 구체 예시 낱말은 적지 않는다(2026-09-30, 머리글 '엄마 사진' ②) — '예시일 뿐'이라고 적어도 예시('a straight blunt fringe' …)가
 * 그대로 옮겨졌다. 대신 살펴볼 갈래(앞머리와 가르마·이마선·얼굴 길이와 턱·쌍꺼풀과 눈 모양 …)만 적고, 칸마다 고를 말을 / 로
 * 나눠 준다 — 고를 말은 모든 사람에게 같은 목록이라 한 사람의 생김새로 당기지 않고, 답이 '보통'으로 뭉개지지도 않는다.
 * 그날만의 흠은 여드름·긁힌 자국·반창고로만 적는다 — 예전 'spots' 는 주근깨·점까지 흠으로 읽혔다(머리글 '엄마 사진' ①).
 * 고를 말 목록에는 보통 쪽 말도 둔다(머리선 normal · 콧대 medium · 입 너비 medium) — '가장 맞는 것을 고르라'는데 보통이 없으면
 * 보통 머리선이 receding, 보통 코가 defined 로 적혀 그림이 늙거나 코가 도드라진다. 피부 점은 얼굴만 묻는다(몸 부위 말 — BODY_PART).
 */
export const FEATURE_CARD_PROMPT = [
  "You help an illustrator paint a friendly picture-book character that looks like the main person in this photo.",
  "Describe that person's visible appearance neutrally and concretely. Do not say or guess who they are or their name, and do not judge or compliment their looks — describe shapes, sizes and positions only.",
  "Start from what makes this face recognisable: pick the 3 to 5 lasting traits of the face, head and hair that most set it apart from other people of the same age and gender who look broadly like them — what someone who knows them would spot at a glance, not traits most such people share (such as dark hair or dark eyes). Only things that stay the same from day to day: never the expression, make-up, face paint, temporary marks (acne, scratches, plasters), hats, hair accessories, jewellery or clothes (everyday glasses may count). Freckles, moles, beauty marks, birthmarks and old scars are lasting traits — count them. Look through every kind of trait — fringe and parting, hairline, face length and chin, eyelids and eye shape, eyebrows, nose bridge, lips, ears, dimples, freckles and moles — and name only what this face really has.",
  "Reply with exactly these 18 lines, in this order, and nothing else. Keep each value short (at most about 12 words; the distinctive and skin marks lines at most about 25). If a trait cannot be seen, write: not visible.",
  "Describe each trait compared with other people of the same age and gender who look broadly like them; write 'average' only when it truly is. Where a line offers choices separated by /, pick the one that fits best. Write left and right as image-left / image-right, as the viewer sees the photo.",
  "gender: woman, man, girl or boy",
  "age: apparent age band from the face itself — early, mid or late + decade for an adult, about N years old for a child",
  "distinctive: those 3 to 5 most recognisable traits, the most noticeable first, separated by semicolons",
  "face shape: long oval / oval / round / square / heart-shaped / diamond, and how long it is for its width (long / balanced / short and wide)",
  "eyes: eyelids (single / inner double / double / hooded), shape (long and narrow / almond / round), size for the face (small / medium / large), tilt (up / down / straight), spacing",
  "eyebrows: thickness, shape, colour",
  "nose: bridge (defined and straight / medium / soft and low / high), size, tip",
  "mouth: lip fullness (thin / medium / full), width (small / medium / wide), smile in the photo (closed-lip / showing teeth)",
  "cheeks and jaw: cheek fullness, cheekbones, dimples, jawline, chin (narrow and pointed / narrow and rounded / rounded / broad / square)",
  "skin tone: e.g. fair, light, medium, tan, deep; warm or cool",
  "skin marks: on the face only, lasting marks only — freckles (a few / some / many, and exactly where), each mole or beauty mark and its place, birthmarks or old scars; or none. Separate them with semicolons",
  "hair: length, texture (straight / wavy / curly / permed), volume, colour, hairline (normal / receding / thinning / bald areas)",
  "fringe: none / see-through wispy / light / full blunt / side-swept; how low it comes (above the brows / at the brows / to the eyes); parting (centre / image-left / image-right / none)",
  "glasses: everyday glasses frame shape, thickness and colour, or none (sunglasses count as none)",
  "facial hair: type and amount, or none",
  "build: slim, average, sturdy or heavy; shoulders",
  "clothing: everyday garments and their colours only (leave out hats, caps, face masks and bags; do not mention any other person or anything held or carried). If they are not wearing ordinary everyday clothes, write: not visible",
  "face box: that person's face, from the top of the forehead to the bottom of the chin and from ear to ear, as [ymin, xmin, ymax, xmax] with each value normalized to 0-1000 over the whole photo",
  "If there is more than one person, describe only the main person in the centre. If no person is clearly visible, reply only: NO_PERSON",
].join("\n");

/** 한 칸 값 다듬기 — 한 줄로, 큰따옴표는 작은따옴표로(그림 프롬프트 인용이 안 깨지게), 끝 문장부호 빼고, 길면 낱말 경계에서 자른다. */
function cleanValue(s: string, max = CARD_VALUE_MAX): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c < 32 || c === 127 ? " " : ch === '"' ? "'" : ch;
  }
  out = out.replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, "");
  return out;
}

/**
 * 특징 여러 개를 적은 값(두드러진 특징 줄·피부 점 줄)을 특징 하나씩 거른다 — drop 에 걸린 특징과 모르는 특징만 빼고 나머지는 살린다.
 * 나눔표는 세미콜론(부탁 글), 세미콜론이 없으면 쉼표로 본다. 적힌 나눔표 그대로 다시 잇고, max 를 넘으면 특징 경계에서 자른다
 * (특징 반쪽이 그림 프롬프트로 가지 않게). 남는 특징이 없으면 빈 글자.
 * 카드 읽기(UNSAFE_VALUE)와 어른 그림의 아이 쪽 말 거르기(lib/family-portrait-prompt cardFor)가 같이 쓴다.
 */
export function keepTraits(value: string, drop: RegExp, max = DISTINCTIVE_VALUE_MAX): string {
  const sep = value.includes(";") ? ";" : ",";
  let out = "";
  for (const raw of value.split(sep)) {
    const trait = raw.trim().replace(/[.;,]+$/, "");
    if (!trait || UNKNOWN.test(trait) || drop.test(trait)) continue;
    const next = out ? `${out}${sep} ${trait}` : trait;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/** 답 글의 '칸: 값' 줄들 — 꾸밈(**굵게**·`코드`·# 제목·> 인용)과 줄머리 기호(- • 1.)를 걷고, 칸 이름은 소문자·빈칸 하나로. */
function namedLines(text: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*`#>]/g, "").replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").trim();
    const at = line.indexOf(":");
    if (at <= 0) continue;
    out.push({ name: line.slice(0, at).trim().toLowerCase().replace(/[_\s]+/g, " "), value: line.slice(at + 1) });
  }
  return out;
}

/**
 * 글 모델의 답 → 특징 카드('- 칸: 값' 줄들, 정해 둔 순서). 정해 둔 칸만 남기고(이름·딴소리는 버린다), 모르는 칸과
 * 넘기지 않을 값(UNSAFE_VALUE — 수영복·맨살·안은 사람 …)은 빼고, 읽힌 칸이 CARD_MIN_FIELDS 보다 적거나 NO_PERSON 이면 null.
 */
export function readFeatureCard(text: string): string | null {
  if (!text || /\bNO_PERSON\b/.test(text)) return null;
  const got = new Map<string, string>();
  for (const { name, value: raw } of namedLines(text)) {
    const field = FIELDS.find((f) => f.names.test(name));
    if (!field || got.has(field.key)) continue;
    // 두드러진 특징 줄·피부 점 줄은 특징 하나씩 거른다 — 한 특징 때문에 가장 중요한 줄을 통째로 잃지 않게. 그날만의 것도 뺀다(PASSING_TRAIT).
    // 피부 점 줄은 '없다'는 특징(no moles …)과 얼굴이 아닌 몸 쪽 점도 뺀다(dropNegatedMarks · BODY_PART).
    const marks = field.key === "skin marks";
    const value = field.traits
      ? keepTraits(
          marks ? dropNegatedMarks(cleanValue(raw, Number.MAX_SAFE_INTEGER)) : cleanValue(raw, Number.MAX_SAFE_INTEGER),
          marks ? MARKS_DROP : DISTINCTIVE_DROP,
          field.max,
        )
      : cleanValue(raw, field.max);
    if (!value || UNKNOWN.test(value) || UNSAFE_VALUE.test(value)) continue;
    got.set(field.key, value);
  }
  if (got.size < CARD_MIN_FIELDS) return null;
  return FIELDS.filter((f) => got.has(f.key))
    .map((f) => `- ${f.key}: ${got.get(f.key)}`)
    .join("\n");
}

/** 얼굴 상자 줄 이름(모델이 조금 달리 적어도 받는다) */
const FACE_BOX_NAME = /^face (box|bbox|bounding box)$/;

/**
 * 글 모델의 답 → 얼굴 상자([위, 왼, 아래, 오른] 0~1000). 'face box:' 줄에서 숫자 넷을 읽는다(대괄호·칸 이름이 섞여도).
 * 넷이 아니거나 범위·순서가 이상하면(lib/family-head readBox) null — 클로즈업 없이 그린다. NO_PERSON 이면 null.
 */
export function readFaceBox(text: string): Box | null {
  if (!text || /\bNO_PERSON\b/.test(text)) return null;
  const line = namedLines(text).find((l) => FACE_BOX_NAME.test(l.name));
  const nums = line?.value.match(/-?\d+(?:\.\d+)?/g);
  return nums && nums.length === 4 ? readBox(nums.map(Number)) : null;
}

/**
 * 특징 카드 한 번의 결과 — outcome·ms 만 로그에 찍는다(card·faceBox 는 찍지 않는다).
 * faceBox 는 카드를 읽었을 때만 준다(카드를 못 읽은 답의 상자는 믿지 않는다).
 */
export type PhotoCardResult = { card: string | null; faceBox: Box | null; ms: number; outcome: string };

type Part = { text?: string; thought?: boolean };

/**
 * 사진 → 특징 카드. 한 번만 부르고, timeoutMs 가 지나면 요청을 끊는다(AbortController — 남겨 두지 않는다).
 * 절대 던지지 않는다: 무엇이 잘못돼도 { card: null, outcome } 로 돌아온다. outcome 에는 사진·카드·구글 답 글을 넣지 않는다.
 */
export async function describePhoto(photo: PortraitPhoto, opts: { timeoutMs: number }): Promise<PhotoCardResult> {
  const startedAt = Date.now();
  const done = (card: string | null, outcome: string, faceBox: Box | null = null): PhotoCardResult => ({
    card,
    faceBox,
    ms: Date.now() - startedAt,
    outcome,
  });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return done(null, "no-key");
  // 한도·결제로 막힌 동안엔 부르지 않는다 — 같은 프로젝트라 어차피 막혀 있다(lib/gemini).
  if (geminiBlocked()) return done(null, "gemini-blocked");
  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-flash-latest";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, opts.timeoutMs));
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ inlineData: { mimeType: photo.mimeType, data: photo.data } }, { text: FEATURE_CARD_PROMPT }],
          },
        ],
        // 낮은 온도 — 같은 사진이면 같은 카드. 생각 설정(thinking)은 모델마다 받는 칸이 달라 넣지 않았다(검수와 같은 설정).
        generationConfig: { temperature: 0.2, maxOutputTokens: CARD_MAX_OUTPUT_TOKENS },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // 본문은 읽지 않는다 — 구글의 오류 글은 보낸 값을 되읊는 일이 있다.
      await res.body?.cancel().catch(() => undefined);
      return done(null, `http ${res.status}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    // 모델·토큰·금액 기록(lib/ai-usage) — 토큰 수만 남는다(사진·카드·구글 답 글은 넣지 않는다).
    reportAiUsage(geminiUsageRow(model, "photo-card", json));
    const block = json.promptFeedback?.blockReason;
    if (block) return done(null, `blocked ${String(block).slice(0, 40)}`);
    const candidate = json.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("\n");
    const card = readFeatureCard(text);
    if (card) return done(card, "ok", readFaceBox(text));
    if (/\bNO_PERSON\b/.test(text)) return done(null, "no-person");
    const finish = candidate?.finishReason;
    return done(null, finish && finish !== "STOP" ? `finish ${String(finish).slice(0, 40)}` : "unreadable");
  } catch (e) {
    return done(null, ctrl.signal.aborted ? "timeout" : e instanceof SyntaxError ? "unreadable" : "network");
  } finally {
    clearTimeout(timer);
  }
}
