/**
 * 관리자 페이지 색·그림자 — 토스풍 미니멀(2026-09-16 사장님 지시)을 정식판(2026-09-30)에 맞게 넓혔다.
 *
 * 옛 이름(ui.tsx 의 T: bg·card·line·text·sub·faint·blue…)을 같은 값으로 그대로 둔다 — 옮겨 온 화면이
 * T.card 같은 옛 이름을 써도 깨지지 않게. 새 부품은 아래 새 이름을 쓴다.
 * ui.tsx 에서 가져와 펼치지 않고 값을 다시 적는 까닭: ui.tsx 는 "use client" 파일이라 서버 쪽(page.tsx)이
 * 이 파일을 거치면 값 대신 '클라이언트 참조'가 들어와 펼치기가 깨진다. 값이 바뀌면 두 곳을 함께 고친다.
 *
 * 강조색은 파랑 하나. 빨강은 위험한 일(실패·돈 냈는데 책 없음)에만. 앱 색(주황)은 로고 네모에만.
 * Tailwind 는 글자 그대로 적힌 class 만 찾아 CSS 를 만든다 — 그래서 부품의 className 에는
 * 이 값을 변수로 끼우지 않고 `bg-[#f2f4f6]` 처럼 글자로 적는다. 이 표는 style={} 과 설명용이다.
 */
export const T = {
  // ── 옛 이름(ui.tsx 와 같은 값)
  bg: "#f2f4f6",
  card: "#ffffff",
  line: "#e5e8eb",
  text: "#191f28",
  sub: "#6b7684",
  faint: "#8b95a1",
  blue: "#3182f6",
  blueSoft: "#e8f3ff",
  red: "#f04452",
  redSoft: "#ffeff0",
  green: "#00b26f",
  greenSoft: "#e6f7ef",
  amber: "#ff9500",
  amberSoft: "#fff4e0",
  // ── 정식판에서 더한 이름
  surface: "#ffffff",
  surface2: "#f9fafb",
  lineStrong: "#d1d6db",
  text2: "#4e5968",
  disabled: "#b0b8c1",
  blueHover: "#1b64da",
  blueInk: "#1b64da",
  greenInk: "#00976b",
  amberInk: "#c77700",
  brand: "#f59e0b",
  brandSoft: "#fff7e6",
  demoStripe: "repeating-linear-gradient(135deg,#fff4e0 0 10px,#fffaf1 10px 20px)",
  demoInk: "#8a5a00",
  scrim: "rgba(0,23,51,.32)",
  shadow: "0 10px 30px rgba(0,27,55,.10)",
} as const;

export type BadgeTone = "gray" | "blue" | "green" | "amber" | "red" | "demo";

/** 배지 색 — 글자와 늘 같이 쓴다(색만으로 뜻을 전하지 않는다). */
export const BADGE_TONE: Record<BadgeTone, string> = {
  gray: "bg-[#f2f4f6] text-[#4e5968]",
  blue: "bg-[#e8f3ff] text-[#1b64da]",
  green: "bg-[#e6f7ef] text-[#00976b]",
  amber: "bg-[#fff4e0] text-[#c77700]",
  red: "bg-[#ffeff0] text-[#f04452]",
  demo: "bg-[repeating-linear-gradient(135deg,#fff4e0_0_6px,#fffaf1_6px_12px)] text-[#8a5a00] ring-1 ring-inset ring-[#ffd89a]",
};
