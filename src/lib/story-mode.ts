/**
 * 동화 몰입 모드 — 전체화면 + 가로 고정.
 *
 * 규칙: 가로 고정(orientation.lock)은 "전체화면 상태"에서만 허용되고,
 * 전체화면 요청은 "사용자 제스처(클릭) 안"에서만 허용된다.
 * 그래서 책을 여는 클릭 핸들러에서 이 함수를 불러야 한다 — 클라이언트
 * 내비게이션(App Router)은 같은 문서라 전체화면이 책 화면까지 유지된다.
 *
 * 환경별 사정:
 *  · 크롬·엣지·안드로이드 — 표준 requestFullscreen 그대로 된다.
 *  · 사파리(맥·아이패드) — 예전 버전은 이름이 다르다(webkitRequestFullscreen).
 *    표준이 없으면 이쪽으로 한 번 더 시도한다.
 *  · 아이폰 사파리 — 전체화면 기능 자체가 없다. 브라우저 안에서는 어떤 방법으로도
 *    안 된다. 대신 '홈 화면에 추가'로 열면 주소창 없이 꽉 찬 앱으로 뜬다
 *    (layout.tsx의 appleWebApp 설정이 그걸 켜 준다).
 *  · 안 되는 환경은 조용히 넘어간다 — 뷰어의 회전 안내(OrientationHint)가 대신 일한다.
 */

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function isFullscreen(): boolean {
  const d = document as FsDocument;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** 문서 전체를 전체화면으로 — 이미 전체화면이면 그대로. 사용자가 누른 그 순간에만 된다(브라우저 규칙). */
function requestRootFullscreen(): Promise<unknown> {
  if (isFullscreen()) return Promise.resolve();
  const root = document.documentElement as FsElement;
  if (typeof root.requestFullscreen === "function") return root.requestFullscreen({ navigationUI: "hide" });
  // 예전 사파리 — 표준 이름이 없을 때만 쓴다.
  if (typeof root.webkitRequestFullscreen === "function") {
    return Promise.resolve(root.webkitRequestFullscreen());
  }
  return Promise.reject(new Error("전체화면 미지원"));
}

/*
 * 앱(안드로이드) 안에서는 전체화면을 늘 유지한다(2026-10-21 사장님 — 아이폰 사진처럼 카메라 주변까지 배경을 꽉 채우기).
 * 크롬은 전체화면일 때만 viewport-fit=cover 페이지를 카메라 구멍 아래까지 그린다. 그래서 앱 안에서는 처음 누를 때 전체화면을 켜고
 * (components/AppShellMark), 동화의 '가로로 보기'는 가로 고정만 켜고 끈다 — '원래대로'가 전체화면까지 풀면 띠가 돌아온다.
 */
let appFullscreen = false;
let landscapeLocked = false;
const STORY_MODE_EVENT = "voice-storybook:story-mode";

function announce(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STORY_MODE_EVENT));
}

/** 앱 안이면 켠다 — 그때부터 '원래대로'는 전체화면을 풀지 않는다 */
export function keepAppFullscreen(on: boolean): void {
  appFullscreen = on;
}

/** 앱 안 전체화면 켜기(누를 때마다 불러도 된다 — 이미 전체화면이면 아무것도 안 한다). 안 되는 기기는 조용히 넘긴다. */
export function requestAppFullscreen(): void {
  if (typeof document === "undefined" || isFullscreen()) return;
  requestRootFullscreen().catch(() => {});
}

/** '가로로 보기' 단추가 켜진 상태인가 — 앱 안이면 가로 고정 여부, 웹이면 전체화면 여부 */
export function storyModeNow(): boolean {
  if (typeof document === "undefined") return false;
  return appFullscreen ? landscapeLocked && isFullscreen() : isFullscreen();
}

/** 상태가 바뀔 때(전체화면 들고 나기·가로 고정 켜고 끄기) 부른다. 돌려준 함수로 끊는다. */
export function onStoryModeChange(cb: () => void): () => void {
  const onFullscreen = () => {
    if (!isFullscreen()) landscapeLocked = false; // 전체화면이 풀리면 가로 고정도 함께 풀린다
    cb();
  };
  document.addEventListener("fullscreenchange", onFullscreen);
  window.addEventListener(STORY_MODE_EVENT, cb);
  return () => {
    document.removeEventListener("fullscreenchange", onFullscreen);
    window.removeEventListener(STORY_MODE_EVENT, cb);
  };
}

export function enterStoryMode(): void {
  if (typeof document === "undefined") return;
  requestRootFullscreen()
    .then(() => {
      const o = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      return o.lock?.("landscape");
    })
    .then(() => {
      landscapeLocked = true;
      announce();
    })
    .catch(() => {
      /* 미지원 환경(아이폰 사파리 등) — 힌트가 대신한다 */
    });
}

export function exitStoryMode(): void {
  if (typeof document === "undefined") return;
  try {
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
  } catch {
    /* 무시 */
  }
  landscapeLocked = false;
  announce();
  // 앱 안에서는 전체화면을 그대로 둔다 — 풀면 카메라 자리에 띠가 돌아온다(가로 고정만 푼다).
  if (appFullscreen || !isFullscreen()) return;
  const d = document as FsDocument;
  try {
    if (typeof d.exitFullscreen === "function") {
      void d.exitFullscreen().catch(() => {});
    } else if (typeof d.webkitExitFullscreen === "function") {
      d.webkitExitFullscreen();
    }
  } catch {
    /* 무시 */
  }
}

/*
 * 다음 동화로 넘어갈 때는 전체화면을 풀지 않는다(2026-10-20 사장님 — 전체보기로 듣다가 '이어서 틀기'로 넘어가면 풀려서
 * 세로로 돌아갔다). 책 화면은 닫힐 때 exitStoryModeOnLeave 로 전체화면을 푸는데, 넘어가기 직전에 keepStoryModeForNextBook 을
 * 불러 두면 그 한 번은 풀지 않는다. 같은 문서 안 이동(App Router)이라 전체화면·가로 고정이 다음 책까지 그대로 간다.
 * 잠깐(3초)만 지키는 표시라, 넘어가지 못하고 남아 있어도 나중에 서재로 나갈 때는 평소처럼 푼다.
 */
const KEEP_MS = 3000;
let keepUntil = 0;

export function keepStoryModeForNextBook(): void {
  keepUntil = Date.now() + KEEP_MS;
}

/** 책 화면이 닫힐 때 — 방금 다음 동화로 넘어가는 중이면 전체화면을 그대로 두고, 아니면 푼다. */
export function exitStoryModeOnLeave(): void {
  if (Date.now() < keepUntil) {
    keepUntil = 0;
    return;
  }
  exitStoryMode();
}
