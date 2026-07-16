/**
 * 세로로 들고 있으면 화면을 덮고 가로로 돌리라고 안내한다.
 *
 * 진짜 방향 잠금(screen.orientation.lock)은 iOS Safari가 지원하지 않아서 웹에서는
 * 강제할 수 없다. 네이티브 앱으로 옮길 때 expo-screen-orientation으로 대체한다.
 * 그때까지는 CSS만으로 도는 이 안내가 최선이다.
 */
export function OrientationGate() {
  return (
    <div className="fixed inset-0 z-50 hidden portrait:flex flex-col items-center justify-center gap-6 bg-neutral-950 px-10 text-center">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-16 w-16 animate-pulse text-white/80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="2" width="16" height="20" rx="2.5" />
        <path d="M10 18.5h4" />
        <path d="M20.5 15.5a9 9 0 0 1-3 3.6" />
        <path d="M17.5 15.4h3.2v3.2" />
      </svg>
      <p className="text-lg font-medium text-white">기기를 가로로 돌려주세요</p>
      <p className="text-sm leading-relaxed text-white/60">
        동화는 가로 화면에서 가장 예쁘게 보여요.
      </p>
    </div>
  );
}
