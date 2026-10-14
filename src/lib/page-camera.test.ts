import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cameraCheckLines, cameraLines, placeVisits } from "./page-camera.ts";

describe("같은 장소 둘째 쪽부터 카메라를 바꾼다(2026-10-14 시장 두 쪽·공원 두 쪽이 같은 그림처럼 나왔다)", () => {
  it("쪽마다 그 장소를 몇 번째로 그리는지 센다 — 시장 나들이 책", () => {
    // 버스 · 시장 · 시장 · 호수 공원 · 호수 공원 · 거실
    assert.deepEqual(placeVisits(["transit", "shop", "shop", "playground", "playground", "home:living"]), [0, 0, 1, 0, 1, 0]);
  });

  it("떨어져 있어도 같은 곳이면 이어 센다 · 장소를 모르는 쪽은 처음처럼", () => {
    assert.deepEqual(placeVisits(["home", "park", "home", "", "home"]), [0, 0, 1, 0, 2]);
  });

  it("처음 그리는 장소는 카메라 줄이 없다 — 예전 그대로 넓게", () => {
    assert.deepEqual(cameraLines(0), []);
    assert.deepEqual(cameraCheckLines(0), []);
  });

  it("둘째는 가까이·다른 쪽에서, 셋째는 반대쪽·낮은 각도 — 장소의 바닥·색은 그대로", () => {
    const second = cameraLines(1).join("\n");
    assert.match(second, /Do NOT reuse that camera position/);
    assert.match(second, /medium shot/);
    assert.match(second, /Keep the place itself exactly the same/);
    const third = cameraLines(2).join("\n");
    assert.match(third, /reverse angle|low camera/);
    assert.notEqual(second, third);
    // 돌아가며 — 다섯째는 둘째와 같은 줄
    assert.deepEqual(cameraLines(4), cameraLines(1));
  });

  it("검수 — 일부러 바꾼 구도를 장소 표지가 덜 보인다고 떨어뜨리지 않는다", () => {
    assert.match(cameraCheckLines(1)[0], /Do not fail it because some landmarks of the place are cropped/);
  });

  it("이상한 값은 처음처럼", () => {
    assert.deepEqual(cameraLines(-1), []);
    assert.deepEqual(cameraLines(1.5), []);
    assert.deepEqual(cameraLines(Number.NaN), []);
  });
});
