import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { createHash } from "node:crypto";
import { generateStory } from "@/lib/anthropic";
import { StoryParseError } from "@/lib/story-format";
import { StoryQualityError } from "@/lib/story-quality";
import { parseChild, parseMaterial, parseMood, parseOccasion, parseOutlineInput } from "../_input";
import type { NarrationStyle } from "@/lib/types";

/** 같은 줄거리로 공짜로 다시 쓸 수 있는 횟수. 앱의 MAX_STORY_REWRITES 와 같아야 한다. */
const MAX_FREE_REWRITES = 2;

/**
 * 2단계 — 확정된 장면별 줄거리를 본문으로. 장면 하나가 한 쪽이 된다(1:1).
 * 이야기를 새로 짓지 않고 각 장면에 살만 붙인다. 쪽수는 줄거리 장면 수를 따른다.
 *
 * 뼈대가 이미 정해져 있어서 이야기 구조가 덜 흔들리고, 실패해도 줄거리는 남아
 * 이 단계만 다시 하면 된다.
 */
/*
 * 회원만 부를 수 있다.
 *
 * 예전엔 인증이 한 줄도 없어서, 주소만 알면 로그인 없이 Anthropic(본문) 크레딧을
 * 태울 수 있었다. 토큰 차감마저 브라우저가 해서, 경로를 직접 부르면 토큰도 안 깎였다.
 * 막고 있던 것은 화면뿐이었다.
 *
 * 비회원은 깨지지 않는다 — 만들기 화면 자체가 로그인 없으면 되돌려 보내고,
 * 첫 화면의 만들기 단추도 비회원이면 /login 으로 간다.
 * 굽기 스크립트도 이 경로를 부르지 않는다(/api/tts 만 쓴다).
 */
/**
 * 줄거리 지문 — '같은 줄거리인가'를 서버가 가리는 열쇠.
 *
 * parseOutlineInput 이 이미 다듬어(장면 번호를 1,2,3… 으로 다시 매기고 공백을 턴다)
 * 정규화된 모양을 주므로, 그대로 해시하면 같은 줄거리는 늘 같은 지문이 나온다.
 * 줄거리를 새로 지으면 지문이 달라져 값을 다시 받는다 — 앱이 하던 것과 같은 규칙이다.
 */
function outlineKeyOf(outline: unknown): string {
  return createHash("sha256").update(JSON.stringify(outline)).digest("hex").slice(0, 40);
}

/** 대본 값을 받은 결과. 서버 DB 에 함수가 없으면(SQL 미적용) charged 가 null 이다. */
type StoryCharge = { charged: number; entry: string | null; rewrites: number; tokens: number } | null;

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
    child?: unknown;
    outline?: unknown;
    material?: unknown;
    occasion?: unknown;
    mood?: unknown;
    longer?: unknown;
    narrationStyle?: unknown;
  };

  let child, outline, material, occasion, mood;
  try {
    child = parseChild(input.child);
    outline = parseOutlineInput(input.outline);
    material = parseMaterial(input.material);
    occasion = parseOccasion(input.occasion);
    mood = parseMood(input.mood);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const longer = input.longer === true;
  const narrationStyle: NarrationStyle =
    input.narrationStyle === "cozy" || input.narrationStyle === "lively"
      ? input.narrationStyle
      : "natural";

  /*
   * 값을 **만들기 전에** 받는다. 잔액이 없는데 Anthropic 을 먼저 부르면 그 돈은 그냥 나간다.
   * 같은 줄거리로 다시 쓰기는 정해진 횟수까지 공짜다 — 그 셈을 DB 가 한다.
   * supabase-tokens.sql 을 아직 안 돌린 DB 면 함수가 없다. 그때는 charged 를 null 로
   * 돌려주고 브라우저가 예전처럼 깎는다(배포가 SQL 보다 먼저 나가도 안 멈추게).
   */
  const outlineKey = outlineKeyOf(outline);
  let charge: StoryCharge = null;
  {
    const { data, error } = await caller.db.rpc("charge_story", {
      p_outline_key: outlineKey,
      p_pages: outline.scenes.length,
      p_max_free_rewrites: MAX_FREE_REWRITES,
    });
    if (error) {
      const missing =
        error.code === "42883" ||
        /could not find the function|does not exist/i.test(error.message ?? "");
      if (!missing) {
        // 잔액 부족·다시 쓰기 소진 등 진짜 거절 — 만들지 않고 그대로 알린다.
        return NextResponse.json({ error: error.message }, { status: 402 });
      }
    } else {
      charge = data as StoryCharge;
    }
  }

  try {
    const story = await generateStory({ child, material, outline, occasion, mood, longer, narrationStyle });
    return NextResponse.json({ story, charge });
  } catch (e) {
    // 만들다 실패했으면 낸 값을 되돌린다. '값 냈다'는 기록도 함께 지워야
    // 다음 시도가 '다시 쓰기'로 세어져 공짜 횟수를 헛되이 깎지 않는다.
    if (charge?.entry) {
      try {
        await caller.db.rpc("refund_story", { p_entry: charge.entry, p_outline_key: outlineKey });
      } catch {
        /* 되돌리기 실패는 본래 오류를 덮지 않는다 — 장부에 기록이 남아 손으로 볼 수 있다 */
      }
    }
    if (e instanceof StoryParseError) {
      return NextResponse.json(
        { error: "본문 형식이 어긋났습니다. 다시 시도해주세요.", detail: e.message },
        { status: 502 },
      );
    }
    if (e instanceof StoryQualityError) {
      return NextResponse.json(
        { error: "동화 품질 검사를 통과하지 못했어요. 다시 만들면 새로운 구성으로 시도합니다.", detail: e.issues },
        { status: 502 },
      );
    }
    console.error("[story]", e);
    return NextResponse.json({ error: "본문을 만들지 못했습니다." }, { status: 500 });
  }
}
