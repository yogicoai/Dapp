/**
 * 본문이 칸을 넘칠 때 얼마나 줄일지 고른다 — 그림책에 스크롤바가 보이면 책이 아니게 된다.
 *
 * DOM 재기와 분리해 둔다. 실제 크기는 브라우저만 알지만 "얼마나 줄일까"를 고르는 셈법은
 * 순수하게 떼어낼 수 있고, 그래야 테스트로 지킬 수 있다. 예전에 이 셈법이 조용히
 * 어긋나 긴 쪽 마지막 줄이 뭉텅 잘려 나갔는데 아무도 몰랐다.
 */

/** 아무리 길어도 이보다 작게는 줄이지 않는다 — 더 줄이면 아이가 못 읽는다. */
export const MIN_FIT = 0.42;

/**
 * 들어가는 가장 큰 배율을 찾는다(이분 탐색).
 *
 * @param fits  그 배율로 그렸을 때 칸에 들어가는지. 브라우저에서는 실제로 글자 크기를
 *              바꿔 보고 재는 함수가 들어온다.
 * @param min   더 줄이지 않을 바닥값.
 * @param steps 재는 횟수. 9번이면 1~0.42 구간을 0.2% 안쪽까지 좁힌다.
 * @returns     1이면 줄일 필요가 없다는 뜻.
 *
 * 바닥값에서도 안 들어가면 바닥값을 준다 — 조금 잘리더라도 글자가 읽을 수 없을
 * 만큼 작아지는 것보다 낫다.
 */
export function fitScale(
  fits: (scale: number) => boolean,
  min = MIN_FIT,
  steps = 9,
): number {
  if (fits(1)) return 1;
  let low = min;
  let high = 1;
  for (let n = 0; n < steps; n++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * 표지 리본 안에 들어가도록 제목 글자를 얼마나 줄일지.
 *
 * 리본(표지 틀 그림에 그려진 띠)의 흰 자리는 표지 높이의 6~7%밖에 안 된다.
 * 그런데 제목은 두 줄까지 허용돼 있어서, 두 줄이 되는 순간 아랫줄이 리본
 * 밖으로 흘러내렸다 — "팥죽 할머니와 호랑이"의 '랑이'가 리본 아래 표지 위에
 * 떠 있었다(사장님 제보).
 *
 * 브라우저에서 재지 않고 글자 수로 정한다. 표지는 한 화면에 여러 권이 깔리는데
 * 권마다 재면 그릴 때마다 레이아웃이 출렁이고, 제목 길이는 미리 알 수 있다.
 */
export function coverTitleScale(title: string): number {
  const n = [...title.trim()].length;
  if (n <= 6) return 1;
  if (n <= 8) return 0.92;
  if (n <= 10) return 0.84;
  if (n <= 13) return 0.76;
  if (n <= 16) return 0.68;
  return 0.6;
}
