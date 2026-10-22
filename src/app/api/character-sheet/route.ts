import { NextResponse } from "next/server";
import { bindAiUsageSink, withAiUsage } from "@/lib/ai-usage";
import { dbUsageSink } from "@/lib/ai-usage-db";
import { callerOf } from "@/lib/api-auth";
import { canCreate, createLockedResponse } from "@/lib/create-access-server";
import { ART_STYLES } from "@/lib/art-styles";
import {
  GeminiError,
  fromDataUrl,
  generateImage,
  loadReferenceImage,
  shrinkForReference,
  toDataUrl,
  type GeneratedImage,
} from "@/lib/gemini";
import { heroIdentity } from "@/lib/child-looks";
import { familyFolderOf, familyUrlPrefix, fetchFamilyRefRetry } from "@/lib/family-ref";
import { readPortraitFigure } from "@/lib/page-refs";
import {
  characterSheetPrompt,
  fixedAdultNotes,
  maxPortraitRefs,
  outfitCardAspect,
  outfitCardPrompt,
  outfitCardSize,
  pickSheetPortraits,
  sheetReferences,
  type SheetAdultLooks,
  type SheetCharacter,
} from "@/lib/sheet-prompt";
import {
  composeCharacterSheet,
  prepareOutfitCard,
  prepareSheetFigure,
  sheetFigureMeta,
  subSheetAspect,
  type PreparedFigure,
  type PreparedOutfitCard,
} from "@/lib/sheet-compose";

/*
 * 그리는 데 20~30초가 걸린다(검사에 걸려 다시 그리면 그 두 배).
 * 이 값을 안 적으면 배포 환경의 짧은 기본값이 걸려 도중에 잘린다 — 그때 돌아오는
 * 응답은 JSON이 아니라, 부르는 쪽은 이유도 모른 채 그 쪽만 빈 채로 넘어갔다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 캐릭터 시트 — 삽화 일관성의 축.
 *
 * 인수인계 앱이 검증한 방식: 시트를 한 장 만들어 매 쪽 삽화에 참조로 재주입하면
 * 8쪽 내내 같은 얼굴이 나온다. 우리는 사진 없이 클로드가 쓴 인물 묘사(@@CHARACTER@@)
 * 로 시트를 만든다. 역할 분담: 클로드가 묘사를 쓰고, Gemini는 그리기만 한다.
 *
 * 고정 얼굴(2026-09-29): 우리 가족 캐릭터에서 얼굴을 고정한 사람이 이야기에 나오면 그 그림(참고용 JPEG)을
 * 함께 붙인다(portraits 칸 — 만들기 화면이 lib/family-cast 로 짝지어 보낸다). 시트가 모든 쪽의 유일한 얼굴
 * 기준이라 여기만 물리면 책 전체가 그 얼굴이 된다. 프롬프트는 lib/sheet-prompt.
 *
 * 원본 픽셀 시트(2026-09-29 오후, 사장님 "얼굴이 달라 특히"): 참고로 붙여 AI 가 다시 그리면 얼굴이 한 번 흐르고, 쪽마다 또
 * 흐른다. 수채화 책이면 고정 가족은 **가족 그림 원본을 그대로** 시트에 세우고(AI 안 거침), 나머지 사람만 AI 로 그려 옆에 붙인다
 * (아래 composedSheet, lib/sheet-compose). 응답의 order = 왼쪽부터 선 순서, composed = "portraits"(고정 가족뿐) | "mixed".
 *
 * 이 책의 옷(2026-09-29 저녁, 사장님 "옷은 그 주제안에서 랜덤으로 교체되게"): 원본 픽셀 시트는 가족 그림의 옷을 책마다 입혔다.
 * 이제 고정 가족 모두에게 이 책의 옷(@@CHARACTER@@ 셋째 칸)이 있으면 AI 로 **옷만** 한 장 그려(옷 카드, 약 95원) 시트 위 줄에
 * 세운다 — 얼굴은 여전히 원본 픽셀뿐이다. 옷 카드가 안 되면 예전처럼 가족 그림의 옷으로 짠다(책은 멈추지 않는다).
 * 응답의 sheetOutfits = 옷 카드로 입은 이름, drawn = 이 요청에서 부른 AI 그림 수(만들기 화면이 그린 장수에 더한다).
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
// 이 요청 안의 AI 호출(시트 그림)을 모델·토큰·금액으로 남긴다(lib/ai-usage) — 답을 돌려주기 전에 다 적는다.
export function POST(request: Request) {
  return withAiUsage("character-sheet", () => handlePost(request));
}

async function handlePost(request: Request) {
  // 요청이 들어온 시각 — 옷 카드를 기다리는 한도(60초 제한 안)를 여기서 잰다. 로그인·견본·가족 그림 받기도 그 60초에 든다.
  const requestStarted = Date.now();
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
    characters?: { name?: unknown; description?: unknown; outfit?: unknown }[];
    artStyleId?: unknown;
    drawing?: unknown;
    looks?: unknown;
    looksEn?: unknown;
    heroAge?: unknown;
    heroGender?: unknown;
    adultLooks?: unknown;
    /** 고정 얼굴 [{ name: 등장인물 이름, ref: 가족 그림 참고 주소, memberId }] — 선택. 없으면 예전 그대로. */
    portraits?: unknown;
    /**
     * 옷 카드를 그려도 되나 — 새 만들기 화면만 true 를 보낸다(sheetOutfits 를 받아 쪽 그림·책에 넘기는 화면).
     * 배포 전에 열어 둔 화면은 이 칸 없이 새 대본(옷 칸 있음)을 보내므로, 옷 칸만 보고 그리면 값(약 95원)만 나가고
     * 그 화면은 sheetOutfits 를 버려 쪽 그림 글과 시트가 어긋났다(검토 2026-09-29).
     */
    outfitCard?: unknown;
  };
  /**
   * 엄마·아빠 생김새 — 부모가 설정에서 고른 것(선택).
   * 이름(엄마/아빠)별로 한 줄씩. 안 온 사람에겐 아래 '지어내지 말라' 규칙만 걸린다.
   */
  const adultLooks = ((): { name: string; line: string }[] => {
    const v = input.adultLooks as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object") return [];
    return Object.entries(v)
      .filter(([, line]) => typeof line === "string" && line.trim())
      // 400자 — 엄마·아빠 생김새 칸이 늘어(2026-09-28) 120자면 옷·안경 뒤쪽이 잘렸다.
      .map(([name, line]) => ({ name, line: String(line).trim().slice(0, 400) }));
  })();

  /**
   * 아이 생김새 — 설정에서 고른 특징(머리·안경·좋아하는 옷 색·주근깨 등)을 한 줄로 받는다.
   * 사진이 아니라 특징만 받는 이유: 아동 얼굴은 개인정보 부담이 크고, 어설프게 닮으면
   * 오히려 실망한다. 특징만으로도 "우리 애 같네"는 충분히 나온다.
   * 이 시트가 모든 쪽 삽화의 기준이므로, 여기 한 번만 넣으면 책 전체에 적용된다.
   *
   * 영어(looksEn)가 오면 그것을 쓴다 — 영어 규칙 사이에 한국어 한 줄이 끼는 것보다
   * 확실히 읽힌다. 옛 호출은 한국어(looks)만 보내므로 그것도 받는다.
   */
  const looksKo = typeof input.looks === "string" ? input.looks.trim().slice(0, 200) : "";
  const looksEn = typeof input.looksEn === "string" ? input.looksEn.trim().slice(0, 400) : "";
  const looks = looksEn || looksKo;
  /*
   * 나이·성별은 이야기(클로드)에만 가고 여기엔 클로드가 쓴 생김새 줄만 왔다.
   * 클로드가 그 줄에 나이를 안 적으면 다섯 살이 여덟 살 얼굴로 나올 수 있었다.
   */
  const heroAge = typeof input.heroAge === "number" ? input.heroAge : null;
  const heroGender = typeof input.heroGender === "string" ? input.heroGender : undefined;
  const hero = heroIdentity(heroAge, heroGender);

  /**
   * 아이가 그린 그림(선택) — 주인공을 이 그림에서 따온다.
   *
   * "동화 속 주인공이 나 같지 않다"는 피드백(7번)의 해법. 아이 사진 대신 아이 '그림'을
   * 받는 이유: 얼굴 데이터를 다루지 않아 개인정보 부담이 없고, 아이에게는
   * "내가 그린 애가 주인공이 됐다"가 훨씬 강한 몰입이다.
   * 시트 한 장이 모든 쪽 삽화의 기준이라, 여기만 물리면 8쪽 전체에 반영된다.
   */
  const drawing = typeof input.drawing === "string" ? fromDataUrl(input.drawing) : null;

  const style =
    ART_STYLES.find((s) => s.id === input.artStyleId) ?? ART_STYLES[0];

  const characters: BookCharacter[] = (input.characters ?? [])
    .map((c) => {
      // 이 책의 옷(@@CHARACTER@@ 셋째 칸) — 고정 가족의 옷 카드에만 쓴다. 설명(description)에도 이미 들어 있다.
      const outfit = typeof c.outfit === "string" ? c.outfit.trim().slice(0, 200) : "";
      return {
        name: typeof c.name === "string" ? c.name.trim() : "",
        description: typeof c.description === "string" ? c.description.trim() : "",
        ...(outfit ? { outfit } : {}),
      };
    })
    .filter((c) => c.name)
    /*
     * 상한 6 — 예전엔 4였다. 실제 책에서 아이 1 + 친구 3 + 선생님 = 5명이 나왔고,
     * 다섯째(선생님)가 시트에서 잘려 매 쪽 새 얼굴로 그려졌다. 친구를 3명까지
     * 넣을 수 있으니 어른 한둘을 더해도 6이면 덮인다.
     */
    .slice(0, 6);

  if (characters.length === 0) {
    return NextResponse.json({ error: "등장인물이 없습니다." }, { status: 400 });
  }

  /*
   * 고정 얼굴 — 이 회원 폴더의 참고용 JPEG 만, 등장인물에 있는 이름에만 붙인다(lib/sheet-prompt pickSheetPortraits,
   * 주소 규칙은 lib/family-ref). 아무 주소나 받아 오지 않는다(남의 가족 그림·서버 내부 주소를 막는다).
   * 못 받은 사람(주소가 이상함·받기 실패·6초 넘음)은 그 사람만 예전처럼 글로 그린다 — 책은 그대로 만든다.
   * 로그에는 수만 남긴다(주소에 회원 uid 가 들어 있다).
   */
  const asked = Array.isArray(input.portraits) ? input.portraits.length : 0;
  const familyPrefix = familyUrlPrefix(process.env, familyFolderOf(caller.uid));
  if (asked > 0 && !familyPrefix) {
    console.warn("[character-sheet] CAFE24 주소 설정이 없어 고정 얼굴을 쓰지 못함:", asked);
  }
  /*
   * 몇 명까지 받을까 — AI 가 참고로 보는 그림은 모델이 잘 따르는 수까지만(maxPortraitRefs, 2.x 는 2명).
   * 수채화 책은 원본 픽셀로 짜서(아래 composedSheet) 참고 그림 수 제한이 없다 — 이야기에 나오는 고정 가족을 모두 받는다
   * (만들기 화면 상한 CAST_PORTRAITS_MAX 6). 짜기에 실패해 예전 AI 시트로 물러서면 그때 aiCap 으로 자른다.
   */
  const aiCap = maxPortraitRefs(process.env);
  const picked = pickSheetPortraits(
    input.portraits,
    characters,
    familyPrefix,
    style.id === "watercolor" ? characters.length : aiCap,
  );

  /*
   * 그림체 견본을 참조로 붙인다.
   *
   * 시트는 책 전체의 그림체 기준인데, 정작 시트 자신은 한 줄짜리 영어 문구로만
   * 그렸다. 문구는 해석이 갈린다 — 같은 "따뜻한 수채화"가 어느 날은 진하고 어느 날은
   * 흐리게 나오고, 그 시트를 따라 책 전체가 흔들렸다. 부모가 화면에서 고른 견본
   * (public/art-styles/여우 그림)이 바로 그 그림체의 실물이라 이것을 함께 준다.
   * 요청의 origin으로 받아 온다 — Vercel 서버 함수 안에는 public 파일이 없을 수 있다.
   * 고정 얼굴은 견본과 함께(동시에) 받는다 — 얼굴 받기가 늘리는 시간은 최대 6초(못 받으면 한 번 더 4초).
   */
  const [styleSample, ...portraitImages] = await Promise.all([
    style.image
      ? loadReferenceImage(new URL(style.image, request.url).toString()).catch(() => null)
      : Promise.resolve(null),
    // 한 번 못 받으면 짧게 한 번 더 — 한 번의 끊김으로 그 사람이 책 전체에서 고정 얼굴을 잃지 않게(2026-10-01).
    ...picked.portraits.map((p) => fetchFamilyRefRetry(p.url)),
  ]);
  const fetchedPortraits = picked.portraits.flatMap((p, i) => {
    const image = portraitImages[i];
    return image ? [{ name: p.name, memberId: p.memberId, image }] : [];
  });
  if (asked > 0) {
    console.info("[character-sheet] 고정 얼굴", {
      asked,
      used: fetchedPortraits.length,
      rejected: picked.rejected,
      dropped: picked.dropped,
      unreachable: picked.portraits.length - fetchedPortraits.length,
    });
  }
  // 주인공 얼굴이 고정돼 있으면 그 그림이 원본이다 — 아이 그림(지금은 늘 없음)은 붙이지 않는다.
  const usedDrawing = fetchedPortraits.some((p) => p.name === characters[0].name) ? null : drawing;

  /*
   * 원본 픽셀 시트(2026-09-29 사장님 "얼굴이 달라 특히") — 고정 얼굴을 AI 가 다시 그리지 않는다(lib/sheet-compose).
   * 수채화 책만: 가족 그림은 늘 수채화라(api/family/portrait) 지브리·벡터 책에 원본을 세우면 시트(=모든 쪽의 그림체 기준)가
   * 수채화가 된다 — 그 책들은 아래 예전 길(원본을 참고로 붙여 이 책 그림체로 옮겨 그리기) 그대로.
   * 짜기가 안 되면(그림을 못 읽음 등) — 아래 예전 AI 시트로 물러선다. 그 전에 옷 카드를 그렸으면(drawnSoFar) 그 장수도 응답의
   * drawn 에 넣는다 — 만들기 화면이 그린 장수(원가)를 적게 세지 않게(검토 2026-09-29).
   */
  let drawnSoFar = 0;
  if (style.id === "watercolor" && fetchedPortraits.length > 0) {
    const composed = await composedSheet({
      characters,
      portraits: fetchedPortraits,
      rawPortraits: input.portraits,
      stylePrompt: style.prompt,
      styleSample,
      drawing: usedDrawing,
      hero,
      heroAge,
      looks,
      adultLooks,
      outfitCard: input.outfitCard === true,
      requestStarted,
    });
    if (composed instanceof NextResponse) return composed;
    drawnSoFar = composed.drawnSoFar;
  }
  /** 이 요청에서 이미 부른 AI 그림(옷 카드) — 응답마다 붙인다. 없으면 칸을 안 붙여 예전 응답 그대로. */
  const drawnField = (more: number) => (drawnSoFar ? { drawn: drawnSoFar + more } : {});

  // 예전 AI 시트(지브리·벡터 책, 또는 원본으로 짜지 못함) — 참고로 붙이는 얼굴은 모델이 잘 따르는 수까지만(등장인물 순).
  const portraits = fetchedPortraits.slice(0, aiCap);

  const prompt = characterSheetPrompt({
    stylePrompt: style.prompt,
    characters,
    hero,
    looks,
    adultLooks,
    styleSample: Boolean(styleSample),
    drawing: Boolean(usedDrawing),
    portraits: portraits.map((p) => p.name),
    // 엄마·아빠 생김새 줄은 붙은 얼굴의 사람 id(파일 이름)로 고른다 — 인물 이름 꼴('엄마 (지은)'·'어머니')에 기대지 않는다.
    fixedAdults: fixedAdultNotes(portraits.map((p) => p.memberId)),
  });

  try {
    const image = await generateImage({
      prompt,
      // 순서 = 프롬프트의 '몇 번째': 그림체 견본 → 고정 얼굴 → 아이 그림(sheetReferences)
      references: sheetReferences<GeneratedImage>(
        styleSample,
        portraits.map((p) => p.image),
        usedDrawing,
      ),
      /*
       * 인물이 셋 이상이면 가로로 넓은 4:3에 그린다.
       * 정사각형 한 장에 넷을 나란히 세우면 얼굴 하나가 가로 1/4밖에 안 돼,
       * 매 쪽 삽화가 참조하기엔 너무 흐릿한 기준이 된다(친구 얼굴이 쪽마다
       * 달라지던 실제 원인 중 하나). 넓게 그리면 얼굴에 픽셀이 더 간다.
       */
      aspectRatio: characters.length >= 3 ? "4:3" : "1:1",
      // 고정 얼굴을 붙였으면 그림 없는 답(안전 검사 멈춤)은 두 번까지만 — 60초를 다 쓰기 전에 알리면
      // 만들기 화면이 얼굴 없이 한 번 더 그린다(아래 422 portrait).
      ...(portraits.length ? { noImageAttempts: 2 } : {}),
    });
    /*
     * 작게 줄여서 돌려준다 — 이 시트는 쪽마다 참조로 **다시 올라가는** 그림이다.
     * 원본(2~3MB)을 그대로 두면 장소 시트와 합쳐 요청이 4.5MB를 넘어 그 쪽들이
     * 통째로 실패한다(2026-08-29 실제 사고).
     * fixed — 고정 얼굴이 실제로 붙은 등장인물 이름. 화면이 쪽 그림·책의 등장인물에 표시한다.
     */
    return NextResponse.json({
      image: toDataUrl(await shrinkForReference(image)),
      ...(portraits.length ? { fixed: portraits.map((p) => p.name) } : {}),
      ...drawnField(1),
    });
  } catch (e) {
    /*
     * 고정 얼굴을 붙인 시트를 그림 모델이 거절했다 — 안전 검사(422)·그림 없는 답(noImage)·그림을 못 읽음(400).
     * 422(portrait)로 알리면 만들기 화면이 얼굴 없이 한 번 더 부른다 — 책 만들기는 멈추지 않는다.
     * 여기서 바로 다시 그리지 않는다: 한 요청에서 두 번 그리면 60초 제한을 넘길 수 있다.
     */
    if (portraits.length > 0 && e instanceof GeminiError && (e.status === 422 || e.status === 400 || e.noImage)) {
      console.warn("[character-sheet] 고정 얼굴 시트 거절:", e.status ?? "-", e.noImage ?? "");
      return NextResponse.json(
        { error: "가족 얼굴 그림으로 인물을 그리지 못했어요.", code: "portrait", ...drawnField(0) },
        { status: 422 },
      );
    }
    if (e instanceof GeminiError) {
      return NextResponse.json({ error: e.message, ...drawnField(0) }, { status: e.status ?? 500 });
    }
    console.error("[character-sheet]", e);
    return NextResponse.json({ error: "캐릭터를 그리지 못했습니다.", ...drawnField(0) }, { status: 500 });
  }
}

/** 등장인물 — 이 책의 옷(outfit)은 새 대본(2026-09-29 저녁~)에만 있다. */
type BookCharacter = SheetCharacter & { outfit?: string };

/**
 * 옷 카드를 그리지 않는 옷 — 수영복·속옷은 사람 없이 그려도 그림 모델이 막기 쉽고(아이 옷이라 더), 한두 쪽에서만 입는 옷이다.
 * 그런 책은 예전처럼 가족 그림의 옷으로 짜고, 그 쪽은 장면 글이 갈아입힌다.
 */
const NO_CARD_OUTFIT = /수영복|래시가드|비키니|속옷/;

/**
 * 옷 카드 — 고정 가족이 이 책에서 입는 옷을 사람 없이 한 장(lib/sheet-prompt outfitCardPrompt), 읽어서 한 벌씩 찾는다
 * (lib/sheet-compose prepareOutfitCard). 가족 그림은 붙이지 않는다 — 얼굴을 AI 에 한 번도 보이지 않는다.
 * 실패하면(거절·시간·칸을 못 읽음) null — 부르는 쪽이 가족 그림의 옷으로 짠다. 던지지 않는다.
 * deadline(Date.now 기준)이 지나면 기다리지 않는다 — 이 경로의 60초 제한에 걸려 응답이 JSON 이 아니게 되면 만들기 화면이
 * 얼굴 없는 AI 시트로 물러선다(얼굴이 가장 중요하다). 같은 시각을 generateImage until 로 넘겨 그 뒤 다시 걸기도 막는다
 * (이미 나간 요청은 멈추지 못한다 — api/family/portrait drawWithin 과 같은 방식).
 */
async function drawOutfitCard(args: {
  people: { name: string; outfit: string; memberId: string; kid: boolean; age: number | null }[];
  stylePrompt: string;
  styleSample: GeneratedImage | null;
  deadline: number;
}): Promise<PreparedOutfitCard | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const prompt = outfitCardPrompt({
      stylePrompt: args.stylePrompt,
      styleSample: Boolean(args.styleSample),
      people: args.people.map((p) => ({ size: outfitCardSize(p), outfit: p.outfit })),
    });
    const image = await Promise.race([
      generateImage({
        prompt,
        references: args.styleSample ? [args.styleSample] : [],
        aspectRatio: outfitCardAspect(args.people.length),
        until: args.deadline,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("옷 카드 시간 초과")), Math.max(0, args.deadline - Date.now()));
      }),
    ]);
    // kids — 아이 옷이 어른 옷보다 뚜렷이 크면 순서가 뒤바뀐 카드로 보고 버린다(lib/sheet-compose prepareOutfitCard).
    return await prepareOutfitCard({ image, names: args.people.map((p) => p.name), kids: args.people.map((p) => p.kid) });
  } catch (e) {
    console.warn(
      "[character-sheet] 옷 카드 실패 — 가족 그림 옷으로:",
      e instanceof GeminiError ? `${e.status ?? "-"} ${e.noImage ?? ""}` : (e as Error).message,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 옷 카드를 얹어 시트를 짠다 — 옷 카드로 짜다 실패하면 옷 카드 없이(가족 그림의 옷으로) 한 번 더.
 * 둘째도 실패하면 던진다. usedCard = 옷 카드가 실제로 시트에 섰는가.
 */
async function composeDressed(
  args: Parameters<typeof composeCharacterSheet>[0],
): Promise<{ sheet: Awaited<ReturnType<typeof composeCharacterSheet>>; usedCard: boolean }> {
  if (args.outfits) {
    try {
      return { sheet: await composeCharacterSheet(args), usedCard: true };
    } catch (e) {
      console.warn("[character-sheet] 옷 카드로 시트 짜기 실패 — 가족 그림 옷으로:", (e as Error).message);
    }
  }
  return { sheet: await composeCharacterSheet({ ...args, outfits: null }), usedCard: false };
}

/**
 * 원본 픽셀 시트 — 고정 가족은 가족 그림 그대로, 나머지 사람만 AI 가 그린다(lib/sheet-compose 머리글).
 *  · 모두 고정: AI 를 부르지 않는다(값 0, 1~7초). composed: "portraits".
 *  · 섞임: 나머지 사람만 AI 로 한 장(얼굴은 붙이지 않는다 — 거절 위험은 얼굴 없는 시트와 같다), 고정 가족 칸 옆에 붙인다.
 *    composed: "mixed". AI 가 실패하면 code "subsheet" 로 돌려준다 — 만들기 화면이 얼굴을 붙인 채 한 번 더, 그래도 안 되면
 *    얼굴 없이 그린다.
 * order = 왼쪽부터 선 순서 — 쪽 그림 프롬프트가 "시트의 몇째 칸이 누구"를 말한다(lib/page-refs sheetOrderLine).
 * 고정 가족 그림을 읽지 못하면 { drawnSoFar } — 부르는 쪽이 예전 AI 시트로 물러선다. drawnSoFar = 그 전에 부른 AI 그림(옷 카드) 수.
 * 이 책의 옷: 고정 가족 모두에게 옷 글이 있고 화면이 옷 카드를 받겠다고 했으면(outfitCard) 옷 카드를 함께 그린다
 * (모두 고정이면 기다리고, 섞이면 나머지 그림과 동시에).
 */
async function composedSheet(args: {
  characters: BookCharacter[];
  portraits: { name: string; memberId: string; image: GeneratedImage }[];
  rawPortraits: unknown;
  stylePrompt: string;
  styleSample: GeneratedImage | null;
  drawing: GeneratedImage | null;
  hero: string;
  heroAge: number | null;
  looks: string;
  adultLooks: SheetAdultLooks[];
  /** 새 만들기 화면이 옷 카드를 받겠다고 했나(요청의 outfitCard) */
  outfitCard: boolean;
  /** 요청이 들어온 시각 — 옷 카드 한도를 여기서 잰다 */
  requestStarted: number;
}): Promise<NextResponse | { drawnSoFar: number }> {
  const started = Date.now();
  const { characters, portraits } = args;
  const metas = new Map(portraits.map((p) => [p.name, sheetFigureMeta(p.memberId, readPortraitFigure(args.rawPortraits, p.name))]));
  let figures: PreparedFigure[];
  try {
    figures = await Promise.all(
      portraits.map((p) => {
        const meta = metas.get(p.name)!;
        return prepareSheetFigure({ name: p.name, image: p.image, heightCm: meta.heightCm, headRatio: meta.headRatio });
      }),
    );
  } catch (e) {
    console.warn("[character-sheet] 가족 그림을 읽지 못해 AI 시트로:", (e as Error).message);
    return { drawnSoFar: 0 };
  }
  const fixedNames = new Set(portraits.map((p) => p.name));
  const fixed = characters.filter((c) => fixedNames.has(c.name)).map((c) => c.name);
  const others = characters.filter((c) => !fixedNames.has(c.name));
  const names = characters.map((c) => c.name);

  /*
   * 이 책의 옷 — 고정 가족 **모두**에게 옷 글이 있을 때만 옷 카드를 그린다(한 사람만 가족 그림 옷이면 시트가 두 규칙으로 갈린다).
   * 옛 대본(옷 칸 없음)·수영복 책은 예전처럼 가족 그림의 옷. 모두 고정이면 옷 카드가 이 요청의 유일한 AI 그림이다.
   */
  const outfitOf = (name: string) => characters.find((c) => c.name === name)?.outfit ?? "";
  const dressable =
    args.outfitCard && fixed.length > 0 && fixed.every((n) => outfitOf(n) && !NO_CARD_OUTFIT.test(outfitOf(n)));
  const cardJob = dressable
    ? drawOutfitCard({
        people: fixed.map((name) => {
          const memberId = portraits.find((p) => p.name === name)?.memberId ?? "";
          return {
            name,
            outfit: outfitOf(name),
            memberId,
            kid: metas.get(name)?.kid ?? false,
            // 나이는 주인공만 안다(형제는 '어린아이').
            age: name === characters[0].name ? args.heroAge : null,
          };
        }),
        stylePrompt: args.stylePrompt,
        styleSample: args.styleSample,
        // 그림 한 장 20~30초 — 요청이 들어온 뒤 42초까지만 기다리고 짜기(1~3초)로 넘어간다(60초 제한 안).
        // 이 함수가 시작한 때(started)로 재면 로그인·견본·가족 그림 받기(6초+)만큼 한도가 60초 쪽으로 밀렸다(검토 2026-09-29).
        deadline: args.requestStarted + 42_000,
      })
    : null;
  const cardFields = (usedCard: boolean) => ({
    sheetOutfits: usedCard ? fixed : [],
    ...(cardJob && !usedCard ? { outfitFallback: true } : {}),
  });

  if (others.length === 0) {
    const card = cardJob ? await cardJob : null;
    try {
      const { sheet, usedCard } = await composeDressed({ names, figures, outfits: card });
      console.info("[character-sheet] 원본 시트", {
        people: fixed.length,
        outfitCard: usedCard ? "ok" : cardJob ? "fallback" : "none",
        ms: Date.now() - started,
      });
      return NextResponse.json({
        image: toDataUrl(sheet.image),
        fixed,
        order: sheet.order,
        composed: "portraits",
        drawn: cardJob ? 1 : 0,
        ...cardFields(usedCard),
      });
    } catch (e) {
      /*
       * 옷 카드를 기다리느라 시간을 썼으면 이 요청에서 AI 시트(20~30초, 한도 없음)를 또 그리지 않는다 — 60초에 걸려 504가 나면
       * 화면은 얼굴 없이 다시 그린다(얼굴이 가장 중요하다). 대신 "나머지 그림 실패"(subsheet)로 알리고 옷 카드 없이 다시 부르게 한다
       * (retryWithoutCard) — 다시 온 요청은 옷 카드 없이 곧바로 짜거나, 그래도 안 되면 시간이 넉넉할 때 AI 시트로 물러선다.
       */
      if (cardJob && Date.now() - args.requestStarted > 25_000) {
        console.warn("[character-sheet] 원본 시트 짜기 실패(옷 카드 뒤, 시간 부족) — 옷 카드 없이 다시:", (e as Error).message);
        return NextResponse.json(
          { error: "캐릭터 그림을 짜지 못했어요.", code: "subsheet", retryWithoutCard: true, drawn: 1 },
          { status: 503 },
        );
      }
      console.warn("[character-sheet] 원본 시트 짜기 실패 — AI 시트로:", (e as Error).message);
      return { drawnSoFar: cardJob ? 1 : 0 };
    }
  }

  // 섞임 — 나머지 사람만 AI 로. 주인공이 고정 가족이면 '첫 사람이 주인공' 줄·아이 생김새·아이 그림을 빼고,
  // 고정 가족인 엄마·아빠의 부모 줄도 뺀다(그 사람은 이 그림에 없다).
  const heroOnSheet = !fixedNames.has(characters[0].name);
  const drawing = heroOnSheet ? args.drawing : null;
  const droppedNotes = new Set(fixedAdultNotes(portraits.map((p) => p.memberId)));
  const prompt = characterSheetPrompt({
    stylePrompt: args.stylePrompt,
    characters: others,
    hero: args.hero,
    looks: args.looks,
    adultLooks: args.adultLooks.filter((a) => !droppedNotes.has(a.name)),
    styleSample: Boolean(args.styleSample),
    drawing: Boolean(drawing),
    heroOnSheet,
    // 가족 그림에서 잰 윗옷 색을 함께 — 설명 글의 옷(클로드가 정함)은 그림의 옷과 다를 수 있어, 글만 믿으면
    // 친구를 가족과 같은 색으로 입힌다(lib/sheet-compose outfitColour).
    // 옷 카드를 그리면 가족은 설명 글의 옷(이 책의 옷)을 입는다 — 잰 색으로 덮지 않는다. 다만 옷 카드가 실패하면 시트는
    // 가족 그림 옷으로 짜이고, 이 그림은 옷 카드와 동시에 그려 어느 쪽이 될지 모른다 — 잰 색도 피하라고 함께 준다(avoidOutfit).
    alreadyDrawn: characters
      .filter((c) => fixedNames.has(c.name))
      .map((c) => {
        const measured = figures.find((f) => f.name === c.name)?.outfit ?? null;
        return {
          name: c.name,
          description: c.description,
          outfit: cardJob ? null : measured,
          ...(cardJob && measured ? { avoidOutfit: measured } : {}),
        };
      }),
  });
  let block: GeneratedImage;
  try {
    block = await generateImage({
      prompt,
      references: sheetReferences<GeneratedImage>(args.styleSample, [], drawing),
      aspectRatio: subSheetAspect(others.length),
    });
  } catch (e) {
    /*
     * code: "subsheet" — 이 AI 그림엔 가족 얼굴이 붙지 않았다. 얼굴 탓이 아니니 만들기 화면은 **얼굴을 붙인 채로**
     * 한 번 더 부르고, 그래도 안 되면 얼굴 없이 그린다. 코드가 없으면 잠깐의 5xx·504 한 번에 책 전체가 고정 얼굴을
     * 잃었다(검토 2026-09-29). 어느 쪽이든 AI 한 번이라 값은 같다.
     */
    // drawn — 동시에 그리던 옷 카드도 부른 그림이다(나머지 그림 실패는 예전처럼 세지 않는다).
    if (e instanceof GeminiError) {
      console.warn("[character-sheet] 나머지 사람 그림 실패:", e.status ?? "-", e.noImage ?? "");
      return NextResponse.json({ error: e.message, code: "subsheet", drawn: cardJob ? 1 : 0 }, { status: e.status ?? 500 });
    }
    console.error("[character-sheet] 나머지 사람 그림", e);
    return NextResponse.json(
      { error: "캐릭터를 그리지 못했습니다.", code: "subsheet", drawn: cardJob ? 1 : 0 },
      { status: 500 },
    );
  }
  // 옷 카드는 나머지 그림과 동시에 그렸다 — 대개 이미 끝나 있다.
  const card = cardJob ? await cardJob : null;
  try {
    const { sheet, usedCard } = await composeDressed({ names, figures, block: { image: block }, outfits: card });
    console.info("[character-sheet] 원본 시트 + 나머지 AI", {
      fixed: fixed.length,
      others: others.length,
      outfitCard: usedCard ? "ok" : cardJob ? "fallback" : "none",
      ms: Date.now() - started,
    });
    return NextResponse.json({
      image: toDataUrl(sheet.image),
      fixed,
      order: sheet.order,
      composed: "mixed",
      drawn: 1 + (cardJob ? 1 : 0),
      ...cardFields(usedCard),
    });
  } catch (e) {
    // 드물다(그림은 이미 읽어 두었다). 한 요청에서 또 그리면 60초를 넘길 수 있어 실패로 알린다 — 화면이 얼굴 없이 다시 그린다.
    // drawn — 나머지 그림과 옷 카드는 값이 나갔다(화면이 그린 장수에 넣는다).
    console.error("[character-sheet] 원본 시트 짜기 실패(나머지 그림 뒤)", (e as Error).message);
    return NextResponse.json({ error: "캐릭터를 그리지 못했습니다.", drawn: 1 + (cardJob ? 1 : 0) }, { status: 500 });
  }
}
