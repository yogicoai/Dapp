"use client";

import { useEffect, useState } from "react";
import { homeHintSeen, markHomeHintSeen } from "@/lib/prefs";

/**
 * "홈 화면에 추가하면 더 크게 볼 수 있어요" — 아이폰에서만, 한 번만.
 *
 * 아이폰 사파리에는 전체화면 기능 자체가 없다(애플이 안 넣었다). 그래서 다른
 * 기기처럼 버튼 하나로 꽉 채울 수가 없고, 홈 화면 앱으로 여는 것이 유일한 길이다.
 * 그런데 그 방법을 아는 부모가 드물어서, 그냥 두면 아이폰 쓰는 집만 작은 화면으로
 * 보게 된다.
 *
 * 안 띄우는 경우:
 *  · 아이폰이 아닐 때 — 안드로이드·아이패드·데스크톱은 전체화면 버튼이 그냥 된다.
 *  · 이미 홈 화면 앱으로 열었을 때 — 할 일이 끝났는데 또 권하면 성가시다.
 *  · 한 번 본 뒤 — 매번 뜨는 안내가 제일 싫다.
 */
export function AddToHomeHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (homeHintSeen()) return;

    const ua = navigator.userAgent;
    // 아이패드는 전체화면이 되므로 뺀다. 아이폰·아이팟만.
    const isIPhone = /iPhone|iPod/.test(ua);
    if (!isIPhone) return;

    // 이미 홈 화면 앱으로 실행 중이면 안내할 것이 없다.
    // navigator.standalone은 애플 전용이라 표준 타입에 없다.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // 첫 화면이 뜨자마자 덮으면 책장을 못 본다 — 잠깐 두고 올라온다.
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const close = () => {
    setShow(false);
    markHomeHintSeen();
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-md rounded-3xl bg-white/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          📱
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-neutral-800">
            홈 화면에 추가하면 더 크게 볼 수 있어요
          </p>
          <p className="mt-1 break-keep text-xs font-medium leading-relaxed text-neutral-500">
            아이폰은 주소창을 없앨 수 없어서 화면이 조금 작아요. 아래{" "}
            <b className="text-neutral-700">공유 버튼</b>
            <span aria-hidden> ⬆️ </span>을 누르고{" "}
            <b className="text-neutral-700">&lsquo;홈 화면에 추가&rsquo;</b>를 고르면, 진짜 앱처럼
            꽉 찬 화면으로 볼 수 있어요.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        className="mt-3 w-full rounded-full bg-neutral-800 py-2.5 text-sm font-extrabold text-white"
      >
        알겠어요
      </button>
    </div>
  );
}
