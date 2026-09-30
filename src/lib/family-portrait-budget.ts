/**
 * 우리 가족 캐릭터 그리기(api/family/portrait)의 시간표 — 모두 **요청이 들어온 때부터** 잰 ms.
 *
 * 함수 제한 60초(배포 Vercel Hobby) 안에서: 그리기 → 머리 재기·(다시 그리기)·몸 늘이기 → 흰 바탕 지우기 → cafe24 올리기
 * → '받았음' 적기(또는 되돌리기). 올리기가 잘리면 그린 그림 값(약 95원)이 버려지고 쿠키를 되돌려야 한다.
 *
 * 2026-09-30 배포에서 두 사람이 한꺼번에 '그림을 올리지 못했어요' — 전날 머리 재기·몸 늘이기를 더하면서 없어도 되는 단계가
 * 올리기 몫을 먹을 수 있었다. 그래서 **올리기 몫(UPLOAD_RESERVE_MS)을 먼저 떼어 두고**, 없어도 되는 단계(머리 재기·다시
 * 그리기·몸 늘이기)는 OPTIONAL_END_MS 전에만 한다. 꼭 해야 하는 그리기(DRAW_DEADLINE_MS)·대신 그리기(FALLBACK_DEADLINE_MS)는
 * 예전 그대로다 — 대신 그리기 뒤에는 올리기 몫이 모자랄 수 있어, 그때는 로그로 남긴다(api/family/portrait).
 * 단계마다 걸린 시간은 stageClock 으로 적어 성공·실패 로그에 싣는다(단계 이름과 ms 숫자만 — 사진·카드·프롬프트는 없다).
 *
 * 이 파일은 순수 셈만 한다(시험: family-portrait-budget.test.ts).
 */

/** 함수 제한 — api/family/portrait 의 maxDuration(초)과 같아야 한다(시험이 route.ts 글을 읽어 맞춰 본다). */
export const FUNCTION_MAX_MS = 60_000;

/** 이때까지 그리기를 끊는다 — 나머지로 지우기·올리기·'받았음'·되돌리기를 한다. */
export const DRAW_DEADLINE_MS = 45_000;
/** 그 사이 앞 단계가 길어져도 그리기에는 최소 이만큼은 준다 */
export const DRAW_MIN_MS = 5_000;
/** 올리기는 여기까지 끝나야 한다(함수 제한 60초 — '받았음'·되돌리기 몫을 남긴다). cafe24 연결도 이때 끊는다. */
export const UPLOAD_DEADLINE_MS = 55_000;
/** 올리기에 이만큼도 안 남았으면 올리지 않고 되돌린다 */
export const UPLOAD_MIN_MS = 3_000;
/**
 * 올리기 몫 — 없어도 되는 단계가 이만큼은 남기고 끝나야 한다. 두 장(PNG ~150KB + JPEG)을 한 세션으로 올리면 서울 배포에서
 * 1초 안쪽, 미국 배포에서 약 6~7초(FTP 는 명령마다 한 번씩 오가서 태평양을 30번쯤 건넌다) — 그래서 8초.
 */
export const UPLOAD_RESERVE_MS = 8_000;
/** 흰 바탕 지우기 + PNG·JPEG 만들기(sharp) 몫 — 보통 1~2초 */
export const CUTOUT_RESERVE_MS = 2_000;
/** 올리기 뒤 '받았음' 적기(두 번까지)·되돌리기 몫 */
export const FINISH_RESERVE_MS = 5_000;
/** 올리기 마감(UPLOAD_DEADLINE_MS)이 cafe24 연결을 먼저 끊도록 바깥 안전 제한에 더 주는 틈 — 실패 코드가 남게 */
export const UPLOAD_SAFETY_MS = 1_000;

/** 참고 그림 받기 — 이보다 오래 걸리면 참고 없이 그린다(fetch 는 기본 제한이 몇 분이다). */
export const REF_TIMEOUT_MS = 6_000;
/**
 * 특징 카드 — 사진 그리기는 카드가 시작된 때부터 이만큼까지만 기다린다. 늦으면 카드 없이 사진으로 그리고, 카드는 계속
 * 기다려 대신 그리기에 쓴다. 보통 몇 초면 온다.
 */
export const CARD_WAIT_MS = 6_000;
/** 특징 카드 요청 자체의 제한 — 넘으면 끊는다(카드 없이 간다). */
export const CARD_TIMEOUT_MS = 12_000;
/**
 * 얼굴 클로즈업 만들기 — 사진 한 장 자르고 줄이기라 보통 수십 ms. 이보다 걸리면 클로즈업 없이 그린다
 * (그리기 제한 시각은 그대로라 504 쪽으로 밀리지 않는다 — 그리기 몫에서 많아야 이만큼 준다).
 */
export const CLOSEUP_TIMEOUT_MS = 1_000;
/**
 * 대신 그리기(사진 거절 뒤, 사진 없이)는 여기까지 끝나야 한다 — 그리기 제한(45초)보다 3초 길게 준다(꼭 해야 하는 단계라
 * 올리기 몫보다 앞선다). 지우기 1~2초 뒤 올리기에 5초쯤 남는다 — 올리기 몫(8초)보다 적어 로그로 남긴다.
 * 남은 시간이 PHOTO_FALLBACK_MIN_MS(lib/family-portrait-prompt)보다 적으면 시작하지 않는다.
 * (함수 제한 60초를 늘리면 여유가 생기지만, 배포(Vercel Hobby) 한도를 넘기면 배포 전체가 막혀 건드리지 않았다.)
 */
export const FALLBACK_DEADLINE_MS = 48_000;

/** 없어도 되는 단계(머리 재기·다시 그리기·몸 늘이기)는 이 시각 전에만 — 뒤로 지우기·올리기 몫을 떼어 둔다(= 45초). */
export const OPTIONAL_END_MS = UPLOAD_DEADLINE_MS - UPLOAD_RESERVE_MS - CUTOUT_RESERVE_MS;
/**
 * 머리 재기는 여기까지 끝나야 한다(재기 한 번은 lib/family-head-check HEAD_CHECK_TIMEOUT_MS 8초에서도 끊는다).
 * 재기를 시작하려면 HEAD_CHECK_MIN_MS(4초)가 남아야 해서, 그리기가 41초 넘어 끝나거나 대신 그리기(48초까지) 뒤면 재지 않고 건넨다.
 * (예전 46초 → 올리기 몫을 떼며 45초.)
 */
export const HEAD_CHECK_DEADLINE_MS = Math.min(DRAW_DEADLINE_MS + 1_000, OPTIONAL_END_MS);
/**
 * 머리가 표에서 많이 벗어나 다시 그릴 때 — 여기까지 끝나야 하고, 시작하려면 그때까지 max(PHOTO_FALLBACK_MIN_MS, 처음 그리기에
 * 걸린 시간)이 남아야 한다(같은 크기 그림을 한 번 더 그리니 비슷하게 걸린다). 처음 그리기가 칩으로 약 19초, 사진으로 약 14초
 * 안에 끝났을 때만 다시 그린다 — 드물다(로그 'no-time-redraw'). 늦거나 실패해도 처음 그림을 건네므로 504 는 나지 않는다.
 */
export const HEAD_REDRAW_DEADLINE_MS = Math.min(DRAW_DEADLINE_MS, OPTIONAL_END_MS);
/** 몸 늘이기는 이 시각 전에만 시작한다 — 수십~백여 ms 라 그 뒤 지우기·올리기 몫이 그대로 남는다. (예전 47초 → 45초.) */
export const STRETCH_DEADLINE_MS = OPTIONAL_END_MS;

/** 없어도 되는 단계를 지금 시작해도 되나 — until(기본 OPTIONAL_END_MS) 전이면 true */
export function optionalAllowed(startedAt: number, now: number = Date.now(), until: number = OPTIONAL_END_MS): boolean {
  return now - startedAt < until;
}

/** 올리기 마감까지 남은 ms(음수일 수 있다) */
export function uploadLeft(startedAt: number, now: number = Date.now()): number {
  return startedAt + UPLOAD_DEADLINE_MS - now;
}

/** 단계 이름 — 정해진 것만 받는다(로그에 사진·카드·프롬프트 같은 글이 끼어들 틈을 타입으로 막는다). */
export type PortraitStage = "auth" | "charge" | "refs" | "draw" | "head" | "stretch" | "cutout" | "upload" | "finish";

/**
 * 단계 시계 — mark(단계)는 그 단계가 끝난 때를 적는다. summary() 는 "auth=120 charge=360 … total=33210" 처럼
 * 단계마다 걸린 ms(앞 표시부터)와 요청 시작부터의 합만 — 로그에 그대로 싣는다.
 */
export function stageClock(startedAt: number, now: () => number = Date.now) {
  const marks: { stage: PortraitStage; at: number }[] = [];
  const since = () => Math.max(0, Math.round(now() - startedAt));
  return {
    mark(stage: PortraitStage): void {
      marks.push({ stage, at: since() });
    },
    /** 요청 시작부터 지금까지 ms */
    elapsed: since,
    summary(): string {
      let prev = 0;
      const parts = marks.map(({ stage, at }) => {
        const part = `${stage}=${at - prev}`;
        prev = at;
        return part;
      });
      parts.push(`total=${since()}`);
      return parts.join(" ");
    },
  };
}

export type StageClock = ReturnType<typeof stageClock>;
