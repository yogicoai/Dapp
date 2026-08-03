"use client";

import { useEffect, useRef } from "react";

/**
 * 테마 배경 영상. autoPlay 속성만으로는 클라이언트 전환(설정→홈)으로 테마가
 * 바뀔 때 브라우저가 자동재생을 놓쳐 poster만 뜨는 일이 있다. src가 바뀔 때마다
 * load() 후 play()를 직접 불러 확실히 재생시킨다. muted라 자동재생 정책에 걸리지 않는다.
 */
export function BgVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.load();
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, [src]);

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      poster={poster}
      className={className}
    />
  );
}
