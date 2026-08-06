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

export function enterStoryMode(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement as FsElement;

  const request = (): Promise<unknown> => {
    if (isFullscreen()) return Promise.resolve();
    if (typeof root.requestFullscreen === "function") return root.requestFullscreen();
    // 예전 사파리 — 표준 이름이 없을 때만 쓴다.
    if (typeof root.webkitRequestFullscreen === "function") {
      return Promise.resolve(root.webkitRequestFullscreen());
    }
    return Promise.reject(new Error("전체화면 미지원"));
  };

  request()
    .then(() => {
      const o = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      return o.lock?.("landscape");
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
  if (!isFullscreen()) return;
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
