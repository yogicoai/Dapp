import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
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
import { familyFolderOf, familyUrlPrefix, fetchFamilyRef } from "@/lib/family-ref";
import {
  characterSheetPrompt,
  fixedAdultNotes,
  maxPortraitRefs,
  pickSheetPortraits,
  sheetReferences,
} from "@/lib/sheet-prompt";

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
export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as {
    characters?: { name?: unknown; description?: unknown }[];
    artStyleId?: unknown;
    drawing?: unknown;
    looks?: unknown;
    looksEn?: unknown;
    heroAge?: unknown;
    heroGender?: unknown;
    adultLooks?: unknown;
    /** 고정 얼굴 [{ name: 등장인물 이름, ref: 가족 그림 참고 주소, memberId }] — 선택. 없으면 예전 그대로. */
    portraits?: unknown;
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

  const characters = (input.characters ?? [])
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.trim() : "",
      description: typeof c.description === "string" ? c.description.trim() : "",
    }))
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
  const picked = pickSheetPortraits(input.portraits, characters, familyPrefix, maxPortraitRefs(process.env));

  /*
   * 그림체 견본을 참조로 붙인다.
   *
   * 시트는 책 전체의 그림체 기준인데, 정작 시트 자신은 한 줄짜리 영어 문구로만
   * 그렸다. 문구는 해석이 갈린다 — 같은 "따뜻한 수채화"가 어느 날은 진하고 어느 날은
   * 흐리게 나오고, 그 시트를 따라 책 전체가 흔들렸다. 부모가 화면에서 고른 견본
   * (public/art-styles/여우 그림)이 바로 그 그림체의 실물이라 이것을 함께 준다.
   * 요청의 origin으로 받아 온다 — Vercel 서버 함수 안에는 public 파일이 없을 수 있다.
   * 고정 얼굴은 견본과 함께(동시에) 받는다 — 얼굴 받기가 늘리는 시간은 최대 6초.
   */
  const [styleSample, ...portraitImages] = await Promise.all([
    style.image
      ? loadReferenceImage(new URL(style.image, request.url).toString()).catch(() => null)
      : Promise.resolve(null),
    ...picked.portraits.map((p) => fetchFamilyRef(p.url)),
  ]);
  const portraits = picked.portraits.flatMap((p, i) => {
    const image = portraitImages[i];
    return image ? [{ name: p.name, memberId: p.memberId, image }] : [];
  });
  if (asked > 0) {
    console.info("[character-sheet] 고정 얼굴", {
      asked,
      used: portraits.length,
      rejected: picked.rejected,
      dropped: picked.dropped,
      unreachable: picked.portraits.length - portraits.length,
    });
  }
  // 주인공 얼굴이 고정돼 있으면 그 그림이 원본이다 — 아이 그림(지금은 늘 없음)은 붙이지 않는다.
  const usedDrawing = portraits.some((p) => p.name === characters[0].name) ? null : drawing;

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
        { error: "가족 얼굴 그림으로 인물을 그리지 못했어요.", code: "portrait" },
        { status: 422 },
      );
    }
    if (e instanceof GeminiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[character-sheet]", e);
    return NextResponse.json({ error: "캐릭터를 그리지 못했습니다." }, { status: 500 });
  }
}
