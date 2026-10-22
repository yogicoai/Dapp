import { NextResponse } from "next/server";
import {
  heroShrunkOnPage,
  pageScale,
  readScaleKind,
  scaleCheckLines,
  scaleLockLines,
  tinyHeroCheckLines,
  tinyHeroLines,
} from "@/lib/scale-lock";
import { callerOf } from "@/lib/api-auth";
import { canCreate, createLockedResponse } from "@/lib/create-access-server";
import { ART_STYLES } from "@/lib/art-styles";
import { pickLocationDetail } from "@/lib/scene-edit";
import {
  checkRuleLines,
  heroLockLines,
  pageVehicle,
  readHero,
  safetyRuleLines,
  vehicleInteriorLines,
} from "@/lib/illustration-rules";
import { isIndoorPlace, locationKeyOf, placeVehicleKind, repairStaleVehicleScene } from "@/lib/story-quality";
import {
  GeminiError,
  detectBlankCanvasBorder,
  generateImage,
  loadReferenceImage,
  repairBlankCanvasBorder,
  toDataUrl,
  validateIllustration,
  type GeneratedImage,
} from "@/lib/gemini";
import { bindAiUsageSink, withAiUsage } from "@/lib/ai-usage";
import { cameraCheckLines, cameraLines } from "@/lib/page-camera";
import { dbUsageSink } from "@/lib/ai-usage-db";
import { familyFolderOf, familyUrlPrefix, fetchFamilyRefRetry } from "@/lib/family-ref";
import {
  arrangePageReferences,
  fixedCheckDescription,
  fixedFamilyFaceLines,
  facialFeatureLines,
  familyFramingCheckLines,
  familyFramingLines,
  maxPagePortraits,
  pageReferenceLabels,
  pickPagePortraits,
  portraitBindingLines,
  readPortraitFigure,
  readSheetOrder,
  readSheetOutfits,
  refOrdinal,
  sheetOrderLine,
} from "@/lib/page-refs";
import { composePortraitCard, sheetFigureMeta } from "@/lib/sheet-compose";

/*
 * 그리는 데 20~30초가 걸린다(검사에 걸려 다시 그리면 그 두 배).
 * 이 값을 안 적으면 배포 환경의 짧은 기본값이 걸려 도중에 잘린다 — 그때 돌아오는
 * 응답은 JSON이 아니라, 부르는 쪽은 이유도 모른 채 그 쪽만 빈 채로 넘어갔다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * 얼굴 카드 잠깐 기억 — 쪽마다(8~12번) 같은 사람의 카드를 다시 짜지 않게. 가족 그림 주소는 그릴 때마다 새 이름이라
 * (lib/family-ref fetchFamilyRefCached 머리글) 주소 + 머리 비율이 같으면 카드도 같다. 서버 한 대 안에서만 산다.
 * 짜지 못하면 null — 부르는 쪽이 원본 그대로 붙인다. 로그에 주소를 남기지 않는다(회원 uid 가 들어 있다).
 */
const CARD_CACHE_MAX = 24;
const cardCache = new Map<string, GeneratedImage>();
async function portraitCard(url: string, image: GeneratedImage, headRatio: number): Promise<GeneratedImage | null> {
  const key = `${url}#${headRatio}`;
  const hit = cardCache.get(key);
  if (hit) {
    cardCache.delete(key);
    cardCache.set(key, hit);
    return hit;
  }
  try {
    const card = await composePortraitCard({ image, headRatio });
    cardCache.set(key, card);
    while (cardCache.size > CARD_CACHE_MAX) {
      const oldest = cardCache.keys().next().value;
      if (oldest === undefined) break;
      cardCache.delete(oldest);
    }
    return card;
  } catch (e) {
    console.warn("[illustrate-page] 얼굴 카드를 짜지 못해 원본 그대로:", (e as Error).message);
    return null;
  }
}

/**
 * 쪽별 삽화. 클로드가 쓴 장면 묘사(@@IMG@@) + 그림체 프롬프트 + 캐릭터 시트 참조.
 *
 * 한 번에 한 쪽만 그린다 — 8쪽을 한 요청에 다 그리면 타임아웃에 걸리고, 쪽마다
 * 따로 하면 클라이언트가 진행률(3/8...)을 보여줄 수 있다. 하단 1/4 여백은 뷰어의
 * 텍스트 오버레이 자리라 프롬프트로 확보한다 (배경 아트에서 검증된 기법).
 */
/*
 * 회원만 부를 수 있다.
 *
 * 예전엔 인증이 한 줄도 없어서, 주소만 알면 로그인 없이 Gemini·GPT 그림(장당 약 55원) 크레딧을
 * 태울 수 있었다. 토큰 차감마저 브라우저가 해서, 경로를 직접 부르면 토큰도 안 깎였다.
 * 막고 있던 것은 화면뿐이었다.
 *
 * 비회원은 깨지지 않는다 — 만들기 화면 자체가 로그인 없으면 되돌려 보내고,
 * 첫 화면의 만들기 단추도 비회원이면 /login 으로 간다.
 * 굽기 스크립트도 이 경로를 부르지 않는다(/api/tts 만 쓴다).
 */
// 이 요청 안의 AI 호출(그림·검수)을 모델·토큰·금액으로 남긴다(lib/ai-usage) — 답을 돌려주기 전에 다 적는다.
export function POST(request: Request) {
  return withAiUsage("illustrate-page", () => handlePost(request));
}

async function handlePost(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  // 결제 전에는 관리자(yogico·fe)와 결제 요금제 회원만 만든다(lib/create-access — 사장님 2026-10-19)
  if (!(await canCreate(caller, "image"))) return createLockedResponse();
  bindAiUsageSink(dbUsageSink(caller.db));
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as {
    scene?: unknown;
    storyText?: unknown;
    artStyleId?: unknown;
    characterSheet?: unknown;
    styleReference?: unknown;
    styleReferenceScene?: unknown;
    mood?: unknown;
    shape?: unknown;
    cast?: unknown;
    qualityCorrection?: unknown;
    locationDetail?: unknown;
    locationSheet?: unknown;
    /** 주인공 이름·성별·생김새 — 쪽마다 "주인공은 남자아이"를 못 박는다. 옛 책은 없다. */
    hero?: unknown;
    /** 이 쪽에서 주인공이 개미만큼 작아진 채인가 — 화면이 책 흐름으로 알아내 보낸다(lib/scale-lock shrunkPages). 없으면 이 쪽 글만으로 본다. */
    heroTiny?: unknown;
    /** styleReference 로 보낸 승인 쪽도 주인공이 작아진 쪽인가 — 작아진 쪽은 이럴 때만 그 그림을 기준으로 받는다. */
    styleReferenceTiny?: unknown;
    /** 이 쪽의 장소를 이 책에서 몇 번째로 그리는가(0 = 처음) — 둘째부터 카메라를 바꾼다(lib/page-camera placeVisits). 옛 화면은 없다. */
    placeVisit?: unknown;
    /**
     * 고정 가족 원본 그림 [{ name, ref, memberId }] — 이 쪽에 보이는 고정 인물의 원본을 참고로 함께 붙인다(2026-09-29~).
     * 시트와 같은 주소 규칙(이 회원 폴더의 참고용 JPEG 만, lib/page-refs pickPagePortraits). 옛 책·가족 없는 책은 없다.
     */
    portraits?: unknown;
    /** 인물 시트에 선 순서(왼쪽부터 이름) — 원본 픽셀로 짠 시트는 이야기 순서와 다를 수 있다. 옛 책은 없다. */
    sheetOrder?: unknown;
    /**
     * 옷 카드로 이 책의 옷을 입은 고정 가족 이름(2026-09-29 저녁~) — 시트의 그 사람 칸 위는 사람 없는 옷뿐이다.
     * 옷 글은 cast[].outfit. 옛 책·오늘 낮에 만든 책은 없다(= 가족 그림의 옷).
     */
    sheetOutfits?: unknown;
    /** 같은 장소 줄의 다른 쪽이 어린이 통학 버스다 — 부르는 쪽이 책 전체로 정한다(lib/illustration-rules schoolBusPlaceKeys). */
    schoolBusPlace?: unknown;
    /**
     * 앞·뒤 쪽의 `장소: 이름 — 설명` 줄(앞 쪽 먼저, 2026-09-30~). 이 쪽 장소 줄이 놀잇감 탈것을 탈것 안으로 잘못 박은
     * 것이면 책의 진짜 장소(앞·뒤 쪽 교실)로 갈아 끼우고, 이어 타는 중(앞·뒤가 탈것)이면 그대로 둔다. 옛 화면은 없다.
     */
    neighbourPlaces?: unknown;
  };

  // 어느 화면에서 볼 동화인가 — 핸드폰은 세로(3:4), 태블릿은 가로(4:3)로 그린다.
  // 기기에 맞는 비율로 그려야 위아래(또는 좌우) 빈 띠 없이 그림이 꽉 찬다.
  const phone = input.shape === "phone";
  const aspectRatio = phone ? ("3:4" as const) : ("4:3" as const);

  const rawScene = typeof input.scene === "string" ? input.scene.trim() : "";
  /*
   * 부모가 대본 화면에서 손으로 적어 준 장소 설명(선택).
   *
   * 장소는 인물과 달리 참조 그림이 없어서 쪽마다 흔들린다("계곡"이 어떤 계곡인지
   * 모델이 매번 새로 상상한다). 부모가 "회색 자갈 바닥, 넓적한 바위 하나"처럼
   * 한 줄만 적어 주면 모든 쪽이 같은 곳을 그린다. 한국어 그대로 넘긴다.
   */
  const locationDetail =
    typeof input.locationDetail === "string" ? input.locationDetail.trim().slice(0, 300) : "";
  const storyText = typeof input.storyText === "string" ? input.storyText.trim().slice(0, 1200) : "";
  /*
   * 상한을 500 → 700으로 올렸다.
   *
   * 장면 한 줄에 등장인물·장소 고정 특징·물건 고정 모습이 모두 들어가면서 500자에
   * 닿는 쪽이 생겼다. 여기서 400을 돌려주면 그 쪽만 그림 없이 남는다 — 길다고 막을
   * 일이 아니다. 상한은 터무니없는 입력을 걸러내는 용도로만 남긴다.
   */
  if (!rawScene || rawScene.length > 700) {
    return NextResponse.json({ error: "장면 묘사가 비었거나 너무 깁니다." }, { status: 400 });
  }
  /*
   * 저장된 장소 줄이 놀잇감 탈것을 탈것 안으로 잘못 박은 것이면 책의 진짜 장소로 갈아 끼운다(lib/story-quality repairStaleVehicleScene).
   *
   * 어제까지의 판정이 교실 가게 놀이의 "자동차 안에 가득가득 채워 넣었어요"를 보고 "장소: 자동차 안 — 뒷좌석 안전벨트 …"를
   * 책에 저장했다. 판정을 고쳐도 한 쪽 다시 그리기는 저장된 줄을 그대로 보내, 장소 잠금·차 안 줄·벨트·검수 정답이 다
   * 차 안이 됐고 장면 문장(Scene:)에도 그 설명이 그대로 들어갔다(2026-09-30 사장님 "재생성 했을때도 차안이란 컨셉을
   * 버리지 못했어"). 아래는 모두 고친 장면을 읽는다. 앞·뒤 쪽을 안 보내는 옛 화면도 본문(선생님 → 교실)으로 고친다.
   */
  const neighbourPlaces = Array.isArray(input.neighbourPlaces)
    ? input.neighbourPlaces
        .filter((place): place is string => typeof place === "string")
        .slice(0, 2)
        .map((place) => place.slice(0, 300))
    : [];
  const staleFix = repairStaleVehicleScene({ scene: rawScene, storyText, neighbours: neighbourPlaces });
  // 장소 줄만 있던 장면이면 뺀 뒤 비는데, 그때는 놀잇감을 말한 본문이 있다(없으면 고치지 않는다).
  const scene = staleFix.scene || storyText;
  if (staleFix.changed) {
    console.info("[illustrate-page] 놀잇감 탈것 장소 줄을 고침", {
      before: /장소\s*:[^.\n]*/.exec(rawScene)?.[0] ?? "",
      after: /장소\s*:[^.\n]*/.exec(scene)?.[0] ?? "(뺌)",
    });
  }

  /*
   * 어떤 그림체로 만든 책인지 아는가.
   *
   * 옛 책에는 그림체가 저장돼 있지 않다. 그때 목록의 첫 그림체를 골라 이름으로
   * 못박아 버리면, 그 책이 실제로 어떤 그림체든 상관없이 그것으로 그려진다 —
   * 한 쪽만 다시 그렸을 때 그 쪽만 화풍이 달라지던 원인이다.
   */
  const matchedStyle = ART_STYLES.find((s) => s.id === input.artStyleId);
  const knownStyle = Boolean(matchedStyle);
  const style = matchedStyle ?? ART_STYLES[0];

  const sheet =
    typeof input.characterSheet === "string" ? await loadReferenceImage(input.characterSheet) : null;
  // 주소로 저장된 그림(cafe24)도 참조로 쓸 수 있어야 한다 — 한 쪽만 다시 그릴 때
  // 이 참조가 없으면 그 쪽만 그림체가 어긋난다.
  const styleReference =
    typeof input.styleReference === "string" ? await loadReferenceImage(input.styleReference) : null;
  const styleReferenceScene =
    typeof input.styleReferenceScene === "string" ? input.styleReferenceScene.trim().slice(0, 500) : "";
  const readLocation = (value: string) => {
    const match = /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/.exec(value);
    return match ? { name: match[1].trim(), description: match[2].trim() } : null;
  };
  /**
   * 장면에 적힌 `물건: 이름 — 고정 모습.`을 모두 읽는다.
   *
   * 두 쪽 이상에 나오는 물건이 매번 다르게 그려지는 것이 가장 흔한 사고다(1쪽은 콘에
   * 담긴 딸기, 3쪽은 컵에 담긴 초코). 인물처럼 참조 그림이 없으니 글로만 잠근다 —
   * 대신 '단순하게' 잠근다. 꾸밀 거리가 많을수록 매번 다르게 그려지기 때문이다.
   */
  const readProps = (value: string) => {
    const found: { name: string; description: string }[] = [];
    const re = /물건\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/g;
    for (let m = re.exec(value); m && found.length < 3; m = re.exec(value)) {
      found.push({ name: m[1].trim(), description: m[2].trim() });
    }
    return found;
  };
  const props = readProps(scene);

  // 잠금 줄(등장인물·장소·물건)을 뺀 '장면 문장'만 — 장소 이름에 든 사람 이름에 안 걸리게.
  const sceneBody = scene
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:등장인물|장소\s*:|물건\s*:)/.test(line))
    .join(" ")
    .replace(/등장인물\s*\d+\s*명(?:\s*:[^.\n]*)?\.?/g, "")
    .replace(/(?:장소|물건)\s*:[^.\n]*\.?/g, "");
  const parsedLocation = readLocation(scene);
  /*
   * 탈것 안인가 · 탈것에서 내렸나 — 안전 줄과 검수가 이걸 본다(판단은 illustration-rules.ts).
   *
   * 예전엔 장소 줄이든 본문 낱말이든 '버스 안·차창'이 스치면 승용차로 봤고, 벨트 문장은 아예
   * 모든 쪽에 붙었다. 관광버스 위층과 궁궐 마당에 벨트가 그려진 까닭이다(my-mu0issap).
   */
  const vehicleInfo = pageVehicle({
    locationName: parsedLocation?.name,
    locationDescription: parsedLocation?.description,
    sceneBody,
    storyText,
    bookContext: locationDetail,
    // 한 번 탄 통학 버스는 내릴 때까지 같은 버스 — 어린이집 말이 앞 쪽에만 있어도 이 쪽 벨트를 같게 그린다.
    schoolBusPlace: input.schoolBusPlace === true,
    // 앞·뒤 쪽 장소 이름 — 탈것이면 이어 타는 중이라 이 쪽 탈것 줄을 놀잇감으로 버리지 않는다(위 고침과 같은 판단).
    neighbourPlaces: neighbourPlaces.map((place) => readLocation(place)?.name ?? "").filter(Boolean),
  });
  /*
   * 본문은 "버스에서 내려"인데 장소 줄이 버스 실내면, 그 장소 줄은 옛 판정이 잘못 박아 둔 것이다.
   * 따르면 다시 그려도 또 버스 안이 나온다 — 장소 잠금·장소 시트·검수 정답에서 뺀다.
   */
  const currentLocation = vehicleInfo.staleVehicleLocation ? null : parsedLocation;
  /*
   * 그림 모델·검수에 건네는 장면 문장 — 틀린 탈것 장소 줄을 버린 쪽은 장면 문장(Scene:)에서도 그 줄을 뺀다.
   * 잠금·정답에서만 빼고 Scene: 에 남기면 "시내버스 안 — 좌석과 손잡이"가 그대로 읽혀 또 탈것 안이 나온다.
   */
  const drawnScene = vehicleInfo.staleVehicleLocation
    ? scene.replace(/장소\s*:[^.\n]*\.?/, "").replace(/[ \t]{2,}/g, " ").trim() || storyText
    : scene;
  const referenceLocation = readLocation(styleReferenceScene);
  // 이름 글자가 아니라 계열로 본다 — "놀이터"와 "동네 놀이터"는 같은 곳이다.
  const sameReferenceLocation = Boolean(
    currentLocation && referenceLocation &&
    locationKeyOf(currentLocation.name) === locationKeyOf(referenceLocation.name),
  );
  /*
   * 장소 기준 그림(장소 시트) — 인물 없는 그 장소의 그림.
   * 인물 시트가 얼굴을 잡듯 이것이 장소를 잡는다. 만들 때 장소마다 한 장 그려 둔다.
   */
  const locationSheet =
    // 서버가 장소 줄을 고친 쪽은 부르는 쪽이 옛 줄(자동차 안)의 열쇠로 고른 시트다 — 차 안 시트를 붙이지 않는다.
    typeof input.locationSheet === "string" && currentLocation && !staleFix.changed
      ? await loadReferenceImage(input.locationSheet)
      : null;
  /*
   * 다른 장소의 그림은 참조로 넣지 않는다.
   *
   * 예전엔 같은 장소 그림이 없으면 1쪽 그림을 그림체 참조로 보내면서 "장소는 따라 하지
   * 마라"고 글로만 말했다. 그림 모델은 받은 그림에 강하게 끌린다 — 거실 그림을 주고
   * 놀이터를 그리라 하면 거실 창문이 섞여 나오고, 인물이 창문 양쪽으로 갈렸다.
   * 그림체는 인물 시트와 그림체 문구가 이미 잡는다. 그림체를 모르는 옛 책만 예외다.
   */
  const usedStyleReference =
    styleReference && (sameReferenceLocation || !knownStyle) ? styleReference : null;
  /*
   * 부모가 적은 장소 칸에서 이 쪽의 장소 부분만 고른다 — 계곡 바위가 거실에 따라오지 않게.
   */
  const pageLocationDetail = currentLocation
    ? pickLocationDetail(locationDetail, currentLocation.name)
    : vehicleInfo.staleVehicleLocation || staleFix.changed
      ? /*
         * 틀린 장소 줄(탈것 실내)을 버린 쪽 — 장소 칸 원문을 통째로 넣으면 그 안의 버스 노란 좌석 설명이
         * '가장 우선'으로 들어가 궁궐 마당에 버스 좌석을 또 부른다. 이름난 곳·탈것 부분은 빼고 물건만 넘긴다.
         * 놀잇감 탈것 장소 줄을 뺀 쪽도 같다 — 장소 칸에 옛 '자동차 안은 뒷좌석 안전벨트…'가 남아 있다.
         */
        pickLocationDetail(locationDetail, "")
      : locationDetail;
  /*
   * 장소 줄 자체가 탈것 안(버스 안·아빠 차)이고 이 쪽이 정말 그 안이면 '건물 안' 줄을 주지 않는다 — vehicleInteriorLines.
   * 지붕 없는 2층 버스 위층은 바깥이라 뺀다.
   */
  const vehicleRoom =
    currentLocation && vehicleInfo.vehicle && !vehicleInfo.openDeck && placeVehicleKind(currentLocation.name)
      ? vehicleInfo.vehicle
      : null;
  /** 실내(true)·실외(false)·모름(null) — 배경 지시와 품질검사가 이걸 본다. 탈것 안은 건물 실내가 아니라 null. */
  const indoor =
    currentLocation && !vehicleRoom ? isIndoorPlace(currentLocation.name, currentLocation.description) : null;
  // 붙이는 그림의 순서(nth)는 아래 고정 얼굴을 고른 뒤에 정한다(refs — lib/page-refs arrangePageReferences).

  const mood = typeof input.mood === "string" ? input.mood.trim().slice(0, 80) : "";
  const qualityCorrection =
    typeof input.qualityCorrection === "string" ? input.qualityCorrection.trim().slice(0, 500) : "";

  /**
   * 등장인물 — 이름만이 아니라 생김새 설명까지 받는다.
   * 그림(캐릭터 시트) 하나만으로는 쪽마다 얼굴·옷이 조금씩 흔들린다. 같은 내용을
   * 글로도 함께 주면 두 갈래로 붙잡혀 훨씬 덜 흔들린다.
   */
  const castRaw = Array.isArray(input.cast) ? (input.cast as unknown[]) : [];
  const cast = castRaw
    .map((c) => {
      if (typeof c === "string") return { name: c.trim(), description: "", fixed: false };
      const o = c as { name?: unknown; description?: unknown; fixed?: unknown; outfit?: unknown; scale?: unknown };
      // 크기 표시(거인·소인) — 화면이 책 전체 글에서 찾아 보낸다(lib/scale-lock withBookScale). 없으면 아래에서 설명 글로 찾는다.
      const scale = readScaleKind(o?.scale);
      // 이 책의 옷(@@CHARACTER@@ 셋째 칸) — 옷 카드로 입은 고정 가족 줄에만 쓴다(설명 글에도 이미 들어 있다).
      const outfit = typeof o?.outfit === "string" ? o.outfit.trim().slice(0, 200) : "";
      return {
        name: typeof o?.name === "string" ? o.name.trim() : "",
        // 500자 — 부모 줄(최대 약 320자, _input 400자)에 클로드가 앞말(하온이 아빠, 30대 후반 남자 …)을 붙여도 끝이 안 잘리게.
        description: typeof o?.description === "string" ? o.description.trim().slice(0, 500) : "",
        // 가족 캐릭터의 고정 얼굴로 시트를 그린 인물 — 얼굴·머리는 설명 글보다 시트를 따른다(아래 CAST LOCK).
        fixed: o?.fixed === true,
        ...(outfit ? { outfit } : {}),
        ...(scale ? { scale } : {}),
      };
    })
    .filter((c) => c.name)
    .slice(0, 6);

  /**
   * 이 쪽에 **보이는** 사람 — `등장인물 N명: 이름…` 줄이 유일한 출처다.
   *
   * 예전엔 장면 문장이든 본문이든 이름이 스치기만 하면 등장인물로 넣었다. 그런데
   * "엄마가 싸 준 김밥", "서연이를 떠올렸어요", "아빠한테 보여 줄 거예요"처럼 **이름만
   * 나오고 그 자리에는 없는** 문장이 유아 동화에는 매 쪽 있다. 그래서 교실 장면에
   * 엄마가 서 있는 그림이 나왔고, 검사(validateIllustration)도 같은 인원을 정답으로
   * 받아 그대로 통과시켰다.
   *
   * 이제 클로드가 적은 등장인물 줄을 그대로 쓴다(그 줄을 쓰는 규칙은 anthropic.ts에
   * 자세히 박혀 있다). 장면 문장이 그 줄과 어긋나게 다른 인물의 행동을 적었으면 그건
   * 그리라는 뜻이므로 보탠다. 본문(storyText)은 등장인물 줄이 아예 없을 때만 쓴다.
   */
  const castLine = /등장인물\s*(\d+)\s*명(?:\s*:\s*([^\n.]*))?/.exec(scene);
  const sceneCast = castLine
    ? cast.filter((c) => (castLine[2] ?? "").includes(c.name) || sceneBody.includes(c.name))
    : cast.filter((c) => scene.includes(c.name) || storyText.includes(c.name));
  /** 이 쪽에 보이는 고정 얼굴(우리 가족 캐릭터) — 옛 책·가족 없는 책은 비어 있어 프롬프트가 예전 그대로다. */
  const fixedOnPage = sceneCast.filter((c) => c.fixed).map((c) => c.name);
  /*
   * 주인공 — 요청에 없으면(옛 책) 등장인물 첫 사람과 그 설명으로 물러선다.
   * 이 쪽에 주인공이 보일 때만 고정 줄을 붙인다. 없는 쪽에 이름을 넣으면 없던 주인공이 그려진다.
   * 등장인물 목록 자체가 없는 옛 책은 본문에 이름이 있으면 보인다고 본다.
   */
  const hero = readHero(input.hero, cast);
  const heroOnPage = Boolean(
    hero &&
      (sceneCast.some((c) => c.name === hero.name) ||
        (cast.length === 0 && `${scene} ${storyText}`.includes(hero.name))),
  );
  /*
   * 작아진 주인공 쪽(2026-10-13 사장님 "장소의 변화가 전혀 없어" — 개미만큼 작아지는 책의 3~5쪽이 1쪽과 같은 마당 그림 위에
   * 보통 크기 하온이로 그려졌다). 장소 기준 그림을 '이 쪽의 유일한 정답'으로 따르게 한 줄이 같은 마당을 사람 눈높이로 다시 그리게
   * 했고, 크기 잠금은 사람끼리만 견줘서 혼자 작아진 쪽에는 걸리지 않았다. 이 쪽에서는 장소 기준 그림·장소 잠금 줄·실내외 줄을
   * 내려놓고 '개미 눈높이' 연출 줄을 넣는다(lib/scale-lock tinyHeroLines). 어느 쪽이 작아진 쪽인지는 화면이 책 흐름으로 알아내
   * 보낸다(heroTiny) — 안 보낸 요청은 이 쪽 글만으로 본다.
   */
  const heroTiny = Boolean(
    hero &&
      heroOnPage &&
      (typeof input.heroTiny === "boolean" ? input.heroTiny : heroShrunkOnPage(hero.name, [sceneBody, storyText])),
  );
  /** 이 쪽에 붙일 장소 기준 그림 — 작아진 쪽에는 붙이지 않는다 */
  const placeSheet = heroTiny ? null : locationSheet;
  /*
   * 이 쪽에 붙일 승인 쪽 그림 — 작아진 쪽은 '같은 작은 세상'을 그린 쪽(화면이 styleReferenceTiny 로 알린다)만 받는다.
   * 같은 장소라고 보통 크기 마당 그림을 붙이면 글로 아무리 말해도 그 마당이 다시 그려진다(위 '다른 장소의 그림' 설명과 같은 까닭).
   * 그림체를 모르는 옛 책은 그림체를 잡을 것이 이것뿐이라 그대로 붙이고, 구도·크기는 따르지 말라고 적는다.
   */
  const referenceTiny = input.styleReferenceTiny === true;
  /** 이 장소를 몇 번째로 그리는가 — 0~20 정수만(이상하면 처음처럼) */
  const placeVisit =
    typeof input.placeVisit === "number" && Number.isInteger(input.placeVisit) && input.placeVisit >= 0 && input.placeVisit <= 20
      ? input.placeVisit
      : 0;
  // 거꾸로도 같다 — 깨어난 뒤의 보통 쪽이 작은 세상 그림을 기준으로 받지 않게.
  const pageStyleReference = knownStyle && heroTiny !== referenceTiny ? null : usedStyleReference;

  /*
   * 주인공 얼굴을 고정했으면(우리 가족 캐릭터) 주인공 고정 줄에 설정 생김새 글을 싣지 않는다 — 얼굴·머리는 시트가 정한다.
   * 설정 칩을 바꾸고 '나중에'를 눌렀거나 사진으로 그린 그림이면 글과 그림이 다르고, 앞쪽에 크게 적힌 글이 시트를 이긴다.
   */
  const heroFixed = Boolean(hero && sheet && cast.some((c) => c.name === hero.name && c.fixed));

  /*
   * 고정 가족 원본 그림(2026-09-29 사장님 "얼굴이 달라 특히") — 시트만 보고 그리면 얼굴이 한 번 더 흐른다.
   * 이 쪽에 **보이는** 고정 인물의 원본(가족 그림 참고용 JPEG)을 함께 붙인다. 주소는 이 회원 폴더의 것만, 수채화 책만,
   * 모델에 따라 몇 장까지(lib/page-refs pickPagePortraits · maxPagePortraits). 받은 그림은 잠깐 기억해 쪽마다 다시 받지
   * 않는다(lib/family-ref fetchFamilyRefCached). 못 받은 사람은 예전처럼 시트만 — 쪽 그림은 그대로 그린다.
   * 로그에는 수만 남긴다(주소에 회원 uid 가 들어 있다).
   */
  const pickedPortraits = sheet
    ? pickPagePortraits(input.portraits, cast, fixedOnPage, familyUrlPrefix(process.env, familyFolderOf(caller.uid)), {
        max: maxPagePortraits(process.env),
        watercolor: knownStyle && style.id === "watercolor",
      })
    : { portraits: [], rejected: 0, offPage: 0 };
  // 한 번 못 받으면 짧게 한 번 더(lib/family-ref fetchFamilyRefRetry) — 잠깐의 끊김으로 이 쪽 얼굴 참고를 잃지 않게.
  const portraitImages = await Promise.all(pickedPortraits.portraits.map((p) => fetchFamilyRefRetry(p.url)));
  /*
   * 얼굴 카드(2026-10-01 사장님 "아바타와 너무 달라") — 원본 전신 그림 그대로면 그림 모델이 읽는 얼굴이 손톱만 했다.
   * 왼쪽 전신 + 오른쪽 같은 원본에서 오려 키운 얼굴로 한 장을 짜 붙인다(lib/sheet-compose composePortraitCard, AI 없음).
   * 짜지 못하면 그 사람은 예전처럼 원본 그대로 붙인다.
   */
  const portraits = (
    await Promise.all(
      pickedPortraits.portraits.map(async (p, i) => {
        const image = portraitImages[i];
        if (!image) return null;
        const meta = sheetFigureMeta(p.memberId, readPortraitFigure(input.portraits, p.name));
        const card = await portraitCard(p.url, image, meta.headRatio);
        return card ? { name: p.name, image: card, card: true } : { name: p.name, image, card: false };
      }),
    )
  ).filter((p): p is { name: string; image: GeneratedImage; card: boolean } => p !== null);
  if (pickedPortraits.rejected > 0 || portraits.length < pickedPortraits.portraits.length) {
    console.info("[illustrate-page] 고정 얼굴", {
      used: portraits.length,
      rejected: pickedPortraits.rejected,
      unreachable: pickedPortraits.portraits.length - portraits.length,
    });
  }
  /** 이 쪽에서 원본 그림이 붙은 사람 — 없으면(옛 책·가족 없는 책) 아래 글은 예전과 한 글자도 다르지 않다. */
  const portraitNames = new Set(portraits.map((p) => p.name));
  /** 그 가운데 얼굴 카드로 붙은 사람 */
  const cardNames = new Set(portraits.filter((p) => p.card).map((p) => p.name));
  /** 인물 시트에 선 순서(왼쪽부터) — 원본 픽셀로 짠 시트만 보낸다. 옛 책은 없다. */
  const sheetOrder = sheet ? readSheetOrder(input.sheetOrder, cast) : null;
  /** 원본 픽셀로 짠 시트인가 — 순서가 온 시트만 그렇다. 그 시트의 고정 가족 옷은 가족 그림의 옷이다. */
  const composedSheet = Boolean(sheetOrder);
  /** 짠 시트에서 AI 가 따로 그려 붙인 사람(고정 안 함) — 키가 시트에서 제 비율이 아니다(lib/page-refs sheetOrderLine). */
  const notToScale = sheetOrder ? sheetOrder.filter((n) => !cast.some((c) => c.name === n && c.fixed)) : [];
  /*
   * 옷 카드로 이 책의 옷을 입은 고정 가족(2026-09-29 저녁~, 사장님 "옷은 그 주제안에서 랜덤으로") — 시트 칸 위가 사람 없는 옷이다.
   * 짠 시트에서만, 시트에 선 사람만. 비면(옛 책·옷 카드 실패) 아래 글은 가족 그림의 옷 그대로다.
   */
  const dressed = sheetOrder ? readSheetOutfits(input.sheetOutfits, cast).filter((n) => sheetOrder.includes(n)) : [];
  const dressedOutfits = new Map(dressed.map((n) => [n, cast.find((c) => c.name === n)?.outfit ?? ""]));
  /*
   * 붙이는 그림의 순서 — 인물 시트 → 고정 얼굴 → 장소 시트 → 승인 쪽(lib/page-refs). 프롬프트의 각 문장이
   * "몇 번째 그림"을 말하는지 여기서 정한다. 넷이 다 있으면 '첨부된 그림'이라는 말만으로는 어느 것인지 모델이 헷갈린다.
   * 얼굴을 앞에 둔다(모델은 앞 그림을 더 세게 따른다). 고정 얼굴이 없으면 예전 순서 그대로.
   */
  const refs = arrangePageReferences({ sheet, portraits, location: placeSheet, style: pageStyleReference });
  const nth = (kind: string) => refOrdinal(refs.order, kind);
  /*
   * 크기 잠금(2026-10-12 사장님 "한 장면이 잘못 나왔다, 크기가") — 거인·소인이 보통 크기 사람과 함께 보이는 쪽.
   * 거인국 책 5쪽에서 거인 아이가 그냥 큰 형으로 그려졌다: 그 쪽 글엔 크기 단서가 없었고, 아래 두 줄은 반대로 밀었다.
   * 잠금이 걸린 쪽에서는 SCALE LOCK 줄을 넣고(주인공 고정 바로 뒤), '허리 위 가까이' 구도 줄과 시트 줄의
   * '나이에 맞는 자연스러운 키'를 물린다. 보통 책은 scale 이 null 이라 프롬프트가 예전 그대로다(lib/scale-lock).
   */
  // 작아진 쪽에서는 주인공을 '아주 작은 사람'으로 견준다 — 보통 크기 사람이 함께 보이면 그 사람 손보다 작게.
  const scale = pageScale(
    heroTiny && hero ? sceneCast.map((c) => (c.name === hero.name ? { ...c, scale: "tiny" as const } : c)) : sceneCast,
    hero?.name ?? cast[0]?.name ?? null,
    [sceneBody, storyText],
  );
  const scaleLock = [
    ...(heroTiny && hero
      ? tinyHeroLines(hero.name, currentLocation ? { name: currentLocation.name, description: currentLocation.description } : null, indoor)
      : []),
    ...scaleLockLines(scale),
  ];
  /** 가족 얼굴이 나오는 쪽의 구도 줄(lib/page-refs familyFramingLines) — 검수도 이 쪽은 가까운 구도를 받아들이게 한다(아래 extraRules). */
  // 크기 잠금 쪽·작아진 쪽은 뺀다 — '얼굴이 크게 보이게 가까이'는 작아야 할 사람을 키운다.
  const familyFraming = scale || heroTiny ? [] : familyFramingLines(sceneCast.length, fixedOnPage.length);

  const prompt = [
    knownStyle
      ? `Children's picture book illustration, ${style.prompt}.`
      : "Children's picture book illustration in the exact style of the attached reference image(s).",
    /*
     * 글자 금지를 맨 앞에도 둔다.
     *
     * 그림 안에 엉터리 영어 문장이 그려져 나오는 일이 있었다(실제 발생). 아래에서
     * 본문을 '사실 확인용'으로 건네는데, 문장을 받은 그림 모델은 그것을 그려 넣으려
     * 든다. 금지 문구가 프롬프트 맨 끝에만 있으면 앞쪽의 문장에 밀린다.
     */
    "ABSOLUTE RULE — THIS IS A WORDLESS PICTURE. Draw ZERO writing of any kind: no captions, no sentences, no single letters, no numbers, no signs, no labels, no speech bubbles, no signatures, no watermarks — in Korean, English or any other script. Any written mark at all makes this page unusable.",
    /*
     * 그림체 잠금.
     *
     * 조심할 것: 어떤 그림체로 만든 책인지 모를 때(옛 책을 한 쪽만 다시 그릴 때)
     * 목록의 첫 그림체를 이름으로 못박으면, 붙여 준 참조 그림과 정면으로 싸운다.
     * 실제로 한 쪽만 다시 그렸더니 그 쪽만 화풍이 바뀌었다.
     * 그래서 그림체를 모르면 이름을 말하지 않고 참조 그림을 그대로 따르게 한다.
     */
    [
      knownStyle
        ? `STYLE LOCK — render the entire page ONLY as: ${style.prompt}.`
        : "STYLE LOCK — copy the rendering style of the attached reference image(s) exactly. Do not invent or substitute a style of your own; the attached pages define what this book looks like.",
      sheet
        ? `The ${nth("sheet")} attached image (the character reference sheet) is also the rendering-style reference. Match its medium, brush/line quality, shape language, facial construction, shading method, texture, saturation and finish exactly.`
        : "",
      "Never switch medium or rendering technique between pages. Do not turn watercolor into 3D, vector, crayon, anime, pencil, collage or a different kind of painting. Do not mix two styles in one page.",
    ].join("\n"),
    /*
     * 장소 잠금을 그림체 바로 다음, 프롬프트 앞쪽에 둔다.
     *
     * 예전엔 60줄짜리 프롬프트 한가운데 한 줄이었다. 인물 규칙은 대여섯 번 반복되는데
     * 장소는 한 번 — 긴 프롬프트에서 모델은 앞·뒤·반복되는 것을 지키고 중간 한 줄은
     * 흘린다. 장소가 쪽마다 바뀌던 이유 중 하나다. 앞에 두고 끝에서 한 번 더 확인시킨다.
     */
    // 작아진 쪽은 장소 잠금을 넣지 않는다 — 같은 곳을 바닥에서 본 모습은 아래 TINY HERO 줄이 말한다.
    currentLocation && !heroTiny
      ? [
          `LOCATION LOCK — this page takes place at "${currentLocation.name}". Fixed features that MUST be visible: ${currentLocation.description}.`,
          "The place is as important as the characters. Draw exactly this kind of place with exactly these features — never a generic forest, park, hanok, classroom, street or a different house in its place, and never a prettier substitute.",
          placeSheet
            ? `The ${nth("location")} attached image is the LOCATION REFERENCE SHEET (the place with no people). It is the ONLY correct interpretation of this page's place — the author provided it. Keep its ground, its big landmark, its architecture, its wall/floor colours and their arrangement. You may change the camera angle and crop; you may not change what the place is made of, and no prop or story association may turn it into a different kind of room (never a hallway, corridor or entrance unless this image shows one). Put the characters INTO this place.`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    /*
     * 주인공 고정 — 장소 잠금 바로 뒤, 장면보다 앞에 둔다.
     * 뒤쪽 긴 안전·구도 문장 사이에 끼면 묽어진다. 성별·머리는 이 책에서 가장 눈에 띄는 약속이다.
     */
    heroOnPage ? heroLockLines(heroFixed && hero ? { ...hero, looks: undefined } : hero, storyText).join("\n") : "",
    // 크기 잠금 — 장면 문장보다 앞에(뒤에 두면 '단추를 건넨다' 같은 장면 글이 평범한 두 아이로 읽힌다).
    scaleLock.join("\n"),
    `Scene: ${drawnScene}`,
    /*
     * 구도 — 아래가 텅 비지 않게.
     *
     * 세로 판형에서 인물을 화면 위쪽에 몰아 그리고 아래 1/3을 바닥(잔디·타일)으로만
     * 채우는 그림이 반복해서 나왔다. 그림책으로 보면 허전하고, 아이 눈에는 인물이
     * 멀리 있어 표정이 잘 안 보인다.
     */
    [
      "COMPOSITION — fill the frame. Place the characters so they occupy the middle of the picture and reach comfortably into the lower half.",
      "Never leave the bottom third of the picture as bare empty ground, floor or grass with nothing in it. If space is left over, move the characters closer to the viewer and draw them larger rather than adding filler.",
      "Draw the characters large enough that a small child can read their faces and expressions clearly.",
      "Every face must be cleanly and correctly drawn: two clear eyes, a nose and a mouth in the right places, no smeared, doubled, melted or distorted features. A child whose face came out broken is the single most upsetting error in this book.",
      "Draw the expression the text asks for. If the child is looking up at something, their head is tilted back and their eyes point upward, not at the viewer.",
      // 가족 얼굴이 나오는 쪽은 허리 위 구도가 기본, 넷 이상이면 가까이 모인 구도 — 얼굴이 작으면 이목구비가 뭉개진다(lib/page-refs familyFramingLines).
      ...familyFraming,
    ].join("\n"),
    // 같은 장소를 두 번째 이후로 그리는 쪽 — 앞 쪽과 같은 카메라로 그리지 않게(lib/page-camera, 2026-10-14). 작아진 쪽은 제 카메라가 있다.
    heroTiny ? "" : cameraLines(placeVisit).join("\n"),
    /*
     * 배경을 채울 때 한국 = 전통이라고 읽지 않게 한다.
     *
     * 실제로 동물원 장면(회색 보도블록, 기린 우리)의 배경에 기와 지붕 팔각정이
     * 들어왔다. 장소 설명에 없는 건물인데, 모델이 "한국 공원"의 빈자리를 전통
     * 건물로 메운 것이다. 우리 동화는 지금 여기, 요즘 한국이다.
     */
    /*
     * 실내와 실외를 가른다.
     *
     * 아래 '요즘 한국' 줄이 아파트·보도·가로수처럼 바깥 것만 나열해서, 실내 장면에도
     * 그대로 들어가면 마트 진열대가 보도 위에 나오고 뒤에 아파트가 섰다(실제로 났다).
     * 실내면 안쪽만 그리라고 하고 바깥 목록은 뺀다.
     */
    // 작아진 쪽은 실내외 줄도 뺀다 — '천장·벽을 그려라', '아파트·보도' 목록은 사람 눈높이 그림을 부른다(TINY HERO 줄이 대신한다).
    heroTiny
      ? ""
      : vehicleRoom
      ? vehicleInteriorLines(vehicleRoom, currentLocation?.name ?? "", vehicleInfo.schoolBus).join("\n")
      : indoor === true
      ? [
          `INDOOR SCENE — "${currentLocation?.name ?? "this place"}" is INSIDE a building. Draw only the interior: its floor, walls, ceiling or ceiling lights, shelves, furniture and fixtures.`,
          "No street, no sidewalk, no shop front, no apartment buildings, no sky, no trees and no outdoor ground may appear — except, at most, as a small view through a window. Never place indoor furniture or shelves outdoors, and never combine the inside and the outside of a building in one picture.",
          "PRESENT-DAY KOREA — the interior is modern: bright floors, plain walls, glass doors, modern fixtures.",
        ].join("\n")
      : "PRESENT-DAY KOREA — this book is set in Korea today. Backgrounds are modern: apartment blocks, concrete and paved walkways, metal or wooden fences, glass windows, ordinary city trees and lawns.",
    /*
     * 아이 안전 — 그림책은 아이가 따라 한다.
     *
     * 실제로 이런 그림이 나왔다. 본문이 "안전벨트를 딸깍 채웠어요"인데 그림에서는
     * 벨트 없이 뒷자리에서 무릎으로 서서 창문 쪽으로 몸을 돌리고 있었다.
     * 또 "소파에서 벌떡 일어났어요"를 소파 **위에 올라선** 모습으로 그렸다.
     * 네 살 아이가 보고 그대로 따라 하는 그림이라, 이건 품질이 아니라 안전 문제다.
     *
     * 벨트·카시트·차 안 좌석 문장은 승용차·택시 안일 때만 붙는다(어린이 통학 버스는 아이용 벨트만) — 어느 줄이
     * 언제 붙는지는 safetyRuleLines 와 그 시험에 있다.
     */
    safetyRuleLines(vehicleInfo, indoor).join("\n"),
    "Do NOT add traditional Korean architecture that the scene did not ask for — no tiled-roof pavilion, no hanok, no thatched roof, no wooden gate, no paper-screen door, no stone jar terrace. If the location line does not name such a building, none appears in the picture.",
    /*
     * 물건 잠금 — 장소와 같은 이유로 넣는다. 다만 요구는 반대다: 장소는 '더 구체적으로',
     * 물건은 '더 단순하게'. 물건은 꾸밀 거리를 줄여야 다음 쪽에서 같게 그려진다.
     */
    /*
     * 옷이 장소·날씨와 맞아야 한다.
     *
     * 캐릭터 시트의 옷을 그대로 베끼라는 규칙이 세다 보니, 잠옷 차림으로 시작한
     * 아이가 눈밭까지 잠옷에 맨발로 나갔다(실제로 났다). 시트는 '누구인지'를
     * 잠그는 것이지 '무엇을 입고 이 쪽에 있는지'까지 정하지 않는다.
     */
    "CLOTHING MUST FIT THIS PAGE. Keep the character's identity from the sheet (face, hair, body), but dress them for THIS scene's place and weather. Outdoors in snow or cold: coat, hat, scarf, gloves and proper shoes — never pajamas, never bare feet. In bed or just waking: pajamas. Indoors at home: everyday clothes and socks or slippers. If the scene text names what they wear, follow the text.",
    props.length
      ? [
          `PROP LOCK — ${props
            .map((prop) => `"${prop.name}" (${prop.description})`)
            .join("; ")}. These objects come back on other pages and must look IDENTICAL every time.`,
          "Draw each one as a SIMPLE, plain shape in flat color, exactly as described and nothing more. Do not add a second scoop, a different flavor, sprinkles, toppings, patterns, logos, sparkles, ribbons or decoration that is not in the description.",
          "Simplicity is the point: a plain shape is what lets a child recognize it as the same object on the next page. If you are unsure how detailed to make it, make it simpler.",
          "The colour word in the description is EXACT, not a hint. A yellow hat is bright yellow, never straw, beige, tan or gold. A pink box is pink, never red or peach. Do not swap a stated colour for a more 'natural' material colour.",
        ].join("\n")
      : "",
    /*
     * 부모가 적어 준 장소는 모델이 상상한 장소보다 우선한다 — 아이가 실제로 아는
     * 곳이기 때문이다. 다만 이것도 '그릴 것'이지 '쓸 글자'가 아니라고 못박는다.
     */
    pageLocationDetail
      ? [
          `PLACE / OBJECT DETAIL (highest priority, written by the child's parent, Korean): ${pageLocationDetail}`,
          "Build this page's setting and any object it names from this description: the same ground, the same big landmark, the same colors, the same shape of object. If it conflicts with what you would normally imagine, follow this description.",
          "These are things to draw, never words to write in the image.",
        ].join("\n")
      : "",
    /*
     * 본문은 '무슨 일이 일어나는지'를 알려 주려고 건넨다 — 장면 설명만으로는 인물이
     * 무엇을 하는지 어긋나는 일이 있어서다.
     *
     * 그런데 문장을 그대로 주면 모델이 그 문장을 그림 안에 써 넣는다. 실제로 한국어
     * 본문을 옮긴 듯한 엉터리 영어가 그림에 박혀 나왔다. 그래서 '이건 읽을 거리가
     * 아니라 배경 지식'이라고 문장 바로 옆에서 못박는다.
     */
    storyText
      ? [
          "BACKGROUND INFORMATION ONLY — the sentences below tell you what happens so you draw the right action. They are NOT part of the picture.",
          "Never copy, translate, paraphrase or render these words anywhere in the image. Draw what they describe, not the words themselves.",
          `What happens on this page: ${storyText}`,
        ].join("\n")
      : "",
    mood ? `Mood: ${mood}.` : "",
    // 캐릭터 시트를 참조로 넣으면 모델이 '생김새'뿐 아니라 시트의 '나란히 선 배치'까지
    // 따라 그려서, 같은 인물이 두 명씩 나오는 일이 생긴다(실제 발생). 그래서
    // "생김새만 참고, 배치는 베끼지 말 것 + 같은 인물 두 번 금지"를 분명히 못박는다.
    sheet
      ? [
          `The ${nth("sheet")} attached image is the CHARACTER REFERENCE SHEET. Use it ONLY to know what each character looks like — face, hair, clothing, colors.`,
          // 누가 몇째 칸인지 — 원본 픽셀로 짠 시트만 보낸다(이야기 순서와 다를 수 있다). 옛 책은 줄이 없다.
          // 섞인 시트면 AI 가 따로 그린 사람은 키가 제 비율이 아니라고 덧붙인다(친구가 엄마만큼 크게 서 있다).
          // 옷 카드로 입은 고정 가족은 칸 위가 사람 없는 옷이라고 — 그 옷을 입히고 물건처럼 늘어놓지 말라고.
          ...(sheetOrder ? [sheetOrderLine(sheetOrder, notToScale, dressed, Boolean(scale) || heroTiny)] : []),
          "Do NOT copy the sheet's layout. The sheet lines characters up side by side on a blank background; this page is a real scene with its own composition.",
          "Each character exists exactly ONCE in this world. NEVER draw the same character twice in one picture — no twins, no repeated faces, no duplicated family members, no mirrored copies.",
          // 시트의 '정면 차렷 자세'까지 베껴 와서, 장면 한가운데 인물만 오려 붙인 것처럼
          // 뻣뻣하게 서 있는 그림이 나왔다(실제 발생). 자세는 장면이 정하게 못박는다.
          "CRITICAL — do NOT copy the sheet's POSE. The sheet shows a neutral standing front view; that is a catalogue pose, not a scene pose.",
          "Draw each character in the middle of the action this scene describes: crouching, reaching, running, leaning, turning, looking at what they are looking at.",
          "Use a natural storytelling camera angle — three-quarter view, profile, from behind, from above or below as the moment needs.",
          "Avoid a symmetrical front-facing full-body figure standing in the centre with arms hanging down and a blank expression. That looks pasted in, not part of the picture.",
          "Characters must physically belong to the scene: touching, holding, standing on, or reacting to what is around them, with an expression that matches the moment.",
        ].join("\n")
      : "",
    // 고정 가족 원본 그림 — 몇 번째 그림이 누구 얼굴인지(lib/page-refs). 시트 바로 뒤에 붙였으니 글도 시트 바로 뒤에.
    // 얼굴 카드로 붙인 사람은 한 장에 같은 사람이 두 번 보인다고 — 두 사람으로 읽지 않게.
    portraits.length ? portraitBindingLines(refs.order, [...portraitNames], cardNames).join("\n") : "",
    // 이목구비 — 카드의 눈·눈썹·코·입을 같은 모양·같은 정도로, 카드보다 단순하게 그리지 않게(lib/page-refs facialFeatureLines).
    portraits.length ? facialFeatureLines([...portraitNames], cardNames).join("\n") : "",
    pageStyleReference
      ? [
          `The ${nth("style")} attached image is a previously APPROVED page from this same book.`,
          "Use that approved page as the book-wide rendering reference: identical medium, dimensionality (2D versus 3D), line/edge treatment, textures, facial construction, lighting softness, colour strength and finish.",
          // 작아진 쪽 — 같은 작은 세상을 그린 쪽이면 풀·땅·개미 모습을 잇고, 보통 크기 쪽이면(옛 책) 구도·크기를 따르지 않는다
          heroTiny
            ? referenceTiny
              ? "SAME TINY WORLD — the approved page shows this same ant's-eye world. Keep the same grass, ground and colours and the same look of the ants and other small creatures. Change the camera angle, the pose and what happens."
              : "Do not copy its composition, camera height or scale: that page shows the place at ordinary human size, and this page is seen from ant height (see TINY HERO)."
            : sameReferenceLocation
            ? `SAME LOCATION LOCK — the approved page and this page are both "${currentLocation?.name}". Preserve the same room/outdoor identity, architecture, wall and floor colours, windows, large furniture or play equipment and their stable arrangement. Change only camera angle, character pose and small story props.`
            : "Do not copy its composition or location because this scene uses a different place.",
          "Never change a 3D/clay-like book into a flat 2D drawing, or a flat drawing into 3D.",
        ].join("\n")
      : "",
    /*
     * 같은 아이가 한 화면에 두 번 나오는 사고 — 이 앱에서 가장 자주 나는 그림 오류다.
     *
     * 원인은 "두 번 그려라"가 아니라, 친구의 생김새가 주인공과 비슷하게 정해져
     * 모델이 둘을 구별하지 못하고 주인공을 복사하는 것이다(실제 발생: 놀이터 장면에서
     * 친구가 주인공과 같은 파란 옷·같은 얼굴로 나옴).
     *
     * 그래서 ① 인물마다 무엇이 다른지 대비시켜 주고 ② 다 그린 뒤 얼굴을 세어 보게 하는
     * 확인 절차를 붙인다. 금지만 적는 것보다 확인 단계를 주는 쪽이 훨씬 잘 먹힌다.
     */
    sceneCast.length > 0
      ? [
          `CAST LOCK — draw EXACTLY ${sceneCast.length} people: ${sceneCast.map((c) => c.name).join(", ")}. Every listed person appears exactly once.`,
          `The reference sheet may contain other book characters. They are ABSENT from this page and must be ignored: ${cast.filter((c) => !sceneCast.some((s) => s.name === c.name)).map((c) => c.name).join(", ") || "none"}.`,
          ...sceneCast.filter((c) => c.description).map((c) => `- ${c.name}: ${c.description}`),
          /*
           * 고정 얼굴(우리 가족 캐릭터) — 시트를 그 사람의 고정 그림으로 그렸다. 클로드가 쓴 설명 글(머리·안경)은
           * 그 그림과 어긋날 수 있다(할머니·형제·친구 생김새는 이야기에 안 간다). 얼굴·머리는 시트를 따른다.
           * 옷은 다른 사람과 같이 시트대로 — 아래 '옷을 바꾸지 말라'(CHARACTER CONSISTENCY)와 부딪치지 않게.
           */
          // 원본 그림이 실제로 붙은 사람만 '붙은 원본'을 말하고, 짠 시트면 설명 글의 옷을 버리라고 한다(lib/page-refs).
          // 원본도 짠 시트도 없으면(옛 책) 예전 한 줄 그대로.
          // 옷 카드로 입었으면 가족 그림의 옷이 아니라 칸 위의 옷과 그 옷 글을(dressedOutfits).
          sheet && fixedOnPage.length
            ? fixedFamilyFaceLines(fixedOnPage, portraitNames, composedSheet, dressedOutfits).join("\n")
            : "",
          sceneCast.length > 1
            ? [
                "These are DIFFERENT people. They have different hair and different clothing colours — keep those differences obvious and never give one character another character's hair or outfit.",
                "Do not make the friend, sibling or classmate look like a copy of the main child. If the descriptions read alike, differentiate them clearly in the drawing.",
                `${portraits.length ? "The reference sheet (and, for a fixed family member, their attached original portrait) is" : "The reference sheet is"} the ONLY source of each face. Copy each named character's face, hair shape and hair length from the sheet exactly as drawn there — same eyes, same nose, same mouth, same face shape, same fringe. Never invent a new face for someone who is on the sheet, and never redesign a face because this page shows a different angle or mood.`,
                "These are Korean children. Every child has black or dark brown hair. Never draw blonde, golden, yellow, red, ginger or silver hair, whatever the wording of a description suggests.",
                "Keep each character's sex as the sheet shows it. Do not give a boy long hair or a bob, and do not turn a girl into a boy, from one page to the next.",
              ].join("\n")
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    [
      `HOW MANY PEOPLE — the exact answer is ${sceneCast.length}. Draw exactly ${sceneCast.length} visible people. No extra background children, no crowd filler, and never a second copy of someone already in the picture.`,
      "If the scene names only one character, exactly one person is in this picture.",
      "Every named character — children AND adults such as a parent, teacher or shopkeeper — must be drawn with the face and hair the reference sheet gives them. An adult whose face changes from page to page reads as a different person to a child.",
      "Before drawing, assign each named character one position and one action from the Scene. Do not swap who performs an action, who has stopped, who leads, who follows, or which side of an object each person occupies.",
      "FINAL CHECK before you finish: look at every face you drew. If two figures share the same face, the same hair and the same clothes, that is the duplication error — remove one of them or redraw that figure as the correct, visibly different character.",
      currentLocation && !heroTiny
        ? `Then check the PLACE: is this unmistakably "${currentLocation.name}" with ${currentLocation.description}? If the ground, the landmark or the colours are different, the page is wrong — fix the place before anything else.`
        : "",
      // 작아진 쪽은 장소 대신 크기를 끝에서 한 번 더 확인시킨다(앞·뒤에 반복한 것을 모델이 지킨다).
      heroTiny && hero
        ? `Then check the SIZE: is ${hero.name} as small as an ant, seen from the ground, with the grass or the furniture towering overhead? If ${hero.name} stands at ordinary child size in an ordinary-looking place, the page is wrong — fix the size before anything else.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    /*
     * 인물은 한 공간에 있어야 한다.
     *
     * 실제로 이런 그림이 나왔다 — 본문은 "하온이와 엄마는 집으로 돌아왔어요"인데,
     * 아이는 방 안에 앉아 있고 엄마는 비 오는 창밖에 서서 안을 들여다보고 있었다.
     * 아이 책에서 이건 따뜻한 장면이 아니라 무서운 장면이다.
     *
     * 왜 이렇게 되냐면, 앞 쪽의 장소(골목·놀이터)와 이 쪽의 장소(집)가 둘 다 신호로
     * 들어올 때 모델이 '창문'으로 두 장소를 한 그림에 욱여넣기 때문이다. 그러면서
     * 인물이 유리 양쪽으로 갈린다. 인원 수도 장소도 규칙을 어긴 게 아니라서
     * 지금까지 아무 검사에도 안 걸렸다.
     */
    sceneCast.length > 1
      ? [
          "ONE SHARED SPACE — every named character stands in the SAME physical space, on the same side of every wall, window, door, fence and gate.",
          "Never put one character indoors and another outdoors. Never place a character behind glass looking in at the others. Never separate them with a window frame, a doorway or a railing.",
          "A person standing outside in the rain looking in through a window is frightening in a children's book, not warm — never compose the page that way.",
          "If the story text says they arrived, came home or went somewhere together, they are together INSIDE that place, close enough to touch.",
        ].join("\n")
      : "",
    // 일관성 — 이 앱의 핵심 약속이다. 쪽마다 얼굴이나 옷이 바뀌면 "내 동화"가 아니게 된다.
    sheet
      ? [
          "ABSOLUTE RULE — CHARACTER CONSISTENCY.",
          "These characters appear on every page of one book. They must look like the SAME person on page 1 and page 8.",
          // 주인공만 챙기고 친구는 쪽마다 바뀌는 일이 잦았다 — 아이는 친구도 알아본다.
          "This applies to EVERY character, not just the main child. The friend, the sibling, the classmate, the grown-up — each one keeps the exact same hair, face and outfit on every single page. A friend who changes shirt colour between pages breaks the book just as badly as a hero who does.",
          "Copy from the reference sheet without any change: face shape and features, eye shape and colour, eyebrows, hairstyle, hair colour and hair length, skin tone, body proportions and apparent age, EVERY garment with its exact colour and pattern, shoes, and every accessory.",
          "Do NOT restyle, do NOT age the character up or down, do NOT change the haircut, do NOT swap or recolour the outfit, do NOT add or remove accessories, do NOT 'improve' the design.",
          "Only the pose, the expression and the camera angle may change — never the character's appearance.",
        ].join("\n")
      : "",
    /*
     * 쪽마다 그림의 '크기'와 '색감'이 달라 보이는 문제.
     *
     * 크기: 캔버스 비율은 API로 고정하는데도, 모델이 그림 안에 흰 여백이나 액자
     * 테두리를 그려 넣어 어떤 쪽은 그림이 작아 보인다. 책을 넘길 때 그림이 커졌다
     * 작아졌다 하면 인쇄가 잘못된 책처럼 보인다.
     *
     * 색감: 한 쪽은 쨍하고 다음 쪽은 물 빠진 듯 나오면 같은 책 같지가 않다.
     * 다만 낮·밤처럼 장면이 정하는 차이는 살려야 하므로, '무엇을 칠하느냐'가 아니라
     * '어떤 톤으로 칠하느냐'를 맞추라고 이른다.
     */
    [
      "SAME SIZE ON EVERY PAGE — the artwork must fill the entire canvas, edge to edge.",
      "No white margins, no borders, no frames, no rounded corners, no vignette box, no drop shadow around the picture, no paper edge, no letterboxing bars. The illustration itself IS the whole image.",
      "Do not shrink the scene to sit inside a smaller box. Every page in this book must look like the same size of picture.",
      "",
      "SAME COLOUR FEEL ON EVERY PAGE — this book is one set, printed together.",
      "Keep the same palette family, the same saturation level, the same brightness and contrast, and the same softness of light across all pages.",
      "Never make one page vivid and glossy and the next page pale and washed out. Never switch between a warm and a cold overall cast without the story asking for it.",
      "Scene-driven changes are fine and welcome — night is darker, sunset is warmer, indoors is softer. What must stay constant is the TREATMENT: how strong the colours are, how much contrast, how the light is rendered.",
    ].join("\n"),
    "Keep the bottom quarter simple but FULLY PAINTED with scene color (ground, sky, water or another natural background) so text can be placed there. Simple never means white, blank, transparent or unfinished.",
    "Wholesome, innocent, fully clothed, child-friendly.",
    "IMAGE ONLY — absolutely NO captions, subtitles, story sentences, labels, speech bubbles, letters, numbers, logos, signatures, watermarks or readable writing in ANY language, including English and Korean. Leave the painted bottom area empty for the app to overlay text later.",
    phone
      ? "Tall 3:4 portrait composition, framed for a phone screen held upright."
      : "Wide 4:3 landscape composition.",
    qualityCorrection
      ? `QUALITY CORRECTION FROM THE REJECTED VERSION: ${qualityCorrection}. Draw a new version that corrects this exact character/composition error.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    // 비용 상한: 페이지당 이미지 생성은 정확히 한 번만 호출한다.
    // 참조 순서 = 프롬프트가 말하는 순서: 인물 시트 → 고정 얼굴 → 장소 시트 → (같은 장소의) 승인 쪽(refs).
    let image = await generateImage({
      prompt,
      references: refs.images,
      // 고정 가족 얼굴을 붙인 쪽은 그림마다 바로 앞에 "이 그림은 누구"를(lib/page-refs pageReferenceLabels). 없으면 예전 요청 그대로.
      ...(portraits.length ? { referenceLabels: pageReferenceLabels(refs.order, cardNames) } : {}),
      aspectRatio,
      // 원본 얼굴을 붙였으면 그림 없는 답(안전 검사 멈춤)은 두 번까지만 — 60초를 다 쓰기 전에 알리면
      // 부르는 쪽이 얼굴 없이 한 번 더 그린다(아래 422 portrait). 인물 시트(api/character-sheet)와 같은 방식.
      ...(portraits.length ? { noImageAttempts: 2 } : {}),
    });

    // 흰 테두리는 재생성하지 않고 로컬 이미지 처리로 잘라내므로 AI 토큰이 들지 않는다.
    const borderIssue = await detectBlankCanvasBorder(image);
    if (borderIssue) image = await repairBlankCanvasBorder(image);
    /*
     * 잘라 확대해도 흰 띠가 남았다(여백이 너무 두꺼웠다) — 부모에게 흰 테두리를 보여 주지 않는다.
     * AI 검수 결과와 상관없이 '떨어짐'으로 돌려줘 부르는 쪽이 다시 그리게 한다. 이 판정은 픽셀 검사라
     * Gemini 가 막혀 AI 검수를 건너뛴 때(checked=false)에도 믿을 수 있다.
     */
    const borderLeft = borderIssue ? await detectBlankCanvasBorder(image) : null;

    // 판매용 품질 기준: 이미지 생성보다 훨씬 저렴한 멀티모달 검수는 항상 수행한다.
    const aiCheck = await validateIllustration({
      image,
      reference: sheet,
      // 고정 가족 원본 — 쪽 그림에 붙인 것 그대로(다시 받지 않는다). 얼굴·머리를 이것과 견준다(lib/gemini).
      portraits,
      // 짠 시트의 칸 순서 — 섞인 시트는 이야기 순서와 달라, 검수가 칸을 이름에 잘못 짝짓지 않게. 옛 책은 없다.
      sheetOrder,
      // 옷 카드로 입은 고정 가족 — 그 칸 위의 옷과 견주게(옛 책은 빈다 = 예전 글).
      sheetOutfits: dressed,
      styleReference: pageStyleReference,
      // 작아진 쪽은 장소 기준 그림·장소 표지·실내외로 떨어뜨리지 않는다(개미 눈높이라 나무·울타리·천장이 안 보이는 게 맞다)
      locationReference: placeSheet,
      indoor: heroTiny ? null : indoor,
      scene: storyText ? `${drawnScene}\nStory text: ${storyText}` : drawnScene,
      expectedLocation: currentLocation && !heroTiny
        ? `${currentLocation.name}: ${currentLocation.description}`
        : "",
      // 고정 얼굴은 설명 글이 아니라 시트와 견주게 한다 — 글과 다르다고 맞게 그린 쪽을 떨어뜨리지 않게.
      // 원본 그림이 붙은 사람은 얼굴·머리는 원본, 옷은 시트와 — 설명 글의 옷 낱말로 맞게 그린 쪽을 떨어뜨리지 않게.
      // 짠 시트면 원본이 안 붙은 고정 가족도 옷은 시트와(시트의 옷 = 가족 그림의 옷). lib/page-refs fixedCheckDescription.
      cast: sceneCast.map((c) =>
        c.fixed && sheet
          ? {
              name: c.name,
              description: fixedCheckDescription(
                c.description,
                portraitNames.has(c.name),
                composedSheet,
                dressed.includes(c.name),
              ),
            }
          : { name: c.name, description: c.description },
      ),
      stylePrompt: style.prompt,
      // 주인공 성별·머리, 벨트, 내린 뒤 장면 — 이 쪽에 주인공이 없으면 주인공 규칙은 빼고 보낸다.
      // 가족 얼굴 쪽은 일부러 가깝게 찍었다 — 다리가 잘리거나 장소가 덜 보인다고 떨어뜨리지 않게(lib/page-refs familyFramingCheckLines).
      extraRules: [
        ...checkRuleLines({ hero: heroOnPage ? hero : null, page: vehicleInfo, storyText }),
        ...familyFramingCheckLines(familyFraming),
        // 크기가 무너진 그림(거인이 큰 형으로)은 떨어뜨려 다시 그리게 한다.
        ...scaleCheckLines(scale),
        // 작아진 쪽인데 보통 크기 아이를 보통 마당에 그린 그림도.
        ...(heroTiny && hero ? tinyHeroCheckLines(hero.name) : []),
        // 같은 장소 둘째 쪽부터 일부러 바꾼 구도 — 장소 표지가 덜 보인다고 떨어뜨리지 않게.
        ...(heroTiny ? [] : cameraCheckLines(placeVisit)),
      ],
    });
    const check = borderLeft
      ? { ok: false, checked: true, issues: [borderLeft, aiCheck.ok ? "" : aiCheck.issues].filter(Boolean).join(" ") }
      : aiCheck;
    /*
     * 글자가 그려진 건 다른 지적과 성격이 다르다.
     *
     * '그림체가 조금 다르다' 같은 지적은 사람에 따라 갈리지만, 그림 안의 글자는
     * 언제나 잘못이고 한눈에 보인다. 부르는 쪽이 이것만 따로 다뤄 꼭 다시 그리게
     * 구분해서 알려 준다.
     */
    /*
     * 낱말 끝에도 경계를 둔다. 예전엔 앞쪽 경계만 있어서 'texture'(질감)·'letterbox'·
     * 'labelled'가 전부 '글자 불량'으로 분류됐다 — 글자 전용 예산(권당 2회)이
     * 엉뚱한 곳에 쓰여, 정작 진짜 글자가 박힌 쪽은 못 고쳤다.
     */
    const textIssue =
      !check.ok &&
      /\b(text|texts|writing|caption|captions|letter|letters|word|words|subtitle|subtitles|script|signage|label|labels|watermark|signature)\b/i.test(
        check.issues,
      );
    /*
     * 고정 가족 얼굴 지적(2026-10-02) — 부르는 쪽(만들기 화면)이 얼굴 전용 다시 그리기 1장을 따로 쓴다.
     * 검수 FAIL 글이 얼굴·머리 낱말을 짚고 이 쪽에 고정 가족이 있을 때만. 글자·테두리가 먼저다(언제나 잘못이라).
     */
    const faceIssue =
      !check.ok &&
      !textIssue &&
      !borderLeft &&
      fixedOnPage.length > 0 &&
      /\b(face|facial|hair|hairstyle|fringe|parting|eyes?|eyebrows?|nose|mouth|glasses|beard|freckles?|mole|older|younger)\b/i.test(
        check.issues,
      );
    return NextResponse.json({
      image: toDataUrl(image),
      corrected: Boolean(borderIssue),
      // 검사를 실제로 했는지 — 부르는 쪽이 '통과'와 '검사 못 함'을 갈라 쓴다.
      qualityChecked: check.checked,
      qualityPassed: check.ok,
      // border — 흰 여백이 남았다. 부르는 쪽이 다시 그린 그림에 흰 여백만 없으면 다른 지적이 있어도 그쪽을 쓴다.
      ...(check.ok
        ? {}
        : {
            qualityWarning: check.issues,
            qualityIssue: textIssue ? "text" : borderLeft ? "border" : faceIssue ? "face" : "other",
          }),
    });
  } catch (e) {
    /*
     * 원본 얼굴을 붙인 쪽을 그림 모델이 거절했다 — 안전 검사(422)·그림 없는 답(noImage)·그림을 못 읽음(400).
     * 422(portrait)로 알리면 부르는 쪽(만들기 화면·한 쪽 다시 그리기)이 얼굴 없이 한 번 더 부른다. 여기서 바로 다시
     * 그리지 않는다: 한 요청에서 두 번 그리고 검수까지 하면 60초 제한을 넘길 수 있다.
     */
    if (portraits.length > 0 && e instanceof GeminiError && (e.status === 422 || e.status === 400 || e.noImage)) {
      console.warn("[illustrate-page] 원본 얼굴 쪽 거절:", e.status ?? "-", e.noImage ?? "");
      return NextResponse.json(
        { error: "가족 얼굴 그림으로 이 쪽을 그리지 못했어요.", code: "portrait" },
        { status: 422 },
      );
    }
    if (e instanceof GeminiError) {
      // 로그에 남겨야 "왜 그림이 안 나오지?"를 나중에 추적할 수 있다.
      // 특히 429(몰림·할당량)는 화면만 봐서는 다른 실패와 구분되지 않는다.
      console.error("[illustrate-page] Gemini", e.status, e.message);
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[illustrate-page]", e);
    return NextResponse.json({ error: "삽화를 그리지 못했습니다." }, { status: 500 });
  }
}
