import test from "node:test";
import assert from "node:assert/strict";
import {
  busyWaitText,
  drawNotice,
  drawProgressLine,
  formatDuration,
  formatUsual,
  noticeFor,
  noticeText,
  pickShowcaseBooks,
  uploadLine,
  usualDrawSec,
  USUAL_WAIT,
  waitLine,
} from "./waiting.ts";

test("formatDuration — 초를 사람 말로", () => {
  assert.equal(formatDuration(0), "0초");
  assert.equal(formatDuration(12), "12초");
  assert.equal(formatDuration(60), "1분");
  assert.equal(formatDuration(72), "1분 12초");
  assert.equal(formatDuration(72.9), "1분 12초");
  // 시계가 뒤로 가거나 값이 깨져도 이상한 글자가 나오지 않는다.
  assert.equal(formatDuration(-5), "0초");
  assert.equal(formatDuration(Number.NaN), "0초");
});

test("formatUsual — 1분이 넘으면 30초 단위로 둥글린다", () => {
  assert.equal(formatUsual(30), "30초");
  assert.equal(formatUsual(120), "2분");
  assert.equal(formatUsual(225), "4분"); // 3분 45초 → 4분 (반올림)
  assert.equal(formatUsual(200), "3분 30초");
});

test("usualDrawSec — 시트 준비 + 두 장씩 묶음", () => {
  const five = USUAL_WAIT.sheetsSec + 3 * USUAL_WAIT.pageBatchSec;
  assert.equal(usualDrawSec(5), five);
  assert.equal(usualDrawSec(4), USUAL_WAIT.sheetsSec + 2 * USUAL_WAIT.pageBatchSec);
  // 실측(그림 전체 3~5분) 안에 들어야 한다.
  assert.ok(five >= 180 && five <= 300, `5쪽 보통 ${five}초`);
});

test("drawNotice — 누르기 전 안내가 기다리는 화면의 '보통'과 같다", () => {
  assert.equal(drawNotice(5), "그림은 보통 4분쯤 걸려요");
  assert.match(waitLine("draw", 0, 5), /보통 4분쯤/);
  assert.doesNotMatch(drawNotice(5), /1~2분/);
});

test("uploadLine — 5쪽 책의 8장이 무엇인지 말한다", () => {
  assert.equal(uploadLine(3, 8, 5), "책장에 넣는 중 · 3 / 8 (그림 5장 + 표지·기준 그림 3장)");
  // 다시 저장하기로 못 올린 쪽만 남았으면 덧말을 붙이지 않는다.
  assert.equal(uploadLine(1, 2, 2), "책장에 넣는 중 · 1 / 2");
});

test("waitLine — 흘러간 시간과 '보통' 시간", async (t) => {
  await t.test("대본은 보통 2분", () => {
    assert.equal(waitLine("story", 72_000), "1분 12초 지났어요 · 보통 2분쯤 걸려요");
  });
  await t.test("줄거리는 보통 30초", () => {
    assert.equal(waitLine("outline", 5_400), "5초 지났어요 · 보통 30초쯤 걸려요");
  });
  await t.test("그림은 쪽 수에 따라", () => {
    assert.equal(waitLine("draw", 10_000, 5), "10초 지났어요 · 보통 4분쯤 걸려요");
  });
  await t.test("보통 시간이 지나면 같은 약속을 되풀이하지 않는다", () => {
    assert.equal(waitLine("story", 150_000), "2분 30초 지났어요 · 조금 더 걸리고 있어요");
  });
  await t.test("딱 보통 시간일 땐 아직 '보통' 문구", () => {
    assert.equal(waitLine("story", 120_000), "2분 지났어요 · 보통 2분쯤 걸려요");
  });
});

test("drawProgressLine — 첫 쪽 전엔 준비 중이라고 말한다", () => {
  assert.equal(drawProgressLine(0, 5, 40_000), "인물·장소를 준비하고 있어요");
  // 2장에 60초 → 한 장 30초 → 남은 3장 90초
  assert.equal(drawProgressLine(2, 5, 60_000), "2 / 5 쪽 · 약 1분 30초 남았어요");
  assert.equal(drawProgressLine(4, 5, 20_000), "4 / 5 쪽 · 약 5초 남았어요");
  assert.equal(drawProgressLine(5, 5, 200_000), "5 / 5 쪽");
});

test("noticeFor — 기다리던 일이 끝났을 때만 알린다", async (t) => {
  const s = (step: string, busy = false, saveFailed = false) => ({ step, busy, saveFailed });
  await t.test("대본이 나옴", () => {
    assert.equal(noticeFor(s("outline", true), s("story")), "script");
  });
  await t.test("임시저장을 되살려 대본 화면으로 온 것은 알리지 않는다", () => {
    assert.equal(noticeFor(s("theme"), s("story")), null);
    assert.equal(noticeFor(s("outline", false), s("story")), null);
  });
  await t.test("그림을 다 그리고 책장에 넣음", () => {
    assert.equal(noticeFor(s("illustrate"), s("done")), "done");
    assert.equal(noticeFor(s("done"), s("done")), null);
  });
  await t.test("책장에 못 넣음 — 새로 떴을 때 한 번만", () => {
    assert.equal(noticeFor(s("illustrate"), s("illustrate", false, true)), "saveFailed");
    assert.equal(noticeFor(s("illustrate", false, true), s("illustrate", false, true)), null);
  });
  await t.test("그리다 인물 시트에서 멈춰 대본으로 돌아온 것은 대본 알림이 아니다", () => {
    assert.equal(noticeFor(s("illustrate"), s("story")), null);
  });
  await t.test("줄거리가 나온 것(짧은 기다림)은 알리지 않는다", () => {
    assert.equal(noticeFor(s("style", true), s("outline")), null);
  });
});

test("noticeText — 종류마다 제목·배너·단추", () => {
  assert.equal(noticeText("done").title, "✅ 동화가 완성됐어요");
  assert.equal(noticeText("script").title, "✍️ 대본이 나왔어요");
  assert.equal(noticeText("saveFailed").title, "⚠️ 저장 확인이 필요해요");
  for (const k of ["done", "script", "saveFailed"] as const) {
    const n = noticeText(k);
    assert.ok(n.banner && n.action, k);
  }
});

test("pickShowcaseBooks — 숨긴 책·표지 없는 책은 빼고 번갈아", () => {
  const folk = [
    { id: "folk-a", title: "가", coverImage: "https://x/a.jpg" },
    { id: "folk-b", title: "나", coverImage: null },
    { id: "folk-c", title: "다", coverImage: "https://x/c.jpg", hidden: true },
    { id: "folk-d", title: "라", coverImage: "https://x/d.jpg" },
    { id: "folk-e", title: "마", coverImage: "https://x/e.jpg" },
  ];
  const classic = [
    { id: "classic-a", title: "A", coverImage: "https://x/A.jpg" },
    { id: "classic-b", title: "B" },
    { id: "classic-c", title: "C", coverImage: "  " },
  ];
  assert.deepEqual(
    pickShowcaseBooks(folk, classic).map((b) => b.id),
    ["folk-a", "classic-a", "folk-d", "folk-e"],
  );
  assert.deepEqual(pickShowcaseBooks([], []), []);
});

test("waitLine — '보통 4분'이라 했으면 4분이 지나기 전엔 늦었다고 하지 않는다", () => {
  // 5쪽 그림은 225초지만 화면엔 "4분"으로 보인다 — 넘김도 240초로 잰다.
  assert.equal(waitLine("draw", 226_000, 5), "3분 46초 지났어요 · 보통 4분쯤 걸려요");
  assert.equal(waitLine("draw", 240_000, 5), "4분 지났어요 · 보통 4분쯤 걸려요");
  assert.equal(waitLine("draw", 241_000, 5), "4분 1초 지났어요 · 조금 더 걸리고 있어요");
  // 1분 미만은 둥글리지 않는다.
  assert.equal(waitLine("outline", 31_000), "31초 지났어요 · 조금 더 걸리고 있어요");
});

test("waitLine — 이어서 그리기는 남은 쪽 수로 '보통'을 잡는다", () => {
  // 4장을 되살리고 1장만 남음 → 시트 45초 + 1묶음 60초 = 105초 → 30초 단위로 "2분"
  assert.equal(waitLine("draw", 10_000, 1), "10초 지났어요 · 보통 2분쯤 걸려요");
});

test("drawProgressLine — 되살린 쪽은 방금 그린 쪽으로 세지 않는다", () => {
  // 4장을 되살린 직후: 남은 시간 대신 준비 중
  assert.equal(drawProgressLine(4, 5, 1_000, 4), "4 / 5 쪽 · 남은 쪽을 그릴 준비를 하고 있어요");
  // 2장 되살리고 새로 1장을 60초에 그림 → 남은 2장 약 2분
  assert.equal(drawProgressLine(3, 5, 60_000, 2), "3 / 5 쪽 · 약 2분 남았어요");
  // 되살린 게 없으면 예전과 같다
  assert.equal(drawProgressLine(2, 5, 60_000, 0), "2 / 5 쪽 · 약 1분 30초 남았어요");
  assert.equal(drawProgressLine(5, 5, 60_000, 4), "5 / 5 쪽");
});

test("busyWaitText — 무엇을 기다리는지로 문구를 고른다", () => {
  // 줄거리 다시 짓기(줄거리 화면에서 눌러도)는 대본이라고 하지 않는다.
  assert.deepEqual(busyWaitText("outline"), { headline: "이야기를 짓고 있어요…", line: "outline", showcase: false });
  assert.deepEqual(busyWaitText("story"), { headline: "대본을 쓰고 있어요…", line: "story", showcase: true });
  assert.equal(busyWaitText("save").line, null);
  assert.equal(busyWaitText("save").showcase, false);
});
