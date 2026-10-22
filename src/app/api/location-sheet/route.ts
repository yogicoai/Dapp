import { NextResponse } from "next/server";
import backgrounds from "@/data/backgrounds.json";
import { bindAiUsageSink, withAiUsage } from "@/lib/ai-usage";
import { dbUsageSink } from "@/lib/ai-usage-db";
import { callerOf } from "@/lib/api-auth";
import { canCreate, createLockedResponse } from "@/lib/create-access-server";
import { ART_STYLES } from "@/lib/art-styles";
import { findLocationBackground, type LocationBg } from "@/lib/location-bg";
import { GeminiError, generateImage, loadReferenceImage, shrinkForReference, toDataUrl } from "@/lib/gemini";
import { pageVehicle, vehicleInteriorLines } from "@/lib/illustration-rules";
import { isIndoorPlace, placeVehicleKind, schoolShuttleName } from "@/lib/story-quality";

/*
 * 그리는 데 20~30초가 걸린다(검사에 걸려 다시 그리면 그 두 배).
 * 이 값을 안 적으면 배포 환경의 짧은 기본값이 걸려 도중에 잘린다 — 그때 돌아오는
 * 응답은 JSON이 아니라, 부르는 쪽은 이유도 모른 채 그 쪽만 빈 채로 넘어갔다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 장소 시트 — 인물 시트의 장소판.
 *
 * 인물은 시트 한 장을 매 쪽 참조로 넣어 8쪽 내내 같은 얼굴이 나온다. 장소는 그런 게
 * 없이 글 한 줄뿐이라, "계곡"이 어떤 계곡인지 모델이 쪽마다 새로 상상했다. 장소마다
 * **인물 없는 기준 그림**을 한 장 먼저 그려 두고, 그 장소의 모든 쪽에 참조로 넣는다.
 * 나중에 한 쪽만 다시 그릴 때도 이 그림이 기준이 된다.
 *
 * 인물 시트를 참조로 붙이지 않는다 — 붙이면 그 인물을 장소 그림에 그려 넣는다.
 * 그림체는 만들 때 고른 그림체 문구로 잠근다(만들기 단계라 그림체는 항상 알고 있다).
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
// 이 요청 안의 AI 호출(장소 그림)을 모델·토큰·금액으로 남긴다(lib/ai-usage) — 답을 돌려주기 전에 다 적는다.
export function POST(request: Request) {
  return withAiUsage("location-sheet", () => handlePost(request));
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
    name?: unknown;
    description?: unknown;
    artStyleId?: unknown;
    shape?: unknown;
    detail?: unknown;
  };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 300) : "";
  if (!name) {
    return NextResponse.json({ error: "장소 이름이 없습니다." }, { status: 400 });
  }
  // 부모가 적어 준 이 장소의 자세한 모습(선택). 모델이 상상한 것보다 우선한다.
  const detail = typeof input.detail === "string" ? input.detail.trim().slice(0, 300) : "";
  const style = ART_STYLES.find((s) => s.id === input.artStyleId) ?? ART_STYLES[0];
  const phone = input.shape === "phone";
  // 이름만 본다 — 설명에 "버스가 지나가는 길"이 있다고 그 장소를 탈것으로 치면 안 된다.
  const vehicle = placeVehicleKind(name);
  /*
   * 탈것 안(어린이집 버스 안·아빠 차)은 '건물 안' 줄 대신 탈것 줄을 준다 — 쪽 그림 라우트와 같은 판단.
   * '실내'로 두면 "INSIDE a building … shelves, furniture"가 붙어 어린이집 버스가 교실로 그려질 수 있다.
   * 지붕 없는 2층 버스 위층(openDeck)은 바깥이라 뺀다.
   * 어린이 통학 버스 안이면 좌석에 작은 아이용 벨트를 그린다 — 쪽 그림의 벨트 맨 아이와 맞게(세림이법).
   * 단 **이름만으로** 통학 버스일 때만(어린이집 버스·통학버스·학원 차) — 열쇠(locationKeyOf)도 이름만 보고 통학 버스를
   * 따로 묶는다. '버스 안'·'노란 버스 안'은 설명·본문으로 통학 버스가 돼도 시내버스와 같은 열쇠라 이 시트를 나눠 쓰므로,
   * 벨트 좌석을 그리면 벨트 금지인 시내버스 쪽의 기준이 된다(2026-09-29 검토). 그때는 이름의 탈것 그대로 보통 실내로 둔다.
   */
  const vehiclePlace = vehicle ? pageVehicle({ locationName: name, locationDescription: description }) : null;
  const shuttleSheet = schoolShuttleName(name) === "shuttle";
  const vehicleRoom = vehiclePlace?.vehicle && !vehiclePlace.openDeck ? (shuttleSheet ? "transit" : vehicle) : null;
  const indoor = vehicleRoom ? null : isIndoorPlace(name, description);
  // 부모가 고른 그림체 견본(여우 그림)을 참조로 — 문구만으로는 그림체가 매번 조금씩 다르다.
  const styleSample = style.image
    ? await loadReferenceImage(new URL(style.image, request.url).toString()).catch(() => null)
    : null;
  /*
   * 배경 창고(src/data/backgrounds.json, 269곳) — 이름이 맞으면 그 그림을 참조로 붙인다(2026-10-02 사장님
   * "저장한 배경이 장소 만들 때 반영되는지 더블 체크" — 전엔 사진관만 쓰고 여긴 글만 보고 상상했다).
   * 그래서 '거실'이 아파트 복도로 그려졌고(나트랑 책 1쪽), 이 시트는 검수가 없어 그 장소의 모든 쪽이 복도를 따랐다.
   * 짝이 없거나 그림을 못 받으면 예전처럼 없이 그린다(lib/location-bg — 보수적 짝짓기).
   */
  const bgMatch = findLocationBackground(name, backgrounds as LocationBg[]);
  const placeRef = bgMatch ? await loadReferenceImage(bgMatch.url).catch(() => null) : null;
  console.log("[location-sheet]", JSON.stringify(name), "배경:", bgMatch ? (placeRef ? bgMatch.slug : bgMatch.slug + "(못 받음)") : "없음");
  const refs = [...(styleSample ? [styleSample] : []), ...(placeRef ? [placeRef] : [])];
  const styleNth = styleSample && placeRef ? "FIRST " : styleSample ? "" : "";
  const placeNth = placeRef ? (styleSample ? "SECOND" : "FIRST") : "";
  // '방 안'인데 복도·현관으로 그리는 버릇 막이 — 장소 자체가 복도·현관이면 걸지 않는다.
  const corridorish = /복도|현관|로비|계단|골목|통로/.test(name);

  const prompt = [
    `Children's picture book BACKGROUND illustration (an establishing shot of a place), ${style.prompt}.`,
    styleSample
      ? [
          `The ${styleNth}attached image is the STYLE SAMPLE for this whole book. Copy its rendering exactly: medium, brush or line quality, edge softness, colour palette and saturation, shading method, paper/texture and finish.`,
          "It is a style reference ONLY — do NOT draw the fox or any animal, do NOT copy its subject or composition. Draw the place described below in that painting style.",
        ].join("\n")
      : "",
    "ABSOLUTE RULE — THIS IS A WORDLESS PICTURE. Draw ZERO writing of any kind: no captions, no letters, no numbers, no signs, no labels, no logos, no watermarks, in any script.",
    `STYLE LOCK — render the entire page ONLY as: ${style.prompt}. This image will be the reference for every page set in this place, so the medium, line quality, texture, saturation and finish must be the book's style exactly.`,
    `THIS IS A LOCATION REFERENCE SHEET for the place called "${name}".`,
    /*
     * 우리 배경 그림을 이 장소의 기준으로 — 무엇이 있는 곳인지(거실=소파·창·마루)를 그림이 정해 줘서
     * '여행 가방 → 현관 복도' 같은 글 연상으로 장소가 바뀌지 않는다. 그림체는 견본이 정한다(배경 그림체는 섞임).
     */
    placeRef && bgMatch
      ? [
          `TOP PRIORITY — the ${placeNth} attached image is OUR OWN SAVED PICTURE of this very place ("${bgMatch.ko}"), provided by the author. It DECIDES what this place is. Nothing may override it: not the place name's other possible meanings, not any prop or story association (a suitcase does NOT turn a living room into a hallway), not your own idea of such a place.`,
          "Rebuild the SAME place from it: the same kind of room or ground, the same furniture or landmark in the same arrangement, the same colours and overall mood. Repaint it in this book's painting style (the STYLE SAMPLE decides the rendering, never this picture's own finish), and you may adjust the camera a little for a clean establishing shot.",
          "It contains no people — likewise draw none. Never swap it for a different kind of room, a hallway or a corridor. If anything written below seems to disagree with this picture about what the place IS, follow this picture and use the words only for small details.",
        ].join("\n")
      : "",
    description
      ? `Fixed features that MUST be clearly visible: ${description}.`
      : "",
    detail
      ? [
          `PLACE DETAIL (highest priority, written by the child's parent, Korean): ${detail}`,
          "Build the place from this description — the same ground, the same big landmark, the same colours. These are things to draw, never words to write.",
        ].join("\n")
      : "",
    /*
     * 한 장에 한 곳만.
     *
     * 실제로 장소 칸에 버스 설명과 궁궐 설명이 함께 들어가, 경복궁 문과 2층 버스 노란 좌석이
     * 한 장에 섞인 시트가 나왔다(my-mu0issap). 이 시트는 검수를 안 받는데, 쪽 검수는 이 시트를
     * 반드시 따를 정답으로 쓴다 — 섞인 시트 한 장이 그 장소의 모든 쪽을 틀리게 만든다.
     */
    vehicle
      ? `ONE PLACE ONLY — draw only this vehicle, "${name}": its seats and its deck or cabin. Do not put another page's destination (a palace, a gate, a park, a building entrance) on or in front of it; any scenery outside is plain and generic.`
      : `ONE PLACE ONLY — draw only "${name}". Do not mix in any other place, and draw NO vehicle of any kind here: no bus, no car, no train, no vehicle seats.`,
    [
      "Show the WHOLE place in one wide, eye-level view: the ground it stands on, its one big landmark, and its main colours, arranged so that another artist could redraw the same place from a different camera angle.",
      "Draw it as an EMPTY STAGE: NO people, NO children, NO adults, NO faces, NO animals, NO characters of any kind. The characters will be placed into this scene on later pages.",
      "Keep it specific and simple — a few clear, memorable features rather than clutter. Everything shown here must be easy to repeat.",
    ].join("\n"),
    // 실내면 안쪽만 — 바깥 목록(아파트·보도)을 주면 마트 안을 마트 앞 길거리로 그린다.
    vehicleRoom
      ? vehicleInteriorLines(vehicleRoom, name, shuttleSheet).join("\n")
      : indoor === true
      ? [
          `INDOOR PLACE — "${name}" is INSIDE a building. Draw only the interior: floor, walls, ceiling or ceiling lights, shelves, furniture and fixtures, from inside the room.`,
          "No street, no sidewalk, no shop front, no building exterior, no sky and no outdoor ground — except, at most, a small view through a window. Never combine the inside and the outside of a building.",
          // '거실'을 아파트 복도로 그린 사고(2026-10-02 나트랑 책) — 방 자체가 화면을 채우게 못박는다.
          ...(corridorish
            ? []
            : [
                "Draw the ROOM ITSELF filling the picture — never a hallway, corridor, staircase, lobby or entrance standing in for it.",
              ]),
          "PRESENT-DAY KOREA — the interior is modern: bright floors, plain walls, glass doors, modern fixtures.",
        ].join("\n")
      : "PRESENT-DAY KOREA — this book is set in Korea today. Backgrounds are modern: apartment blocks, concrete and paved walkways, metal or wooden fences, glass windows, ordinary city trees and lawns.",
    "Do NOT add traditional Korean architecture that the place description did not ask for — no tiled-roof pavilion, no hanok, no thatched roof, no wooden gate, no paper-screen door, no stone jar terrace.",
    "The artwork must fill the entire canvas edge to edge: no white margins, no borders, no frames, no letterboxing.",
    "Keep the bottom quarter simple but FULLY PAINTED with scene colour (ground, floor, water or sky).",
    "Wholesome, child-friendly.",
    phone
      ? "Tall 3:4 portrait composition, framed for a phone screen held upright."
      : "Wide 4:3 landscape composition.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const image = await generateImage({
      prompt,
      references: refs.length ? refs : undefined,
      aspectRatio: phone ? "3:4" : "4:3",
    });
    // 쪽마다 참조로 다시 올라가는 그림이라 작게 줄여 보낸다(요청 4.5MB 한도).
    return NextResponse.json({ image: toDataUrl(await shrinkForReference(image)) });
  } catch (e) {
    if (e instanceof GeminiError) {
      console.error("[location-sheet] Gemini", e.status, e.message);
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[location-sheet]", e);
    return NextResponse.json({ error: "장소 그림을 그리지 못했습니다." }, { status: 500 });
  }
}
