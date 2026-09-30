/**
 * 쪽 그림 프롬프트와 그림 검수에 붙는 '판단 규칙' — 주인공 고정 · 탈것 안전 · 내린 뒤 장면.
 *
 * 왜 따로 뺐나 — 이 판단들이 라우트 한가운데 긴 배열 속에 있어서, 어떤 장면에 어떤 줄이
 * 붙는지 아무도 확인하지 못했다. 실제로 fe 계정 책(my-mu0issap)에서
 *   · 2층 관광버스 위층의 가족 셋이 전부 안전벨트를 맸고(승용차 규칙이 모든 쪽에 붙어 있었다),
 *   · "버스에서 내려 커다란 문을 지나자" 쪽이 버스 안 카시트 그림이 됐고,
 *   · 남자아이 주인공이 단발머리에 분홍 꽃핀을 달고 나왔다(쪽 그림엔 성별이 한 번도 안 갔다).
 * 여기 두면 시험(illustration-rules.test.ts)으로 "버스 장면엔 벨트 줄이 안 붙는다"를 못 박을 수 있다.
 *
 * 순수 함수만 둔다 — 네트워크·그림 없이 글만 받아 글을 돌려준다.
 * 상대 경로 + 확장자: node --test 가 "@/" 별칭을 모른다.
 */
import {
  isIndoorPlace,
  knownPlaceFamily,
  locationKeyOf,
  mentionsNotInCar,
  mentionsToyVehicle,
  mentionsVehicle,
  namesSchoolShuttle,
  placeVehicleKind,
  staleToyVehiclePlace,
  schoolShuttleName,
  schoolShuttleRide,
  vehicleState,
  type VehicleKind,
} from "./story-quality.ts";

export type HeroGender = "boy" | "girl";
/** 책의 주인공 — 쪽 그림마다 성별·생김새를 못 박는 데 쓴다. */
export type HeroInfo = { name: string; gender?: HeroGender; looks?: string };

/*
 * 인물 설명에서 성별을 짐작한다 — 주인공 정보를 저장하지 않던 옛 책을 다시 그릴 때만 쓴다.
 * 둘 다 나오거나 아무것도 없으면 모른다고 한다. 틀린 성별을 박는 것보다 안 박는 편이 낫다.
 */
const BOY_WORDS = /(남자\s*아이|남자애|남아|소년|사내\s*아이|\bboy\b)/i;
const GIRL_WORDS = /(여자\s*아이|여자애|여아|소녀|\bgirl\b)/i;

export function genderFromDescription(text: string): HeroGender | undefined {
  const source = (text ?? "").normalize("NFC");
  const boy = BOY_WORDS.test(source);
  const girl = GIRL_WORDS.test(source);
  if (boy === girl) return undefined;
  return boy ? "boy" : "girl";
}

/**
 * 요청 본문의 hero 칸을 읽는다. 없으면(옛 책) 등장인물 첫 사람을 주인공으로 본다 —
 * 만들기 화면이 늘 주인공을 첫 자리에 둔다(page.tsx 의 characterIndex === 0).
 */
export function readHero(raw: unknown, cast: { name: string; description: string }[]): HeroInfo | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as { name?: unknown; gender?: unknown; looks?: unknown };
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 30) : (cast[0]?.name ?? "");
  if (!name) return null;
  const description = cast.find((c) => c.name === name)?.description ?? "";
  const gender =
    o.gender === "boy" || o.gender === "girl" ? o.gender : genderFromDescription(description);
  // 500자 — 등장인물 설명(illustrate-page cast)과 같은 기준. 어른 칸이 늘어 300자면 끝이 잘렸다.
  const looks = typeof o.looks === "string" && o.looks.trim() ? o.looks.trim().slice(0, 500) : description;
  return { name, gender, looks: looks || undefined };
}

/**
 * 만들기 화면이 쪽 그림 요청과 책에 싣는 주인공 칸 — 주인공은 늘 등장인물 첫 자리다.
 * 성별은 boy/girl 일 때만 싣는다("unspecified"는 모른다는 뜻이라 빼야 서버가 머리 모양만 잠근다).
 */
export function heroFromStory(
  characters: { name: string }[],
  gender: unknown,
  looks: string,
): HeroInfo | undefined {
  const name = characters[0]?.name?.trim();
  if (!name) return undefined;
  return {
    name,
    ...(gender === "boy" || gender === "girl" ? { gender } : {}),
    ...(looks.trim() ? { looks: looks.trim() } : {}),
  };
}

export type PageVehicle = {
  /**
   * 이 쪽이 어느 탈것 안인가 — 승용차·택시(car) / 버스·기차·지하철(transit) / 아님(null).
   * 어린이집 차·학원 차도 통학 버스(schoolBus)면 transit 이다 — 가족 승용차 좌석 규칙(운전석 엄마 아빠)이 붙지 않게.
   */
  vehicle: VehicleKind | null;
  /**
   * 어린이 통학 버스(어린이집·유치원·학원 버스, 등·하원 차) 안이다 — 아이들이 벨트를 맨 모습으로 그린다.
   * 세림이법으로 통학 버스의 아이는 벨트를 맨다(2026-09-29 사장님 "조아"). 시내버스·기차·지하철은 그대로 벨트 없음.
   */
  schoolBus: boolean;
  /** 본문이 "탈것에서 내렸다"고 말한다 — 탈것 실내를 그리면 틀린다. */
  gotOff: boolean;
  /** 2층 관광버스 위층(지붕 없음) — 시내버스 실내와 다르게 그린다. */
  openDeck: boolean;
  /**
   * 장소 줄은 탈것인데 본문은 내렸다고 한다 — 장소 줄이 틀렸다.
   * 옛 판정("버스에서 내려"를 버스 안으로 읽음)이 이미 책에 박아 둔 장소 줄이다. 다시 그릴 때 따르지 않는다.
   */
  staleVehicleLocation: boolean;
  /** 탈것이 아닌 쪽인데 책 어딘가에 탈것 이야기가 있다 — "벨트 없음"을 따로 일러 줄 때. */
  vehicleNearby: boolean;
  /**
   * 탈것 안이 아닌 쪽에 놀잇감 탈것이 나온다 — 장난감 자동차, 종이 상자 기차, 음식 모형을 채워 넣은 '자동차 안'.
   * 그 차는 방·교실 바닥의 놀잇감이라고 한 줄 일러 준다(벨트 낱말은 꺼내지 않는다).
   */
  toyVehicle: boolean;
};

/**
 * 이 쪽이 탈것 안인지 정한다.
 *
 * 예전엔 장소 줄 **또는** 장면·본문 어디든 탈것 낱말이 스치면 차 안으로 봤다. 그래서 궁궐 마당을
 * 걷는 쪽도 본문에 '버스'가 있으면 벨트 규칙이 붙을 수 있었다. 이제 순서를 둔다.
 *   ① 장소 줄이 탈것이면 장소 줄을 따른다. 장면 문장이 내렸다고 하거나, 본문이 내렸다고 하는데
 *      장면 문장은 타고 있다는 말이 없을 때만 그 장소 줄을 틀린 것으로 본다.
 *      (본문의 '내렸다' 하나로 버리면 "2층 버스에서 내려다보니" 같은 쪽의 장소 잠금이 빠졌다.)
 *   ② 본문·장면이 "내렸다"고 하면 탈것 안이 아니다 — 단 장면 문장이 타고 있다고 하면 장면을 믿는다.
 *   ③ 장소 줄이 머무는 곳(마당·거실·실내)이면 본문 낱말로 뒤집지 않는다.
 *      길·도로("할머니 댁 가는 길")와 모르는 곳은 머무는 곳이 아니다 — 차를 타고 지나가는 자리일 수 있다.
 *   ④ 그 밖에는 장면 문장, 그다음 본문. 둘 다 '타고 있다'는 꼴(버스 안·차를 타고)만 센다.
 */
export function pageVehicle(input: {
  locationName?: string;
  locationDescription?: string;
  /** 잠금 줄(등장인물·장소·물건)을 뺀 장면 문장. */
  sceneBody?: string;
  storyText?: string;
  /** 부모 장소 칸처럼 책 전체에 걸친 글 — '근처에 탈것 이야기가 있나'에만 쓴다. */
  bookContext?: string;
  /**
   * 같은 장소 줄(열쇠)의 다른 쪽이 어린이 통학 버스다 — 책 전체를 본 schoolBusPlaceKeys 가 정한다.
   * 이 쪽 본문이 무슨 버스인지 말하지 않을 때만 쓴다("창밖으로 포도밭이 보였어요").
   */
  schoolBusPlace?: boolean;
  /** 앞·뒤 쪽의 장소 이름 — 탈것이면 이어 타는 중이라 이 쪽 탈것 줄을 놀잇감으로 버리지 않는다. 모르면 없다. */
  neighbourPlaces?: string[];
}): PageVehicle {
  const name = input.locationName?.trim() ?? "";
  const description = input.locationDescription?.trim() ?? "";
  const sceneBody = input.sceneBody ?? "";
  const storyText = input.storyText ?? "";
  const location = `${name} ${description}`.trim();
  /*
   * 지붕 없는 2층 위층인가 — '관광버스'만으로는 켜지 않는다(창문 있는 단층 관광버스가 지붕 없는 그림이 됐다).
   * 본문에서는 버스 낱말에 붙은 '2층 버스·버스 위층'만 본다. "2층 집에 사는 할머니"는 버스와 무관하다.
   */
  const openDeck =
    /(위층|지붕\s*없|오픈\s*탑|시티\s*투어|(?:2층|이층)\s*[가-힣]{0,8}버스)/.test(location) ||
    /((?:2층|이층|오픈\s*탑)\s*[가-힣]{0,8}버스|시티\s*투어\s*버스|버스\s*(?:위층|2층|이층)|지붕\s*없는\s*[가-힣]{0,4}버스)/.test(
      `${sceneBody} ${storyText}`,
    );
  /*
   * 글마다 따로 본다 — 이어 붙이면 장소 설명의 '장난감 수납장'이 본문의 진짜 버스를 놀잇감으로 만든다(notARideAt ③은
   * '같은 글 앞에 나온 놀잇감'을 본다).
   */
  const nearby = [location, sceneBody, storyText, input.bookContext ?? ""].some((text) => mentionsVehicle(text));
  const toyOnPage = mentionsToyVehicle(sceneBody) || mentionsToyVehicle(storyText);
  /** 이 쪽 글(장면·본문)에 진짜 탈것 이야기가 있나 — 책 전체 글(부모 장소 칸)은 빼고. */
  const nearbyOnPage = [sceneBody, storyText].some((text) => mentionsVehicle(text));

  const scene = vehicleState(sceneBody);
  const story = vehicleState(storyText);
  /** 주차장·세차장 이야기에서 나온 '차'는 차 안이 아니다. */
  const carUnlessParked = (kind: VehicleKind | null, text: string): VehicleKind | null =>
    kind === "car" && mentionsNotInCar(text) ? null : kind;

  /*
   * 머무는 곳 — 실내로 확정된 곳이거나 목록의 머무는 장소(길·도로 계열은 뺀다).
   * 실외로만 확정된 곳(isIndoorPlace=false)은 넣지 않는다: "아빠 차 — 창밖으로 흐르는 바다 풍경"이
   * 설명의 '바다' 때문에 실외로 잡혀, 진짜 차 안 쪽에 "벨트 없음"이 붙었다.
   */
  const nameKind = name ? placeVehicleKind(name) : null;
  const family = name ? knownPlaceFamily(name) : null;
  const stayPlace =
    Boolean(name) &&
    !nameKind &&
    (mentionsNotInCar(name) ||
      isIndoorPlace(name, description) === true ||
      (family !== null && !["street", "car", "transit", "tourbus"].includes(family)));
  const locationKind = stayPlace
    ? null
    : carUnlessParked(nameKind ?? (description ? vehicleState(description).kind : null), location);

  /*
   * 어린이 통학 버스인가 — 장소 줄이 탈것이면 차례로 본다.
   *   ① 장소 이름 — '어린이집 버스 안'이면 통학 버스, '시내버스 안'·'아빠 차'면 아니다. 이름이 정하면 설명·본문에 스친
   *      다른 탈것("창밖으로 기차가 지나가는")으로 뒤집지 않는다.
   *   ② 이름이 그냥 '버스 안'·'노란 버스 안'이면 본문(없으면 장면 문장)에서 **탄** 탈것 — schoolShuttleRide. 놓치거나
   *      창밖으로 본 어린이집 버스는 세지 않는다("어린이집 버스를 놓쳐서 엄마랑 버스를 탔어요"는 시내버스다).
   *   ③ 그래도 모르면 이름('노란 버스' + 같은 쪽의 어린이집 말)·장소 설명이 통학 버스를 부르거나,
   *      같은 장소 줄의 다른 쪽이 통학 버스였다(schoolBusPlace) — 한 번 탄 버스는
   *      내릴 때까지 같은 버스다. 어린이집 말이 앞 쪽에만 있다고 뒤 쪽을 벨트 금지로 돌리면, 벨트 맨 앞 쪽 그림을
   *      기준으로 받은 뒤 쪽이 검수에서 떨어진다(2026-09-29 검토).
   * 장소 줄이 탈것이 아니면(본문에서 탈것을 찾은 쪽) 탄 탈것을 먼저, 모르면 장소 이름을 본다("하원 차량"·"어린이집 버스
   * 정류장"에서 버스에 탄 쪽).
   * 통학 버스는 어린이집 차·학원 차여도 transit 으로 둔다 — 가족 승용차 줄(운전석 엄마 아빠, 앞뒤 좌석)이 붙지 않게.
   * 통학 버스는 지붕 없는 2층 위층일 수 없다 — 본문에 스친 '2층 버스'로 위층 그림을 켜지 않는다.
   */
  const cueContext = `${location} ${sceneBody} ${storyText}`;
  const schoolBusOf = (kind: VehicleKind, fromLocation: boolean): boolean => {
    // 이름만으로 정해지는 곳(어린이집 버스 안 · 시내버스 안)은 이름을 따른다. '노란 버스'처럼 어린이집 말이 있어야
    // 통학 버스인 이름은 본문이 "어린이집 버스를 놓쳐서 …"면 아니니, 탄 탈것을 먼저 본다.
    const byName = schoolShuttleName(name);
    if (fromLocation && byName) return byName === "shuttle";
    const byRide = schoolShuttleRide(storyText, kind, cueContext) ?? schoolShuttleRide(sceneBody, kind, cueContext);
    if (byRide) return byRide === "shuttle";
    const nameWithCue = schoolShuttleName(name, cueContext) === "shuttle";
    if (!fromLocation) return nameWithCue;
    return nameWithCue || namesSchoolShuttle(description, cueContext) || input.schoolBusPlace === true;
  };

  if (locationKind) {
    const off = scene.gotOff || (story.gotOff && !scene.kind);
    if (off) {
      return { vehicle: null, schoolBus: false, gotOff: true, openDeck: false, staleVehicleLocation: true, vehicleNearby: nearby, toyVehicle: false };
    }
    /*
     * 놀잇감 탈것을 탈것 안으로 읽어 박힌 장소 줄 — 어제까지의 판정이 "자동차 안에 가득가득 채워 넣었어요"를 보고
     * "자동차 안 — 뒷좌석 안전벨트 …"를 책에 저장했다. 한 쪽 다시 그리기는 저장된 줄을 그대로 보내 또 차 안이 됐다
     * (2026-09-30 사장님 "재생성 했을때도 차안이란 컨셉을 버리지 못했어"). 다 맞을 때만 버린다 —
     *   이름이 누구 탈것인지 밝히지 않았고(아빠 차·어린이집 버스는 클로드가 진짜 탈것을 적은 것),
     *   설명이 옛 판정이 붙인 기성 글 그대로이고(클로드가 제 말로 적은 차 안은 한 쪽짜리 진짜 차일 수 있다),
     *   이 쪽 글이 탈것을 놀잇감·그릇으로 말하고(toyOnPage), 탄 흔적이 하나도 없고(ridesInText),
     *   앞·뒤 쪽이 탈것이 아니다(이어 타는 중에 장난감 자동차를 쥔 쪽은 진짜 차 안이다).
     */
    const toyPlace =
      nameKind !== null && staleToyVehiclePlace({ name, description, sceneBody, storyText, neighbourNames: input.neighbourPlaces });
    if (toyPlace) {
      return { vehicle: null, schoolBus: false, gotOff: false, openDeck: false, staleVehicleLocation: true, vehicleNearby: nearbyOnPage, toyVehicle: true };
    }
    const schoolBus = schoolBusOf(locationKind, true);
    return {
      vehicle: schoolBus ? "transit" : locationKind,
      schoolBus,
      gotOff: false,
      openDeck: locationKind === "transit" && openDeck && !schoolBus,
      staleVehicleLocation: false,
      vehicleNearby: nearby,
      toyVehicle: false,
    };
  }

  if ((scene.gotOff || story.gotOff) && !scene.kind) {
    return { vehicle: null, schoolBus: false, gotOff: true, openDeck: false, staleVehicleLocation: false, vehicleNearby: nearby, toyVehicle: false };
  }

  const vehicle = stayPlace
    ? null
    : (carUnlessParked(scene.kind, sceneBody) ?? carUnlessParked(story.kind, storyText));
  const schoolBus = vehicle !== null && schoolBusOf(vehicle, false);
  return {
    vehicle: schoolBus ? "transit" : vehicle,
    schoolBus,
    gotOff: false,
    openDeck: vehicle === "transit" && openDeck && !schoolBus,
    staleVehicleLocation: false,
    // 머무는 곳인데 장면 문장은 타고 있다고 한다 — 어느 쪽이 맞는지 모르니 "벨트 없음"을 박지 않는다.
    // 이 쪽 탈것이 놀잇감뿐이면 책 전체 글(장소 칸에 남은 옛 '자동차 안은 뒷좌석 안전벨트…')로 벨트 낱말을 꺼내지 않는다.
    vehicleNearby: nearby && !(vehicle === null && scene.kind) && !(vehicle === null && toyOnPage && !nearbyOnPage),
    toyVehicle: vehicle === null && toyOnPage,
  };
}

/**
 * 책에서 어린이 통학 버스인 **장소**의 열쇠(locationKeyOf)들 — 쪽 그림 요청의 schoolBusPlace 를 정한다.
 *
 * 통학 버스인지는 쪽마다 정하는데, 장소 기준 그림·같은 장소 기준 쪽은 열쇠가 같은 쪽끼리 나눠 쓴다. 그래서
 * "노란 버스 안"으로 탄 여러 쪽 중 '어린이집 친구들이랑 … 올라탔어요' 쪽만 통학 버스(벨트)이고, 다음 쪽
 * '창밖으로 포도밭이 보였어요'는 벨트 금지 + 벨트 FAIL 이 됐다. 뒤 쪽은 벨트 맨 앞 쪽 그림을 기준으로 받으니
 * 그대로 따라 그리고 떨어져, 다시 그리기(약 95원)만 쓴다(2026-09-29 검토). 한 장소 줄의 어느 쪽이든 통학 버스면
 * 그 장소는 통학 버스다 — 본문이 다른 탈것을 대놓고 말한 쪽은 pageVehicle 이 여전히 뺀다.
 * 장소 줄이 탈것인 쪽만 센다(열쇠가 곧 그 탈것일 때). 장소 줄은 쪽 그림 라우트와 같은 모양(`장소: 이름 — 설명`)으로 읽는다.
 */
export function schoolBusPlaceKeys(pages: { imagePrompt?: string; text?: string }[]): Set<string> {
  const keys = new Set<string>();
  for (const page of pages) {
    const scene = page.imagePrompt ?? "";
    const location = /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/.exec(scene);
    const name = location?.[1].trim() ?? "";
    if (!location || !placeVehicleKind(name)) continue;
    // 잠금 줄(등장인물·장소·물건)을 뺀 장면 문장 — 쪽 그림 라우트(api/illustrate-page)와 같은 방법.
    const sceneBody = scene
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:등장인물|장소\s*:|물건\s*:)/.test(line))
      .join(" ")
      .replace(/등장인물\s*\d+\s*명(?:\s*:[^.\n]*)?\.?/g, "")
      .replace(/(?:장소|물건)\s*:[^.\n]*\.?/g, "");
    const ride = pageVehicle({ locationName: name, locationDescription: location[2].trim(), sceneBody, storyText: page.text ?? "" });
    if (ride.schoolBus) keys.add(locationKeyOf(name));
  }
  return keys;
}

/*
 * 본문이 주인공에게 머리 장식·모자를 직접 씌우는가 — "하온이도 친구가 준 꽃을 머리에 꽂았어요",
 * "생일 고깔모자를 썼어요".
 *
 * 왜 보나 — 주인공 고정 줄은 "남자아이에게 꽃·핀·리본 없음"을 못 박는다. 그런데 본문이 직접 꽃을
 * 꽂게 하면 프롬프트와 검수가 서로 부딪쳐, 본문대로 맞게 그린 그림이 계속 떨어지고 다시 그리기
 * 예산만 쓴다. 한 문장 안에 주인공 이름 · 장식 낱말 · 다는 말이 함께 있을 때만 켠다.
 */
const HEAD_THINGS = /(꽃|핀|리본|머리띠|모자|고깔|왕관|화관|족두리|갓|두건|헬멧|가면|머리끈)/;
const PUT_ON = /(꽂|달았|달고|달아(?!나)|썼|쓰고|쓴|써\s*보|둘렀|둘러|얹었|얹고|끼웠|묶었)/;

export function heroPutsOnHeadThing(storyText: string, heroName: string): boolean {
  const name = (heroName ?? "").normalize("NFC").trim();
  if (!name) return false;
  return (storyText ?? "")
    .normalize("NFC")
    .split(/[.!?\n]/)
    .some((sentence) => sentence.includes(name) && HEAD_THINGS.test(sentence) && PUT_ON.test(sentence));
}

/**
 * 주인공 고정 줄 — 등장인물 수와 상관없이 주인공이 나오는 쪽마다 붙인다.
 *
 * 예전엔 "시트대로 성별을 지켜라"가 둘 이상 나오는 쪽의 인물 잠금 안쪽에만 있었다. 그리고 쪽 그림
 * 요청에는 '주인공은 남자아이'라는 말이 한 번도 가지 않았다. 그래서 짧은 바가지 머리 남자아이가
 * 헝클어진 단발로, 한복 입은 사람들 사이에선 분홍 꽃핀까지 달고 나왔다(my-mu0issap 2·5쪽).
 * 손으로 "HAON IS A BOY … NO hair clips, NO flowers" 를 넣어 다시 그렸더니 바로 맞게 나왔다.
 *
 * storyText 를 주면, 본문이 주인공에게 직접 씌우는 장식은 금지에서 뺀다(heroPutsOnHeadThing).
 */
export function heroLockLines(hero: HeroInfo | null, storyText = ""): string[] {
  if (!hero?.name) return [];
  const { name, gender } = hero;
  const textGivesHeadThing = heroPutsOnHeadThing(storyText, name);
  const lines = [
    `HERO LOCK — ${name} is the main child of this book${gender ? ` and is a ${gender === "boy" ? "BOY" : "GIRL"}` : ""}. On this page ${name} looks exactly like the character reference sheet: the same face, the same hairstyle, the same hair length and the same outfit colours.`,
  ];
  // 본문이 씌우는 장식이 있으면 그것만 허락한다 — 금지 문장과 장면 문장이 부딪치지 않게.
  const accessoryRule = textGivesHeadThing
    ? `Add only the head accessory that the story text itself puts on ${name}; no other hair clip, flower, ribbon or hairband.`
    : null;
  if (gender === "boy") {
    lines.push(
      `${name} IS A BOY. Keep his hair exactly as short and as shaped as on the sheet — never grow it longer, and never draw it long, messy, wispy, bob-cut, in pigtails or in a ponytail. ${accessoryRule ?? "NO hair clips, NO flowers, NO ribbons, NO hairbands on him."}`,
    );
  } else if (gender === "girl") {
    lines.push(
      `${name} IS A GIRL. Keep her hairstyle and hair length exactly as on the sheet — never cut it short or make her look like a boy. ${accessoryRule ?? "Add no hair accessory the sheet does not show."}`,
    );
  } else {
    lines.push(
      `Keep ${name}'s hair shape and hair length exactly as on the sheet. ${accessoryRule ?? "Add no hair clip, flower, ribbon or hairband that the sheet does not show."}`,
    );
  }
  if (hero.looks) lines.push(`${name}'s appearance: ${hero.looks}.`);
  lines.push(
    `OTHER PEOPLE'S THINGS STAY WITH THEM — flowers or clips in the hair, ribbons, hanbok, crowns, hats and costumes that the scene gives to OTHER people belong only to those people. Never move them onto ${name}. ${name} keeps the outfit from the sheet unless the text says ${name} puts something on.`,
  );
  return lines;
}

/**
 * 탈것 안 배경 줄 — 쪽 그림(api/illustrate-page)과 장소 시트(api/location-sheet)가 '실내' 줄 대신 쓴다.
 *
 * 버스·차 안도 isIndoorPlace 로는 실내라, 예전엔 "INSIDE a building … shelves, furniture … 바깥은 작은 창으로만"이
 * 붙었다. 이름이 '어린이집 버스 안'이면 어린이집·건물·선반이 한꺼번에 들어가 교실 창가 그림으로 끌려간다
 * (2026-09-29 사장님 보고 — 버스에 올라탄 쪽이 어린이집 교실 창가로 나왔다). 검수도 "창밖이 작은 창보다 크면 FAIL"
 * 이라, 창밖으로 나무가 휙휙 지나가는 맞는 그림을 떨어뜨릴 수 있었다. 부르는 쪽은 이때 indoor 를 null 로 둔다.
 * 지붕 없는 2층 버스 위층은 실내가 아니라 여기 들지 않는다(부르는 쪽이 openDeck 을 뺀다).
 *
 * 어린이 통학 버스(schoolBus)면 좌석마다 작은 아이용 벨트가 있다고 한 줄 더한다 — 장소 시트는 쪽 검수의 정답이라,
 * 시트의 좌석에 벨트가 없으면 벨트 맨 아이가 든 쪽 그림과 어긋나 보인다. 다른 탈것의 줄은 한 글자도 그대로다.
 */
export function vehicleInteriorLines(kind: VehicleKind, name: string, schoolBus = false): string[] {
  const place = name.trim() || "this vehicle";
  const what = schoolBus ? "a children's daycare or school shuttle bus" : kind === "car" ? "a car" : "a bus, train or subway";
  return [
    `VEHICLE INTERIOR — "${place}" is the inside of ${what} on the move, NOT a building and NOT a room. Draw its seats, its ${kind === "car" ? "cabin" : "aisle and floor"} and its side windows, seen from inside.`,
    ...(schoolBus ? ["Its seats are low, child-size bus seats, each with a small child-size seat belt."] : []),
    "No classroom, no house room, no desks, no shelves, no toy storage and no room furniture anywhere in it.",
    "The passing scenery outside (trees, fields, streets) may show clearly through the windows, but everyone stays inside the vehicle.",
    "PRESENT-DAY KOREA — a modern vehicle interior, with modern scenery outside.",
  ];
}

/** 이 쪽에 탈것 이야기가 있나 — 벨트라는 낱말을 꺼낼지 정한다. */
function vehicleTalk(page: PageVehicle | null | undefined): boolean {
  return Boolean(page && (page.vehicle || page.gotOff || page.vehicleNearby));
}

/**
 * 아이 안전 · 탈것 규칙.
 *
 * 예전엔 승용차 벨트·카시트·왼쪽 핸들·차 안 신발 문장이 **모든 쪽에 조건 없이** 붙었다.
 * 그림 모델은 받은 문장을 그리려 든다 — 관광버스 위층에도, 버스에서 내린 궁궐 마당에도
 * 벨트와 카시트가 나왔다. 서 있는 엄마 아빠가 어깨벨트를 맨 그림까지 나왔다(my-mu0issap 3쪽).
 *
 * 그래서 늘 붙이는 것은 탈것과 무관한 일반 규칙(가구·난간 위에 서지 않기)뿐이다.
 * "서 있는 사람은 벨트를 매지 않는다"도 탈것 이야기가 있는 쪽에만 붙인다 — 탈것이 없는 거실·옛이야기
 * 쪽에 'seat belt' 낱말을 넣으면 오히려 벨트를 부른다. 벨트·카시트는 승용차·택시 안일 때만,
 * 버스·기차·지하철에서는 반대로 "벨트·카시트 없음"을 일러 준다.
 * 어린이 통학 버스만 예외다 — 세림이법대로 아이들이 낮은 버스 좌석에서 벨트를 맨다(카시트는 없다).
 */
export function safetyRuleLines(page: PageVehicle, indoor: boolean | null): string[] {
  const lines = [
    "CHILD SAFETY — a small child copies what they see in a picture book. Never draw a child in a posture that would be dangerous in real life.",
    "Never draw a child standing on a sofa, chair, table, window sill, railing or stair rail. If the text says they jumped up or sprang up, draw them standing on the floor or sitting up on the seat.",
  ];
  if (vehicleTalk(page)) lines.push("A person who is STANDING never wears a seat belt.");
  /*
   * 집 안 신발 줄은 탈것 안에는 붙이지 않는다 — '버스 안·차 안'도 실내(isIndoorPlace)로 잡혀, 버스에 탄
   * 아이를 맨발로 그리라는 말이 됐다(승용차는 "Inside a car, shoes stay ON"과 정면으로 부딪쳤다).
   * 쪽 그림 라우트는 탈것 안이면 indoor 를 아예 null 로 넘기지만, 다른 부르는 쪽을 위해 여기서도 막는다.
   */
  if (indoor === true && !page.vehicle) {
    lines.push("Indoors at home Koreans do not wear shoes, and shoes are left at the entrance, not in the middle of the living room.");
  }
  if (page.gotOff) {
    // '바깥에'라고 박지 않는다 — 내려서 할머니 댁 거실로 들어간 쪽도 있다. 도착한 곳은 장소 줄이 정한다.
    lines.push(
      "ALREADY OFF THE VEHICLE — the text says they have already GOT OFF. Draw them standing or walking at the place they arrived, off the vehicle. No bus, train, subway or car interior, no vehicle seats, NO seat belts, NO car seats.",
    );
  } else if (page.vehicle === "car") {
    lines.push(
      "In a moving car the child is seated facing FORWARD in a rear seat with the seat belt clearly fastened across their chest and lap (or strapped into a child seat). Never draw a child kneeling, standing, turned backwards, leaning out, or without a visible belt while the car is moving. Adults in the car wear their belts too.",
      "Korean cars are LEFT-hand drive: the steering wheel and the driver are on the LEFT side of the car.",
      "Inside a car, shoes stay ON.",
      /*
       * 차 안 좌석 — 자동차 실내는 앞뒤 좌석이 겹쳐 보이는 좁은 공간이라, 사람을 여럿 넣으면
       * 누가 어느 자리에 앉았는지가 뒤엉킨다. 실제로 엄마가 앞자리와 뒷자리 사이에 떠 있는
       * 그림이 나왔다(사장님 확인, 2026-09-08). 자리를 말로 못 박고, 구도를 아이 쪽으로 당긴다.
       */
      "CAR INTERIOR — this scene happens inside a moving car. Car cabins are the easiest place to draw wrong, so follow these exactly.",
      "SEATS: a Korean car is LEFT-hand drive. The driver sits in the FRONT-LEFT seat with both hands on the steering wheel. The front passenger sits FRONT-RIGHT. Children sit in the REAR seats, never in front.",
      "ONE PERSON PER SEAT, and every person sits properly ON a seat — never between two seats, never floating in the aisle, never half in the front row and half in the back. Draw the seat backs and headrests clearly so it is obvious which row each person is in.",
      "FRAME IT CLOSE ON THE CHILD. Put the camera inside the cabin beside the child in the rear seat, close enough that the child fills much of the picture. Adults appear only partly — the back of a head, a shoulder, or a face turned in profile past the front seat back. Do not attempt a wide view of the whole cabin with every passenger fully visible.",
      "Everyone wears a seat belt, clearly visible across chest and lap. The child faces FORWARD, seated, belt fastened. Never kneeling, standing, turned around, or leaning out of a window.",
      "EACH PERSON APPEARS EXACTLY ONCE IN THE CAR. An adult who is in a front seat must NOT also appear in the back seat, and vice versa. Count the people before you finish: the picture contains each named person one single time.",
      "The window shows the passing scenery outside; do not draw a second car interior, a mirrored cabin, or a doubled row of seats.",
    );
  } else if (page.vehicle === "transit" && page.schoolBus) {
    lines.push(
      "SCHOOL SHUTTLE — this scene is on a children's daycare or kindergarten shuttle bus, NOT a private car and NOT a city bus. The children sit in the low bus seats, each wearing a buckled child-size seat belt (lap-and-shoulder style). No child car seats, and no one stands in the aisle while the bus is moving.",
    );
  } else if (page.vehicle === "transit") {
    lines.push(
      "PUBLIC TRANSPORT — this scene is on a bus, train or subway, NOT in a car. Draw NO seat belts and NO child car seats on anyone. People sit on ordinary seats, or stand holding a handrail or strap.",
    );
    if (page.openDeck) {
      lines.push(
        "This is the OPEN upper deck of a double-decker sightseeing tour bus: rows of ordinary seats under open sky with a low side rail — no roof, no ceiling straps, no seat belts, no car seats.",
      );
    }
  } else if (page.vehicleNearby) {
    lines.push("This page is NOT inside any vehicle: no vehicle seats, NO seat belts, NO car seats.");
  }
  /*
   * 놀잇감 탈것 — "자동차 안에 가득가득 채워 넣었어요"의 자동차는 교실 바닥의 장난감이다. 본문(What happens on this page)에
   * 맨 '자동차 안'이 그대로 가니, 그림 모델이 진짜 차 안으로 끌려가지 않게 한 줄 붙인다(2026-09-29 사장님 — 뒷좌석 그림).
   */
  if (page.toyVehicle && !page.vehicle && !page.gotOff) {
    lines.push(
      "TOY VEHICLE — the car, bus or train named on this page is a child's toy (a small toy, or a cardboard play vehicle big enough to sit in) on the floor or a table of this place. The children play with it right here; no one is inside a real vehicle.",
    );
  }
  return lines;
}

/**
 * 검수(validateIllustration)에 더하는 FAIL 규칙.
 *
 * 좁게 쓴다 — 검수가 까다로우면 멀쩡한 그림도 떨어져 다시 그리기 비용이 늘고, 책 한 권의
 * 다시 그리기 예산이 앞 쪽에서 바닥난다. 사람이 한눈에 "틀렸다"고 할 경우만 적는다.
 * storyText 를 주면, 본문이 주인공에게 직접 씌운 장식은 FAIL 로 치지 않는다(프롬프트와 같은 예외).
 */
export function checkRuleLines(input: { hero?: HeroInfo | null; page?: PageVehicle | null; storyText?: string }): string[] {
  const lines: string[] = [];
  const hero = input.hero;
  if (hero?.name) {
    const allowed = heroPutsOnHeadThing(input.storyText ?? "", hero.name);
    const accessory = allowed
      ? ""
      : `, or wearing a hair clip, flower, ribbon or hairband that the sheet does not show (unless the story text puts it on ${hero.name})`;
    if (hero.gender === "boy") {
      lines.push(
        `If ${hero.name} (the main child, a BOY) is visible: FAIL only if he is clearly drawn with long, bob-cut, pigtailed or ponytail hair, or with clearly longer hair than on the character sheet${accessory}.`,
      );
    } else if (hero.gender === "girl") {
      lines.push(
        `If ${hero.name} (the main child, a GIRL) is visible: FAIL only if she is clearly drawn as a boy, or her hair is clearly much shorter or a different style than on the character sheet.`,
      );
    } else {
      lines.push(
        `If ${hero.name} (the main child) is visible: FAIL only if the hair length or hair shape is clearly different from the character sheet${accessory}.`,
      );
    }
  }
  const page = input.page;
  // 탈것 이야기가 전혀 없는 책(거실·놀이터)에는 벨트 규칙을 붙이지 않는다 — 검수 문장이 늘수록 엉뚱하게 떨어진다.
  if (vehicleTalk(page)) lines.push("FAIL if a person who is STANDING wears a seat belt.");
  if (page?.gotOff) {
    lines.push(
      "The story text says they have already GOT OFF the vehicle: FAIL if they are drawn inside a bus, train, subway or car interior, or sitting in vehicle seats.",
    );
  } else if (page?.vehicle === "transit") {
    /*
     * 어린이 통학 버스는 벨트를 맨 아이가 맞는 그림이다 — 벨트로 떨어뜨리지 않는다.
     * 벨트가 안 보인다고 떨어뜨리는 줄도 넣지 않는다: 벨트는 작아서 헛떨어짐이 잦고, 한 번 떨어질 때마다
     * 다시 그리기(약 95원)와 책 한 권의 다시 그리기 예산을 쓴다. 벨트는 그리기 프롬프트가 맡는다.
     * 카시트 FAIL 도 뺀다 — 아이 키에 맞춘 낮은 좌석을 카시트로 잘못 보고 떨어뜨릴 수 있다.
     */
    lines.push(
      page.schoolBus
        ? "This page is on a children's daycare or school shuttle bus: children wearing seat belts in their seats is correct and never a FAIL. Belts are small — do not FAIL the page because a belt is missing, hidden or hard to see."
        : "This page is on a bus, train or subway: FAIL if anyone wears a seat belt or sits in a child car seat.",
    );
    /*
     * 버스에 탄 쪽이 교실·방으로 그려지는 것 — 2026-09-29 사장님 보고의 바로 그 틀림. 한눈에 틀린 것만 적는다.
     * 창밖 풍경이 크게 보이는 것은 맞는 그림이다(탈것 안은 indoor 검사 줄을 받지 않는다).
     */
    if (!page.openDeck) {
      lines.push(
        "FAIL if the characters are drawn in a classroom, a house room or another building instead of inside the vehicle. Scenery through the vehicle windows is correct and is not a FAIL.",
      );
    }
  } else if (page && page.vehicle === null && page.vehicleNearby) {
    lines.push("This page is not inside a vehicle: FAIL if the characters are drawn sitting in vehicle seats with seat belts or in a child car seat.");
  }
  if (page?.toyVehicle && !page.vehicle && !page.gotOff) {
    lines.push("The vehicle on this page is a toy: FAIL if the characters are drawn inside a real car, bus or train cabin.");
  }
  return lines;
}
