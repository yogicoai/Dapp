import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { GUIDE_HEIGHT, GUIDE_LINE, GUIDE_MARGIN, GUIDE_WIDTH, guideImage, guideSvg } from "./family-guide.ts";

/** SVG 글에서 머리 타원(cy·ry)과 가로줄 y 들을 읽는다 */
function readSvg(svg: string) {
  const head = /<ellipse cx="[\d.]+" cy="([\d.]+)" rx="[\d.]+" ry="([\d.]+)"\/>/.exec(svg);
  assert.ok(head, "머리 타원이 있다");
  const lines = [...svg.matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)" stroke="#ececec"/g)].map((m) => {
    assert.equal(m[1], m[2], "가로줄");
    return Number(m[1]);
  });
  return { headTop: Number(head[1]) - Number(head[2]), headH: 2 * Number(head[2]), lines };
}

describe("guideSvg — 비율 견본(표 비율로 선 회색 마네킹)", () => {
  const top = GUIDE_HEIGHT * GUIDE_MARGIN;
  const tall = GUIDE_HEIGHT * (1 - 2 * GUIDE_MARGIN);

  for (const ratio of [4, 4.5, 5, 5.5]) {
    it(`1:${ratio} — 머리가 정확히 키의 1/${ratio}, 가로줄은 머리 높이마다 + 발바닥`, () => {
      const { headTop, headH, lines } = readSvg(guideSvg(ratio));
      assert.ok(Math.abs(headTop - top) < 0.2, `머리 위 ${headTop}`);
      assert.ok(Math.abs(headH - tall / ratio) < 0.2, `머리 높이 ${headH} ≈ ${tall / ratio}`);
      // 줄: 머리 위(0) … floor(ratio) 칸, 그리고 발바닥(정수 비율이면 마지막 칸과 같아 하나만)
      const want = Math.floor(ratio) + 1 + (Number.isInteger(ratio) ? 0 : 1);
      assert.equal(lines.length, want);
      assert.ok(Math.abs(lines[0] - top) < 0.2);
      assert.ok(Math.abs(lines[1] - (top + tall / ratio)) < 0.2, "둘째 줄 = 턱");
      assert.ok(Math.abs(lines[lines.length - 1] - (top + tall)) < 0.2, "마지막 줄 = 발바닥");
    });
  }

  it("글자·숫자·얼굴이 없다 — 흰 바탕·회색 둘뿐", () => {
    const svg = guideSvg(5.5);
    assert.ok(!/<text|font|<image/i.test(svg));
    const colours = new Set(svg.match(/#[0-9a-f]{6}/gi));
    assert.deepEqual([...colours].sort(), ["#b4b4b4", "#ececec", "#ffffff"]);
    assert.equal(GUIDE_LINE, "#ececec");
  });
});

describe("guideImage — PNG(참고 그림 꼴)", () => {
  it("3:4 흰 바탕 PNG, 몇 KB — 같은 비율은 한 번만 만든다", async () => {
    const a = await guideImage(4.5);
    assert.ok(a);
    assert.equal(a.mimeType, "image/png");
    const buf = Buffer.from(a.data, "base64");
    assert.ok(buf.length < 20_000, `${buf.length} bytes`);
    const meta = await sharp(buf).metadata();
    assert.deepEqual([meta.width, meta.height], [GUIDE_WIDTH, GUIDE_HEIGHT]);
    // 모서리는 흰색(바탕)
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([data[0], data[1], data[2]], [255, 255, 255]);
    // 가운데 아래(다리 사이 아닌 곳 — 몸통 가운데)는 회색
    const at = (Math.round(GUIDE_HEIGHT * 0.45) * info.width + Math.round(GUIDE_WIDTH / 2)) * info.channels;
    assert.ok(data[at] < 200 && data[at] > 150, `몸통 ${data[at]}`);
    assert.equal(await guideImage(4.5), a, "기억해 둔 것을 준다");
  });

  it("가로줄은 보이되(255 아래) 흰 바탕 지우기가 '거의 흰색'으로 보는 밝기(lib/cutout WHITE_MIN 236 이상) — 따라 그려져도 지워진다", async () => {
    const g = await guideImage(5.5);
    assert.ok(g);
    const { data, info } = await sharp(Buffer.from(g.data, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // 머리 위 줄(마네킹 밖, 왼쪽 12% 자리)의 가장 짙은 픽셀
    const x = Math.round(GUIDE_WIDTH * 0.12);
    const top = Math.round(GUIDE_HEIGHT * GUIDE_MARGIN);
    let darkest = 255;
    for (let y = top - 3; y <= top + 3; y++) {
      for (let c = 0; c < 3; c++) darkest = Math.min(darkest, data[(y * info.width + x) * info.channels + c]);
    }
    assert.ok(darkest >= 236 && darkest < 250, `줄 밝기 ${darkest}`);
  });

  it("말이 안 되는 비율이면 null(견본 없이 그린다)", async () => {
    assert.equal(await guideImage(Number.NaN), null);
    assert.equal(await guideImage(1), null);
    assert.equal(await guideImage(11), null);
  });
});
