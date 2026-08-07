import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { detectBlankCanvasBorder, repairBlankCanvasBorder } from "./gemini.ts";

async function imageWithSvg(svg: string) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { mimeType: "image/png", data: png.toString("base64") };
}

describe("detectBlankCanvasBorder", () => {
  it("캔버스 왼쪽의 흰 띠를 불량으로 잡는다", async () => {
    const image = await imageWithSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#6b9b67"/><rect width="24" height="300" fill="white"/></svg>',
    );
    assert.match((await detectBlankCanvasBorder(image)) ?? "", /left/);
  });

  it("가장자리까지 칠해진 밝은 그림은 통과시킨다", async () => {
    const image = await imageWithSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#d8ebef"/><circle cx="200" cy="40" r="30" fill="white"/></svg>',
    );
    assert.equal(await detectBlankCanvasBorder(image), null);
  });

  it("흰 띠를 추가 생성 없이 잘라내고 원래 크기로 복원한다", async () => {
    const image = await imageWithSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#6b9b67"/><rect width="24" height="300" fill="white"/></svg>',
    );
    const repaired = await repairBlankCanvasBorder(image);
    const metadata = await sharp(Buffer.from(repaired.data, "base64")).metadata();
    assert.deepEqual([metadata.width, metadata.height], [400, 300]);
    assert.equal(await detectBlankCanvasBorder(repaired), null);
  });
});
