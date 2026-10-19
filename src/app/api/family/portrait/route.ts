import { after, NextResponse } from "next/server";
import sharp from "sharp";
import { bindAiUsageSink, settleAiUsage, withAiUsage } from "@/lib/ai-usage";
import { dbUsageSink } from "@/lib/ai-usage-db";
import { callerOf, type Caller } from "@/lib/api-auth";
import { canCreate } from "@/lib/create-access-server";
import { CREATE_LOCKED_CODE, CREATE_LOCKED_MESSAGE } from "@/lib/create-access";
import { isDevUser } from "@/lib/dev-mode";
import { ART_STYLES } from "@/lib/art-styles";
import { ftpErrorCode, uploadHitDeadline, uploadManyToCafe24 } from "@/lib/cafe24";
import { removeWhiteBackground } from "@/lib/cutout";
import { PORTRAIT_LOOKS_MAX, ROLE_LABEL, freeRedrawsLeft, type FamilyRole } from "@/lib/family";
import {
  CARD_TIMEOUT_MS,
  CARD_WAIT_MS,
  CLOSEUP_TIMEOUT_MS,
  DRAW_DEADLINE_MS,
  DRAW_MIN_MS,
  FALLBACK_DEADLINE_MS,
  HEAD_CHECK_DEADLINE_MS,
  HEAD_REDRAW_DEADLINE_MS,
  REF_TIMEOUT_MS,
  STRETCH_DEADLINE_MS,
  UPLOAD_DEADLINE_MS,
  UPLOAD_MIN_MS,
  UPLOAD_RESERVE_MS,
  UPLOAD_SAFETY_MS,
  optionalAllowed,
  stageClock,
  uploadLeft,
} from "@/lib/family-portrait-budget";
import {
  PHOTO_REFUSED_MESSAGE,
  PHOTO_TOO_BIG_MESSAGE,
  PORTRAIT_BODY_MAX_BYTES,
  readPortraitPhoto,
  type PhotoFallback,
  type PortraitPhoto,
} from "@/lib/family-photo";
import { describePhoto } from "@/lib/family-photo-card";
import { faceCloseUp } from "@/lib/family-closeup";
import { guideImage } from "@/lib/family-guide";
import { cleanBodyStretch, cleanHeadRatio, headChartRatio, type Box } from "@/lib/family-head";
import { evenOutHead, measureHeadRatio, type HeadPassLog } from "@/lib/family-head-check";
import { ratioAfterStretch, stretchFigure } from "@/lib/family-stretch";
import {
  PENLINE_SAMPLE,
  PHOTO_FALLBACK_MIN_MS,
  buildPrompt,
  cardFor,
  drawThenRelease,
  headRedrawRecipe,
  photoFallbackPlan,
  photoRefused,
  portraitReferences,
  redrawLikeness,
  type PortraitInput,
} from "@/lib/family-portrait-prompt";
import { GeminiError, generateImage, loadReferenceImage, type GeneratedImage } from "@/lib/gemini";

/*
 * 그리는 데 20~30초, 올리기에 몇 초가 걸린다. 이 값을 안 적으면 배포 환경의 짧은 기본값에
 * 걸려 도중에 잘리고, 쿠키만 나간 채 되돌리기도 못 돈다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 우리 가족 캐릭터 — 가족 한 사람을 수채화 전신 한 장으로 그린다.
 *
 * 값(쿠키 = 토큰)은 **서버가 먼저 받는다**. 한 사람 처음 2쿠키(다시 그리기 1번 포함), 그 뒤 1쿠키.
 * 셈은 DB(family_portraits, supabase/family-portraits.sql)가 하고, 브라우저는 차감하지 않는다.
 * 관리실이 더해 준 '캐릭터 무료 생성'(2026-10-19, supabase-family-draw-credits.sql)은 화면이 무료로 보여 준 그리기
 * (expectedCost 0)에 DB 가 쿠키 대신 쓴다 — 응답의 freeUsed · freeLeft 로 화면이 안내 숫자를 맞춘다.
 * 펜선 또렷한 수채화(2026-10-19 — lib/family-portrait-prompt PENLINE): fe 시험 뒤 사장님 "전체에 반영"으로 **모든 회원의 기본**이다.
 *   그림체 글·얼굴 펜선 줄이 바뀌고, 그림체 견본은 빨간 모자 1쪽(PENLINE_SAMPLE), 같은 가족 그림(옛 수채화)은 붙이지 않는다.
 *   penline:false(예전 수채화)는 fe(isDevUser)만 받는다 — 비교용. 다른 회원이 보내도 펜선으로 그린다.
 * 함수가 없는 DB 면 브라우저 차감으로 물러서지 않고 503 으로 멈춘다 — 물러서면 경로를 직접 불러
 * 공짜로 그릴 수 있다.
 *
 * POST 순서: 로그인 → 입력 검사 → 값 받기(열쇠 lease 를 받는다) → 그리기(45초 제한) → 머리 재기·몸 늘이기(아래) → 흰 바탕 지우기
 *       → cafe24 두 장(투명 PNG = 화면용, 흰 바탕 JPEG = 다음 그림의 참고용, 55초까지) → '받았음' 적기
 *       (열쇠 + 그림 주소를 DB 에 남긴다).
 * 그리기·지우기·올리기 어디서든 실패하면 받은 값을 바로 되돌린다(refund_family_portrait, 열쇠가 있어야).
 * 열쇠는 서버만 안다 — 회원이 콘솔에서 그리는 도중에 값을 되돌려 공짜로 그리게 하는 길을 막는다.
 * '받았음'을 적은 그림은 되돌릴 수 없다 — 그림을 받고 콘솔에서 값만 돌려받는 길을 막는다.
 *
 * GET ?memberId= : 응답을 잃은 화면(앱 전환·망 끊김·함수 잘림)이 묻는다 — 마지막으로 건넨 그림,
 *       아직 그리는 중인지, 90초가 넘도록 안 건넨 그리기를 되돌렸는지(family_portrait_status).
 *
 * 마스터는 값 없이 그린다(횟수도 안 센다).
 *
 * 머리 비율(사장님 2026-09-29 "아빠만 머리가 너무 크게 나와", lib/family-head):
 *   ① 비율 견본 — 표 비율로 선 회색 마네킹(lib/family-guide, 서버가 만든다·값 없음)을 마지막 참고 그림으로 붙인다(칩·사진·대신 그리기 모두).
 *   ② 머리 재기 — 그린 그림을 값싼 글 모델로 한 번 재서(lib/family-head-check, 보통 약 2~4원·많아야 약 9원) 머리가 표보다
 *      20% 넘게 크거나 작으면(lib/family-head HEAD_TOO_BIG·HEAD_TOO_SMALL), 시간이 넉넉할 때만(HEAD_REDRAW 아래 — 처음 그리기가
 *      빨리 끝났을 때뿐) 같은 쿠키로 한 번 더 그려(약 95원) 표에 더 가까운 쪽을 건넨다. 재기가 실패하거나 늦으면 오늘처럼 건넨다.
 *      다시 그리기는 **처음 그림에서**(사장님 승인 2026-09-29 오후 "엄마 비율이 이상해졌어"): 참고 그림은 처음 그림(첫째) +
 *      비율 견본(둘째)뿐, '같은 캐릭터 그대로 비율만 고쳐'(lib/family-portrait-prompt headRedrawRecipe). 사진·클로즈업은
 *      다시 보내지 않는다 — 얼굴이 꽉 찬 사진이 머리를 크게 당기는 버릇을 같은 사진으로 되풀이했다(엄마 표 7 → 처음
 *      4.15 · 다시 4.41). 칩·대신 그리기도 같다. 로그에는 숫자(비율·시간)와 갈래만.
 *      특징 카드는 글로 다시 적는다(2026-09-30 사장님 "100% 비슷하단 느낌이 덜한데" — 처음 그림만 보고 다시 그리면 처음 그림이
 *      어긋난 얼굴을 베끼고 한 번 더 그림책 얼굴 쪽으로 어긋났다): 사진(또는 사진에서 읽은 카드)으로 그렸으면 카드의 얼굴·머리
 *      칸만 걸러 둔 닮음 줄(likeness — lib/family-portrait-prompt redrawLikeness)을 다시 그리기 프롬프트에 붙인다. 칩으로 그렸으면 없다.
 *   ③ 잰 비율(headRatio, 0.01 단위)을 그림과 함께 건네고 DB(last_pic)에도 적는다 — 단체 사진이 얼굴 크기를 고르는 데 쓴다.
 *   ④ 몸 늘이기(사장님 승인 2026-09-29 밤 "그래도 아빠 비율이랑 비교해봐 엄마가 아직도 얼굴이 너무 크게 나왔어" — 셀카로 그린
 *      엄마가 처음 3.94 → 다시 그림 4.56, 아빠 약 5.6): 남긴 그림을 쟀고 그래도 머리가 크면(표 × 0.8 보다 5% 넘게 작으면)
 *      머리·목 윗부분은 그대로 두고 목 ~ 발목 띠만 세로로 늘인다(lib/family-stretch, 값 없음·보통 수십 ms, 띠 배율 1.35 까지).
 *      얼굴을 건드리지 않아 닮음이 그대로다. 칩·사진·대신 그리기·모든 역할 같다. 못 쟀으면 늘이지 않는다.
 *      ③의 headRatio 는 늘인 뒤 비율로 적고, 늘인 배율(bodyStretch, 0.01 단위)도 그림과 함께 건네고 DB(last_pic)에 적는다 —
 *      단체 사진이 몸을 또 늘일 때 둘을 곱해 1.45 를 넘지 않게 본다(lib/family-head FACE_FIT.totalMax).
 *      로그에는 숫자(늘이기 전·후 비율, 배율, 걸린 시간)만.
 *      ②에서 두 장을 견줄 때도 늘인 뒤 비율로 견주고, 다시 그린 그림을 못 쟀으면(상자가 없어 못 늘인다) 늘여서 나아지는 처음
 *      그림을 남긴다(lib/family-head-check evenOutHead effective).
 *
 * 사진(선택, 사장님 2026-09-29 '사진으로 할게요'): photo 칸에 그 사람 사진(JPEG·PNG·WEBP, 풀어서 2.5MB 까지 —
 * lib/family-photo readPortraitPhoto)을 실어 보내면 사진을 보고 같은 수채화 캐릭터로 그린다. 값은 칩으로 그릴 때와 같다.
 * 사진이 이상하면 값을 받기 전에 400(photo). 값을 받은 뒤(공짜로 부르는 길을 막으려고 그 뒤에만):
 *   ① 특징 카드(lib/family-photo-card) — 값싼 글 모델에 사진을 보여 알아볼 생김새(두드러진 특징 3~5개 먼저)를 짧은 영어 줄로,
 *      같은 답에 얼굴 상자도 받는다. 참고 그림 받기와 나란히 돌고, 사진 그리기는 CARD_WAIT_MS 까지만 기다린다(늦거나 실패하면
 *      카드·클로즈업 없이).
 *   ①-2 얼굴 클로즈업(lib/family-closeup, 사장님 2026-09-29 "그림만 보고도 누구다") — 카드가 제때 왔고 얼굴 상자가 쓸 만하면
 *      사진에서 얼굴을 넉넉히 잘라 조금 키운 JPEG 를 만든다(sharp, 보통 수십 ms, CLOSEUP_TIMEOUT_MS 까지만). 값이 들지 않는다.
 *   ② 사진으로 그리기 — 참고 그림은 사진이 첫째, 얼굴 클로즈업이 둘째(있으면), 그다음 그림체 견본. 같은 가족 그림은 붙이지
 *      않는다. 카드는 '그대로 맞출 것', 프롬프트 둘째 줄이 LIKENESS FIRST.
 *      아이 쪽 말은 빼고 담담하게 적는다(lib/family-portrait-prompt 머리글 — 2026-09-29 아빠 사진 IMAGE_SAFETY 거절).
 *   ③ 대신 그리기 — 그림 모델이 사진을 거절하면(안전 검사·그림 없는 답·요청 차단·사진을 못 읽음) 같은 요청·같은 쿠키로
 *      사진 없이 특징 카드(+칩)로 한 번 더 그린다. 응답에 photoFallback('features'·'looks')을 실어 화면이 한 줄 알린다.
 *      카드도 칩도 없거나 시간이 모자라거나 대신 그리기도 실패하면 값을 되돌리고 422(photo)로 '다른 사진이나 특징으로'.
 *   skipPhotoDraw(선택): 이번 방문에 이 사진이 이미 거절돼 대신 그렸다(화면이 메모리에만 기억한다). 다시 그리기는 ②를
 *      건너뛰고 곧바로 ③ — 또 거절될 사진 그리기에 구글 값(약 95원)과 시간을 쓰지 않는다. 사진은 특징 카드에만 쓴다.
 * 시간: 모두 DRAW_DEADLINE_MS(대신 그리기만 FALLBACK_DEADLINE_MS) 안에서 — 함수 제한 60초(배포 Hobby)를 넘기지 않는다.
 *   시간표는 lib/family-portrait-budget 에 모았다(2026-09-30 배포에서 '그림을 올리지 못했어요' 뒤): 올리기 몫(8초)을 먼저 떼어
 *   두고 머리 재기·다시 그리기·몸 늘이기는 45초 전에만. 단계마다 걸린 ms 를 성공·실패 로그에 한 줄로 남긴다(단계 이름과 숫자만).
 *   cafe24 두 장은 한 FTP 세션으로 올리고(lib/cafe24 uploadManyToCafe24 — 잠깐 끊기면 못 올린 것만 한 번 더), 실패하면 짧은
 *   오류 코드(ftp-421·ECONNREFUSED·passive …, 주소·포트 없는 것)를 로그와 응답 detail 에 싣는다 — 배포 로그를 못 볼 때 화면의
 *   개발자 도구로 원인을 가린다. 올리기 마감에 걸려 끊긴 것(detail closed·deadline)은 시간이 모자란 것이라 502 '올리지
 *   못했어요'가 아니라 504 '너무 오래 걸려서'(code timeout)로 알린다.
 * **사진은 저장하지 않는다 — 화면 약속 "사진은 저장하지 않고, 그림을 그리는 데 한 번 쓰고 바로 지워요".**
 * 사진과 특징 카드·얼굴 상자·얼굴 클로즈업(사진에서 읽거나 잘라 낸 것이라 사진과 똑같이 다룬다)은 이 요청의 메모리에서
 * Gemini 로 넘기기만 한다: 결제 RPC(charge·finish·refund·status) 인자, cafe24(올리는 건 그린 그림뿐), Supabase, console 로그,
 * 오류·성공 응답 어디에도 사진·카드·상자·클로즈업·요청 본문을 넣지 않는다. 로그는 결과 갈래(있음·없음)와 걸린 시간만.
 * 사진·클로즈업은 **처음 그리기 한 번에만** 쓴다 — 한 참고 그림 배열에 들어 그 그리기가 끝나면(성공·실패 모두) 곧바로 비우고
 * (drawThenRelease), 사진 변수와 특징 카드 기다리기(CardJob)도 머리 재기 전에 놓는다. 머리 비율 다시 그리기는 처음 그림으로
 * 하므로 사진이 필요 없다. 카드에서 걸러 낸 얼굴·머리 줄(likeness, 머리글 '머리 비율' ②)만 머리 재기·다시 그리기가 끝날 때까지
 * 이 요청 메모리에 두고(다시 그리기 프롬프트로만 넘긴다), 끝나면(실패해도) 놓는다 — 카드와 똑같이 다룬다.
 * 이 파일에 로그를 더할 때도 input·body·photo·card·likeness·faceBox·closeUp·prompt·references 를 통째로 찍지 말 것.
 */

const MEMBER_ID = /^[a-z0-9-]{1,40}$/;
const ROLES = Object.keys(ROLE_LABEL) as FamilyRole[];

/*
 * 시간 값(DRAW_DEADLINE_MS·UPLOAD_DEADLINE_MS·HEAD_CHECK_DEADLINE_MS·STRETCH_DEADLINE_MS …)은 lib/family-portrait-budget 에 있다 —
 * 순수 셈이라 시험(family-portrait-budget.test.ts)이 '없어도 되는 단계가 올리기 몫을 먹지 않는다'를 본다. 여기 따로 적지 말 것.
 * 머리 다시 그리기가 늦거나 실패해도 처음 그림을 건네므로 504 는 나지 않는다. 끊긴 뒤에는 새 요청을 시작하지 않지만(drawWithin),
 * 이미 나간 요청의 구글 값(약 95원)은 나갈 수 있다.
 */

/** skipPhotoDraw — 이 사진은 이번 방문에 이미 거절됐다(머리글). 사진이 없으면 뜻이 없다. */
type Input = PortraitInput & { skipPhotoDraw?: boolean };

/** 사진이 거절됐고 대신 그리기도 못 했다 — 값을 되돌리고 '이 사진으로는 못 그렸어요'(422 photo). */
class PhotoRefused extends Error {
  constructor() {
    super("사진 거절");
    this.name = "PhotoRefused";
  }
}

/** charge_family_portrait 가 돌려준 값(status 'ok') */
type Charge = {
  charged: number;
  entry: string | null;
  draw: number;
  lease: string;
  tokens: number | null;
  /** 관리실이 더해 준 무료 생성을 이번에 썼나(supabase-family-draw-credits.sql) — 되돌리면 그 횟수도 돌아온다 */
  freeUsed: boolean;
  /** 남은 무료 생성 — 옛 함수(무료 횟수 전)는 null */
  freeLeft: number | null;
};

type DbError = { code?: string; message?: string } | null;

class DrawTimeout extends Error {
  constructor() {
    super("그리기 시간 초과");
    this.name = "DrawTimeout";
  }
}

function fail(status: number, error: string, code?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...(code ? { code } : {}), ...(extra ?? {}) }, { status });
}

/**
 * 가족 그림 폴더 — **회원 uid** 로 정한다. 아이디(username)는 한글이면 글자를 거르면 다 같은
 * 'member' 가 되고 'a.b'·'ab' 도 겹쳐서, 여러 가족의 그림이 한 폴더에 섞이고 '이 폴더면 이 회원 것'이라는
 * 참고 그림 검사(acceptStyleRef)가 깨진다. uid 는 바뀌지 않고 겹치지 않는다(uuid 글자만 남긴다).
 */
function folderOf(caller: Caller): string {
  return caller.uid.toLowerCase().replace(/[^a-f0-9-]/g, "").slice(0, 40) || "member";
}

/** 한 줄로 — 줄바꿈·제어 글자를 없애고 큰따옴표는 작은따옴표로(프롬프트 인용이 안 깨지게). */
function oneLine(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c < 32 || c === 127 ? " " : ch === '"' ? "'" : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

function parseInput(body: unknown): Input | string {
  if (!body || typeof body !== "object") return "요청 내용이 없어요.";
  const b = body as Record<string, unknown>;

  const memberId = typeof b.memberId === "string" ? b.memberId : "";
  if (!MEMBER_ID.test(memberId)) return "가족 id 가 올바르지 않아요.";

  const role = b.role as FamilyRole;
  if (typeof role !== "string" || !ROLES.includes(role)) return "역할이 올바르지 않아요.";

  const callName = typeof b.callName === "string" ? oneLine(b.callName) : "";
  if (!callName || callName.length > 12) return "호칭은 1~12자로 적어 주세요.";

  // 성별·나이는 선택이다. 모양이 다르면(unspecified·null 등) 없는 것으로 본다.
  const gender = b.gender === "girl" || b.gender === "boy" ? b.gender : undefined;
  const age =
    typeof b.age === "number" && Number.isFinite(b.age) && b.age >= 1 && b.age <= 99
      ? Math.round(b.age)
      : undefined;

  if (b.looks !== undefined && b.looks !== null && typeof b.looks !== "string") return "생김새가 올바르지 않아요.";
  const looks = typeof b.looks === "string" ? oneLine(b.looks) : "";
  // 600자(PORTRAIT_LOOKS_MAX) — 어른 생김새 칸이 늘어(2026-09-28) 다 고르면 300자를 넘는다.
  if (looks.length > PORTRAIT_LOOKS_MAX) return `생김새는 ${PORTRAIT_LOOKS_MAX}자까지예요.`;

  const styleRef = typeof b.styleRef === "string" && b.styleRef.trim() ? b.styleRef.trim() : undefined;

  // 화면이 보여 준 값(선택) — 0 이상 정수만. 이상하면 없는 것으로 본다.
  const expectedCost =
    typeof b.expectedCost === "number" && Number.isInteger(b.expectedCost) && b.expectedCost >= 0 && b.expectedCost <= 100
      ? b.expectedCost
      : undefined;

  // 사진이 이번 방문에 이미 거절됐다(화면이 알려 준다) — true 만 받는다. 값은 똑같이 받는다(건너뛰는 건 거절될 그리기뿐).
  const skipPhotoDraw = b.skipPhotoDraw === true;

  // 펜선 또렷한 수채화 — 기본으로 켠다. false(예전 수채화)는 fe 만 — handlePost 가 다른 회원은 다시 켠다.
  const penline = b.penline !== false;

  return { memberId, role, callName, gender, age, looks, styleRef, expectedCost, skipPhotoDraw, penline };
}

/**
 * 이 회원의 가족 그림 폴더 주소 — cafe24.ts 가 올린 파일 주소를 만드는 규칙과 같다:
 *   CAFE24_PUBLIC_BASE_URL + '/' + CAFE24_UPLOAD_DIR + '/family/<폴더>/'
 */
function familyUrlPrefix(folder: string): string | null {
  const base = (process.env.CAFE24_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return null;
  const dir = (process.env.CAFE24_UPLOAD_DIR ?? "").trim().replace(/^\/+|\/+$/g, "");
  return `${base}/${[dir, "family", folder].filter(Boolean).join("/")}/`;
}

/**
 * 그림체 맞추기용 참고 그림(같은 가족의 다른 사람) — **이 회원 폴더의 우리가 올린 파일만** 받는다.
 * 남의 그림을 참고로 끌어오거나, 서버가 내부 주소를 대신 받아 오게 하는 길을 막는다.
 * 같은 사람의 옛 그림은 받지 않는다 — 프롬프트가 '그 사람 얼굴은 베끼지 말라'고 하므로 뜻이 어긋난다.
 */
function acceptStyleRef(raw: string | undefined, folder: string, memberId: string): string | null {
  if (!raw) return null;
  const prefix = familyUrlPrefix(folder);
  if (!prefix || !raw.startsWith(prefix)) return null;
  const m = /^([a-z0-9-]{1,40})-(\d{10,16})-[a-f0-9]{32}(?:-ref\.jpg|\.png)$/.exec(raw.slice(prefix.length));
  if (!m || m[1] === memberId) return null;
  return raw;
}

function missingFunction(error: DbError): boolean {
  const code = String(error?.code ?? "");
  return code === "42883" || code === "PGRST202" || /could not find the function/i.test(error?.message ?? "");
}

/** 되돌렸을 때 붙이는 말 — 쿠키를 냈으면 쿠키, 무료 생성을 썼으면 그 횟수. **실제로** 되돌렸을 때만. */
function refundNote(charge: Charge, refunded: boolean): string {
  if (!refunded) return "";
  if (charge.charged > 0) return " 쿠키는 돌려드렸어요.";
  if (charge.freeUsed) return " 무료 생성 횟수는 돌려드렸어요.";
  return "";
}

/** charge_family_portrait 응답 — ok / busy / price, 모양이 다르면 null */
type ChargeReply =
  | { status: "ok"; charge: Charge }
  | { status: "busy"; draws: number; retryAfter: number; tokens: number | null }
  | { status: "price"; cost: number; draws: number; tokens: number | null; freeLeft: number | null };

function readCharge(data: unknown): ChargeReply | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  const tokens = typeof d.tokens === "number" ? d.tokens : null;
  const freeLeft = typeof d.free_left === "number" && Number.isInteger(d.free_left) && d.free_left >= 0 ? d.free_left : null;
  const draws = Number(d.draws);
  if (d.status === "busy") {
    return { status: "busy", draws: Number.isInteger(draws) ? draws : 0, retryAfter: Number(d.retry_after) || 30, tokens };
  }
  if (d.status === "price") {
    const cost = Number(d.cost);
    if (!Number.isInteger(cost)) return null;
    return { status: "price", cost, draws: Number.isInteger(draws) ? draws : 0, tokens, freeLeft };
  }
  if (d.status !== "ok") return null;
  const draw = Number(d.draw);
  // 열쇠가 없으면 '받았음'도 되돌리기도 못 한다 — 모양이 다른 옛 함수로 본다.
  if (!Number.isInteger(draw) || draw < 1 || typeof d.lease !== "string" || !d.lease) return null;
  return {
    status: "ok",
    charge: {
      charged: Number(d.charged) || 0,
      entry: typeof d.entry === "string" ? d.entry : null,
      draw,
      lease: d.lease,
      tokens,
      freeUsed: d.free_used === true,
      freeLeft,
    },
  };
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DrawTimeout()), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * ms 안에만 그린다 — withTimeout 으로 기다림을 끊고, 같은 시각을 generateImage until 로 넘겨 끊긴 뒤에는 새 요청
 * (몰림·서버 오류 뒤 다시 걸기)을 시작하지 않게 한다. 이미 나간 요청은 멈추지 못한다(그 구글 값은 나갈 수 있다).
 */
function drawWithin(input: Parameters<typeof generateImage>[0], ms: number): Promise<GeneratedImage> {
  const job = generateImage({ ...input, until: Date.now() + ms });
  /*
   * 기다림을 끊어도 이미 나간 요청은 구글이 끝까지 그리고 값을 받는다. 답을 보낸 뒤에도 그 그림이 돌아와
   * 모델·토큰·금액이 기록될 때까지(lib/ai-usage) 서버를 잡아 둔다 — 안 그러면 버린 그림의 값이 기록에서 빠진다.
   */
  try {
    after(() => job.then(settleAiUsage, settleAiUsage));
  } catch {
    // 요청 밖에서는 after 를 쓸 수 없다 — 기록만 놓칠 뿐 그리기는 같다
  }
  return withTimeout(job, ms);
}

/** 제한 시간 안에 안 오면 null — 참고 그림처럼 없어도 되는 것에 쓴다. */
function orNullAfter<T>(work: Promise<T | null>, ms: number): Promise<T | null> {
  return withTimeout(work, ms).catch(() => null);
}

/* ─────────────────────────────── 사진으로 그리기 ─────────────────────────────── */

/** 오류를 로그용 짧은 글로 — 구글 오류 원문(message)은 넣지 않는다(보낸 값 — 사진·카드 — 을 되읊는 일이 있다). */
function brief(e: unknown): string {
  if (e instanceof GeminiError) return `GeminiError ${e.status ?? "-"} ${e.noImage ?? ""}`.trim();
  if (e instanceof DrawTimeout) return "시간 초과";
  return e instanceof Error ? e.name : "오류";
}

/** 특징 카드와 같은 답으로 받은 얼굴 상자 — 둘 다 사진과 똑같이 다룬다(찍지 않는다). 아직 안 왔거나 실패면 둘 다 null. */
type CardGot = { card: string | null; faceBox: Box | null };
const NO_CARD: CardGot = { card: null, faceBox: null };

/**
 * 특징 카드 기다리기(머리글 ①). startCard 는 값을 받은 뒤에 부른다 — 참고 그림 받기와 나란히 돈다.
 * waitUntil(t): 시각 t 까지만 기다리고 그때까지 온 카드·얼굴 상자를 준다(없으면 null). 이 요청 메모리에만 있다.
 * drop(): 그리기가 끝나 카드가 더 쓰일 일이 없다 — 받아 둔 카드·상자를 놓고, 늦게 오는 답도 담아 두지 않는다
 *   (머리 비율 다시 그리기는 처음 그림 + 그 그림에 쓴 카드에서 걸러 낸 얼굴·머리 줄로 한다 — drawFromPhoto 가 돌려주는 card, 머리글 ②).
 */
type CardJob = { startedAt: number; waitUntil: (t: number) => Promise<CardGot>; drop: () => void };

function startCard(photo: PortraitPhoto, memberId: string, draw: number): CardJob {
  const startedAt = Date.now();
  const got: CardGot & { done: boolean; dropped: boolean } = { card: null, faceBox: null, done: false, dropped: false };
  const job = describePhoto(photo, { timeoutMs: CARD_TIMEOUT_MS }).then(
    (r): CardGot => {
      got.done = true;
      // 결과 갈래·상자 있음/없음·걸린 시간만 — 카드 글·상자 숫자는 찍지 않는다(사진과 똑같이 다룬다).
      console.info(
        "[family/portrait] 특징 카드",
        memberId,
        draw,
        r.outcome,
        r.faceBox ? "얼굴 상자 있음" : "얼굴 상자 없음",
        `${r.ms}ms`,
      );
      if (got.dropped) return NO_CARD;
      got.card = r.card;
      got.faceBox = r.faceBox;
      return { card: r.card, faceBox: r.faceBox };
    },
    (): CardGot => {
      got.done = true;
      return NO_CARD;
    },
  );
  return {
    startedAt,
    waitUntil: async (t) => {
      if (got.dropped) return NO_CARD;
      const ms = t - Date.now();
      if (got.done || ms <= 0) return { card: got.card, faceBox: got.faceBox };
      return (await orNullAfter(job, ms)) ?? NO_CARD;
    },
    drop: () => {
      got.dropped = true;
      got.card = null;
      got.faceBox = null;
    },
  };
}

/**
 * 사진으로 그린다(머리글 ②·③). 그림 모델이 사진을 거절하면 같은 요청에서 사진 없이 특징 카드(+칩)로 한 번 더 그리고,
 * 그것도 못 하면 PhotoRefused 를 던진다(값 되돌리기는 부른 쪽). 몰림(429)·서버 문제·시간 초과처럼 사진 탓이 아닌 실패는
 * 그대로 던진다(칩으로 그릴 때와 같은 처리). input.skipPhotoDraw 면 ②를 건너뛰고 ③만 한다.
 * ms — 건넨 그림을 그리는 데 걸린 시간(머리 비율 다시 그릴 시간이 되는지 어림한다). 사진·클로즈업은 그 그리기가 끝나면 곧바로
 * 놓는다(drawThenRelease) — 머리 비율 다시 그리기는 처음 그림으로 한다(머리글 ②).
 * card — 건넨 그림을 그릴 때 쓴 특징 카드(사진 그리기의 카드 · 대신 그리기 features 의 카드, 칩으로 대신 그렸거나 카드가 늦었으면
 * null). 머리 비율 다시 그리기가 그 얼굴·머리 줄을 다시 적는다(redrawLikeness). 사진과 똑같이 다룬다 — 찍지 않는다.
 */
async function drawFromPhoto(o: {
  input: Input;
  photo: PortraitPhoto;
  card: CardJob;
  styleSample: GeneratedImage | null;
  sibling: GeneratedImage | null;
  guide: GeneratedImage | null;
  startedAt: number;
  draw: number;
}): Promise<{ image: GeneratedImage; fallback: PhotoFallback | null; ms: number; card: string | null }> {
  const { input, card, startedAt, draw } = o;
  const since = () => `${Date.now() - startedAt}ms`;

  if (input.skipPhotoDraw) {
    // 이번 방문에 이미 거절된 사진(머리글 skipPhotoDraw) — 또 거절될 사진 그리기는 건너뛰고 곧바로 ③.
    console.info("[family/portrait] 사진 그리기 건너뜀(이번 방문에 거절됨)", input.memberId, draw, since());
  } else {
    // ② 사진으로 — 카드는 CARD_WAIT_MS 까지만 기다린다(늦으면 사진만으로 — 클로즈업도 없이).
    const first = await card.waitUntil(card.startedAt + CARD_WAIT_MS);
    // ①-2 얼굴 클로즈업 — 카드와 함께 온 얼굴 상자가 쓸 만할 때만(lib/family-closeup). 사진과 똑같이 다룬다: 아래 photoRefs.images
    //     에만 들고, 사진을 놓을 때 같이 놓는다. 찍지 않는다(있음·없음만).
    const closeUp = first.faceBox ? await orNullAfter(faceCloseUp(o.photo, first.faceBox), CLOSEUP_TIMEOUT_MS) : null;
    const photoRefs = portraitReferences({
      photo: o.photo,
      closeUp,
      sample: o.styleSample,
      sibling: o.sibling,
      guide: o.guide,
    });
    const prompt = buildPrompt(input, photoRefs.attached, first.card);
    const t0 = Date.now();
    try {
      // 사진·클로즈업은 이 그리기 한 번에만 — 끝나면(성공·실패 모두) 배열을 곧바로 비운다(drawThenRelease). 머리가 표에서
      // 벗어나 다시 그려도 사진으로 그리지 않는다(처음 그림으로 — 머리글 ②). 거절됐으면 아래 ③은 사진 없이 대신 그린다.
      const image = await drawThenRelease(photoRefs.images, (references) =>
        drawWithin(
          {
            prompt,
            references,
            aspectRatio: "3:4",
            provider: "gemini",
            // 거절(그림 없는 답)은 한 번만 — 같은 사진은 대개 또 거절되고, 남은 시간은 대신 그리기 몫이다.
            noImageAttempts: 1,
          },
          Math.max(DRAW_MIN_MS, startedAt + DRAW_DEADLINE_MS - Date.now()),
        ),
      );
      console.info(
        "[family/portrait] 사진으로 그림",
        input.memberId,
        draw,
        first.card ? "카드 있음" : "카드 없음",
        photoRefs.attached.closeUp ? "클로즈업 있음" : "클로즈업 없음",
        since(),
      );
      return { image, fallback: null, ms: Date.now() - t0, card: first.card };
    } catch (e) {
      if (!photoRefused(e)) throw e;
      console.warn("[family/portrait] 사진 거절", input.memberId, draw, brief(e), since());
    }
  }

  // ③ 대신 그리기 — 카드가 아직이면 대신 그리기 몫(PHOTO_FALLBACK_MIN_MS)을 남기는 만큼만 더 기다린다.
  //    사진 그리기를 건너뛰었으면 이것이 이번 그리기 한 장이라 칩으로 그릴 때와 같은 그리기 제한(DRAW_DEADLINE_MS)까지.
  //    카드는 이 사람에게 맞게 거른 것(cardFor)으로 정한다 — 걸러서 남는 줄이 없으면 칩으로.
  const fallbackEnd = startedAt + (input.skipPhotoDraw ? DRAW_DEADLINE_MS : FALLBACK_DEADLINE_MS);
  const lateCard = cardFor(
    input,
    (await card.waitUntil(Math.min(card.startedAt + CARD_TIMEOUT_MS, fallbackEnd - PHOTO_FALLBACK_MIN_MS))).card,
  );
  const msLeft = fallbackEnd - Date.now();
  const plan = photoFallbackPlan({ card: lateCard, looks: input.looks, msLeft });
  if (!plan) {
    const why = msLeft < PHOTO_FALLBACK_MIN_MS ? "시간 모자람" : "카드·칩 없음";
    console.warn("[family/portrait] 대신 그리기 안 함", input.memberId, draw, why, since());
    throw new PhotoRefused();
  }
  const noPhoto = portraitReferences({ photo: null, sample: o.styleSample, sibling: o.sibling, guide: o.guide });
  const prompt = buildPrompt(input, noPhoto.attached, plan === "features" ? lateCard : null);
  const t0 = Date.now();
  try {
    const image = await drawWithin(
      {
        prompt,
        references: noPhoto.images,
        aspectRatio: "3:4",
        provider: "gemini",
        noImageAttempts: 1,
      },
      msLeft,
    );
    console.info("[family/portrait] 대신 그림", input.memberId, draw, plan, since());
    return { image, fallback: plan, ms: Date.now() - t0, card: plan === "features" ? lateCard : null };
  } catch (e) {
    console.warn("[family/portrait] 대신 그리기도 실패", input.memberId, draw, brief(e), since());
    throw new PhotoRefused();
  }
}

/* ─────────────────────────────── 결제 되돌리기·마무리 ─────────────────────────────── */

/** refund_family_portrait 결과. DB 에 닿지 못했으면 null. */
type Refund = { refunded: boolean; delivered: boolean; tokens: number | null };

/**
 * 이번 그리기를 되돌린다(쿠키·횟수) — 열쇠가 맞을 때만 DB 가 되돌린다.
 * refunded 는 **실제로** 되돌렸을 때만 true 다(조건이 안 맞아 아무것도 안 했으면 false).
 * delivered 는 이미 '받았음'이 적힌 그리기라 되돌릴 수 없다는 뜻이다(그림을 건네면 된다).
 */
async function refundDraw(caller: Caller, memberId: string, charge: Charge): Promise<Refund | null> {
  try {
    const { data, error } = await caller.db.rpc("refund_family_portrait", {
      p_member: memberId,
      p_draw: charge.draw,
      p_lease: charge.lease,
    });
    if (error) {
      console.error("[family/portrait] 되돌리기 실패", memberId, charge.draw, error.code, error.message);
      return null;
    }
    const d = data as Record<string, unknown> | null;
    if (!d || typeof d !== "object") return null;
    return {
      refunded: d.refunded === true,
      delivered: d.delivered === true,
      tokens: typeof d.tokens === "number" ? d.tokens : null,
    };
  } catch (e) {
    console.error("[family/portrait] 되돌리기 실패", memberId, charge.draw, e);
    return null;
  }
}

/**
 * 건넨 그림 — 응답을 잃은 화면이 되찾을 수 있게 DB(last_pic)에도 적는다. headRatio 는 잰 머리 비율(머리글 ③, 못 쟀으면 없음),
 * bodyStretch 는 몸을 늘인 배율(머리글 ④, 안 늘였으면 없음).
 */
type Pic = { url: string; ref: string; at: string; transparent: boolean; headRatio?: number; bodyStretch?: number };

/** 머리 재기 로그 — 숫자와 갈래만(그림·프롬프트·사진·카드는 찍지 않는다). */
function logHead(memberId: string, draw: number, h: HeadPassLog, startedAt: number) {
  console.info(
    "[family/portrait] 머리 비율",
    memberId,
    draw,
    `표 ${h.target}`,
    `처음 ${h.first ?? "-"}`,
    h.retried ? `다시 그림 ${h.second ?? "-"}` : "다시 안 그림",
    `남김 ${h.kept}`,
    h.outcome,
    `재기 ${h.checkMs}ms`,
    `다시 그리기 ${h.redrawMs}ms`,
    `${Date.now() - startedAt}ms`,
  );
}

/**
 * '받았음'과 그림 주소를 적는다. true = 적음, false = 이 결제가 이미 되돌려졌거나(열쇠가 바뀜) 다음 그리기가
 * 끼어듦, null = DB 에 닿지 못함(한 번 더 해 본 뒤).
 */
async function finishDraw(caller: Caller, memberId: string, charge: Charge, pic: Pic): Promise<boolean | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await caller.db.rpc("finish_family_portrait", {
        p_member: memberId,
        p_draw: charge.draw,
        p_lease: charge.lease,
        p_pic: pic,
      });
      if (!error) return data === true;
      console.error("[family/portrait] 받았음 적기 실패", memberId, charge.draw, error.code, error.message);
    } catch (e) {
      console.error("[family/portrait] 받았음 적기 실패", memberId, charge.draw, e);
    }
  }
  return null;
}

/**
 * 마스터의 그림을 예전 그림 기록에 적는다(DB record_master_family_picture, 2026-10-14). 마스터는 값을 안 내 '받았음'
 * (finish_family_portrait — 회원은 거기서 적힌다)을 안 거친다. 실패해도 그림은 준다 — 목록에서 그 한 장이 빠질 뿐이다.
 */
async function recordMasterPicture(caller: Caller, memberId: string, pic: Pic): Promise<void> {
  try {
    const { error } = await caller.db.rpc("record_master_family_picture", { p_member: memberId, p_pic: pic });
    if (error) console.warn("[family/portrait] 마스터 그림 기록", memberId, error.code);
  } catch (e) {
    console.warn("[family/portrait] 마스터 그림 기록", memberId, e instanceof Error ? e.name : "error");
  }
}

/* ─────────────────────────────── 경로 ─────────────────────────────── */

// 이 요청 안의 AI 호출(그림·사진 특징표·머리 비율)을 모델·토큰·금액으로 남긴다(lib/ai-usage) — 답을 돌려주기 전에 다 적는다.
export function POST(request: Request) {
  return withAiUsage("family-portrait", () => handlePost(request));
}

async function handlePost(request: Request) {
  const startedAt = Date.now();
  // 단계마다 걸린 ms — 배포에서 어디가 느렸는지 가리려고 성공·실패 로그에 한 줄로 싣는다(단계 이름과 숫자만).
  const clock = stageClock(startedAt);

  // ① 로그인
  const caller = await callerOf(request);
  if (!caller) return fail(401, "로그인이 필요합니다.", "login");
  // 결제 전에는 관리자(yogico·fe)와 결제 요금제 회원만 그린다(lib/create-access — 사장님 2026-10-19)
  if (!(await canCreate(caller))) return fail(403, CREATE_LOCKED_MESSAGE, CREATE_LOCKED_CODE);
  bindAiUsageSink(dbUsageSink(caller.db));
  clock.mark("auth");

  // ② 입력 — 사진이 든 본문이 너무 크면 읽기 전에 막는다(화면은 1024px JPEG 로 줄여 보내 보통 0.5MB 안팎).
  if (Number(request.headers.get("content-length") ?? 0) > PORTRAIT_BODY_MAX_BYTES) {
    return fail(413, PHOTO_TOO_BIG_MESSAGE, "photo");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "요청 본문이 JSON이 아닙니다.", "input");
  }
  const parsed = parseInput(body);
  if (typeof parsed === "string") return fail(400, parsed, "input");
  // 예전 수채화(펜선 끄기)는 fe(개발자 모드)만 — 비교용. 다른 회원은 늘 펜선(lib/dev-mode)
  const input = !parsed.penline && !isDevUser(caller.username) ? { ...parsed, penline: true } : parsed;
  // 사진(선택) — 값을 받기 전에 형식·크기를 본다. 사진은 이 변수(와 특징 카드·그리기 도우미의 인자)에만 두고,
  // 본문은 곧바로 놓는다. 사진은 저장하지 않는다: 로그·DB·cafe24·오류 응답 어디에도 넣지 않고, 이 요청의 특징 카드와
  // 그리기에만 넘긴 뒤 버린다(머리글).
  let photoRead: ReturnType<typeof readPortraitPhoto> | null = readPortraitPhoto((body as Record<string, unknown>).photo);
  body = undefined;
  if ("error" in photoRead) return fail(400, photoRead.error, "photo");
  let photo: PortraitPhoto | null = photoRead.photo;
  // 사진을 가리키는 곳은 photo 하나만 — 읽은 결과도 놓아야 ④-1 에서 photo 를 비울 때 사진이 정말 놓인다.
  photoRead = null;
  const withPhoto = photo !== null;

  // 폴더는 부른 사람의 uid 로 — 요청이 보낸 값은 쓰지 않는다.
  const folder = folderOf(caller);
  const styleRef = acceptStyleRef(input.styleRef, folder, input.memberId);
  if (input.styleRef && !styleRef) {
    console.warn("[family/portrait] 참고 그림 주소를 받지 않음:", input.styleRef.slice(0, 200));
  }

  // 참고 그림은 값 받기와 나란히 받아 둔다 — 그리기에 쓸 시간을 아낀다. 늦거나 실패하면 없이 그린다.
  const style = ART_STYLES.find((s) => s.id === "watercolor") ?? ART_STYLES[0];
  // 비율 견본(머리글 ①)은 서버가 만든다(받아 오지 않는다) — 이 사람의 표 비율로.
  const headTarget = headChartRatio(input.role, input.age);
  // 펜선 시험은 견본을 빨간 모자 1쪽으로, 같은 가족 그림(옛 수채화)은 받지 않는다 — 옛 결로 당기지 않게.
  const sampleImage = input.penline ? PENLINE_SAMPLE : style.image;
  const refsReady = Promise.all([
    sampleImage
      ? orNullAfter(loadReferenceImage(new URL(sampleImage, request.url).toString()), REF_TIMEOUT_MS)
      : Promise.resolve(null),
    styleRef && !input.penline ? orNullAfter(loadReferenceImage(styleRef), REF_TIMEOUT_MS) : Promise.resolve(null),
    orNullAfter(guideImage(headTarget), REF_TIMEOUT_MS),
  ]);

  // ③ 값 받기 — 마스터는 결제 없이
  let charge: Charge | null = null;
  if (!caller.isMaster) {
    let data: unknown;
    let error: DbError;
    try {
      ({ data, error } = await caller.db.rpc("charge_family_portrait", {
        p_member: input.memberId,
        p_expected: input.expectedCost ?? null,
      }));
    } catch (e) {
      console.error("[family/portrait] 값 받기 실패", e);
      return fail(500, "쿠키를 받지 못했어요. 잠시 뒤 다시 해 주세요.", "charge");
    }
    if (error) {
      if (missingFunction(error)) {
        // 브라우저 차감으로 물러서지 않는다 — 물러서면 경로를 직접 불러 공짜로 그릴 수 있다.
        console.error("[family/portrait] charge_family_portrait 없음 — supabase/family-portraits.sql 을 돌려야 해요.");
        return fail(503, "가족 그리기 준비가 아직 안 됐어요. 관리자에게 알려 주세요.", "setup");
      }
      if (error.code === "22003" || (error.message ?? "").includes("부족")) {
        return fail(402, "쿠키가 모자라요.", "insufficient");
      }
      console.error("[family/portrait] 값 받기 거절", error.code, error.message);
      return fail(500, "쿠키를 받지 못했어요. 잠시 뒤 다시 해 주세요.", "charge");
    }
    const reply = readCharge(data);
    if (!reply) {
      // 함수가 돌려준 모양이 다르다(옛 함수 등) — 몇 번째 그리기인지·열쇠를 모르면 '받았음'도 되돌리기도 못 한다.
      console.error("[family/portrait] 값 받기 응답을 못 읽음 — family-portraits.sql 을 다시 돌려야 해요.", JSON.stringify(data)?.slice(0, 300));
      return fail(503, "가족 그리기 준비가 아직 안 됐어요. 관리자에게 알려 주세요.", "setup");
    }
    if (reply.status === "busy") {
      // 이 사람을 이미 그리는 중이다(다른 탭·기기, 또는 응답을 잃은 앞 요청). 값은 안 받았다.
      return fail(409, "이 사람을 벌써 그리고 있어요. 잠시만 기다려 주세요.", "busy", {
        draws: reply.draws,
        retryAfter: reply.retryAfter,
        tokens: reply.tokens,
      });
    }
    if (reply.status === "price") {
      // 화면이 보여 준 값보다 비싸다 — 동의 없이 더 깎지 않는다. 값은 안 받았다.
      return fail(409, `이번 그리기는 쿠키 ${reply.cost}개예요. 다시 확인해 주세요.`, "price", {
        cost: reply.cost,
        draws: reply.draws,
        tokens: reply.tokens,
        ...(reply.freeLeft !== null ? { freeLeft: reply.freeLeft } : {}),
      });
    }
    charge = reply.charge;
  }
  const draw = charge?.draw ?? 0;
  clock.mark("charge");

  // 실패하면 값을 되돌리고 알린다. '돌려드렸어요'는 **실제로** 되돌렸을 때만 붙인다.
  // 되돌린 뒤의 잔액도 함께 준다(화면의 쿠키 수를 맞추게). extra 는 사진·카드가 없는 짧은 값만(올리기 오류 코드 등).
  const failAndRefund = async (status: number, error: string, code: string, extra?: Record<string, unknown>) => {
    if (!charge) return fail(status, error, code, extra);
    const r = await refundDraw(caller, input.memberId, charge);
    const refunded = r?.refunded === true;
    const note = refundNote(charge, refunded);
    return fail(status, `${error}${note}`, code, { ...extra, refunded, tokens: r?.tokens ?? null });
  };

  let stage: "draw" | "cutout" | "upload" = "draw";
  /** 올리기를 시작할 때 마감까지 남았던 ms — 올리기 실패 로그에 싣는다 */
  let uploadLeftMs: number | null = null;
  let pic: Pic;
  /** 사진이 거절돼 사진 없이 대신 그렸으면 무엇으로 — 응답에 실어 화면이 한 줄 알린다(저장하지 않는다) */
  let fallback: PhotoFallback | null = null;
  // 특징 카드(머리글 ①) — 값을 받은 뒤에야 시작한다(값 없이 글 모델을 부르는 길을 막는다). 참고 그림 받기와 나란히 돈다.
  // 처음 그리기가 끝나면 사진과 함께 곧바로 놓는다(아래 ④-1).
  let card = photo ? startCard(photo, input.memberId, draw) : null;
  /**
   * 머리 비율 다시 그리기에 다시 적을 얼굴·머리 줄(머리글 '머리 비율' ②) — 사진(카드)으로 그렸을 때만. 카드에서 걸러 낸 것이라
   * 카드와 똑같이 다룬다: 이 요청 메모리에서 다시 그리기 프롬프트로만 넘기고, 머리 재기가 끝나면(실패해도) 놓는다. 찍지 않는다.
   */
  let likeness: string | null = null;
  try {
    // ④ 그리기 — 참고 그림 순서(= 프롬프트의 몇 번째)는 portraitReferences 가 정한다:
    //    칩: 그림체 견본 → 같은 가족 그림 → 비율 견본
    //    사진: 이 사람 사진 → 얼굴 클로즈업(있으면) → 그림체 견본 → 비율 견본(같은 가족 그림은 붙이지 않는다)
    // 가족 캐릭터는 늘 Gemini 로(사장님 결정) — IMAGE_PROVIDER=openai 여도, 한도에 막혀도 GPT 로 넘기지 않는다.
    const [styleSample, sibling, guide] = await refsReady;
    clock.mark("refs");
    let image: GeneratedImage;
    /** 처음 그리기에 걸린 시간 — 머리 비율 다시 그릴 시간이 되는지 어림한다(HEAD_REDRAW_DEADLINE_MS) */
    let drawMs: number;
    if (photo && card) {
      const got = await drawFromPhoto({ input, photo, card, styleSample, sibling, guide, startedAt, draw });
      image = got.image;
      fallback = got.fallback;
      drawMs = got.ms;
      likeness = redrawLikeness(input, got.card);
    } else {
      const refs = portraitReferences({ photo: null, sample: styleSample, sibling, guide });
      const prompt = buildPrompt(input, refs.attached);
      const t0 = Date.now();
      image = await drawWithin(
        {
          prompt,
          references: refs.images,
          aspectRatio: "3:4",
          provider: "gemini",
        },
        Math.max(DRAW_MIN_MS, startedAt + DRAW_DEADLINE_MS - Date.now()),
      );
      drawMs = Date.now() - t0;
    }
    clock.mark("draw");

    // ④-1 사진·특징 카드는 여기서 끝 — 처음 그리기에만 쓴다(사진·클로즈업이 든 참고 그림 배열은 drawFromPhoto 가 그리기 직후
    //     이미 비웠다). 머리 비율 다시 그리기는 처음 그림으로 하므로 이 요청 안에서도 더 붙들지 않는다(그린 그림만 아래로 간다).
    //     카드에서 걸러 낸 얼굴·머리 줄(likeness)만 머리 재기가 끝날 때까지 둔다(머리글 '머리 비율' ②).
    photo = null;
    card?.drop();
    card = null;

    // ④-2 머리 재기(머리글 '머리 비율' ②) — 던지지 않는다. 표에서 많이 벗어났고 시간이 넉넉하면 **처음 그림에서** 같은 캐릭터를
    //    비율만 고쳐 한 번 더 그리고(headRedrawRecipe — 처음 그림 + 비율 견본뿐, 사진·클로즈업 없이. 사진·카드로 그렸으면 카드의
    //    얼굴·머리 줄을 글로), 표에 더 가까운 쪽을 남긴다. 칩·사진·대신 그리기 모두 같은 다시 그리기. 실패·거절·시간 초과면 처음 그림 그대로.
    const head = await evenOutHead({
      image,
      target: headTarget,
      measure: (img, ms) => measureHeadRatio(img, { timeoutMs: ms }),
      redraw: async (first, fix, ms) => {
        const again = headRedrawRecipe({ first, guide, fix, likeness, penline: input.penline });
        try {
          // 끊긴 뒤 뒤에서 다시 걸지 않는다(drawWithin until) — 버릴 그림에 값이 나가지 않게.
          return await drawWithin(
            {
              prompt: again.prompt,
              references: again.references,
              aspectRatio: "3:4",
              provider: "gemini",
              // 거절(그림 없는 답)은 한 번만 — 처음 그림이 있으니 기다리지 않고 그것을 건넨다.
              noImageAttempts: 1,
            },
            ms,
          );
        } catch (e) {
          console.warn("[family/portrait] 머리 다시 그리기 실패", input.memberId, draw, brief(e));
          throw e;
        }
      },
      checkUntil: startedAt + HEAD_CHECK_DEADLINE_MS,
      redrawUntil: startedAt + HEAD_REDRAW_DEADLINE_MS,
      redrawMinMs: Math.max(PHOTO_FALLBACK_MIN_MS, drawMs),
      // 머리가 큰 그림은 아래 ④-3 에서 늘이니, 두 장을 견줄 때도 늘인 뒤 비율로 — 못 잰 다시 그린 그림보다 늘일 수 있는 처음 그림.
      effective: (ratio, boxes) => ratioAfterStretch(ratio, boxes, headTarget),
    });
    image = head.image;
    let headRatio = head.ratio;
    logHead(input.memberId, draw, head.log, startedAt);
    clock.mark("head");
    // 다시 그리기가 끝났다 — 카드에서 걸러 낸 얼굴·머리 줄도 놓는다(더 쓰일 일이 없다).
    likeness = null;

    // ④-3 몸 늘이기(머리글 '머리 비율' ④) — 남긴 그림을 잰 상자가 있고 그래도 머리가 크면, 머리는 그대로 두고 목 ~ 발목만
    //     세로로 늘인다(흰 바탕 그림에 — 지우기가 늘인 윤곽에서 가장자리를 새로 푼다). 실패하면 늘이지 않은 그림 그대로.
    //     없어도 되는 단계라 올리기 몫을 떼어 둔 시각(STRETCH_DEADLINE_MS) 전에만 시작한다(lib/family-portrait-budget).
    let drawn: Buffer = Buffer.from(image.data, "base64");
    /** 늘인 배율(머리글 ④) — 단체 사진이 또 늘일 때 본다. 안 늘였으면 없다. */
    let bodyStretch: number | undefined;
    const stretchInTime = optionalAllowed(startedAt, Date.now(), STRETCH_DEADLINE_MS);
    if (head.boxes && !stretchInTime) {
      console.info("[family/portrait] 몸 늘이기 건너뜀(올리기 몫)", input.memberId, draw, `${clock.elapsed()}ms`);
    }
    if (head.boxes && stretchInTime) {
      const t0 = Date.now();
      try {
        const stretched = await stretchFigure(drawn, { boxes: head.boxes, chart: headTarget });
        if (stretched) {
          drawn = stretched.image;
          headRatio = stretched.plan.after;
          bodyStretch = cleanBodyStretch(stretched.plan.factor);
          // 숫자만 — 그림·상자는 찍지 않는다.
          console.info(
            "[family/portrait] 몸 늘이기",
            input.memberId,
            draw,
            `표 ${headTarget}`,
            `${stretched.plan.before} → ${stretched.plan.after}`,
            `배율 ${stretched.plan.factor.toFixed(2)}`,
            `${Date.now() - t0}ms`,
          );
        }
      } catch (e) {
        console.warn("[family/portrait] 몸 늘이기 실패 — 늘이지 않고 건넴", input.memberId, draw, brief(e), `${Date.now() - t0}ms`);
      }
    }
    clock.mark("stretch");

    // ⑤ 흰 바탕 지우기 — 화면용 투명 PNG(가로 최대 720) + 참고용 흰 바탕 JPEG(최대 1024)
    stage = "cutout";
    const cut = await removeWhiteBackground(drawn);
    if (!cut.transparent) {
      console.warn("[family/portrait] 흰 바탕을 못 지워 흰 바탕 그대로 둠 — 지운 비율", cut.clearedRatio.toFixed(3));
    }
    const [png, jpg] = await Promise.all([
      // 팔레트 PNG(알파 그대로) — 수채화 전신 한 장이 ~570KB → ~150KB, 눈으로는 차이가 없다(홈에 여러 장이 뜬다).
      sharp(cut.png)
        .resize({ width: 720, withoutEnlargement: true })
        .png({ palette: true, quality: 90, effort: 8, compressionLevel: 9 })
        .toBuffer(),
      sharp(cut.png)
        .flatten({ background: "#ffffff" })
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer(),
    ]);
    clock.mark("cutout");

    // ⑥ 올리기 — 남은 시간 안에서만. 함수 제한(60초)에 잘리면 값은 나갔는데 되돌리기도 못 돈다.
    stage = "upload";
    const left = uploadLeft(startedAt);
    uploadLeftMs = left;
    if (left < UPLOAD_MIN_MS) throw new DrawTimeout();
    if (left < UPLOAD_RESERVE_MS) {
      // 올리기 몫보다 적게 남았다(대신 그리기 뒤 등) — 실패하면 이 줄이 까닭을 알려 준다.
      console.warn("[family/portrait] 올리기 시간 빠듯", input.memberId, draw, `남음 ${left}ms`, clock.summary());
    }
    // 매번 새 이름(cafe24 는 ?v= 를 무시해서 같은 이름이면 옛 그림이 보인다). 끝에 임의 32자를 붙여
    // 주소를 맞힐 수 없게 한다 — 건네지 못한(되돌린) 그림을 시각으로 찔러 찾아 공짜로 받는 길을 막는다.
    const stem = `family/${folder}/${input.memberId}-${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}`;
    // 두 장을 한 FTP 세션으로(로그인·폴더 찾기 한 번, 동시 접속 하나 — lib/cafe24). 마감(UPLOAD_DEADLINE_MS)에 cafe24 가
    // 스스로 연결을 끊어 오류 코드를 남기고, 바깥 withTimeout 은 그보다 조금 늦게(UPLOAD_SAFETY_MS) 받치는 안전 제한이다.
    // 마감에 끊긴 것(코드 끝이 closed)은 아래 catch 에서 바깥 제한과 똑같이 504 '너무 오래 걸려서'로 알린다(uploadHitDeadline).
    const [pngUp, jpgUp] = await withTimeout(
      uploadManyToCafe24(
        [
          { remotePath: `${stem}.png`, data: png },
          { remotePath: `${stem}-ref.jpg`, data: jpg },
        ],
        { deadline: startedAt + UPLOAD_DEADLINE_MS },
      ),
      left + UPLOAD_SAFETY_MS,
    );
    clock.mark("upload");
    pic = {
      url: pngUp.url,
      ref: jpgUp.url,
      at: new Date().toISOString(),
      transparent: cut.transparent,
      ...(headRatio !== null ? { headRatio } : {}),
      ...(bodyStretch !== undefined ? { bodyStretch } : {}),
    };
  } catch (e) {
    photo = null;
    card?.drop();
    card = null;
    likeness = null;
    // 오류만 찍는다 — 사진·카드·본문·참고 그림은 넣지 않는다(사진으로 그렸는지만 표시). 사진으로 그린 요청이면 그림 모델
    // 오류의 원문(구글 응답 본문)도 찍지 않는다 — 구글의 400 오류 글은 보낸 값을 되읊는 일이 있어 사진·카드 조각이 남을 수 있다.
    // 올리기 오류는 짧은 코드로만(lib/cafe24 ftpErrorCode — ftp-421·ECONNREFUSED·passive …). basic-ftp 원문에는 서버 주소·포트,
    // PASV IP 가 들어 있어 통째로 찍지 않는다. 마감에 걸렸으면 deadline.
    const uploadCode = stage === "upload" ? (e instanceof DrawTimeout ? "deadline" : ftpErrorCode(e)) : null;
    // 시간이 모자라 멈췄나 — 바깥 제한(DrawTimeout)이든, cafe24 가 올리기 마감에 스스로 끊은 것(코드 끝 closed, 예
    // "closed"·"ftp-421>closed")이든 같다. 2026-09-30 검토: 마감에 끊긴 것이 502 '그림을 올리지 못했어요'로 나가면
    // 이번 사고와 같은 말이 떠 비밀번호·해외 접속 차단부터 찾게 된다 — 504 '너무 오래 걸려서'(code timeout)로 보내고
    // 무엇에 걸렸는지는 detail(closed·deadline)로 남긴다.
    const outOfTime = e instanceof DrawTimeout || (stage === "upload" && uploadHitDeadline(e));
    const logged =
      e instanceof PhotoRefused
        ? "사진 거절 — 대신 그리기 못 함"
        : uploadCode !== null
          ? `올리기 ${uploadCode} (시작 때 남음 ${uploadLeftMs ?? "-"}ms)`
          : withPhoto && e instanceof GeminiError
            ? brief(e)
            : e;
    console.error("[family/portrait]", stage, input.memberId, draw, withPhoto ? "사진" : "칩", logged, clock.summary());
    // 올리기 단계의 실패는 코드를 응답에도 싣는다(detail) — 배포 로그를 못 볼 때 개발자 도구로 원인(동시 접속·로그인·용량·
    // 해외 접속 막힘 …)을 가린다. 주소·포트·사진은 들어 있지 않다. 화면(family-ui jobError)은 code 만 본다.
    const uploadExtra = uploadCode !== null ? { detail: uploadCode } : undefined;
    // 사진이 거절됐고 대신 그리기(사진 없이 카드·칩)도 못 했다 — 같은 사진으로는 또 거절되니 '다른 사진이나 특징으로'를
    // 알린다. 값은 되돌린다(failAndRefund).
    if (e instanceof PhotoRefused) {
      return failAndRefund(422, PHOTO_REFUSED_MESSAGE, "photo");
    }
    if (outOfTime) {
      return failAndRefund(504, "그림이 너무 오래 걸려서 멈췄어요. 잠시 뒤 다시 해 주세요.", "timeout", uploadExtra);
    }
    if (e instanceof GeminiError) {
      // 부모가 읽을 말로 적힌 것은 429(한도·몰림)뿐이다. 나머지는 원문(HTTP 본문·키 설정 안내)이라 보이지 않는다.
      const msg =
        e.status === 429
          ? e.message
          : e.status === 422
            ? "그림이 안전 검사에 걸렸어요. 생김새 문구를 조금 바꿔 다시 해 주세요."
            : "그림을 그리지 못했어요. 잠시 뒤 다시 해 주세요.";
      // 구글의 상태 코드를 그대로 넘기지 않는다 — 401/403(키 문제)은 화면에서 '다시 로그인',
      // 503(몰림·키 없음)은 '준비 안 됨'으로 읽혀 엉뚱한 버튼이 뜬다. 429·422 만 살리고 나머지는 502.
      const status = e.status === 429 || e.status === 422 ? e.status : 502;
      return failAndRefund(status, msg, "draw");
    }
    if (stage === "upload") {
      return failAndRefund(502, "그림을 올리지 못했어요. 잠시 뒤 다시 해 주세요.", "upload", uploadExtra);
    }
    return failAndRefund(500, "그림을 마무리하지 못했어요. 잠시 뒤 다시 해 주세요.", stage);
  }

  // ⑦ '받았음' — 이 뒤로는 되돌릴 수 없다. 그 사이 값이 되돌려졌으면(열쇠가 바뀜) 그림을 주지 않는다.
  if (charge) {
    const done = await finishDraw(caller, input.memberId, charge, pic);
    if (done === false) {
      return fail(409, "결제가 취소돼 그림을 드릴 수 없어요.", "cancelled");
    }
    if (done === null) {
      // 적혔는지 모른다 — 되돌려 본다. 되돌렸으면 그림을 주지 않고, 이미 적혀 있었으면(응답만 잃음) 그림을 준다.
      const r = await refundDraw(caller, input.memberId, charge);
      if (!r?.delivered) {
        const refunded = r?.refunded === true;
        const note = refundNote(charge, refunded);
        return fail(500, `그림을 드리지 못했어요. 잠시 뒤 다시 해 주세요.${note}`, "finish", {
          refunded,
          tokens: r?.tokens ?? null,
        });
      }
    }
  } else if (caller.isMaster) {
    // 마스터는 값을 안 내 '받았음'을 안 거친다 — 예전 그림 목록(DB 기록)에 보이게 이름만 적는다. 실패해도 그림은 준다.
    await recordMasterPicture(caller, input.memberId, pic);
  }
  clock.mark("finish");
  // 단계마다 걸린 ms(단계 이름과 숫자만) — 느려지는 단계를 실패하기 전에 본다.
  console.info("[family/portrait] 단계 시간", input.memberId, draw, withPhoto ? "사진" : "칩", input.penline ? "펜선" : "수채화", clock.summary());

  // ⑧ photoFallback — 사진이 거절돼 대신 그렸을 때만('features' 사진 속 특징으로 · 'looks' 고르신 특징으로).
  //    카드 글은 싣지 않는다. 이 표시는 DB(last_pic)에도 적지 않는다 — 화면이 그 자리에서 한 줄 알리는 데만 쓴다.
  return NextResponse.json({
    url: pic.url,
    ref: pic.ref,
    at: pic.at,
    transparent: pic.transparent,
    charged: charge?.charged ?? 0,
    draw,
    freeRedrawLeft: charge ? freeRedrawsLeft(charge.draw) : 1,
    tokens: charge ? charge.tokens : null,
    // 관리실이 더해 준 무료 생성 — 썼나 · 남은 횟수(화면이 안내 숫자를 맞춘다)
    ...(charge ? { freeUsed: charge.freeUsed } : {}),
    ...(charge && charge.freeLeft !== null ? { freeLeft: charge.freeLeft } : {}),
    ...(pic.headRatio !== undefined ? { headRatio: pic.headRatio } : {}),
    ...(pic.bodyStretch !== undefined ? { bodyStretch: pic.bodyStretch } : {}),
    ...(fallback ? { photoFallback: fallback } : {}),
    // fe 비교용 — 펜선으로 그렸다는 표시(fe 확인 화면에만 한 줄). 고객 응답에는 싣지 않는다.
    ...(input.penline && isDevUser(caller.username) ? { penline: true } : {}),
  });
}

/**
 * 응답을 잃었을 때 — 이 사람의 지금 형편과 마지막으로 건넨 그림.
 * 90초가 넘도록 안 건넨 그리기는 여기서 되돌린다(서버는 이미 끝났다 — 함수 제한 60초).
 */
export async function GET(request: Request) {
  const caller = await callerOf(request);
  if (!caller) return fail(401, "로그인이 필요합니다.", "login");

  const memberId = new URL(request.url).searchParams.get("memberId") ?? "";
  if (!MEMBER_ID.test(memberId)) return fail(400, "가족 id 가 올바르지 않아요.", "input");

  // 마스터는 셈을 안 하므로 되찾을 기록도 없다.
  if (caller.isMaster) {
    return NextResponse.json({ draws: 0, delivered: 0, pending: false, refunded: false, pic: null, tokens: null });
  }

  let data: unknown;
  let error: DbError;
  try {
    ({ data, error } = await caller.db.rpc("family_portrait_status", { p_member: memberId }));
  } catch (e) {
    console.error("[family/portrait] 형편 묻기 실패", e);
    return fail(500, "지금은 확인하지 못했어요. 잠시 뒤 다시 해 주세요.", "status");
  }
  if (error) {
    if (missingFunction(error)) return fail(503, "가족 그리기 준비가 아직 안 됐어요. 관리자에게 알려 주세요.", "setup");
    console.error("[family/portrait] 형편 묻기 거절", error.code, error.message);
    return fail(500, "지금은 확인하지 못했어요. 잠시 뒤 다시 해 주세요.", "status");
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const p = d.pic as Record<string, unknown> | null | undefined;
  const https = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u) && u.length <= 500;
  const headRatio = cleanHeadRatio(p?.headRatio);
  const bodyStretch = cleanBodyStretch(p?.bodyStretch);
  const pic =
    p && typeof p === "object" && https(p.url) && https(p.ref)
      ? {
          url: p.url,
          ref: p.ref,
          at: typeof p.at === "string" ? p.at : "",
          transparent: p.transparent !== false,
          ...(headRatio !== undefined ? { headRatio } : {}),
          ...(bodyStretch !== undefined ? { bodyStretch } : {}),
        }
      : null;
  return NextResponse.json({
    draws: Number(d.draws) || 0,
    delivered: Number(d.delivered) || 0,
    pending: d.pending === true,
    refunded: d.refunded === true,
    pic,
    tokens: typeof d.tokens === "number" ? d.tokens : null,
  });
}
