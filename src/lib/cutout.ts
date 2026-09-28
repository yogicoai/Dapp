import sharp from "sharp";

/**
 * 가족 캐릭터 그림의 흰 바탕을 지워 투명 PNG 로 만든다.
 *
 * 왜 이렇게 하나: 가족 그림은 홈 액자·앨범에서 색 있는 바탕 위에 올라간다. 흰 네모가 그대로
 * 보이면 스티커처럼 안 붙는다. 그래서 그릴 때 '순수한 흰 바탕'으로 그리게 하고 여기서 지운다.
 *
 * 규칙:
 *  - **네 변에서부터 이어진** 거의 흰 픽셀만 지운다(flood fill). 그림 전체의 흰색을 지우면
 *    흰 양말·눈 흰자·치아가 뚫린다. 윤곽선 안에 갇힌 흰색은 그대로 둔다.
 *  - 지운 곳 바로 옆 가장자리(몇 픽셀)는 흰색이 섞인 정도에 따라 알파를 부드럽게 주고(바로 안쪽
 *    색과 견주어 풀고, 못 찾으면 흰 정도로), 섞여 있던 흰색을 빼서(흰 바탕 기준 역합성) 색 바탕에
 *    올렸을 때 흰·회색 테두리(halo)가 덜 보이게 한다.
 *  - 바탕에 떨어진 작은 얼룩(점 몇 개)은 지운다 — 남으면 여백 자르기가 그 점까지 늘어난다.
 *  - 지운 비율이 0.25 미만(바탕을 흰색으로 안 그림)이거나 0.95 초과(거의 빈 그림)면
 *    지우기를 믿지 않고 원본(흰 바탕)을 여백만 잘라 돌려준다(transparent=false).
 *
 * gemini.ts 의 measureBlankBands/detectBlankCanvasBorder 는 쓰지 않는다 — 흰 바탕을 '빈 테두리'로
 * 보고 잘라 버린다.
 */

export type CutoutResult = {
  /** PNG. transparent=true 면 RGBA(바탕 투명), false 면 흰 바탕 RGB. 둘 다 여백을 자른 것. */
  png: Buffer;
  /** 바탕을 실제로 지웠나 */
  transparent: boolean;
  /** 네 변에서 이어져 지운 픽셀 비율(0~1) */
  clearedRatio: number;
};

/** 거의 흰색 — 세 채널이 다 이 값 이상이고 */
const WHITE_MIN = 236;
/** 채널 사이 차이가 이 값 이하(색이 거의 없음) */
const WHITE_SPREAD = 14;

/** 가장자리 부드럽게(안쪽 색을 못 찾았을 때): 가장 어두운 채널이 이 값 이하면 완전 불투명, 255 면 완전 투명 */
const SOFT_LOW = 185;
/** 지운 곳에서 몇 픽셀 안쪽까지 부드럽게 할지 */
const SOFT_DEPTH = 3;
/** 둘째 픽셀부터는 이만큼 밝은 픽셀을 따라서만 들어간다(어두운 윤곽선에서 멈춘다) */
const SOFT_PASS = 200;
/** 알파가 이보다 작으면 그냥 투명으로 */
const ALPHA_FLOOR = 0.04;

/** 지운 비율이 이 범위 밖이면 지우기를 믿지 않는다 */
const MIN_CLEARED = 0.25;
const MAX_CLEARED = 0.95;

/** 이보다 작은 덩어리는 얼룩으로 보고 지운다(전체 픽셀 비율, 최소 픽셀 수) */
const SPECK_RATIO = 0.0002;
const SPECK_MIN = 24;

/** 흰 바탕으로 돌려줄 때 남길 여백(긴 변 비율) */
const FALLBACK_PAD = 0.03;

type Box = { left: number; top: number; width: number; height: number };

export async function removeWhiteBackground(input: Buffer): Promise<CutoutResult> {
  // 원래 알파가 있으면 흰 바탕에 눕혀 두고 시작한다 — 판단은 늘 '흰 바탕 위 그림' 기준.
  const { data, info } = await sharp(input)
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  if (info.channels !== 4 || n === 0) {
    throw new Error("그림을 읽지 못했어요.");
  }
  const px = data; // RGBA, 이 자리에서 고친다

  const minOf = (i: number) => {
    const o = i * 4;
    return Math.min(px[o], px[o + 1], px[o + 2]);
  };
  const nearWhite = (i: number) => {
    const o = i * 4;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    if (r < WHITE_MIN || g < WHITE_MIN || b < WHITE_MIN) return false;
    return Math.max(r, g, b) - Math.min(r, g, b) <= WHITE_SPREAD;
  };

  /* ① 네 변에서 이어진 거의 흰 픽셀 — 4방향 flood fill */
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seed = (i: number) => {
    if (!bg[i] && nearWhite(i)) {
      bg[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < n - w) seed(i + w);
  }
  const cleared = tail;
  const clearedRatio = cleared / n;

  if (clearedRatio < MIN_CLEARED || clearedRatio > MAX_CLEARED) {
    return { png: await whiteFallback(px, w, h, bg), transparent: false, clearedRatio };
  }

  /* ② 가장자리 부드럽게 — 지운 곳에서 SOFT_DEPTH 픽셀 안쪽까지(8방향) */
  const depth = new Uint8Array(n);
  head = 0;
  tail = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i]) continue;
    if (touches(bg, i, w, h)) {
      depth[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const d = depth[i];
    if (d >= SOFT_DEPTH || minOf(i) < SOFT_PASS) continue; // 어두운 윤곽선 너머로는 안 들어간다
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
        const j = yy * w + xx;
        if (bg[j] || depth[j]) continue;
        depth[j] = d + 1;
        queue[tail++] = j;
      }
    }
  }

  /*
   * 가장자리 픽셀의 알파 — 바로 안쪽의 '진짜 색'(F)을 알면 C = a·F + (1-a)·흰색 에서 a 를 푼다.
   * 머리카락처럼 어두운 곳의 가장자리는 흰색과 반쯤 섞여 회색이 되는데, 흰 정도만 보면 이 회색이
   * 불투명으로 남아 색 바탕 위에서 회색 테두리가 된다. 안쪽 색을 못 찾으면 흰 정도로만 정한다.
   * 안쪽 픽셀(depth 0)은 이 반복에서 고치지 않으므로 원래 색 그대로 읽힌다.
   */
  const alphaOf = (i: number): number => {
    const o = i * 4;
    const x = i % w;
    const y = (i - x) / w;
    let best = -1;
    let bestD = Infinity;
    for (let dy = -SOFT_DEPTH; dy <= SOFT_DEPTH; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -SOFT_DEPTH; dx <= SOFT_DEPTH; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const j = yy * w + xx;
        if (bg[j] || depth[j]) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
    }
    if (best >= 0) {
      const f = best * 4;
      let a = -1;
      for (let c = 0; c < 3; c++) {
        const room = 255 - px[f + c];
        if (room < 24) continue; // 이 채널은 안쪽 색도 거의 흰색 — 알파를 풀 수 없다
        a = Math.max(a, (255 - px[o + c]) / room);
      }
      if (a >= 0) return Math.min(1, a);
    }
    return Math.min(1, Math.max(0, (255 - minOf(i)) / (255 - SOFT_LOW)));
  };

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (bg[i]) {
      px[o + 3] = 0;
      continue;
    }
    if (!depth[i]) continue;
    const a = alphaOf(i);
    if (a >= 1) continue;
    if (a < ALPHA_FLOOR) {
      px[o + 3] = 0;
      continue;
    }
    // 흰 바탕과 섞인 색에서 흰색을 뺀다: C = a·F + (1-a)·255 → F = (C - (1-a)·255) / a
    for (let c = 0; c < 3; c++) {
      const f = (px[o + c] - (1 - a) * 255) / a;
      px[o + c] = Math.max(0, Math.min(255, Math.round(f)));
    }
    px[o + 3] = Math.round(a * 255);
  }

  /* ③ 얼룩 지우기 + 남은 덩어리의 테두리 상자(여백 자르기) */
  const box = keepBlobs(px, w, h, queue);
  if (!box) {
    // 남길 만한 덩어리가 없다 — 지우기를 믿지 않는다.
    return { png: await whiteFallback(await flatAgain(input), w, h, bg), transparent: false, clearedRatio };
  }

  const png = await sharp(px, { raw: { width: w, height: h, channels: 4 } })
    .extract(box)
    .png()
    .toBuffer();
  return { png, transparent: true, clearedRatio };
}

/** 8방향 이웃 중 지운 픽셀이 있나 */
function touches(bg: Uint8Array, i: number, w: number, h: number): boolean {
  const x = i % w;
  const y = (i - x) / w;
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
      if (bg[yy * w + xx]) return true;
    }
  }
  return false;
}

/**
 * 보이는 픽셀(알파>0)을 8방향 덩어리로 묶어, 작은 덩어리(얼룩)는 투명으로 지우고
 * 남은 덩어리들의 테두리 상자를 돌려준다. 남는 게 없으면 null.
 * queue 는 넘겨받은 것을 다시 쓴다(크기 n).
 */
function keepBlobs(px: Buffer, w: number, h: number, queue: Int32Array): Box | null {
  const n = w * h;
  const minKeep = Math.max(SPECK_MIN, Math.round(n * SPECK_RATIO));
  const seen = new Uint8Array(n);
  let left = w;
  let top = h;
  let right = -1;
  let bottom = -1;

  for (let s = 0; s < n; s++) {
    if (seen[s] || px[s * 4 + 3] === 0) continue;
    // 한 덩어리 모으기
    let head = 0;
    let tail = 0;
    seen[s] = 1;
    queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (seen[j] || px[j * 4 + 3] === 0) continue;
          seen[j] = 1;
          queue[tail++] = j;
        }
      }
    }
    if (tail < minKeep) {
      for (let k = 0; k < tail; k++) px[queue[k] * 4 + 3] = 0;
      continue;
    }
    for (let k = 0; k < tail; k++) {
      const i = queue[k];
      const x = i % w;
      const y = (i - x) / w;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** 원본을 흰 바탕 RGBA 로 다시 읽는다(지우기 도중 px 를 고쳤을 때 되돌리는 용도). */
async function flatAgain(input: Buffer): Promise<Buffer> {
  return sharp(input).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer();
}

/**
 * 흰 바탕 그대로, 여백만 자른다 — 지우지 않은(네 변에서 안 이어진) 픽셀의 상자에 조금 여백을 둔다.
 * 그런 픽셀이 없으면(전부 흰색) 자르지 않는다.
 */
async function whiteFallback(px: Buffer, w: number, h: number, bg: Uint8Array): Promise<Buffer> {
  let left = w;
  let top = h;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bg[y * w + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  let box: Box = { left: 0, top: 0, width: w, height: h };
  if (right >= 0) {
    const pad = Math.round(Math.max(w, h) * FALLBACK_PAD);
    const l = Math.max(0, left - pad);
    const t = Math.max(0, top - pad);
    const r = Math.min(w - 1, right + pad);
    const b = Math.min(h - 1, bottom + pad);
    box = { left: l, top: t, width: r - l + 1, height: b - t + 1 };
  }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } })
    .extract(box)
    .removeAlpha()
    .png()
    .toBuffer();
}
