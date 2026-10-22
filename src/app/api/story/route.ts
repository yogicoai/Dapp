import { after, NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { canCreate, createLockedResponse } from "@/lib/create-access-server";
import { canReopenForRewrite, insertJob, isJobId, readJobResult, storyManuscript, updateJob } from "@/lib/book-jobs";
import { generateStory } from "@/lib/anthropic";
import { redoPlotProblem, storyChargeKey } from "@/lib/story-charge";
import { StoryParseError, type ParsedOutline } from "@/lib/story-format";
import { StoryQualityError } from "@/lib/story-quality";
import { parseChild, parseMaterial, parseMood, parseOccasion, parseOutlineInput } from "../_input";
import type { NarrationStyle } from "@/lib/types";

/**
 * 같은 줄거리로 공짜로 다시 쓸 수 있는 횟수 — 옛 SQL 과 맞추려고 보내는 값이다.
 * 지금 SQL(charge_story)은 이 값을 쓰지 않고 가격표(app_pricing.max_free_rewrites)를 읽는다.
 * 앱도 같은 가격표 값으로 남은 횟수를 보여 준다(create/page.tsx · lib/create-flow redoLeft).
 */
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
/*
 * 줄거리 지문(값을 셀 열쇠)은 lib/story-charge 에 있다 — 시험하려고 뺐다(라우트 파일은 함수를 내보낼 수 없다).
 */

/** 대본 값을 받은 결과. 서버 DB 에 함수가 없으면(SQL 미적용) charged 가 null 이다. */
type StoryCharge = {
  charged: number;
  entry: string | null;
  rewrites: number;
  tokens: number;
  /** 동화 크레딧을 썼나 · 남은 권수 · 넣어 준 쿠키(supabase-book-credits.sql — 옛 함수면 없다) */
  credit_used?: boolean;
  credit_left?: number;
  topup?: number;
} | null;

export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  // 결제 전에는 관리자(yogico·fe)와 결제 요금제 회원만 만든다(lib/create-access — 사장님 2026-10-19)
  if (!(await canCreate(caller, "story"))) return createLockedResponse();
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
    jobId?: unknown;
    /**
     * 이번 만들기에서 대본 값을 낸 줄거리 — 다시 만들 때만 온다(같은 줄거리로 다시 쓰기·다른 이야기로 새로 짓기).
     * 이 줄거리의 지문으로 값을 센다(lib/story-charge storyChargeKey). 없으면 outline 으로 센다(예전과 같다).
     */
    paidOutline?: unknown;
    /** 동화 크레딧을 쓸까(화면이 크레딧이 있을 때 true) — 새 줄거리에만 쓰인다(DB 가 다시 본다) */
    useBookCredit?: unknown;
  };

  let child, outline, material, occasion, mood;
  let paidOutline: ParsedOutline | null = null;
  try {
    child = parseChild(input.child);
    outline = parseOutlineInput(input.outline);
    // 모양이 틀리면 만들지 않는다 — 몰래 새 값으로 셌다가 받아 버리는 일이 없게(값 낸 줄거리는 이미 한 번 통과한 모양이다).
    if (input.paidOutline !== undefined && input.paidOutline !== null) {
      paidOutline = parseOutlineInput(input.paidOutline);
    }
    material = parseMaterial(input.material);
    occasion = parseOccasion(input.occasion);
    mood = parseMood(input.mood);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  // 값 낸 줄거리보다 장면이 많은 다시 만들기는 받지 않는다 — 적은 값으로 긴 대본을 공짜로 받는 길(lib/story-charge).
  const scenesProblem = paidOutline ? redoPlotProblem(outline.scenes.length, paidOutline.scenes.length) : null;
  if (scenesProblem) {
    return NextResponse.json({ error: scenesProblem }, { status: 400 });
  }
  const longer = input.longer === true;
  const narrationStyle: NarrationStyle =
    input.narrationStyle === "cozy" || input.narrationStyle === "lively"
      ? input.narrationStyle
      : "natural";

  /*
   * 값을 **만들기 전에** 받는다. 잔액이 없는데 Anthropic 을 먼저 부르면 그 돈은 그냥 나간다.
   * 같은 줄거리로 다시 쓰기는 정해진 횟수까지 공짜다 — 그 셈을 DB 가 한다.
   * 다른 이야기로 새로 짓기(paidOutline 이 옴)도 값을 낸 줄거리의 지문으로 세어 같은 무료 횟수를 쓴다.
   * supabase-setup.sql 을 아직 안 돌린 DB 면 함수가 없다. 그때는 charged 를 null 로
   * 돌려주고 브라우저가 예전처럼 깎는다(배포가 SQL 보다 먼저 나가도 안 멈추게).
   */
  const outlineKey = storyChargeKey(outline, paidOutline);
  /*
   * '토큰 없이 다시 만들기'라고 온 요청은 **값을 받지 않는다**. 값 낸 줄(story_charges)이 없으면
   * charge_story 는 새 대본으로 보고 값을 받는데, 부모 화면의 단추는 '토큰 없이'라고 말하고 있다.
   * 그래서 먼저 제 줄이 있는지 본다(본인 줄은 읽을 수 있다 — RLS '본인 열람'). 없으면 받지 않고 멈춘다.
   * 표가 없는 옛 DB 등으로 읽기가 실패하면 예전처럼 간다(그때는 charge_story 도 없어 서버가 값을 받지 않는다).
   * 관리자는 값도 횟수도 없어 줄이 없다 — 보지 않는다.
   */
  if (paidOutline && !caller.isMaster) {
    const { data: paidRow, error: paidErr } = await caller.db
      .from("story_charges")
      .select("outline_key")
      .eq("owner", caller.uid)
      .eq("outline_key", outlineKey)
      .maybeSingle();
    if (!paidErr && !paidRow) {
      return NextResponse.json(
        { error: "처음 낸 대본 값 기록을 찾지 못해 다시 만들 수 없어요. 문장을 눌러 직접 고쳐 주세요." },
        { status: 409 },
      );
    }
  }
  let charge: StoryCharge = null;
  {
    const args = {
      p_outline_key: outlineKey,
      p_pages: outline.scenes.length,
      p_max_free_rewrites: MAX_FREE_REWRITES,
    };
    // 동화 크레딧(관리실이 더해 준 무료 권수) — 화면이 쓰겠다고 할 때만 싣는다. 다시 쓰기(paidOutline)에는 쓰지 않는다.
    const useCredit = input.useBookCredit === true && !paidOutline && !caller.isMaster;
    let { data, error } = await caller.db.rpc("charge_story", useCredit ? { ...args, p_use_credit: true } : args);
    // 크레딧 SQL(11번) 전의 DB 는 4인자 판이 없다 — 크레딧 없이 다시 부른다('함수 없음'으로 보고 브라우저가 깎게 두면 안 된다).
    if (error && useCredit && (error.code === "PGRST202" || error.code === "42883")) {
      ({ data, error } = await caller.db.rpc("charge_story", args));
    }
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

  /*
   * 만들기 기록(book_jobs) — 값을 받은 직후, 대본을 쓰기 전에 적는다.
   *
   * 대본 쓰기는 1분 넘게 걸리고 도중에 실패할 수 있다. 먼저 적어 두어야 "값은 냈는데 대본이
   * 안 나왔다"는 컴플레인에 대본 값 장부 id 와 줄거리가 남는다.
   * 같은 줄거리로 다시 쓰기면(브라우저가 jobId 를 보냄) 새 줄 없이 그 줄을 고친다.
   * 대본 값 장부 id 는 그 줄에 이미 붙어 있으니 건드리지 않는다(지킴이가 바꾸기를 막는다).
   * 단, 그림 값·책 id 가 붙은 줄(값 내고 저장 못 한 책)은 되열지 않는다 — 먼저 읽어 보고
   * canReopenForRewrite 가 아니면 새 줄을 만든다. 되열면 되살릴 원고(올린 그림 주소)가 새 대본으로
   * 덮이고, 그 줄의 '그림 값 냈음'이 새 대본에 옮겨 붙어 새 그림을 값 없이 저장하게 됐다(2026-09-14 고침).
   * 새 줄에는 옛 줄의 대본 값 장부 id 를 옮긴다 — 다시 쓰기는 값을 안 받아 새 장부 id 가 없다.
   * 기록 쓰기가 실패해도(표 없음·상한·네트워크) 대본 만들기는 그대로 간다 — 함수들이 던지지 않는다.
   * jobId 가 남의 것이면 RLS 에 막혀 0줄이 되고, 그러면 새 줄을 만든다.
   */
  const pageCount = outline.scenes.length;
  let jobId: string | null = null;
  let carriedStoryEntry: string | null = null;
  if (isJobId(input.jobId)) {
    const read = await readJobResult(caller.db, input.jobId);
    if (read.ok && canReopenForRewrite(read.job)) {
      const reused = await updateJob(caller.db, input.jobId, {
        status: "writing",
        page_count: pageCount,
        error: null,
        // 지난 그리기의 장수·실패 이유도 비운다 — 안 비우면 새 대본 줄이 사고 목록에서
        // '대본 단계인데 3장 그림·실패 이유 있음'으로 잘못 보인다.
        drawn: 0,
        draw_failed: 0,
        upload_failed: 0,
        failures: [],
      });
      if (reused) jobId = input.jobId;
    } else if (read.ok && read.job) {
      carriedStoryEntry = read.job.story_entry;
    }
    // 못 읽었으면(read.ok=false) 되열지 않는다 — 값 낸 줄인지 모르니 새 줄이 안전하다.
  }
  if (!jobId) {
    const row = {
      owner: caller.uid,
      status: "writing",
      page_count: pageCount,
      manuscript: { outline, narrationStyle },
    };
    const entry = charge?.entry ?? carriedStoryEntry;
    jobId = await insertJob(caller.db, { ...row, story_entry: entry ?? null });
    // 옮긴 장부 id 가 대조에 걸리면(환불로 지워짐 등) 장부 id 없이라도 줄은 남긴다.
    if (!jobId && entry && !charge?.entry) jobId = await insertJob(caller.db, row);
  }

  try {
    const story = await generateStory({ child, material, outline, occasion, mood, longer, narrationStyle });
    // 대본이 나왔다 — 원고(그림 없는 Book 모양)를 적는다. 이게 있어야 마스터가 되살릴 재료가 된다.
    // 응답을 먼저 보내고 적는다(after). 대본 쓰기가 함수 제한 시간 가까이 걸린 때 기록 쓰기까지
    // 기다리면, 응답 전에 함수가 끊겨 대본 값만 나가고 대본은 못 받는다(환불도 안 돈다).
    // 아직 'writing' 일 때만 적는다 — 이 쓰기가 늦게 도착하는 사이 부모가 곧바로 '그림 그리기'를 누르면
    // 브라우저가 적은 'drawing'과 부모가 고친 원고(그림체 포함)를 대본 단계로 되돌렸다. 지킴이는 상태 순서를 안 본다.
    const scriptJob = jobId;
    after(() => updateJob(caller.db, scriptJob, {
      status: "script",
      page_count: story.pages.length,
      manuscript: storyManuscript(story),
    }, ["writing"]));
    return NextResponse.json({ story, charge, jobId });
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
    // 기록: 대본 쓰기 실패. 이유를 한 줄 남긴다(값은 위에서 되돌렸다).
    const reason =
      e instanceof StoryQualityError
        ? `품질 검사 불통과: ${e.issues.join(" / ")}`
        : `${(e as Error)?.name ?? "Error"}: ${(e as Error)?.message ?? String(e)}`;
    const failedJob = jobId;
    after(() => updateJob(caller.db, failedJob, { status: "failed", error: `대본 실패 — ${reason}`.slice(0, 1000) }));
    if (e instanceof StoryParseError) {
      return NextResponse.json(
        { error: "본문 형식이 어긋났습니다. 다시 시도해주세요.", detail: e.message, jobId },
        { status: 502 },
      );
    }
    if (e instanceof StoryQualityError) {
      return NextResponse.json(
        { error: "동화 품질 검사를 통과하지 못했어요. 다시 만들면 새로운 구성으로 시도합니다.", detail: e.issues, jobId },
        { status: 502 },
      );
    }
    console.error("[story]", e);
    return NextResponse.json({ error: "본문을 만들지 못했습니다.", jobId }, { status: 500 });
  }
}
