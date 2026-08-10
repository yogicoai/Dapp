/**
 * 녹음 조각 길이 다듬기 — 계산만 하는 자리라 브라우저 오디오 장치가 필요 없다.
 *
 * parent-voice.ts에 두면 Supabase 등을 함께 불러와서 테스트에서 열 수가 없다.
 * 규칙만 따로 빼 두면 그대로 시험할 수 있다.
 */

/**
 * 조각들이 상한을 넘을 때, 조각마다 얼마씩 남길지 정한다.
 *
 * 그냥 이어 붙인 뒤 뒤를 자르면 마지막 조각이 통째로 사라진다 — 서로 다른 두 문장을
 * 읽게 해 놓고 두 번째를 버리면 발음 재료가 반으로 준다. 그래서 조각마다 공평하게
 * 나누되, 짧아서 안 쓰는 몫은 다음 조각에 넘겨 상한을 알뜰히 채운다.
 */
export function capPieceLengths(lengths: number[], cap: number): number[] {
  const total = lengths.reduce((n, len) => n + len, 0);
  if (total <= cap || lengths.length === 0) return [...lengths];

  const kept = new Array<number>(lengths.length).fill(0);
  let left = cap;
  let remaining = lengths.length;
  // 짧은 조각부터 채워야 남는 몫이 긴 조각으로 정확히 흘러간다.
  for (const i of lengths.map((_, index) => index).sort((a, b) => lengths[a] - lengths[b])) {
    const share = Math.floor(left / remaining);
    kept[i] = Math.min(lengths[i], share);
    left -= kept[i];
    remaining--;
  }
  return kept;
}
