/**
 * 기다리는 화면의 말 — 흘러간 시간·'보통' 걸리는 시간·다 됐을 때 알림 문구·감상할 책 고르기.
 *
 * 왜 필요한가: 대본은 2분 넘게, 그림은 3~5분 걸린다. 그동안 화면에 "쓰고 있어요…" 한 줄만
 * 있으면 부모는 멈춘 줄 알고 창을 닫거나 다시 누른다. 시간이 흐르는 게 보이고 '보통 이쯤'이
 * 보이면 같은 시간도 덜 길게 느낀다. 잠자리에서 쓰는 앱이라, 다 됐을 때 알리는 것도
 * 부모가 다른 앱을 보고 있을 때만 한다 — 판단은 여기, 소리·제목 바꾸기는 화면이 한다.
 *
 * 이 파일은 순수 함수만 둔다(시험하기 쉽게). 브라우저 것(document·AudioContext)은 쓰지 않는다.
 */

/**
 * '보통' 걸리는 시간(초) — 한 곳에서만 고친다.
 *
 * 어디서 잰 값인가(2026-09 운영 실측, 5쪽 동화 기준):
 *  · 줄거리: 20~30초 → 30초
 *  · 대본: 2분~2분 30초 → 2분 (부모에게는 짧은 쪽을 말하고, 넘으면 '조금 더' 문구로 받는다)
 *  · 그림: 인물 시트·장소 시트 준비 30초~1분 → 45초,
 *          그다음 쪽을 2장씩 나란히 그린다 — 두 장 한 묶음에 1분쯤 (그림 전체 3~5분과 맞춘 값)
 */
export const USUAL_WAIT = {
  outlineSec: 30,
  storySec: 120,
  sheetsSec: 45,
  /** 쪽 그림을 한 번에 몇 장 나란히 그리나 — create 화면의 CONCURRENT_IMAGES 와 같다. */
  pagesInParallel: 2,
  /** 나란히 그리는 한 묶음에 걸리는 시간. */
  pageBatchSec: 60,
} as const;

/** 기다림 종류 — 줄거리·대본·그림. */
export type WaitKind = "outline" | "story" | "draw";

/** 초를 "12초" / "1분" / "1분 12초" 로. 음수·NaN 은 0초로 본다. */
export function formatDuration(totalSec: number): string {
  const sec = Number.isFinite(totalSec) ? Math.max(0, Math.floor(totalSec)) : 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** 그림 전체가 보통 몇 초 걸리나 — 시트 준비 + 쪽 묶음 수 × 한 묶음 시간. */
export function usualDrawSec(pageCount: number): number {
  const pages = Math.max(0, Math.floor(pageCount));
  const batches = Math.ceil(pages / USUAL_WAIT.pagesInParallel);
  return USUAL_WAIT.sheetsSec + batches * USUAL_WAIT.pageBatchSec;
}

/** 이 기다림이 보통 몇 초인가. 그림은 쪽 수에 따라 다르다. */
export function usualWaitSec(kind: WaitKind, pageCount = 5): number {
  if (kind === "outline") return USUAL_WAIT.outlineSec;
  if (kind === "story") return USUAL_WAIT.storySec;
  return usualDrawSec(pageCount);
}

/**
 * '보통' 시간을 사람 말로 — 30초 단위로 둥글린다("보통 3분 45초쯤"은 너무 정확해 보여 믿기 어렵다).
 * 1분 미만은 그대로(30초 → "30초").
 */
export function formatUsual(sec: number): string {
  return formatDuration(roundUsual(sec));
}

/** 부모에게 보여 주는 '보통' 초 — 1분 미만은 그대로, 넘으면 30초 단위. 넘김 비교도 이 값으로 한다. */
function roundUsual(sec: number): number {
  return sec < 60 ? sec : Math.round(sec / 30) * 30;
}

/**
 * 하단에 흘러가는 시간 한 줄.
 *
 * "1분 12초 지났어요 · 보통 2분쯤 걸려요".
 * 보통 시간을 넘기면 '보통' 대신 "조금 더 걸리고 있어요" — 약속한 시간이 지났는데
 * 같은 말을 되풀이하면 멈춘 것처럼 보인다. 그래도 멈춘 게 아니라는 뜻만 담는다.
 */
export function waitLine(kind: WaitKind, elapsedMs: number, pageCount = 5): string {
  const elapsedSec = Math.max(0, Math.floor((Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000));
  // 보여 준 값("보통 4분")과 같은 값으로 넘김을 잰다 — 225초로 재면 "4분"이라 해 놓고 3분 46초에 "늦어요"가 된다.
  const usual = roundUsual(usualWaitSec(kind, pageCount));
  const passed = `${formatDuration(elapsedSec)} 지났어요`;
  if (elapsedSec > usual) return `${passed} · 조금 더 걸리고 있어요`;
  return `${passed} · 보통 ${formatDuration(usual)}쯤 걸려요`;
}

/** 기다림 막(busy)이 무엇을 기다리나 — 줄거리 짓기·대본 쓰기·다시 저장하기. */
export type BusyKind = "outline" | "story" | "save";

/**
 * 기다림 막에 쓸 말 — 큰 문구, 흐르는 시간 줄의 종류(없으면 null), 감상 줄을 둘지.
 *
 * 줄거리 화면에서 '다른 이야기로 다시 짓기'도 같은 막을 쓴다. 단계(step)만 보고 고르면
 * 30초짜리 줄거리를 "대본을 쓰고 있어요 · 보통 2분"이라 해서 대본 값이 나간 줄 안다.
 * 그래서 무엇을 기다리는지는 단추를 누를 때 정한 값으로 고른다.
 *  · 감상 줄은 대본(2분)만 — 30초 줄거리·몇 초 저장에 책을 펼치면 읽다 끊긴다.
 */
export function busyWaitText(kind: BusyKind): { headline: string; line: WaitKind | null; showcase: boolean } {
  switch (kind) {
    case "story":
      return { headline: "대본을 쓰고 있어요…", line: "story", showcase: true };
    case "save":
      return { headline: "동화를 책장에 넣고 있어요…", line: null, showcase: false };
    case "outline":
      return { headline: "이야기를 짓고 있어요…", line: "outline", showcase: false };
  }
}

/**
 * 그림 진행 한 줄 — "인물·장소를 준비하고 있어요" / "2 / 5 쪽 · 약 1분 30초 남았어요".
 *
 * 첫 쪽이 나오기 전(시트 준비 30초~1분)에 "0 / 5 쪽"을 띄우면 멈춘 것처럼 보였다.
 * 남은 시간은 지금까지 걸린 시간 ÷ 이번에 그린 장수로 어림한다(예전 화면과 같은 셈).
 *
 * @param restored '이어서 그리기'로 지난번 것을 되살린 장수. 이 장들은 시작하자마자 한꺼번에
 *   들어오므로 '이번에 그린 장'으로 세면 "4 / 5 쪽 · 약 1초 남았어요" 같은 거짓 시간이 나온다.
 *   되살린 장만 있고 새로 그린 장이 아직 없으면 남은 시간 대신 준비 중이라고 말한다.
 */
export function drawProgressLine(drawn: number, total: number, elapsedMs: number, restored = 0): string {
  if (drawn <= 0) return "인물·장소를 준비하고 있어요";
  const head = `${drawn} / ${total} 쪽`;
  if (drawn >= total) return head;
  const fresh = drawn - Math.max(0, restored);
  if (fresh <= 0) return `${head} · 남은 쪽을 그릴 준비를 하고 있어요`;
  const perPage = Math.max(0, elapsedMs) / fresh;
  const left = Math.ceil((perPage * (total - drawn)) / 1000);
  return left > 0 ? `${head} · 약 ${formatDuration(left)} 남았어요` : head;
}

/** 다 됐을 때 알릴 일 — 동화 완성·대본 나옴·책장에 못 넣음. */
export type NoticeKind = "done" | "script" | "saveFailed";

/** 알림에 쓸 말 — 탭 제목·배너 문구·배너 단추. */
export function noticeText(kind: NoticeKind): { title: string; banner: string; action: string } {
  switch (kind) {
    case "done":
      return { title: "✅ 동화가 완성됐어요", banner: "✅ 동화가 완성됐어요", action: "보러 가기" };
    case "script":
      return { title: "✍️ 대본이 나왔어요", banner: "✍️ 대본이 나왔어요", action: "대본 보기" };
    case "saveFailed":
      return { title: "⚠️ 저장 확인이 필요해요", banner: "⚠️ 책장에 넣지 못했어요", action: "확인하기" };
  }
}

/** 알림 판단에 필요한 만들기 화면 상태 — 단계·대기 중인지·저장 실패가 떠 있는지. */
export type NoticeState = { step: string; busy: boolean; saveFailed: boolean };

/**
 * 앞 화면 → 지금 화면으로 바뀐 것을 보고 알릴 일을 고른다. 없으면 null.
 *
 *  · 대본: 줄거리 화면에서 기다리다(busy) 대본 화면으로 넘어왔을 때만. 임시저장을 되살려
 *    대본 화면으로 온 것은 기다린 게 아니므로 알리지 않는다.
 *  · 완성: 완성 화면이 새로 떴을 때.
 *  · 저장 실패: 실패 안내가 새로 떴을 때(이미 떠 있던 것을 또 알리지 않는다).
 */
export function noticeFor(prev: NoticeState, next: NoticeState): NoticeKind | null {
  if (next.step === "done" && prev.step !== "done") return "done";
  if (next.saveFailed && !prev.saveFailed) return "saveFailed";
  if (prev.step === "outline" && prev.busy && next.step === "story") return "script";
  return null;
}

/** 감상할 책 한 권 — 표지 줄에 필요한 것만. */
export type ShowcaseBook = { id: string; title: string; coverImage: string };

type ShelfBook = { id: string; title: string; coverImage?: string | null; hidden?: boolean };

/**
 * 기다리는 동안 감상할 제공 동화를 고른다.
 *
 * 서가에서 숨긴 책(다듬는 중)은 빼고, 표지 그림이 있는 책만 — 표지 없는 동그라미는 눌러 보고 싶지 않다.
 * 전래동화·세계명작을 번갈아 세운다 — 한쪽만 줄줄이 나오면 "명작도 있어요"가 안 보인다.
 */
export function pickShowcaseBooks(folk: ShelfBook[], classic: ShelfBook[]): ShowcaseBook[] {
  const ok = (b: ShelfBook): b is ShelfBook & { coverImage: string } =>
    !b.hidden && typeof b.coverImage === "string" && b.coverImage.trim() !== "";
  const a = folk.filter(ok);
  const b = classic.filter(ok);
  const out: ShowcaseBook[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push({ id: a[i].id, title: a[i].title, coverImage: a[i].coverImage });
    if (i < b.length) out.push({ id: b[i].id, title: b[i].title, coverImage: b[i].coverImage });
  }
  return out;
}
