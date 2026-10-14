/**
 * 같은 장소를 두 번째 이후로 그리는 쪽의 카메라(사장님 2026-10-14 "같은 장소의 둘째 쪽은 더 가깝게 찍거나 다른 각도로").
 *
 * 시장 나들이 책(my-mv7k3fid)에서 시장 두 쪽(2·3쪽)과 호수 공원 두 쪽(4·5쪽)이 카메라 자리까지 거의 같아, 인물만 조금
 * 움직인 같은 그림처럼 보였다. 장소를 맞추려고 장소 기준 그림과 앞 쪽 그림을 강하게 따르게 해 둔 것이(쪽 그림 라우트의
 * LOCATION LOCK·SAME LOCATION LOCK) 구도까지 따라가게 했다. 장소의 바닥·색·재료는 그대로 두고 카메라만 바꾸라고 이른다.
 *
 * visit — 이 장소를 이 책에서 몇 번째로 그리는가(0 = 처음). 화면이 책 흐름으로 세어 보낸다(placeVisits).
 * 처음 쪽은 지금처럼 장소가 잘 보이는 넓은 그림, 그다음부터 가까이 → 낮은 각도·반대쪽 → … 돌아가며.
 * 순수 함수만 둔다(node --test).
 */

const SHOTS: readonly string[] = [
  "Move in closer: a medium shot at the characters' eye level, the characters filling much more of the frame, seen from a clearly different side of the place (turn the camera about 45 degrees from the usual view). Only part of the place shows behind them.",
  "Change the angle again: look from the opposite side of the place (a reverse angle), or from a low camera looking slightly up at the characters, so the background behind them is a different part of the same place.",
  "Try a high, gentle view looking down on the characters from one side, with the ground of the place filling the lower part of the frame.",
];

/** 이 쪽에 넣을 카메라 줄 — 처음 그리는 장소(visit 0)면 없다 */
export function cameraLines(visit: number): string[] {
  if (!Number.isInteger(visit) || visit < 1) return [];
  const shot = SHOTS[(visit - 1) % SHOTS.length];
  return [
    "CAMERA FOR THIS PAGE — this place was already drawn on an earlier page from its usual viewpoint. Do NOT reuse that camera position, distance or framing: this page must not look like the same picture with the characters moved.",
    shot,
    "Keep the place itself exactly the same — its ground, colours, materials and kind of place. Only the camera changes.",
  ];
}

/** 검수 줄 — 일부러 바꾼 구도를 '장소 표지가 덜 보인다'고 떨어뜨리지 않게 */
export function cameraCheckLines(visit: number): string[] {
  if (!Number.isInteger(visit) || visit < 1) return [];
  return [
    "CAMERA NOTE — this page deliberately uses a closer or different camera angle than the other page of this place. Do not fail it because some landmarks of the place are cropped or out of view, or because the framing differs from the reference; fail the place only if what IS visible contradicts it (a different kind of ground, colours or place).",
  ];
}

/**
 * 책 전체에서 — 쪽마다 그 장소를 몇 번째로 그리는가. keys 는 쪽 순서대로 그 쪽의 장소 열쇠(같은 곳이면 같은 글자, 모르면 빈 글자).
 * 장소를 모르는 쪽은 0(처음처럼 그린다).
 */
export function placeVisits(keys: readonly string[]): number[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    if (!key) return 0;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n;
  });
}
