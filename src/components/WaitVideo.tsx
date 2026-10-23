"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "./family/motion";

/**
 * 기다리는 화면의 짧은 동화 나라 영상(2026-10-23 사장님 — 그림 그리는 3~5분을 마스코트 그림 한 장 대신 영상으로).
 * 소리 없이 끝없이 되풀이한다(브라우저가 소리 있는 자동 재생을 막는다). 움직임 줄이기를 켠 기기에는 첫 장면 그림(poster)만.
 * 부르는 쪽이 기다리는 동안에만 그리므로 그때만 내려받는다(640px, 약 2MB — 쪽 그림 한 장 값).
 */
export function WaitVideo({ src, poster, className = "" }: { src: string; poster: string; className?: string }) {
  const still = useReducedMotion();
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || still) return;
    // muted 는 성질로도 켜 둔다 — React 가 HTML 에 muted 를 안 적는 일이 있어 iOS 가 자동 재생을 막았다.
    el.muted = true;
    el.play().catch(() => {
      /* 자동 재생이 막히면 첫 장면(poster)이 그대로 보인다 */
    });
  }, [still]);
  if (still) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" className={className} />;
  }
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden
      className={className}
    />
  );
}
