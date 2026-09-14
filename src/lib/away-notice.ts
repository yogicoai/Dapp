"use client";

import { noticeText, type NoticeKind } from "./waiting";

/*
 * 부모가 다른 탭·앱을 보고 있을 때 "다 됐어요"를 알린다 — 탭 제목·짧은 소리.
 *
 * 무엇을 알릴지는 waiting.ts(noticeFor)가 정하고, 여기는 브라우저에 실제로 하는 일만 한다.
 * 화면을 보고 있으면 아무것도 안 한다 — 잠든 아이 옆에서 소리를 내지 않는다.
 * 시스템 알림(Notification) 권한은 묻지 않는다 — 한밤에 권한 창이 뜨는 것도 방해다.
 *
 * 진동은 하지 않는다: 웹 진동(navigator.vibrate)은 규격상 화면이 안 보일 때 무시된다
 * (W3C Vibration — 문서가 보이지 않으면 false, 크롬도 같다). 우리는 '안 보고 있을 때만'
 * 알리므로 진동은 한 번도 울리지 않는다 — 되지 않는 약속을 코드에 남기지 않는다.
 * 떨리게 하려면 시스템 알림 권한이 필요하다(승인 범위 밖).
 */

let ctx: AudioContext | null = null;

/** 소리를 다 낸 뒤 장치를 재울 타이머 — 연달아 울리면 앞 것을 지운다. */
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

/*
 * 소리 장치는 평소엔 재워 둔다(suspend).
 * 켜 둔 채(running)면 소리를 안 내도 휴대폰·블루투스 스피커의 출력이 계속 깨어 있어
 * 잠자리 내내 배터리를 쓰거나 잡음이 날 수 있다. 한 번 부모가 누른 순간에 깨운 장치는
 * 나중에 다시 깨울 수 있으므로, 울릴 때만 깨웠다가 끝나면 다시 재운다.
 */
function sleepSoon(c: AudioContext, afterMs: number): void {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    sleepTimer = null;
    if (c.state === "running") void c.suspend().catch(() => {});
  }, afterMs);
}

/**
 * 부모가 단추를 누른 그 순간에 부른다(대본 쓰기·그림 그리기·다시 저장하기).
 *
 * 브라우저는 사람이 누르지 않은 때 만든 소리 장치를 잠가 둔다(자동 재생 규칙).
 * 2분 뒤 대본이 나왔을 때 처음 만들면 소리가 안 난다 — 그래서 누를 때 미리 만들어 깨워 두고,
 * 소리는 내지 않고 곧 다시 재운다(위 sleepSoon).
 */
export function primeChime(): void {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    const c = ctx;
    if (c.state === "suspended") {
      void c
        .resume()
        .then(() => sleepSoon(c, 300))
        .catch(() => {});
    } else {
      sleepSoon(c, 300);
    }
  } catch {
    // 소리는 덤이다 — 못 만들어도 만들기는 그대로 간다.
  }
}

/** 부드러운 두 음(미→라) 한 번. 파일 없이 합성한다 — 새 소리 파일을 받지 않게. */
function playChime(): void {
  const c = ctx;
  if (!c) return;
  try {
    const play = () => {
      const start = c.currentTime + 0.05;
      [659.25, 880].forEach((freq, i) => {
        const t = start + i * 0.18;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        // 톡 튀지 않게 천천히 올렸다 길게 줄인다. 크기도 작게(0.12).
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.75);
      });
      // 두 음이 끝난(약 1초) 뒤 다시 재운다.
      sleepSoon(c, 1200);
    };
    if (c.state === "running") play();
    else void c.resume().then(play).catch(() => {});
  } catch {
    // 소리를 못 내도 제목은 바뀐다.
  }
}

/** 바꾸기 전 탭 제목 — 돌아오면 되돌린다. null 이면 지금 바꾼 게 없다. */
let savedTitle: string | null = null;

/**
 * 다른 탭·앱을 보고 있으면 알린다. 보고 있으면 아무것도 안 한다.
 * @returns 알렸는지(보고 있지 않았는지)
 */
export function alertIfAway(kind: NoticeKind): boolean {
  if (typeof document === "undefined" || !document.hidden) return false;
  if (savedTitle === null) savedTitle = document.title;
  document.title = noticeText(kind).title;
  playChime();
  const back = () => {
    if (document.hidden) return;
    document.removeEventListener("visibilitychange", back);
    if (savedTitle !== null) {
      document.title = savedTitle;
      savedTitle = null;
    }
  };
  document.addEventListener("visibilitychange", back);
  return true;
}
