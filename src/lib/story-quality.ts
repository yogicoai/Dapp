import type { ParsedStory } from "./story-format";

export class StoryQualityError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(" "));
    this.name = "StoryQualityError";
    this.issues = issues;
  }
}

function compact(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, "").replace(/[^가-힣A-Za-z0-9]/g, "");
}

const LOCATION_PATTERN = /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/;
/**
 * `물건: 이름 — 고정 모습.` — 두 쪽 이상 나오는 물건을 잠그는 줄.
 *
 * 장소와 달리 g 플래그를 쓴다. 한 쪽에 물건이 둘까지 나올 수 있어서다.
 * (g 정규식은 lastIndex를 들고 다녀 재사용하면 결과가 밀린다 — 쓸 때마다 새로 만든다.)
 */
const PROP_SOURCE = "물건\\s*:\\s*([^\\n—.-]+?)\\s*[—-]\\s*([^\\n.]+)";
/*
 * '이 쪽에서 자리를 옮겼다'고 볼 만한 말들.
 *
 * 이게 없으면 장소가 앞 쪽으로 되돌려진다 — 옮겼다는 신호를 못 찾으면 "실수로
 * 장소가 바뀐 것"으로 보고 고쳐 버리기 때문이다. 그래서 여기 빠진 표현이 있으면
 * 이야기가 밖으로 나가도 그림은 계속 집 안이다(실제로 겪었다:
 * 「하얀 고래 책」이 집 식탁 장면에서도 도서관을 그렸고,
 * 「첫눈」은 눈사람을 만드는 쪽까지 거실이었다).
 *
 * 옛 목록은 '갔/나가/도착' 같은 몇 개뿐이라, 아이 동화에서 흔한 이동 표현을
 * 대부분 놓쳤다 — 현관문을 열자 / 밖으로 나왔어요 / 집에 들어와 / 오는 길에 /
 * 저녁에. 넉넉히 잡는 편이 안전하다. 잘못 잡으면 장소가 한 번 더 바뀔 뿐이지만,
 * 못 잡으면 그림이 통째로 딴 곳이 된다.
 */
const MOVE_PATTERN =
  /(가기로|가던|갔|가요|갑니다|도착|출발|나섰|나가|나와|나왔|들어갔|들어와|들어서|돌아왔|돌아와|돌아오|돌아가|돌아온|옮겼|이동|건너갔|향했|찾아갔|올라갔|내려갔|뛰어갔|달려갔|따라갔|데려갔|따라나|현관|문을\s*열|밖으로|안으로|집으로|로\s*가|에\s*가|다음\s*날|이튿날|그날\s*(아침|점심|오후|저녁|밤)|아침이\s*되|저녁이\s*되|밤이\s*되|사흘|일주일|여름이\s*되|겨울이\s*되|잠시\s*후|한참\s*뒤|얼마\s*뒤|집을\s*나서|차를\s*타|버스를\s*타|걸어서|디뎠|디디|오는\s*길|가는\s*길|저녁에|아침에|낮에|밤에|점심에)/;

type LocationHint = { family: string; name: string; description: string; index: number };

/*
 * 본문에서 '어디인지'를 읽어 내는 목록.
 *
 * 여기 없는 곳은 못 알아본다. 그리고 못 알아보면 **앞 쪽 장소로 되돌려 버린다** —
 * 이야기가 밖으로 나갔는데 그림은 계속 집 안이 되는 원인이다. 그래서 아이 동화에
 * 실제로 나오는 곳을 넉넉히 적어 둔다.
 *
 * 설명은 요즘 한국 기준으로 쓴다. 예전에는 집이 "따뜻한 벽과 나무 바닥"뿐이라
 * 모델이 그 빈 곳을 마당 있는 옛날 집으로 채웠다.
 */
function inferLocationFromText(text: string): LocationHint | null {
  const hints = locationHints(text);
  // 점수가 높은 곳이 '지금 있는 곳'. 같으면 뒤에 나온 것을 쓴다(가다가 도착한 곳).
  // 음수는 '아직 안 간 곳'이나 '물건을 보낼 곳'이라 있는 곳이 아니다 — 고르지 않는다.
  const best = hints.filter((h) => h.score >= 0).sort((a, b) => b.score - a.score || b.index - a.index)[0] ?? null;
  return best ? inVenue(best, hints) : null;
}

/** 글에 나오는 장소 낱말을 전부 찾는다(점수 포함). 고르는 일은 부르는 쪽이 한다. */
function locationHints(text: string): (LocationHint & { score: number })[] {
  const definitions = [
    {
      family: "home",
      /*
       * '방'은 앞글자를 봐야 한다. 그냥 /방/으로 잡으면 주방·가방·책방의 뒷글자까지
       * 방(room)으로 읽어, 주방 장면이 거실로 되돌려졌다(실제로 시험에서 잡혔다).
       * 그래서 방 앞에 다른 한글이 붙어 있으면 제외한다(안방·건넌방은 따로 적는다).
       */
      re: /([가-힣]{1,8}네\s*집|우리\s*집|집\s*(?:안|에서|으로|에)|거실|놀이방|침실|안방|건넌방|(?<![가-힣])방\s*(?:안|에서|으로|에))/g,
      /*
       * 요즘 아이가 사는 집으로 못박는다. '친구 집에 놀러 간다'는 동화에 제일 자주
       * 나오는 장면인데, 설명이 비어 있으면 거기서 툇마루와 대문이 튀어나왔다.
       */
      description: "크림색 벽과 밝은 나무 마루, 큰 창과 커튼, 낮은 소파와 장난감 선반이 있는 요즘 아파트 거실",
    },
    { family: "kitchen", re: /(주방|부엌|식탁)/g, description: "밝은 나무 식탁과 낮은 의자, 크림색 주방 수납장" },
    { family: "entrance", re: /(현관|신발장)/g, description: "신발장과 낮은 문턱, 밝은 타일 바닥의 좁은 아파트 현관" },
    { family: "veranda", re: /(베란다|발코니)/g, description: "큰 유리창과 빨래 건조대, 화분 몇 개가 놓인 베란다" },
    { family: "corridor", re: /(복도|엘리베이터|계단참)/g, description: "밝은 조명과 회색 타일 바닥의 아파트 복도" },
    { family: "playground", re: /(놀이터|공원|모래밭|그네|미끄럼틀)/g, description: "노란 미끄럼틀과 둥근 모래밭, 나무 벤치" },
    /*
     * '길'은 조심한다 — "물감이 흘러가는 길을 따라가"의 '가는 길'을 길거리로 읽어 교실 장면이
     * 아스팔트 길이 됐다(실제로 났다). '가는 길'은 앞에 다른 한글이 없을 때만(집으로 가는 길),
     * '길을'(목적어)은 빼고 '길에서·길에'만 본다.
     */
    { family: "street", re: /(골목|길가|(?<![가-힣])가는\s*길|(?<![가-힣])오는\s*길|(?<![가-힣])길\s*(?:에서|에)|동네|횡단보도|버스\s*정류장|단지)/g, description: "회색 아스팔트 길과 낮은 담, 가로수와 상가 간판 없는 건물" },
    { family: "yard", re: /(마당|텃밭|화단)/g, description: "흙바닥과 낮은 화단, 담장 옆 작은 나무" },
    { family: "forest", re: /(숲길|숲속|숲|산길|산속)/g, description: "키 큰 푸른 나무와 흙길, 낮은 꽃덤불" },
    { family: "water", re: /(계곡|시냇물|개울|연못)/g, description: "맑은 물과 회색 자갈 바닥, 물가의 넓적한 바위" },
    { family: "sea", re: /(바다|바닷가|해변|모래사장)/g, description: "푸른 바다와 하얀 파도, 밝은 모래사장" },
    { family: "school", re: /(유치원|어린이집|학교|교실)/g, description: "밝은 벽과 큰 창문, 낮은 책상과 장난감 수납장" },
    { family: "library", re: /(도서관|서점)/g, description: "키 큰 나무 책장과 큰 창문, 낮은 열람 책상" },
    { family: "shop", re: /(마트|가게|시장|편의점)/g, description: "정돈된 진열대와 넓은 통로, 밝은 실내 조명" },
    { family: "restaurant", re: /(식당|고깃집|분식집|카페)/g, description: "나무 식탁과 의자, 따뜻한 조명이 걸린 실내" },
    { family: "hospital", re: /(병원|진료실|치과)/g, description: "밝은 벽과 의자, 정돈된 진료 공간" },
    { family: "zoo", re: /(동물원|수족관)/g, description: "울타리와 넓은 관람 통로, 푸른 나무" },
    { family: "pool", re: /(수영장|물놀이장)/g, description: "파란 물과 흰 타일 바닥, 알록달록한 튜브" },
    /*
     * 차와 대중교통을 갈라 둔다.
     *
     * 예전엔 한 덩어리라 설명이 "좌석과 손잡이"였다. 손잡이는 버스·지하철 물건이라,
     * 가족이 자기 차로 가는 장면에도 손잡이가 달린 통로가 그려졌다.
     * 아이가 아는 "우리 차 뒷자리"와 전혀 다른 그림이 된다.
     */
    {
      family: "car",
      re: /(자동차\s*(?:안|에서)|(?<![기전마])차\s*(?:안|에서)|카시트|뒷자리|뒷좌석)/g,
      description: "뒷좌석 안전벨트와 창문, 앞자리 등받이가 보이는 승용차 안, 창밖으로 흐르는 도시 풍경",
    },
    {
      family: "transit",
      re: /(버스\s*(?:안|에서)|지하철|전철|기차\s*(?:안|에서))/g,
      description: "나란히 놓인 좌석과 천장 손잡이, 창밖 풍경이 흐르는 차량 안",
    },
  ];
  const hints: (LocationHint & { score: number })[] = [];
  for (const definition of definitions) {
    for (const match of text.matchAll(definition.re)) {
      const at = match.index ?? 0;
      const after = text.slice(at + match[0].length, at + match[0].length + 12);
      hints.push({
        family: definition.family,
        name: match[0].replace(/\s+/g, " "),
        description: definition.description,
        index: at,
        score: locusScore(after),
      });
    }
  }
  return hints;
}

/*
 * 실내인가 — 프롬프트의 배경 지시를 가르는 기준.
 *
 * "요즘 한국" 배경 지시가 아파트·보도·가로수처럼 **바깥 것**만 나열하고 있어서, 실내
 * 장면에도 그대로 들어가면 마트 진열대가 보도 위에 나오고 뒤에 아파트가 선다
 * (실제로 났다 — 마트 장난감 코너가 마트 문 앞 길거리로 그려졌다). 장소 이름·설명으로
 * 실내를 알아보고, 실내면 안쪽만 그리라고 따로 이른다.
 */
/*
 * 낱말 경계에 특히 조심한다 — 글자 조각에 걸리면 실내가 실외가 된다.
 *   '계산대'의 산 → 실외, '하늘색 벽'의 하늘 → 실외, '먹거리'의 거리 → 실외.
 * 실제로 마트 계산대 장면이 실외로 판정돼 길거리 배경 지시가 들어갔다.
 */
const INDOOR_WORDS =
  /(마트|가게|상점|편의점|백화점|코너|매장|계산대|진열대|거실|안방|침실|놀이방|부엌|주방|식탁|욕실|화장실|현관|복도|교실|어린이집|유치원|학교|도서관|서점|식당|카페|병원|진료실|치과|(?<!야외\s?)수영장|수족관|실내|방\s*(?:안|에서)|(?<![가-힣])방(?![가-힣])|집\s*안|안에서|차\s*안|버스\s*안|지하철|엘리베이터|목욕탕|찜질방|극장|영화관|박물관|미술관|체육관|사무실|공항|기차\s*안|침대|옷장|책상|소파|커튼|천장|벽지)/;
const OUTDOOR_WORDS =
  /(야외|옥외|바깥|놀이터|공원|마당|운동장|골목|길가|(?<![가-힣])거리(?![가-힣])|바닷가|해변|바다|계곡|숲|뒷산|앞산|산속|산길|등산|(?<![가-힣])산(?![가-힣])|들판|논밭|(?<![가-힣])논(?![가-힣])|텃밭|(?<![가-힣])밭(?![가-힣])|강가|호숫가|캠핑장|정류장|횡단보도|주차장|옥상|베란다|하늘(?!색)|눈밭)/;

/** 장소 이름과 설명을 보고 실내인지 정한다. 둘 다 아니면 null(모름). */
export function isIndoorPlace(name: string, description = ""): boolean | null {
  // '야외 수영장'처럼 대놓고 밖이라고 적은 곳은 다른 낱말과 겨루지 않고 바로 실외.
  if (/(야외|옥외|바깥)/.test(name)) return false;
  // 마지막에 나온 낱말이 이긴다 — 한국어는 머리 명사가 뒤에 온다.
  // "마트 앞 주차장"은 주차장(바깥), "놀이터 옆 편의점"은 편의점(실내).
  const lastAt = (re: RegExp, text: string) => {
    let last = -1;
    for (const m of text.matchAll(new RegExp(re.source, "g"))) last = m.index ?? last;
    return last;
  };
  // 이름이 정하고, 이름에 단서가 없을 때만 설명을 본다.
  for (const text of [name, description]) {
    const indoorAt = lastAt(INDOOR_WORDS, text);
    const outdoorAt = lastAt(OUTDOOR_WORDS, text);
    if (indoorAt >= 0 || outdoorAt >= 0) return indoorAt > outdoorAt;
  }
  return null;
}

/**
 * 차 안(달리는 차의 실내)인가.
 *
 * 왜 따로 보는가 — 자동차 실내는 그림이 가장 자주 무너지는 자리다. 좌석이 앞뒤로
 * 겹쳐 보이는 좁은 공간이라, 사람을 여럿 넣으면 누가 어느 자리에 앉았는지가
 * 뒤엉킨다. 실제로 엄마가 앞자리와 뒷자리 사이에 떠 있는 그림이 나왔다(사장님 확인).
 * 다른 장소에는 없는 문제라, 이 장면에만 좌석 규칙을 더 붙이려고 가려낸다.
 *
 * '주차장·정비소'처럼 차가 나오지만 실내가 아닌 곳은 뺀다 — 그 장면의 문제는 다르다.
 */
// 앞 글자를 본다 — '기차·열차·전차·마차·유모차'는 자동차가 아니다.
// 이걸 안 보면 "기차를 타고 할머니 댁에"가 차 안으로 잡혀 엉뚱한 쪽에 좌석 규칙이 붙는다.
const IN_CAR_WORDS =
  /(?<![기열전마모])(차 ?안|차안|자동차 ?안|승용차|택시 ?안|버스 ?안|카시트|뒷좌석|뒷자리|앞좌석|조수석|운전석|차창|차를 ?타|드라이브)/;
const NOT_IN_CAR_WORDS = /(주차장|정비소|세차|차고|주유소)/;

export function isInsideCar(name: string, description = ""): boolean {
  const text = `${name} ${description}`;
  if (NOT_IN_CAR_WORDS.test(text)) return false;
  return IN_CAR_WORDS.test(text);
}

/** 목록에 있는 장소인가 — 있으면 계열 이름, 없으면 null. */
export function knownPlaceFamily(name: string): string | null {
  return inferLocationFromText(name)?.family ?? null;
}

/**
 * 장소 이름 → 같은 곳끼리 묶는 열쇠.
 *
 * 장소 기준 그림은 이름 글자로 찾았다. "놀이터"·"동네 놀이터"·"아파트 놀이터"는 셋 다
 * 다른 키가 되어 각자 첫 그림을 새로 상상했다 — 같은 놀이터인데 미끄럼틀이 쪽마다
 * 달랐다. 클로드에게 "한 글자도 다르지 않게 반복하라"고 시켜도 모델은 말을 바꾼다.
 * 그래서 이름이 아니라 **계열**로 묶는다.
 *
 * 집은 방을 가른다 — 아이 방과 거실은 다른 그림이어야 한다. 큰 건물(어린이집·도서관)
 * 안의 자리는 건물까지 붙인다 — 어린이집 현관과 아파트 현관은 다른 곳이다.
 * 목록에 없는 곳은 꾸밈말만 떼고 이름 자체로 묶는다.
 */
export function locationKeyOf(name: string): string {
  // 꾸밈말을 먼저 뗀다 — '동네'는 길 계열 낱말이라, 떼지 않으면 "동네 캠핑장"이 길이 된다.
  const bare = name
    .normalize("NFC")
    .trim()
    .replace(/^(?:(?:동네|우리|낯선|작은|큰|근처|아파트|시골|새|옛|어느|우리\s*집)\s*)+/, "")
    .trim();
  const cleaned = compact(bare) || compact(name);
  if (!cleaned) return "";
  const hint = inferLocationFromText(bare || name);
  if (!hint) {
    // 목록에 없는 곳 — '~방'으로 끝나면 집 안의 방(아이 방·하온이 방), 아니면 이름 자체로 묶는다.
    if (/방$/.test(cleaned) && !/(주방|가방|책방|찜질방|노래방)$/.test(cleaned)) return "home:room";
    return cleaned;
  }
  let base = hint.family;
  if (base === "home") {
    if (/거실/.test(bare)) base = "home:living";
    else if (/침실|안방|건넌방|놀이방|(?<![가-힣])방(?![가-힣])/.test(bare) || /방$/.test(cleaned)) base = "home:room";
  }
  const venue = locationHints(bare || name).find((h) => VENUE_FAMILIES.has(h.family));
  return venue && venue.family !== hint.family ? `${venue.family}:${base}` : base;
}

/**
 * '어디의' 신발장인지까지 본다.
 *
 * 실제로 이런 사고가 났다 — 어린이집 소풍 이야기의 1쪽 본문이
 * "어린이집 교실이 시끌시끌했어요 … 신발장 앞도 북적북적했어요"인데,
 * 뒤에 나온 '신발장'이 뽑혀 장소가 **"좁은 아파트 현관"**이 됐다.
 * 그림은 아파트 현관과 어린이집 교실을 문틀로 갈라 붙인 이상한 그림이 나왔다.
 *
 * 현관·복도·마당·거실은 **건물의 부분**을 가리키는 말이라, 그 건물이 무엇인지가
 * 정해지지 않으면 기본값(집=아파트)으로 떨어진다. 그래서 같은 글에 어린이집·학교
 * 같은 **건물 이름**이 함께 있으면 그쪽을 먼저 세우고, 부분은 그 건물 안의 말로
 * 바꿔 적는다.
 */
const VENUE_FAMILIES = new Set(["school", "library", "shop", "restaurant", "hospital", "zoo", "pool"]);
const HOME_PART_FAMILIES = new Set(["home", "entrance", "corridor", "yard", "veranda", "kitchen"]);
/** 여기로 옮기면 앞의 큰 장소를 떠난 것이다. */
const LEAVES_VENUE = new Set(["car", "transit", "home", "street"]);
const VENUE_PART: Record<string, Record<string, string>> = {
  school: {
    entrance: "나무 신발장이 줄지어 선 어린이집 현관, 낮은 문턱과 밝은 타일 바닥",
    corridor: "밝은 어린이집 복도, 아이 키 높이 옷걸이와 낮은 게시판",
    yard: "어린이집 앞마당, 낮은 울타리와 작은 나무",
    home: "밝은 벽과 큰 창문, 낮은 책상과 장난감 수납장이 있는 어린이집 교실",
    kitchen: "낮은 식탁과 작은 의자가 줄지어 놓인 어린이집 급식실",
  },
};

function inVenue(
  best: LocationHint & { score: number },
  hints: (LocationHint & { score: number })[],
): LocationHint {
  if (VENUE_FAMILIES.has(best.family)) return best;
  const venue = hints.find((h) => VENUE_FAMILIES.has(h.family));
  if (!venue) return best;
  const override = VENUE_PART[venue.family]?.[best.family];
  if (override) return { ...best, name: `${venue.name} ${best.name}`.trim(), description: override };
  // 그 건물 안의 말이 마련돼 있지 않으면, 집 기본값으로 떨어지느니 건물 자체를 쓴다.
  return HOME_PART_FAMILIES.has(best.family) ? venue : best;
}

/**
 * 그 장소가 '지금 인물이 있는 곳'인지, '멀리서 이야기하는 곳'인지를 가른다.
 *
 * 한 쪽에 두 장소가 나오면 예전에는 무조건 **뒤에 나온 것**을 골랐다. 그런데
 * 이런 문장에서 어긋난다:
 *   "집에 돌아와 하온이는 창가에 앉았어요. 마당에는 눈사람이 서 있었어요."
 * 아이는 집에 있고 마당은 창밖으로 보이는 곳일 뿐인데, 뒤에 있다는 이유로
 * 마당이 뽑혔다. 그래서 그림이 밖에서 그려질 뻔했다.
 *
 * 뒤에 붙는 말이 단서다.
 *   "~에 도착/에 들어/으로 갔"  → 거기로 간 것이다 (있는 곳)
 *   "~에는/~에도 … 있었어요"    → 그곳을 설명하는 것이다 (보이는 곳)
 */
function locusScore(after: string): number {
  /*
   * 아직 가지 않은 곳은 '있는 곳'이 아니다.
   *
   * 실제 사고 — "집으로 가는 길, … 우리 놀이터 잠깐만 가면 안 돼?" 라고 조른 쪽의
   * 그림이 이미 놀이터였다. 다음 쪽 첫 문장이 "놀이터에 도착하자"인데도 그렇다.
   * 조르는 말·가자는 말 속의 장소는 **다음에 갈 곳**이지 지금 서 있는 곳이 아니다.
   */
  if (/^[^.!?\n]{0,8}(?:가면|가자|갈까|갈래|가고\s*싶|가 볼|가 보자|갈\s*거|갈게|가야)/.test(after)) return -3;
  // "집에 가져 갈거예요" — 물건을 보낼 곳이지 서 있는 곳이 아니다(실제로 교실이 거실이 됐다).
  if (/^\s*(?:가져|갖다|가지고|보내|데려|두고)/.test(after)) return -3;
  // "집으로 가는 길" — 집이 아니라 길 위에 있다.
  if (/^\s*(?:가는|오는|가던|오던)\s*길/.test(after)) return -3;
  if (/^(?:에는|에도)/.test(after)) return -2; // 그곳을 '설명'하는 말
  if (/^(?:에\s*도착|에\s*들어|으로\s*가|로\s*가|에\s*갔|으로\s*나|에서\s*나)/.test(after)) return 2;
  if (/^(?:에서|에)/.test(after)) return 1; // 그 자리에서 무언가 한다
  return 0;
}

function locationFamily(text: string): string {
  if (compact(text) === "방") return "home";
  return inferLocationFromText(text)?.family ?? compact(text);
}

/**
 * 같은 물건이 쪽마다 다른 물건이 되지 않게, 처음 적은 한 줄로 되돌린다.
 *
 * 1쪽은 "콘에 담긴 딸기 아이스크림", 3쪽은 "컵에 담긴 초코 아이스크림"이 되는 사고가
 * 흔하다 — 아이는 같은 물건으로 못 알아본다. 프롬프트로 "한 글자도 다르지 않게
 * 반복하라"고 일러도 모델은 말을 바꾼다. 그래서 코드로 되돌린다: 그 물건 이름이
 * 처음 나온 줄이 그 책의 정답이고, 뒤에서 뭐라 썼든 그 줄로 갈아 끼운다.
 */
function lockProps(imagePrompt: string, fixedProps: Map<string, string>): string {
  return imagePrompt.replace(new RegExp(PROP_SOURCE, "g"), (clause, rawName: string) => {
    const key = compact(rawName);
    if (!key) return clause;
    const canonical = fixedProps.get(key);
    if (canonical) return canonical;
    fixedProps.set(key, clause);
    return clause;
  });
}

/** 모델이 장소 문구를 조금씩 바꿔도 이미지 생성 전에 이전 장면과 같은 장소로 정규화한다. */
export function repairStoryContinuity(story: ParsedStory): ParsedStory {
  const fixedLocations = new Map<string, string>();
  const fixedProps = new Map<string, string>();
  let previous: { name: string; clause: string; text: string } | null = null;
  /*
   * '지금 어느 건물 안인가'를 쪽을 넘어 기억한다.
   *
   * 실제 사고 — 4쪽에서 동물원에 들어갔는데 5·6·7쪽 장소가 그냥 "잔디밭과 벤치"가
   * 됐고, 그림은 동물원이 아니라 깊은 숲속 공터로 나왔다. 아이가 보기엔 소풍 가서
   * 갑자기 숲에 온 것이다. 동물원·학교·도서관처럼 **큰 장소**는 그 안의 작은 장소
   * (잔디밭·복도·벤치)로 옮겨도 사라지지 않는다.
   *
   * 버스를 타거나 집으로 가면 그 건물을 떠난 것이므로 잊는다.
   */
  let venue: LocationHint | null = null;
  const pages = story.pages.map((page) => {
    // 물건 잠금은 장소 손질과 얽히지 않는다 — 먼저 끝내 두면 아래 어느 갈래로 빠져도 적용된다.
    let imagePrompt = lockProps(page.imagePrompt, fixedProps);
    let location = LOCATION_PATTERN.exec(imagePrompt);
    /*
     * 장소 단서는 본문뿐 아니라 **장면 문장**에서도 읽는다.
     *
     * 장면 문장이 곧 그려질 그림이다. 실제로 1쪽 장면이 "하온이는 교실 가운데 앉아"
     * 인데 장소 줄은 "아파트 현관"이었고, 둘이 어긋난 채로 그림이 나갔다.
     * 어긋나는지 아무도 검사하지 않아 지금까지 그대로 통과했다.
     */
    const sceneOnly = imagePrompt
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:등장인물|장소\s*:|물건\s*:)/.test(line))
      .join(" ");
    const textLocation = inferLocationFromText(`${page.text} ${sceneOnly}`);
    /*
     * 클로드가 적은 장소 이름이 본문에도 그대로 있으면 그것이 곧 근거다.
     *
     * 예전엔 목록에 없는 곳(캠핑장·호숫가·목욕탕…)을 못 알아보고, 본문에 목록 낱말이
     * 하나라도 있으면(숲·공원) 그쪽 기성 문구로 통째로 갈아 끼웠다 — "장소: 캠핑장 —
     * 텐트와 모닥불"이 "장소: 숲속 — 키 큰 푸른 나무와 흙길"이 되는 식이다. 글은
     * 캠핑장인데 그림은 숲. 이제 이름이 본문에 있거나 목록에 없는 곳이면 클로드를 믿는다.
     * 갈아 끼우는 것은 **목록에 있는 두 곳이 정면으로 다를 때**(숲길 ↔ 태이네 집)뿐이다.
     */
    const nameInText = location ? compact(page.text).includes(compact(location[1])) : false;
    const claudeFamily = location ? knownPlaceFamily(location[1]) : null;
    /** 목록엔 없지만 본문이 그 이름을 부르는 곳(캠핑장·목욕탕) — 클로드가 맞다. */
    const unknownButNamed = claudeFamily === null && nameInText;
    /*
     * 앞 쪽과 같은 곳을 클로드가 적었는데 본문 낱말 하나로 딴 곳으로 바꾸는 건 위험하다 —
     * 그림책은 한 자리에서 이야기가 깊어진다. 이동 표현이 있을 때만 바꾼다.
     */
    const sameAsPrevious = Boolean(location && previous && locationKeyOf(location[1]) === previous.name);
    const moved = MOVE_PATTERN.test(page.text);
    if (
      location &&
      textLocation &&
      claudeFamily &&
      claudeFamily !== textLocation.family &&
      !(sameAsPrevious && !moved)
    ) {
      const correctedClause = `장소: ${textLocation.name} — ${textLocation.description}`;
      imagePrompt = imagePrompt.replace(location[0], correctedClause);
      location = LOCATION_PATTERN.exec(imagePrompt);
    }
    if (!location) {
      if (previous && !MOVE_PATTERN.test(`${previous.text} ${page.text}`)) {
        imagePrompt = `${previous.clause}. ${imagePrompt}`;
        previous = { ...previous, text: page.text };
      }
      return { ...page, imagePrompt };
    }

    // 같은 곳끼리 묶는 열쇠 — 이름 글자가 아니라 계열로 본다("놀이터" = "동네 놀이터").
    const name = locationKeyOf(location[1]);
    let clause = location[0];
    /*
     * 앞 쪽으로 되돌릴지 정하는 자리.
     *
     * 예전에는 '이동을 뜻하는 낱말'이 있는지만 봤다. 낱말 목록은 아무리 넓혀도
     * 새는 곳이 생기고, 새면 이야기가 밖으로 나갔는데 그림은 계속 집 안이 된다.
     *
     * 그래서 판단 근거를 하나 더 둔다 — **본문이 장소를 말하고 있으면 그것을 믿는다.**
     * 본문에 "놀이터"라고 적혀 있는데 앞 쪽이 거실이었다는 이유로 거실로 되돌리는 건,
     * 글을 무시하고 앞 그림을 따르는 셈이다. 글이 먼저다.
     * 되돌리는 것은 **본문이 아무 장소도 말하지 않고, 이동 표현도 없을 때**뿐이다 —
     * 그때만 '모델이 괜히 장소를 바꿨다'고 볼 수 있다.
     */
    if (
      previous &&
      previous.name !== name &&
      !textLocation &&
      !unknownButNamed &&
      !MOVE_PATTERN.test(`${previous.text} ${page.text}`)
    ) {
      imagePrompt = imagePrompt.replace(location[0], previous.clause);
      clause = previous.clause;
      previous = { ...previous, text: page.text };
      return { ...page, imagePrompt };
    }

    const canonical = fixedLocations.get(name);
    if (canonical) {
      imagePrompt = imagePrompt.replace(location[0], canonical);
      clause = canonical;
    } else {
      const family = textLocation?.family ?? locationFamily(location[1]);
      if (VENUE_FAMILIES.has(family)) {
        venue = textLocation ?? { family, name, description: "", index: 0 };
      } else if (LEAVES_VENUE.has(family)) {
        venue = null;
      } else if (venue && !MOVE_PATTERN.test(page.text) && !clause.includes(venue.name)) {
        // 이 쪽에서 자리를 옮기는 말이 없으면 아직 그 건물 안이다.
        // 큰 장소 안의 작은 자리다 — 이름과 설명 양쪽에 그 건물을 남긴다.
        const withVenue = clause
          .replace(/^장소:\s*/, `장소: ${venue.name} `)
          .replace(/\.?$/, `, ${venue.name} 안`);
        imagePrompt = imagePrompt.replace(location[0], withVenue);
        clause = withVenue;
      }
      fixedLocations.set(name, clause);
    }
    previous = { name, clause, text: page.text };
    return { ...page, imagePrompt };
  });
  return { ...story, pages };
}

/** 판매를 중단해야 할 치명적 오류와, 자동 보정·이미지 QA로 처리할 권고를 분리한다. */
export function isBlockingStoryQualityIssue(issue: string): boolean {
  return /(페이지 수가|주인공 이름|본문이 지나치게 짧|다른 페이지와 중복|아동용 이야기로 사용할 수 없는)/.test(issue);
}

/** 추가 AI 호출 없이 판매 전 최소 품질을 거르는 보수적인 검사다. */
export function validateStoryQuality(
  story: ParsedStory,
  input: { childName: string; age: number; expectedPages: number; requiredTerms?: string[] },
): string[] {
  const issues: string[] = [];
  if (story.pages.length !== input.expectedPages) {
    issues.push(`페이지 수가 ${input.expectedPages}쪽이 아닙니다.`);
  }
  const allText = `${story.title} ${story.pages.map((page) => page.text).join(" ")}`;
  if (!allText.normalize("NFC").includes(input.childName.normalize("NFC"))) {
    issues.push(`주인공 이름 '${input.childName}'이 본문에 없습니다.`);
  }
  for (const term of input.requiredTerms ?? []) {
    if (term && !allText.normalize("NFC").includes(term.normalize("NFC"))) {
      issues.push(`처음 입력한 핵심 정보 '${term}'이 이야기에서 빠졌습니다.`);
    }
  }

  const seen = new Set<string>();
  const locationDescriptions = new Map<string, string>();
  let previousLocation: { name: string; label: string; text: string } | null = null;
  story.pages.forEach((page, index) => {
    const normalized = compact(page.text);
    if (normalized.length < 25) issues.push(`${index + 1}쪽 본문이 지나치게 짧습니다.`);
    if (normalized.length > (input.age <= 5 ? 620 : 900)) issues.push(`${index + 1}쪽 본문이 연령에 비해 지나치게 깁니다.`);
    if (seen.has(normalized)) issues.push(`${index + 1}쪽 본문이 다른 페이지와 중복됩니다.`);
    seen.add(normalized);
    if ((page.text.match(/"/g) ?? []).length % 2 !== 0) issues.push(`${index + 1}쪽의 대화 따옴표가 닫히지 않았습니다.`);
    if (page.text.split(/[.!?。！？]\s*/).some((sentence) => compact(sentence).length > (input.age <= 5 ? 125 : 180))) {
      issues.push(`${index + 1}쪽에 아이가 듣기 지나치게 긴 문장이 있습니다.`);
    }

    const mentionedCharacters = story.characters.filter((character) =>
      character.name && page.text.normalize("NFC").includes(character.name.normalize("NFC")),
    );
    for (const character of mentionedCharacters) {
      if (!page.imagePrompt.normalize("NFC").includes(character.name.normalize("NFC"))) {
        issues.push(`${index + 1}쪽 삽화 장면에서 누락된 본문 인물: '${character.name}'.`);
      }
    }
    const declaredCount = /등장인물\s*(\d+)명/.exec(page.imagePrompt)?.[1];
    if (declaredCount && Number(declaredCount) < mentionedCharacters.length) {
      issues.push(`${index + 1}쪽 삽화의 등장인물 수가 본문에 나온 인물보다 적습니다.`);
    }
    const location = LOCATION_PATTERN.exec(page.imagePrompt);
    if (!location) {
      issues.push(`${index + 1}쪽 삽화에 고정 장소 설명이 없습니다.`);
    } else {
      const placeName = compact(location[1]);
      const description = compact(location[2]);
      const fixed = locationDescriptions.get(placeName);
      if (fixed && fixed !== description) {
        issues.push(`${index + 1}쪽에서 반복 장소 '${location[1].trim()}'의 고정 특징이 바뀌었습니다.`);
      } else if (!fixed) {
        locationDescriptions.set(placeName, description);
      }
      if (previousLocation && previousLocation.name !== placeName) {
        const transitionText = `${previousLocation.text} ${page.text}`;
        const hasExplicitMove = MOVE_PATTERN.test(transitionText);
        if (!hasExplicitMove) {
          issues.push(
            `${index + 1}쪽 장소가 '${previousLocation.label}'에서 '${location[1].trim()}'(으)로 바뀌었지만 본문에 이동 과정이 없습니다.`,
          );
        }
      }
      previousLocation = { name: placeName, label: location[1].trim(), text: page.text };
    }
  });

  if (/(자살|성폭행|토막\s*살인|피가\s*분수처럼|내장이|목을\s*졸라\s*죽)/i.test(allText)) {
    issues.push("아동용 이야기로 사용할 수 없는 노골적인 위해 표현이 있습니다.");
  }
  return issues;
}
