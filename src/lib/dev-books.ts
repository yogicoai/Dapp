/**
 * fe 전용 책(개발자 모드) — 책 아이디 앞머리 "my-dev-" 로 가른다.
 *
 * 2026-10-26 사장님: "fe에서만 나오면 돼", "어드민 단에서는 해당 동화에 대한 존재가 안 뜨게 해 주면 되는 거야".
 * - 책은 fe 의 books 줄이라 fe 책장에만 보인다(RLS: 자기 책만).
 * - 관리실(서버 api/admin/* 와 관리 화면이 부르는 prefs 의 마스터 함수)은 이 책을 세지도, 제목을 보여 주지도 않는다.
 *   책을 읽는 쿼리마다 `.not("id", "like", DEV_BOOK_LIKE)` 를 붙인다 — dev-books.test 가 빠진 곳을 잡는다.
 * - 아이디는 my- 로 시작하므로 뷰어·쪽 다시 그리기 같은 '내가 만든 동화' 길과 아이디 모양 검사(^my-…)는 그대로 통과한다.
 */
export const DEV_BOOK_PREFIX = "my-dev-";

/** PostgREST like 패턴 — 관리실 쿼리에 `.not("id", "like", DEV_BOOK_LIKE)` 로 쓴다. */
export const DEV_BOOK_LIKE = `${DEV_BOOK_PREFIX}%`;

/** fe 전용 책 아이디인가. */
export function isDevBookId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(DEV_BOOK_PREFIX);
}

/** fe 전용 책이 놓일 제공 서가 — 책 데이터의 shelf 칸. 없으면 '우리 가족 책장'(만든 동화)에 그대로 있다. */
export type DevShelf = "folk" | "classic";

/**
 * 내 책 목록에서 fe 전용 전래동화·세계명작을 골라낸다(2026-10-26 사장님 "fe 계정으로 새로 추가되는 애들은 동화 맨 앞으로").
 * 홈은 folk·classic 을 그 서가 맨 앞에 놓고, '우리 가족 책장'에는 rest 만 둔다(두 번 보이지 않게).
 * 내 책은 RLS 로 자기 것만 오므로 fe 에게만 해당한다. 순서는 받은 그대로(최신 먼저).
 */
export function splitDevShelves<T extends { id: string; shelf?: string | null }>(
  books: readonly T[],
): { folk: T[]; classic: T[]; rest: T[] } {
  const folk: T[] = [];
  const classic: T[] = [];
  const rest: T[] = [];
  for (const b of books) {
    if (isDevBookId(b.id) && b.shelf === "folk") folk.push(b);
    else if (isDevBookId(b.id) && b.shelf === "classic") classic.push(b);
    else rest.push(b);
  }
  return { folk, classic, rest };
}
