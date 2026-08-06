"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 테마 배경 영상 — 이음매 없이 계속 흐르게.
 *
 * 그냥 loop을 걸면 끝 프레임과 첫 프레임이 달라서, 돌 때마다 화면이 툭 튄다.
 * "멈췄다 다시 재생되는" 느낌이 이것이다(사장님 지적).
 *
 * 거꾸로 재생은 방법이 못 된다 — playbackRate에 음수를 넣는 건 브라우저가 안 받아
 * 주고, currentTime을 뒤로 밀어 흉내 내면 키프레임 사이를 매번 다시 디코딩해야 해서
 * 오히려 더 끊긴다.
 *
 * 그래서 같은 영상을 두 겹으로 두고 겹치는 순간에 넘긴다. 끝나기 조금 전에 뒤 겹을
 * 처음부터 틀어 놓고 서서히 바꿔치기하면, 튀는 자리가 페이드에 묻혀 이음매가 안 보인다.
 * 겹치는 동안만 둘 다 도니까 부담도 잠깐이다.
 */

/** 겹쳐 넘기는 시간(초). 짧으면 이음매가 비치고, 길면 두 겹이 오래 돈다. */
const CROSSFADE = 0.8;

export function BgVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  const aRef = useRef<HTMLVideoElement | null>(null);
  const bRef = useRef<HTMLVideoElement | null>(null);
  // 지금 보이는 겹. 넘길 때마다 뒤바뀐다.
  const [front, setFront] = useState<"a" | "b">("a");
  // 한 번의 이음매에서 두 번 넘기지 않도록 잠근다.
  const swapping = useRef(false);

  const play = useCallback((v: HTMLVideoElement | null) => {
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, []);

  // 테마가 바뀌면 처음부터 다시. 자동재생을 놓쳐 poster만 뜨는 일이 있어 직접 부른다.
  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    swapping.current = false;
    setFront("a");
    a.load();
    b.load();
    a.currentTime = 0;
    b.currentTime = 0;
    b.pause();
    play(a);
  }, [src, play]);

  /**
   * 끝이 가까워지면 뒤 겹을 처음부터 틀고 화면을 넘긴다.
   * timeupdate는 초당 네 번쯤 오는데, 넘기는 건 CSS가 0.8초에 걸쳐 하므로 충분하다.
   */
  const onTime = (side: "a" | "b") => () => {
    if (side !== front || swapping.current) return;
    const cur = side === "a" ? aRef.current : bRef.current;
    const other = side === "a" ? bRef.current : aRef.current;
    if (!cur || !other || !Number.isFinite(cur.duration)) return;
    if (cur.duration - cur.currentTime > CROSSFADE) return;

    swapping.current = true;
    other.currentTime = 0;
    play(other);
    setFront(side === "a" ? "b" : "a");
    // 넘어간 겹은 페이드가 끝난 뒤에 세운다 — 바로 멈추면 사라지는 게 보인다.
    window.setTimeout(() => {
      cur.pause();
      cur.currentTime = 0;
      swapping.current = false;
    }, CROSSFADE * 1000);
  };

  const common = "absolute inset-0 h-full w-full object-cover transition-opacity ease-linear";
  const dur = { transitionDuration: `${CROSSFADE}s` };

  return (
    // 넘겨받은 className이 자리·크기를 정하고, 두 겹은 그 안에 겹쳐 둔다.
    <div className={className}>
      <video
        ref={aRef}
        key={`${src}-a`}
        src={src}
        autoPlay
        muted
        playsInline
        poster={poster}
        onTimeUpdate={onTime("a")}
        style={dur}
        className={`${common} ${front === "a" ? "opacity-100" : "opacity-0"}`}
      />
      <video
        ref={bRef}
        key={`${src}-b`}
        src={src}
        muted
        playsInline
        poster={poster}
        onTimeUpdate={onTime("b")}
        style={dur}
        className={`${common} ${front === "b" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
