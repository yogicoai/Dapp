/**
 * 앱을 새로 켤 때의 '동화 나라로 이동 중' 화면(components/AppIntro)에 쓰는 순수 도구 — 2026-10-21 사장님
 * "검은 화면보다 디자인적으로 뭐 더".
 *  · 밤하늘 별 — 그림 파일 없이 box-shadow 점으로 찍는다(서버 HTML 에 바로 들어가 첫 그림부터 보이고, 받을 것이 없다).
 *    자리는 고정 씨앗으로 정해 서버·화면이 늘 같다(hydration 이 어긋나지 않는다).
 *  · 홈 준비 신호 — 홈이 로그인·책장까지 다 읽고 진짜 화면을 그리면 알린다. 소개 화면은 그때 '도착'하며 걷혀,
 *    홈의 준비 화면(마스코트 카드)이 한 번 더 끼지 않는다.
 *  · 책 표지 글 — 로그인한 가족이면 아이 이름으로 '하온이의 동화 나라'(사장님 10-21 "로그인 된 상태라면").
 */
import { hasBatchim } from "./family.ts";

/** 소개 화면의 차례 — 밤하늘(travel) → 책이 날아옴(book) → 표지가 열림(open) → 책 속으로(dive) → 걷힘(leave).
 *  책 그림이 늦으면 책 없이 나라 배경으로 바로 도착(arrive) → 걷힘. */
export type IntroPhase = "travel" | "book" | "open" | "dive" | "arrive" | "leave";

/** '하온' → '하온이' · '지우' → '지우' — 이름 뒤에 '의'를 붙일 때 */
function nameStem(name: string): string {
  return `${name}${hasBatchim(name) ? "이" : ""}`;
}

/** 책 표지 제목 — 아이 이름을 알면 '하온이의 동화 나라', 모르면(손님·처음 기기) '동화 나라' */
export function introBookTitle(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n ? `${nameStem(n)}의 동화 나라` : "동화 나라";
}

/** 책 아래 한 줄 — '하온이의 동화 나라로 가는 중', 이름을 모르면 '동화 나라로 이동 중'(점 셋은 화면이 붙인다) */
export function introTravelLine(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n ? `${nameStem(n)}의 동화 나라로 가는 중` : "동화 나라로 이동 중";
}

/** 0~1 사이 같은 순서의 수 — 씨앗이 같으면 늘 같은 별자리 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 별 count 개를 box-shadow 한 줄로 — 화면 크기와 상관없이 고르게(vw·vh). 1px 점 하나에 그림자로 붙이고,
 * size 는 그 점의 크기(css)라 여기서는 자리·밝기만 정한다.
 */
export function starShadows(count: number, seed: number): string {
  const rand = seeded(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rand() * 100).toFixed(2);
    const y = (rand() * 100).toFixed(2);
    const a = (0.45 + rand() * 0.55).toFixed(2);
    out.push(`${x}vw ${y}vh 0 0 rgba(255,255,255,${a})`);
  }
  return out.join(", ");
}

let homeReady = false;
const waiters = new Set<() => void>();

/** 첫 화면이 떴다 — 홈이 진짜 화면을 그렸거나(app/page), 손님이 로그인 화면으로 갔다(AppIntro). 여러 번 불러도 한 번만 알린다 */
export function markHomeReady(): void {
  if (homeReady) return;
  homeReady = true;
  waiters.forEach((cb) => cb());
  waiters.clear();
}

/** 홈이 준비되면 부른다(이미 준비됐으면 바로). 돌려준 함수로 끊는다. */
export function onHomeReady(cb: () => void): () => void {
  if (homeReady) {
    cb();
    return () => {};
  }
  waiters.add(cb);
  return () => {
    waiters.delete(cb);
  };
}
