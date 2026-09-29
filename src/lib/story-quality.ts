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

/**
 * 이 글에 자리를 옮긴 말이 있나 — 낱말 목록(MOVE_PATTERN)에 더해 탈것에 **올라탄** 말과 **내린** 말도 센다.
 *
 * 목록만 보면 "버스에 올라탔어요"·"버스가 멈추자 … 내렸어요"를 못 잡는다. 그래서 버스에서 내린 포도밭 쪽이
 * 앞 쪽의 어린이집 안으로 붙었다("어린이집 포도밭 — …, 어린이집 안" — 2026-09-29 오프라인 재현).
 * '내렸·탔'을 목록에 그냥 넣으면 "눈이 내렸어요"·"그네를 탔어요"까지 걸리므로, 탈것 낱말에 붙은 것만 본다.
 *
 * 이미 타고 있는 말("버스 창가에서", "뒷자리에 앉아")은 옮긴 게 아니다. 그것까지 세면 여러 쪽 이어 타는
 * 동안 장소 줄이 엉뚱하게 바뀌어도(버스 안 → 포도밭) 되돌리지 못한다. 창밖으로 지나가는 버스, 장난감 자동차도 아니다.
 */
function movesPlace(text: string): boolean {
  if (MOVE_PATTERN.test(text)) return true;
  const source = (text ?? "").normalize("NFC");
  return boardsVehicle(source) || vehicleState(source).gotOff;
}

type LocationHint = { family: string; name: string; description: string; index: number };

/*
 * '탈것에서 내렸다'로 치는 말.
 *
 * 뒤를 막는 것이 중요하다 — '내려다보니'(위에서 아래를 봄)·'내리는 비'·'내릴 준비'·'나오는 연기'는
 * 내린 게 아니다. 예전엔 낱말 앞부분만 맞춰 봐서 "2층 버스에서 내려다보니 남산이"를 '내렸다'로 읽었고,
 * 버스 위층 쪽의 장소 잠금이 빠지고 "바깥에 그려라"가 붙어 맞게 그린 그림이 검수에서 떨어졌다.
 */
const GOT_OFF_RE =
  /(?:내렸|내린(?!\s*(?:비|눈))|내려(?!\s*다\s*[보본봤볼]|\s*놓|\s*놨)|내리(?!기\s*전|는\s*(?:비|눈|햇))|내릴(?!\s*(?:준비|거|때까지))|나왔|나와|나온(?!\s*(?:연기|김))|나오(?!는)|빠져나)/;

/**
 * 탈것 낱말 **바로 뒤** 글을 보고 '거기서 내렸나'를 정한다.
 *
 * 예전엔 '버스에서' 바로 다음에 '내려'가 와야만 알아봤다. 그래서 "버스에서 천천히 내려",
 * "버스에서 폴짝 내렸어요", "버스가 멈추자 가족은 내렸어요"는 모두 '버스 안'이 됐고,
 * 궁궐 마당이어야 할 장소 줄이 또 시내버스 실내로 바뀌었다(my-mu0issap 3쪽과 같은 사고).
 * 이제 같은 문장 안 짧은 창(열 글자쯤, 어절 서넛)까지 본다. 창을 넓히면 "기차 안에서 창밖을 보니
 * 눈이 내렸어요" 같은 말까지 걸리므로 좁게 두고, 비·눈이 내리는 말은 따로 뺀다.
 */
function gotOffAfter(after: string): boolean {
  const clause = after.split(/[.!?\n]/)[0] ?? "";
  // 탈것 낱말에 붙는 말 — 안에서 · 밖으로 · 가 멈추자
  const lead = /^\s*(?:안\s*)?(?:에서(?:는|도)?|밖으로|(?:가|이)\s*(?:멈추|멈춰|멈췄|서자|섰))?/.exec(clause)?.[0] ?? "";
  const rest = clause.slice(lead.length);
  const m = GOT_OFF_RE.exec(rest);
  if (!m) return false;
  const between = rest.slice(0, m.index);
  // 붙는 말이 없으면 곧바로 이어져야 한다("버스 내려서"). "버스를 타고 산에서 내려왔어요"는 버스에서 내린 게 아니다.
  if (!lead.trim()) return /^\s*$/.test(between);
  /*
   * "버스가 멈추자 하온이는 친구들과 함께 내렸어요" — 탈것이 멈춘 문장에서 내렸으면 그 탈것에서 내린 것이다.
   * 사람 이름·함께 간 사람이 끼어 열 글자를 넘기 쉬워 창을 문장 끝까지 넓힌다. 하늘에서 내리는 것
   * ("버스가 멈추자 창밖에 눈이 펑펑 내렸어요")은 문장 어디에 있든 뺀다.
   */
  if (/(?:멈추|멈춰|멈췄|서자|섰)\s*$/.test(lead)) {
    return !/(?:비|눈|눈발|빗방울|눈송이|햇살|햇빛|어둠)\s*(?:가|이)\s/.test(between);
  }
  if (m.index > 10 || (between.match(/\s+/g) ?? []).length > 3) return false;
  // "눈이 내렸어요"·"비가 내리는" — 하늘에서 내리는 것.
  if (/(?:비|눈|눈발|햇살|햇빛|어둠)\s*(?:가|이)?\s*$/.test(between)) return false;
  return true;
}

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
function inferLocationFromText(text: string, forText = false): LocationHint | null {
  const hints = locationHints(text, forText);
  // 점수가 높은 곳이 '지금 있는 곳'. 같으면 뒤에 나온 것을 쓴다(가다가 도착한 곳).
  // 음수는 '아직 안 간 곳'이나 '물건을 보낼 곳'이라 있는 곳이 아니다 — 고르지 않는다.
  const best = hints.filter((h) => h.score >= 0).sort((a, b) => b.score - a.score || b.index - a.index)[0] ?? null;
  return best ? inVenue(best, hints) : null;
}

/** 글에 나오는 장소 낱말을 전부 찾는다(점수 포함). 고르는 일은 부르는 쪽이 한다. */
const VEHICLE_FAMILIES = new Set(["car", "tourbus", "transit"]);

/**
 * forText — 쪽 본문·장면 문장을 읽을 때만 true. 그때만 '어린이집 친구들'의 어린이집을 있는 곳에서 뺀다
 * (AFFILIATION_AFTER). 장소 **이름**("어린이집 형님반", "어린이집 선생님 방")에는 쓰지 않는다 — 이름에서 빼면
 * 같은 어린이집이 다른 열쇠(locationKeyOf)로 갈라져 장소 기준 그림을 한 장 더 그리고, 옛 책의 저장된 열쇠와도 어긋난다.
 */
function locationHints(text: string, forText = false): (LocationHint & { score: number })[] {
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
      // 버스와 같은 이유로 '차에서 내려'는 차 안이 아니다 — 내린 말은 아래 모으는 자리에서 거른다.
      re: /((?:자동차|(?<![기열전마모녹홍풍찻유주세])차)\s*(?:안|에서)|카시트|뒷자리|뒷좌석)/g,
      description: "뒷좌석 안전벨트와 창문, 앞자리 등받이가 보이는 승용차 안, 창밖으로 흐르는 도시 풍경",
    },
    /*
     * 2층 관광버스 위층은 시내버스 실내와 다른 곳이다.
     *
     * 예전엔 둘 다 "천장 손잡이가 달린 차량 안"으로 뭉쳐서, 지붕 없는 관광버스 위층 장면에
     * 천장과 손잡이가 들어갈 자리가 생겼다. 위층은 하늘이 트인 바깥 좌석이다.
     * '관광버스'만으로는 켜지 않는다 — 창문 있는 단층 관광버스 안 장면이 "지붕 없는 위층"이 됐다.
     * 2층·이층·시티투어·오픈탑이거나 '버스 위층'일 때만.
     */
    {
      family: "tourbus",
      re: /((?:2층|이층|오픈\s*탑)\s*[가-힣]{0,8}버스(?:\s*(?:위층|2층|안|에서))?|시티\s*투어\s*버스(?:\s*(?:위층|2층|안|에서))?|버스\s*(?:위층|2층|이층))/g,
      description: "지붕 없이 하늘이 트인 2층 관광버스 위층, 줄지어 놓인 좌석과 낮은 난간, 옆으로 지나가는 도시 풍경",
    },
    /*
     * '버스에서'는 뒤를 봐야 한다.
     *
     * 실제 사고(my-mu0issap 3쪽) — 본문 "버스에서 내려 커다란 문을 지나자"의 '버스에서'를
     * 버스 안으로 읽어, 경복궁 마당이어야 할 장소 줄이 시내버스 실내로 바뀌었다. 그림은
     * 버스 안에서 카시트에 앉은 아이가 나왔다. '에서' 뒤에 내리·나오가 오면 떠난 것이다
     * (아래 모으는 자리에서 gotOffAfter 로 거른다 — 부사가 끼어도 알아본다).
     */
    {
      family: "transit",
      re: /((?<!(?:2층|이층|오픈\s*탑|시티\s*투어)\s*[가-힣]{0,8})버스\s*(?:안|에서)|지하철|전철|기차\s*(?:안|에서))/g,
      description: "나란히 놓인 좌석과 손잡이, 창밖 풍경이 흐르는 시내버스·지하철 같은 대중교통 안",
    },
  ];
  const hints: (LocationHint & { score: number })[] = [];
  for (const definition of definitions) {
    for (const match of text.matchAll(definition.re)) {
      const at = match.index ?? 0;
      // 탈것에서 내린 말("버스에서 천천히 내려")은 그 탈것에 있는 게 아니다 — 장소 단서로 치지 않는다.
      if (VEHICLE_FAMILIES.has(definition.family) && vehicleState(text.slice(at, at + match[0].length + 24)).gotOff) {
        continue;
      }
      const after = text.slice(at + match[0].length, at + match[0].length + 12);
      hints.push({
        family: definition.family,
        name: match[0].replace(/\s+/g, " "),
        description: definition.description,
        index: at,
        score: forText && definition.family === "school" && AFFILIATION_AFTER.test(after) ? -1 : locusScore(after),
      });
    }
  }
  return hints;
}

/*
 * '어린이집 친구들'·'유치원 선생님'·'어린이집 버스'의 어린이집은 **누구·무엇이 어디 소속인지**이지
 * 지금 서 있는 곳이 아니다.
 *
 * 실제 사고(2026-09-29) — "오늘은 어린이집 친구들이랑 포도밭에 가는 날 … 버스에 올라탔어요" 쪽에서
 * '어린이집'이 이 쪽의 장소로 뽑혀, 클로드가 적은 버스 안이 "어린이집 — 밝은 벽과 큰 창문, 낮은 책상"으로
 * 갈아 끼워졌다. 그림은 교실 창가에 앉은 아이였다.
 * '있는 곳' 후보에서만 뺀다(점수 -1). 건물 단서(이 신발장은 어디의 신발장인가)로는 그대로 남긴다.
 * 방·반 이름은 소속이 아니라 그 건물 안의 자리다 — 선생님 방, 형님반·동생반, 차고, 가방 걸이는 빼지 않는다.
 */
const AFFILIATION_AFTER =
  /^\s*(?:친구|선생님(?!\s*방)|(?:형|누나|언니|오빠|동생)(?!님?\s*반)|버스|차(?![고례])|가방(?!\s*걸이)|원복|체육복|모자)/;

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
export function isInsideCar(name: string, description = ""): boolean {
  const text = `${name} ${description}`;
  if (NOT_IN_CAR_WORDS.test(text)) return false;
  const byName = placeVehicleKind(name);
  if (byName) return byName === "car";
  return vehicleState(text).kind === "car";
}

/** 승용차·택시(car) / 버스·기차·지하철(transit). 둘은 안전 규칙이 정반대다. */
export type VehicleKind = "car" | "transit";

/*
 * '타고 있다'로 칠 때 탈것 낱말 뒤에 오는 말 — 안에서 · 좌석 · 를 타고 · 가 달리자.
 *
 * 맨 낱말(자동차·택시·버스·기차)만으로는 타고 있다고 보지 않는다. 예전엔 "장난감 자동차를 가지고
 * 놀았어요", "빨간 택시가 지나가는 거리", "창밖으로 버스가 지나가요", 장소 이름 "자동차 박물관"까지
 * 탈것 안으로 읽어, 거실·거리 장면에 차 안 좌석 규칙(뒷좌석에 앉혀 벨트를 채워라)이 붙었다.
 * 맨 낱말은 '근처에 탈것 이야기가 있나'(mentionsVehicle)에만 쓴다.
 * 앞보기(?=)로 둔다 — 찾은 글이 탈것 낱말뿐이어야 그 뒤에서 '내렸나'를 볼 수 있다.
 */
const RIDE_AHEAD = String.raw`(?=\s*(?:안|속|위층|아래층|2층|이층|객실|좌석|자리|뒷자리|뒷좌석|앞자리|앞좌석|창가|창문|에서|밖으로|(?:를|을)\s*(?:타|탔|탄|탑니)|에\s*(?:타|탔|탄|올라|앉)|(?:가|이)\s*(?:멈추|멈춰|멈췄|서자|섰|출발|달리|달렸|떠나|떠났)))`;
/*
 * 승용차 낱말. 앞 글자를 본다 — '기차·열차·전차·마차·유모차'는 자동차가 아니고,
 * '녹차·홍차·풍차·주차·세차'도 아니다. 이걸 안 보면 "기차를 타고 할머니 댁에"가 차 안으로 잡혀
 * 엉뚱한 쪽에 좌석 규칙이 붙는다.
 *
 * '버스 안'·'차창'은 뺐다. 버스를 승용차로 읽어, 2층 관광버스 위층에 앉은 가족 셋이
 * 전부 안전벨트를 맨 그림이 나왔다(my-mu0issap 2쪽). 버스는 아래 대중교통 낱말이 맡는다.
 */
const CAR_NOUN = "(?:자동차|승용차|택시|(?<![기열전마모녹홍풍찻유주세])차)";
const CAR_STRONG = new RegExp(String.raw`${CAR_NOUN}${RIDE_AHEAD}|카시트|조수석|드라이브`, "g");
/*
 * 자리 낱말 — 차에도 버스에도 있다. '버스 뒷자리'가 승용차가 되면 안 되므로,
 * 같은 글에 대중교통이 나오면 그쪽을 따른다.
 */
const CAR_SEAT = /(?:뒷좌석|뒷자리|앞좌석|운전석)/g;
/*
 * 대중교통 낱말. 정류장·터미널·역은 탈것 안이 아니다 — 거기서 "좌석에 앉는다"는 규칙이 붙으면
 * 정류장 벤치 장면이 버스 안이 된다. (타는 말이 붙어야 하므로 '버스 정류장'은 애초에 안 걸린다.)
 */
const TRANSIT_NOUN = "(?:버스|기차|열차|지하철|전철|KTX|케이티엑스|트램|케이블카)";
const TRANSIT_WORDS = new RegExp(`${TRANSIT_NOUN}${RIDE_AHEAD}`, "g");
/** 탈것 이야기가 조금이라도 있나 — 맨 낱말도 센다. */
const ANY_VEHICLE_WORDS = new RegExp(
  String.raw`(?:자동차|승용차|택시|카시트|조수석|뒷좌석|뒷자리|버스(?!\s*(?:정류|정거장|터미널))|기차(?!\s*역|놀이)|열차|지하철(?!\s*역)|전철(?!\s*역)|KTX|케이티엑스|트램|케이블카|(?<![기열전마모녹홍풍찻유주세])차\s*(?:안|에서|를\s*타|에\s*타))`,
);
const NOT_IN_CAR_WORDS = /(주차장|정비소|세차|차고|주유소)/;
/*
 * 탈것에 올라탄 말 — "버스에 올라탔어요", "아빠 차를 탔어요", "기차에 탄". 자리를 옮긴 말(movesPlace)로 센다.
 * 이미 타고 있는 말("버스 창가에서", "뒷자리에 앉아")은 여기 걸리지 않는다.
 */
const BOARD_SOURCE = String.raw`(?:${TRANSIT_NOUN}|${CAR_NOUN})\s*(?:에|를|을)\s*(?:올라\s*)?(?:타|탔|탄|탑니)`;
/**
 * 장난감·상자·종이로 만든 탈것, 놀이 기구(꼬마 기차) — 탈것 낱말 바로 앞 글이 이것으로 끝나면 타도 자리를
 * 옮긴 게 아니다("하온이는 장난감 자동차에 올라탔어요"는 거실 그대로다). 끝 두 글자는 '자동'(자동차의 앞)까지 봐 준다.
 */
const TOY_BEFORE = /(?:장난감|상자|종이|모형|꼬마|블록|레고)\s*[가-힣]{0,2}$/;
function isToyAt(source: string, at: number): boolean {
  return at > 0 && TOY_BEFORE.test(source.slice(Math.max(0, at - 10), at));
}
/*
 * 탈것 **안**에 있다는 말 — 탔다(boardsVehicle)는 말 말고도 '버스 안·차 창가·뒷자리·카시트'.
 * "창밖 길에서 버스가 멈췄어요"처럼 탈것이 움직이기만 하는 말은 밖에서 보는 것일 수 있어 여기 들지 않는다.
 */
const INSIDE_CUE = new RegExp(
  String.raw`(?:${TRANSIT_NOUN}|${CAR_NOUN})\s*(?:안|속|위층|객실|좌석|자리|창가|창문|뒷자리|뒷좌석|앞자리|앞좌석)|뒷좌석|뒷자리|앞좌석|카시트|조수석`,
);
/** 탈것 낱말 뒤가 '가 멈췄다·달렸다·출발했다'뿐인가 — 타고 있다는 뜻일 수도, 밖에서 보는 것일 수도 있다. */
const MOTION_ONLY_AFTER = /^\s*(?:가|이|는|도)\s*(?:멈추|멈춰|멈췄|서자|섰|출발|달리|달렸|떠나|떠났)/;
function boardsVehicle(source: string): boolean {
  for (const m of source.matchAll(new RegExp(BOARD_SOURCE, "g"))) {
    if (!isToyAt(source, m.index ?? 0)) return true;
  }
  return false;
}

/**
 * 이 글이 '지금 탈것 안'을 말하는가, '탈것에서 내렸다'를 말하는가.
 *
 * 탈것 낱말을 전부 찾아 **마지막에 나온 것**을 따른다 — "택시에서 내려 기차를 탔다"는 기차,
 * "버스를 타고 가다 버스에서 내려"는 내린 것. 내린 뒤라면 kind는 없고 gotOff가 선다.
 * 기다리는 탈것("버스를 기다렸어요")은 아직 탄 게 아니라 셈하지 않는다.
 */
export function vehicleState(text: string): { kind: VehicleKind | null; gotOff: boolean } {
  const { kind, gotOff } = readVehicle((text ?? "").normalize("NFC"));
  return { kind, gotOff };
}

/** vehicleState 의 속 — 마지막 탈것 낱말이 시작·끝나는 자리(start·end)까지 돌려준다. 없으면 둘 다 -1. */
function readVehicle(source: string): { kind: VehicleKind | null; gotOff: boolean; start: number; end: number } {
  type Mention = { kind: VehicleKind; index: number; end: number; off: boolean; seatOnly: boolean };
  const mentions: Mention[] = [];
  const collect = (re: RegExp, kind: VehicleKind, seatOnly: boolean) => {
    for (const m of source.matchAll(new RegExp(re.source, "g"))) {
      const at = m.index ?? 0;
      const after = source.slice(at + m[0].length, at + m[0].length + 24);
      if (/^\s*(?:를|을|가|이)?\s*기다/.test(after)) continue;
      mentions.push({ kind, index: at, end: at + m[0].length, off: gotOffAfter(after), seatOnly });
    }
  };
  collect(CAR_STRONG, "car", false);
  collect(CAR_SEAT, "car", true);
  collect(TRANSIT_WORDS, "transit", false);
  if (mentions.length === 0) return { kind: null, gotOff: false, start: -1, end: -1 };
  const last = mentions.reduce((a, b) => (b.index >= a.index ? b : a));
  if (last.off) return { kind: null, gotOff: true, start: last.index, end: last.end };
  if (last.kind === "car" && last.seatOnly && mentions.some((m) => m.kind === "transit" && !m.off)) {
    return { kind: "transit", gotOff: false, start: last.index, end: last.end };
  }
  return { kind: last.kind, gotOff: false, start: last.index, end: last.end };
}

/**
 * 따옴표 속 말(대사·속말)을 같은 길이의 빈칸으로 가린다 — 자리(index)는 그대로다.
 * "아빠, 언제 도착해요?"는 일어난 일이 아니다. 가리지 않으면 차에 탄 쪽이 '도착했다'로 읽혀
 * 클로드가 맞게 적은 '아빠 차 안'이 할머니 댁 거실로 바뀌었다(2026-09-29 검토에서 재현).
 */
function maskSpeech(text: string): string {
  return text.replace(/"[^"\n]*"|“[^”\n]*”|'[^'\n]*'|‘[^’\n]*’/g, (quoted) => " ".repeat(quoted.length));
}

/*
 * 목적지에 닿은 말 — "놀이터에 도착했어요", "포도밭으로 들어섰어요".
 * 앞으로의 일·아직 아닌 일("도착하면", "도착할 때까지", "도착하지 않았어요")은 뺀다 — 아직 타고 가는 중이다.
 */
const ARRIVE_SOURCE = "(?:도착(?!하면|할|하기|하려|하지|하나|하니|해요?\\s*\\?)|들어서(?!면)|들어섰|들어갔|닿았|다다랐)";
/*
 * 가서 닿은 곳 — "○○에 도착했어요·들어섰어요" 에 더해 "○○에 갔어요·왔어요"(아이 동화에서 가장 흔한 꼴).
 * "갔다가"는 아직 들르는 중이다. 이름 뒤 '안·속'은 이름에 붙인다("교실 안으로 들어갔어요"는 교실).
 */
const ARRIVAL_SOURCE = `([가-힣]+?)(?:\\s*(?:안|속))?(?:에|으로|로)\\s*(?:${ARRIVE_SOURCE}|(?:갔|왔)(?!\\s*다가))`;
/** 닿은 '곳'이 아닌 말 — 방향·자리(앞으로 갔어요, 창가로 갔어요), 몸(입으로 들어갔어요), 꿈나라·이불 속. */
const NOT_A_DESTINATION =
  /^(?:앞|뒤|옆|위|아래|밑|안|속|밖|쪽|곁|가운데|창가|자리|좌석|멀리|이리|저리|그리|여기|거기|저기|입|코|귀|눈|품|꿈나라|꿈속|잠|이불|주머니|마음)$/;

/** 이 글(대사는 빼고)에서 가서 닿은 곳의 이름 — "포도밭에 도착했어요"면 '포도밭'. 없으면 "". */
function arrivedAt(text: string): string {
  for (const m of maskSpeech((text ?? "").normalize("NFC")).matchAll(new RegExp(ARRIVAL_SOURCE, "g"))) {
    if (!NOT_A_DESTINATION.test(m[1])) return m[1];
  }
  return "";
}

/**
 * 탄 뒤에 따로 내린 말이 있나 — "버스에 탔어요. 한참 뒤 하온이는 친구 손을 잡고 내렸어요."
 * (탈것 낱말 바로 뒤의 '내렸'은 readVehicle 이 이미 본다. 이건 떨어져 있는 것.)
 * 하늘에서 내리는 것(눈이 펑펑 내렸어요)과 무엇을 내린 것(창문을 내렸어요, 가방을 내려놓았어요)은 뺀다.
 */
function leftRideAfter(rest: string): boolean {
  return rest
    .split(/[.!?\n]/)
    .some(
      (sentence) =>
        /(?:내렸|내린(?!\s*(?:비|눈))|내려(?!\s*다\s*[보본봤볼]|\s*놓|\s*놨)|내리자)/.test(sentence) &&
        !/(?:비|눈|눈발|빗방울|눈송이|햇살|햇빛|어둠)\s*(?:가|이)\s/.test(sentence) &&
        !/[을를]\s*(?:살짝|천천히|조금|쓱|스르르)?\s*내(?:렸|려|린|리)/.test(sentence),
    );
}

/**
 * 이 글이 **탈것 안에서 끝나는가** — 그렇다면 그 탈것(car/transit), 아니면 null.
 *
 * 한 쪽 안에서 자리를 옮기면 그림은 그 쪽이 끝나는 자리다(2026-09-29 사장님 — 어린이집을 나서 버스에
 * 올라탄 쪽이 어린이집 교실 창가로 그려졌다). 마지막 탈것 낱말이 '타고 있다'여야 하고, 그 뒤에 내리거나
 * 어딘가에 닿은 말이 없어야 한다. "버스를 타고 놀이터에 도착했어요"·"아빠 차를 타고 공원에 갔어요"는
 * 그곳에서 끝난다. "버스 안으로 들어갔어요"처럼 들어간 곳이 그 탈것이면 탄 것이다.
 * 대사는 가리고 본다("언제 도착해요?"는 아직 타고 있다). 장난감 자동차·꼬마 기차는 탈것으로 치지 않는다.
 */
export function ridingAtEnd(text: string): VehicleKind | null {
  const source = maskSpeech((text ?? "").normalize("NFC"));
  const state = readVehicle(source);
  if (!state.kind || isToyAt(source, state.start)) return null;
  const rest = source.slice(state.end);
  // "창밖 길에서 버스가 멈췄어요"뿐이면 타고 있는지 모른다 — 탄 말이나 안에 있다는 말이 따로 있어야 한다.
  if (MOTION_ONLY_AFTER.test(rest) && !boardsVehicle(source) && !INSIDE_CUE.test(source)) return null;
  for (const m of rest.matchAll(new RegExp(ARRIVE_SOURCE, "g"))) {
    if (/^\s*(?:안|속)?\s*(?:으로|로|에)?\s*$/.test(rest.slice(0, m.index))) continue;
    return null;
  }
  if (arrivedAt(rest) || leftRideAfter(rest)) return null;
  return state.kind;
}

/**
 * 이 쪽(본문 + 장면 문장)이 탈것 안에서 끝나는가.
 * 본문이 먼저다 — 본문에 탈것 말이 있으면 본문만 본다. 본문에 탈것 말도 닿은 말도 없을 때만 장면 문장을 본다.
 */
function ridingOnPage(text: string, sceneBody: string): VehicleKind | null {
  const byText = ridingAtEnd(text);
  if (byText) return byText;
  const narration = maskSpeech((text ?? "").normalize("NFC"));
  const state = vehicleState(narration);
  if (state.kind || state.gotOff || new RegExp(ARRIVE_SOURCE).test(narration) || arrivedAt(narration)) return null;
  return ridingAtEnd(sceneBody);
}

/** 장면 지시에서 잠금 줄(등장인물·장소·물건)을 뺀 장면 문장 — 한 줄로 쓴 지시에서도 뺀다. */
function sceneSentences(imagePrompt: string): string {
  return (imagePrompt ?? "")
    .replace(/등장인물\s*\d+\s*명(?:\s*:[^.\n]*)?\.?/g, " ")
    .replace(/(?:장소|물건)\s*:[^.\n]*\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 장소 **이름**이 탈것인가 — 이름은 끝말(머리 명사)로 본다.
 *
 * "아빠 차"·"승용차"·"지하철 안"·"2층 관광버스 위층"은 탈것이고, "자동차 박물관"·"택시 승강장"·
 * "장난감 기차 가게"는 아니다. 예전엔 이름 어디든 탈것 낱말이 있으면 탈것으로 봐서, 박물관 장소 시트가
 * 차 한 대로 그려질 뻔했고, 반대로 "아빠 차"는 못 알아봐 진짜 차 안 쪽에 "벨트 없음"이 붙었다.
 * 이름 끝에 없으면 타는 말 꼴("버스에서" — 옛 판정이 박아 둔 이름)만 본다.
 */
export function placeVehicleKind(name: string): VehicleKind | null {
  const n = (name ?? "").normalize("NFC").trim();
  if (!n || NOT_IN_CAR_WORDS.test(n)) return null;
  const tail = String.raw`(?:\s*(?:안|속|위층|아래층|2층|이층|객실|칸|좌석|창가|뒷자리|뒷좌석|앞자리|앞좌석))?$`;
  if (new RegExp(`${TRANSIT_NOUN}${tail}`).test(n)) return "transit";
  if (new RegExp(`${CAR_NOUN}${tail}`).test(n)) return "car";
  if (/^(?:뒷자리|뒷좌석|카시트|조수석)$/.test(n)) return "car";
  return vehicleState(n).kind;
}

/** 글에 탈것 이야기가 조금이라도 있는가 — 탈것이 아닌 쪽에 "벨트 없음"을 따로 일러 줄지 정한다. */
export function mentionsVehicle(text: string): boolean {
  return ANY_VEHICLE_WORDS.test((text ?? "").normalize("NFC"));
}

/** '주차장·세차장·주유소'처럼 차가 나오지만 차 안은 아닌 곳을 말하나. */
export function mentionsNotInCar(text: string): boolean {
  return NOT_IN_CAR_WORDS.test((text ?? "").normalize("NFC"));
}

/*
 * 어린이 통학 버스 낱말 — 어린이집·유치원·학원 버스, 통학버스, 셔틀, 등·하원 차.
 *
 * 왜 따로 보나 — 버스·기차·지하철 쪽은 "벨트·카시트 없음"으로 그린다(관광버스 위층 가족 셋이 벨트를 맨
 * 그림 때문에, my-mu0issap). 그런데 어린이 통학 버스는 법(세림이법)으로 아이가 벨트를 매야 해서, 그 규칙대로면
 * 어린이집 버스에 탄 아이를 벨트 없이 그리고 벨트를 맨 그림은 검수에서 떨어뜨린다. 사장님 결정(2026-09-29 "조아") —
 * 통학 버스만 아이가 벨트를 맨 모습으로 그린다. 시내·마을·고속·2층 버스, 기차·지하철, 승용차는 그대로다.
 *
 * 맨 '버스'는 통학 버스가 아니다(어린이집 친구들이랑 탄 시내버스일 수 있다). '노란 버스'(서울 순환버스도 노랗다)와
 * 맨 '셔틀'(놀이공원·캠핑장 셔틀일 수 있다)은 같은 쪽에 어린이집·유치원·학원·등하원 말이 있을 때만 통학 버스로 본다.
 * 공항·호텔·놀이공원 셔틀과 셔틀콕은 뺀다.
 * '어린이집 차'는 탄 말(차에 탔어요·차 안)이나 이름 끝일 때만 — "어린이집 차고", 창밖으로 본 "어린이집 차를 봤어요"는 아니다.
 */
const SHUTTLE_OWNER = "(?:어린이집|유치원|학원|학교|통학|등원|하원|스쿨)";
/** 그 말만으로 통학 버스 — 어린이집 버스, 통학버스, 유치원 셔틀, 노란 셔틀버스(노란색은 통학 버스 색이다). */
const SHUTTLE_BUS = new RegExp(String.raw`${SHUTTLE_OWNER}\s*(?:버스|셔틀)|(?:노란색?|노랑)\s*셔틀`);
const SHUTTLE_CAR = new RegExp(String.raw`${SHUTTLE_OWNER}\s*(?:차량|승합차|차)(?:${RIDE_AHEAD}|\s*$)`);
/** 같은 쪽에 어린이집 말(SHUTTLE_CUE)이 있어야 통학 버스인 말 — 노란 버스, 맨 셔틀. */
const MAYBE_SHUTTLE = /(?:노란색?|노랑)\s*버스|셔틀(?!콕)/;
/**
 * 어린이집 쪽 이야기라는 단서. '등원·하원'은 뒤에 버스·차·길·시간·하다가 붙을 때만 —
 * '하원'은 아이 이름(하원이랑)일 수 있어, 이름 하나로 '노란 버스'가 통학 버스가 됐다(2026-09-29 검토).
 */
const SHUTTLE_CUE = /어린이집|유치원|학원|통학|(?:등|하)원(?=\s*(?:버스|차|길|시간|하(?!고)|했|할|해))/;
/** 다른 탈것을 대놓고 부르는 말 — 시내버스·2층 버스·기차·택시·아빠 차, 공항·놀이공원 셔틀. */
const OTHER_RIDE_SOURCE = String.raw`(?:시내|마을|고속|시외|광역|관광|직행|공항|리무진|2층|이층|시티\s*투어|오픈\s*탑)\s*버스|(?:공항|호텔|리조트|놀이공원|동물원|캠핑장|스키장|워터파크)\s*셔틀(?:\s*버스)?|지하철(?!\s*역)|전철(?!\s*역)|기차(?!\s*(?:역|놀이))|열차|KTX|케이티엑스|트램|케이블카|택시|승용차|자가용|(?:아빠|엄마|할머니|할아버지|삼촌|이모|고모|우리)\s*차(?![례고림비])`;
const OTHER_RIDE = new RegExp(OTHER_RIDE_SOURCE);
const OTHER_RIDE_AT_END = new RegExp(`(?:${OTHER_RIDE_SOURCE})$`);
/** 탄 탈것 낱말 바로 앞이 통학 버스 주인 말인가 — "어린이집 버스", "통학버스", "학원 승합차", "노란 셔틀버스". */
const SHUTTLE_OWNER_BEFORE = new RegExp(String.raw`(?:${SHUTTLE_OWNER}\s*(?:셔틀|승합)?|(?:노란색?|노랑)\s*셔틀)\s*$`);
/** 글 어디든 통학 버스를 부르는 말 — 탔는지 놓쳤는지는 notTakenShuttle 이 가른다. 차(car) 쪽은 차 낱말만 센다. */
const SHUTTLE_ANY = new RegExp(
  String.raw`${SHUTTLE_OWNER}\s*(?:셔틀\s*)?(?:버스|셔틀|승합차|차량|차(?![고례림비]))|(?:노란색?|노랑)\s*셔틀(?:\s*버스)?`,
  "g",
);
const SHUTTLE_ANY_CAR = new RegExp(String.raw`${SHUTTLE_OWNER}\s*(?:승합차|차량|차(?![고례림비]))`, "g");
const MAYBE_SHUTTLE_ANY = /(?:노란색?|노랑)\s*버스|셔틀(?!콕)(?:\s*버스)?/g;
/*
 * 그 통학 버스는 타지 않았다는 말 — 놓쳤다·쌩 지나갔다·떠나 버렸다·없었다·안 왔다, "어린이집 버스보다·처럼".
 * '지나가'는 조사 바로 뒤만 본다 — "어린이집 버스가 포도밭을 지나갔어요"는 타고 가는 버스다.
 */
const NOT_TAKEN_AFTER =
  /^\s*(?:보다|처럼|같이|같은|만큼|말고|대신)|^[^.!?\n]{0,10}?놓(?:치|쳐|쳤|친)|^\s*(?:가|이|는|도)?\s*(?:(?:쌩|씽|휙|휭|부릉부릉|빠르게|천천히|옆으로|옆을)\s*)?지나(?:가|갔|간|쳐|쳤|치)|^\s*(?:가|이|는)?\s*[^.!?\n]{0,8}?(?:버렸|버린)|^\s*(?:가|이|는|도)?\s*(?:없|안\s*(?:왔|와|오)|오지\s*않)/;
/** 지금 일이 아닌 문장 — 내일·어제·옛날 이야기. */
const NOT_NOW_SENTENCE = /내일|모레|어제|나중에|언젠가|옛날|예전/;
/**
 * 버스에서 아이가 벨트를 맸다는 말 — "안전벨트를 딸깍 채워 주셨어요", "벨트를 꼭 맸어요".
 * 시내버스·기차엔 벨트가 없으니, 이름이 다른 탈것을 대지 않은 버스에서 벨트를 맸으면 통학 버스다.
 */
const BELT_ON =
  /(?:안전\s*)?벨트\s*(?:를|을|도)?\s*(?:(?:꼭|딸깍|찰칵|착|단단히|잘)\s*)*(?:매|맸|맨|메|멨|채우|채워|채웠|채운|잠그|잠갔|잠가|딸깍|찰칵)/;

/** 통학 버스 판정 — 통학 버스다("shuttle") · 다른 탈것이다("other") · 이 글로는 모른다(null). */
export type ShuttleVerdict = "shuttle" | "other" | null;

/** 이 글이 통학 버스를 부르는가 — 다른 탈것 말은 보지 않는다(장소 설명처럼 긍정만 볼 때). */
export function namesSchoolShuttle(text: string, context = ""): boolean {
  const source = (text ?? "").normalize("NFC");
  if (SHUTTLE_BUS.test(source) || SHUTTLE_CAR.test(source)) return true;
  return MAYBE_SHUTTLE.test(source) && SHUTTLE_CUE.test(`${source} ${(context ?? "").normalize("NFC")}`);
}

/**
 * 장소 **이름**이 어린이 통학 버스인가. 이름은 그 탈것을 부르는 말이라, 이름이 정하면 설명·본문에 스친
 * 다른 탈것("창밖으로 기차가 지나가는")으로 뒤집지 않는다(2026-09-29 검토 — 진짜 어린이집 버스 쪽이 벨트 금지로 돌아갔다).
 * context 는 '노란 버스'·맨 '셔틀'을 가를 때만 본다. 비우면 이름만으로 정한다(locationKeyOf·장소 시트).
 */
export function schoolShuttleName(name: string, context = ""): ShuttleVerdict {
  const source = (name ?? "").normalize("NFC");
  if (OTHER_RIDE.test(source)) return "other";
  return namesSchoolShuttle(source, context) ? "shuttle" : null;
}

/** 탈것을 타고 있다는 말(RIDE_AHEAD)이 붙은 탈것 낱말 전부 — 기다리는 탈것·장난감은 뺀다. */
function rideMentions(source: string): { index: number; noun: string; motionOnly: boolean }[] {
  const found: { index: number; noun: string; motionOnly: boolean }[] = [];
  for (const re of [CAR_STRONG, TRANSIT_WORDS]) {
    for (const m of source.matchAll(new RegExp(re.source, "g"))) {
      const at = m.index ?? 0;
      const after = source.slice(at + m[0].length, at + m[0].length + 24);
      if (/^\s*(?:를|을|가|이)?\s*기다/.test(after) || isToyAt(source, at)) continue;
      found.push({ index: at, noun: m[0], motionOnly: MOTION_ONLY_AFTER.test(after) });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** 탄 탈것 낱말이 누구의 탈것인가 — 앞 글자로 본다. 그냥 '버스·차'면 null. */
function rideOwner(source: string, ride: { index: number; noun: string }, cue: boolean): ShuttleVerdict {
  if (ride.noun !== "버스" && ride.noun !== "차") {
    // 기차·지하철·택시·승용차는 다른 탈것, 자동차·카시트·조수석은 누구 차인지 모른다.
    return /^(?:자동차|카시트|조수석|드라이브)$/.test(ride.noun) ? null : "other";
  }
  const phrase = source.slice(Math.max(0, ride.index - 16), ride.index + ride.noun.length);
  if (OTHER_RIDE_AT_END.test(phrase)) return "other";
  const before = phrase.slice(0, phrase.length - ride.noun.length);
  if (SHUTTLE_OWNER_BEFORE.test(before)) return "shuttle";
  return cue && /(?:노란색?|노랑|셔틀)\s*$/.test(before) ? "shuttle" : null;
}

/** 글에 나온 통학 버스가 이 쪽에서 탄 것이 아닌가 — 놓쳤다·지나갔다·창밖으로 봤다·내일 탈 것. */
function notTakenShuttle(source: string, start: number, end: number): boolean {
  const marks = [".", "!", "?", "\n"];
  const sentenceStart = Math.max(...marks.map((mark) => source.lastIndexOf(mark, start - 1))) + 1;
  const ends = marks.map((mark) => source.indexOf(mark, end)).filter((at) => at >= 0);
  const sentence = source.slice(sentenceStart, ends.length ? Math.min(...ends) : source.length);
  return (
    NOT_TAKEN_AFTER.test(source.slice(end, end + 24)) ||
    /창\s*밖/.test(source.slice(sentenceStart, start)) ||
    NOT_NOW_SENTENCE.test(sentence)
  );
}

/**
 * 이 글(본문·장면 문장)에서 **탄** 탈것이 어린이 통학 버스인가 — kind 는 이미 정한 탈것(pageVehicle).
 *
 * 글 어디든 '어린이집 버스'가 있으면 통학 버스로 봤더니, "어린이집 버스를 놓쳐서 엄마랑 버스를 탔어요",
 * "창밖으로 노란 어린이집 버스가 지나갔어요"처럼 엄마와 탄 시내버스가 벨트 맨 통학 버스로 그려졌다(2026-09-29 검토).
 * 그래서 차례로 본다.
 *   ① 마지막으로 탄 탈것 낱말의 앞 글자 — 어린이집 버스·학원 차면 통학 버스, 시내버스·아빠 차·기차면 다른 탈것.
 *      "가 멈췄다·달렸다"뿐인 낱말은 밖에서 보는 것일 수 있어, 탄 말이 따로 있으면 그쪽을 쓴다.
 *   ② 탄 것이 그냥 '버스·차'면 같은 글의 통학 버스 말로 가른다 — 놓쳤다·지나갔다·창밖으로 봤다·내일 탈 것이면
 *      다른 버스, 아니면 그 버스다("어린이집 버스가 왔어요. 하온이는 버스에 올라탔어요").
 *      대사도 본다 — "어린이집 버스에 타세요!"는 무슨 버스인지 알려 준다. 탔는지(①)는 대사를 가리고 본다.
 *   ③ 버스에서 아이가 벨트를 맸다는 말 — 시내버스엔 벨트가 없다.
 * 차(car) 쪽은 '어린이집 차·학원 차'만 센다 — 아빠 차를 타고 가며 창밖으로 본 어린이집 버스가 아빠 차를 통학 버스로 바꾸면 안 된다.
 * context 는 '노란 버스'·맨 '셔틀'을 가를 때만 본다(같은 쪽의 장소 줄·다른 글).
 */
export function schoolShuttleRide(text: string, kind: VehicleKind = "transit", context = ""): ShuttleVerdict {
  const raw = (text ?? "").normalize("NFC");
  const source = maskSpeech(raw);
  const cue = SHUTTLE_CUE.test(`${raw} ${(context ?? "").normalize("NFC")}`);
  const rides = rideMentions(source);
  const settled = rides.filter((ride) => !ride.motionOnly);
  const ridden = (settled.length ? settled : rides).at(-1);
  const owner = ridden ? rideOwner(source, ridden, cue) : null;
  if (owner) return owner;
  const mentions = [...raw.matchAll(SHUTTLE_ANY), ...(cue && kind === "transit" ? raw.matchAll(MAYBE_SHUTTLE_ANY) : [])];
  if (mentions.some((m) => notTakenShuttle(raw, m.index ?? 0, (m.index ?? 0) + m[0].length))) return "other";
  // 차 쪽이 그 통학 버스를 탄 것으로 치는 건 '어린이집 차·학원 차'뿐이다.
  if (mentions.some((m) => kind === "transit" || new RegExp(SHUTTLE_ANY_CAR.source).test(m[0]))) return "shuttle";
  return kind === "transit" && BELT_ON.test(raw) ? "shuttle" : null;
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
  /*
   * 이름이 탈것이면(끝말이 버스·차) 탈것으로 묶는다 — "노란 어린이집 버스"는 어린이집이 아니라 버스다.
   * 예전엔 '어린이집'에 걸려 교실과 같은 열쇠(school)가 되어, 교실의 장소 기준 그림·기준 쪽을 나눠 썼다.
   */
  const vehicle = hint && VEHICLE_FAMILIES.has(hint.family) ? null : placeVehicleKind(bare || name);
  if (!hint && !vehicle) {
    // 목록에 없는 곳 — '~방'으로 끝나면 집 안의 방(아이 방·하온이 방), 아니면 이름 자체로 묶는다.
    if (/방$/.test(cleaned) && !/(주방|가방|책방|찜질방|노래방)$/.test(cleaned)) return "home:room";
    return cleaned;
  }
  const family = vehicle ?? hint!.family;
  let base = family;
  if (base === "home") {
    if (/거실/.test(bare)) base = "home:living";
    else if (/침실|안방|건넌방|놀이방|(?<![가-힣])방(?![가-힣])/.test(bare) || /방$/.test(cleaned)) base = "home:room";
  }
  // 어느 건물의 것인가 — "어린이집 버스 안"(school:transit)과 "시내버스 안"(transit)은 다른 버스다.
  const venue = locationHints(bare || name).find((h) => VENUE_FAMILIES.has(h.family));
  if (venue && venue.family !== family) return `${venue.family}:${base}`;
  /*
   * 건물 낱말 없이 이름만으로 통학 버스인 곳(통학버스·스쿨버스·등원 버스·학원 차)도 따로 묶는다.
   * 예전엔 "통학버스 안"이 "시내버스 안"과, "학원 차"가 "아빠 차"와 같은 열쇠라 장소 시트·같은 장소 기준 쪽을
   * 나눠 썼다 — 통학 버스는 아이가 벨트를 맨 그림이라, 벨트 금지인 시내버스 쪽에 벨트 맨 좌석 그림이 기준으로 갔다(2026-09-29 검토).
   * 'shuttle:'은 갈라내기만 한다 — 원래 따로이던 어린이집 버스(school:transit)와 합치지 않는다. 옛 책의 시트는 이름으로 다시 맞춘다(sheetMatchesKey).
   */
  if (VEHICLE_FAMILIES.has(family) && schoolShuttleName(bare || name) === "shuttle") return `shuttle:${base}`;
  return base;
}

/**
 * 저장된 장소 기준 그림(장소 시트)이 이 열쇠의 것인가.
 * 옛 책은 열쇠 규칙이 바뀌기 전에 열쇠를 저장했다 — "아빠 차"는 예전 열쇠 '아빠차', 지금은 'car'(2026-09-29).
 * 저장된 열쇠만 보면 다시 그리기·이어 그리기에서 그 장소 그림을 못 찾으므로 이름으로도 다시 맞춰 본다.
 */
export function sheetMatchesKey(sheet: { key: string; name?: string }, key: string): boolean {
  if (!key) return false;
  return sheet.key === key || Boolean(sheet.name && locationKeyOf(sheet.name) === key);
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
const LEAVES_VENUE = new Set(["car", "transit", "tourbus", "home", "street"]);
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
    const textLocation = inferLocationFromText(`${page.text} ${sceneOnly}`, true);
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
    const moved = movesPlace(page.text);
    /*
     * 클로드가 탈것 안을 적었고, 이 쪽이 정말 그 탈것 안에서 끝나면 클로드를 믿는다.
     *
     * 한 쪽 안에서 자리를 옮기면 그림은 그 쪽이 끝나는 곳이다. "어린이집 앞에서 버스에 올라탔어요"의
     * 본문 낱말은 어린이집이지만 아이는 이미 버스 안이다. 본문 낱말로 갈아 끼우면 떠나온 곳이 그려진다.
     * 탔다가 어딘가에 도착했거나 내렸으면("버스를 타고 놀이터에 도착했어요") 믿지 않고 본문을 따른다.
     */
    const claudeVehicle = location ? placeVehicleKind(location[1]) : null;
    const ridingThere = claudeVehicle !== null && ridingOnPage(page.text, sceneSentences(imagePrompt)) === claudeVehicle;
    if (
      location &&
      textLocation &&
      claudeFamily &&
      claudeFamily !== textLocation.family &&
      !ridingThere &&
      !(sameAsPrevious && !moved)
    ) {
      const correctedClause = `장소: ${textLocation.name} — ${textLocation.description}`;
      imagePrompt = imagePrompt.replace(location[0], correctedClause);
      location = LOCATION_PATTERN.exec(imagePrompt);
    }
    if (!location) {
      if (previous && !movesPlace(`${previous.text} ${page.text}`)) {
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
      !movesPlace(`${previous.text} ${page.text}`)
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
      // 장소 줄이 탈것이면 탈것 쪽이다 — 본문 낱말(어린이집 앞에서 버스에 탔어요)로 '어린이집 안'을 기억하지 않는다.
      const family = placeVehicleKind(location[1]) ?? textLocation?.family ?? locationFamily(location[1]);
      if (VENUE_FAMILIES.has(family)) {
        venue = textLocation ?? { family, name, description: "", index: 0 };
      } else if (LEAVES_VENUE.has(family)) {
        venue = null;
      } else if (venue && !movesPlace(page.text) && !clause.includes(venue.name)) {
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

/**
 * 장소 줄이 그 쪽이 **끝나는 자리**와 어긋나 보이는 곳을 찾는다 — 로그용 권고, 제작을 막지 않는다.
 *
 * 왜 막지 않나 — validateStoryQuality 의 항목은 하나라도 나오면 대본 한 편을 통째로 다시 산다(유료).
 * 그리고 이 판단은 낱말로 하는 짐작이라 틀릴 수 있다: "버스를 타고 포도밭에 갔어요"를 여기서는 닿은 것으로
 * 읽지만, 가는 중일 수도 있다. 그래서 자동으로 고치지도 않는다(repairStoryContinuity 는 클로드가 적은 탈것을
 * 지키기만 한다). 얼마나 자주 나오는지 재고, 어차피 다시 쓸 때만 '틀릴 수 있다'는 말과 함께 넘긴다.
 *
 *   ① 본문이 탈것에 타서 끝나는데(ridingAtEnd) 장소 줄이 탈것이 아니다 — 떠나온 곳을 적었을 수 있다.
 *   ② 본문이 어디에 닿았는데(도착·들어섬·갔·왔 — arrivedAt) 장소 줄이 탈것이거나 앞 쪽과 같은 곳이고,
 *      닿은 곳 이름도 없다.
 */
export function placeRuleNotes(story: ParsedStory): string[] {
  const notes: string[] = [];
  let previousKey = "";
  story.pages.forEach((page, index) => {
    const location = LOCATION_PATTERN.exec(page.imagePrompt ?? "");
    if (!location) return;
    const name = location[1].trim();
    const key = locationKeyOf(name);
    const vehicle = placeVehicleKind(name);
    const text = (page.text ?? "").normalize("NFC");
    const riding = ridingAtEnd(text);
    if (riding && !vehicle) {
      notes.push(`${index + 1}쪽 본문은 탈것을 타고 가는 중인데 장소가 '${name}'입니다`);
    } else if (!riding) {
      const destination = arrivedAt(text);
      // 도착한 곳이 장소 줄에 이미 있으면(교실에 도착 ↔ 어린이집 교실) 맞게 적은 것이다.
      const named = compact(name).includes(compact(destination));
      const destinationFamily = destination ? knownPlaceFamily(`${destination}에`) : null;
      const sameFamily = destinationFamily !== null && destinationFamily === knownPlaceFamily(name);
      if (destination && !named && !sameFamily && (vehicle || key === previousKey)) {
        notes.push(`${index + 1}쪽 본문은 '${destination}'에 도착했는데 장소가 '${name}'입니다`);
      }
    }
    previousKey = key;
  });
  return notes;
}

/** 판매를 중단해야 할 치명적 오류와, 자동 보정·이미지 QA로 처리할 권고를 분리한다. */
export function isBlockingStoryQualityIssue(issue: string): boolean {
  return /(페이지 수가|주인공 이름|본문이 지나치게 짧|다른 페이지와 중복|아동용 이야기로 사용할 수 없는)/.test(issue);
}

/**
 * 쪽 글의 최소 글자 수(띄어쓰기·부호 뺀 글자) — 이보다 짧으면 막는 오류다.
 *
 * 2세 이하는 낮춘다. 쪽 분량이 30~45자(띄어쓰기 포함, 글자로는 21~31자)라 25자 문턱은
 * 원래도 빠듯했는데, 한 문장 12자 안팎(story-punctuation.ts)으로 짧게 끊으라고 하면서
 * 두 문장짜리 쪽이 24자로 걸려 다시 쓰기(유료)·실패가 날 수 있었다(2026-09-29 검토).
 */
export function minPageLetters(age: number): number {
  return age <= 2 ? 15 : 25;
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
    if (normalized.length < minPageLetters(input.age)) issues.push(`${index + 1}쪽 본문이 지나치게 짧습니다.`);
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
        const hasExplicitMove = movesPlace(transitionText);
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
