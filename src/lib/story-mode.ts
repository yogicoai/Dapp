/**
 * 동화 몰입 모드 — 전체화면 + 가로 고정.
 *
 * 규칙: 가로 고정(orientation.lock)은 "전체화면 상태"에서만 허용되고,
 * 전체화면 요청은 "사용자 제스처(클릭) 안"에서만 허용된다.
 * 그래서 책을 여는 클릭 핸들러에서 이 함수를 불러야 한다 — 클라이언트
 * 내비게이션(App Router)은 같은 문서라 전체화면이 책 화면까지 유지된다.
 *
 * 안 되는 환경(아이폰 사파리, 데스크톱의 가로 고정 등)은 조용히 넘어간다 —
 * 그 경우 뷰어의 회전 안내 힌트(OrientationHint)가 대신 일한다.
 */
export function enterStoryMode(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const request = () =>
    document.fullscreenElement ? Promise.resolve() : root.requestFullscreen();
  request()
    .then(() => {
      const o = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      return o.lock?.("landscape");
    })
    .catch(() => {
      /* 미지원 환경 — 힌트가 대신한다 */
    });
}

export function exitStoryMode(): void {
  if (typeof document === "undefined") return;
  try {
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
  } catch {
    /* 무시 */
  }
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}
