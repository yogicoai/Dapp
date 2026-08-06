"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 테마 배경 영상 — 이음매 없이 계속 흐르게.
 *
 * 그냥 loop을 걸면 끝 프레임과 첫 프레임이 달라서, 돌 때마다 화면이 툭 튄다.
 * 거꾸로 재생은 방법이 못 된다 — playbackRate에 음수는 브라우저가 안 받아 주고,
 * currentTime을 뒤로 밀어 흉내 내면 키프레임 사이를 매번 다시 디코딩해서 더 끊긴다.
 *
 * 그래서 같은 영상을 두 겹으로 두고, 끝나기 조금 전에 뒤 겹을 처음부터 틀어
 * 서서히 바꿔치기한다. 튀는 자리가 페이드에 묻혀 이음매가 안 보인다.
 *
 * 여기서 조심할 것이 세 가지다.
 *  ① 넘길 때를 놓치면 안 된다. timeupdate는 초당 네 번쯤만 와서 짧은 영상에서는
 *    넘길 자리를 지나쳐 버린다. 화면 그리는 박자(rAF)로 매 프레임 확인한다.
 *  ② 그래도 놓쳤을 때를 대비해야 한다. loop을 뗐기 때문에 못 넘기면 영상이 끝난
 *    채로 얼어붙는다 — 이게 오히려 '멈췄다'로 보인다. ended가 오면 그 자리에서
 *    즉시 넘겨 절대 멈추지 않게 한다.
 *  ③ 짧은 영상에서 페이드가 너무 길면 안 된다. 길이의 1/4을 넘지 않게 줄인다.
 */

/** 겹쳐 넘기는 기본 시간(초). 짧으면 이음매가 비치고, 길면 두 겹이 오래 돈다. */
const CROSSFADE = 0.6;

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
  const frontRef = useRef<"a" | "b">("a");
  // 한 번의 이음매에서 두 번 넘기지 않도록 잠근다.
  const swapping = useRef(false);
  // 실제로 쓰는 페이드 길이 — 영상 길이를 알고 나서 정해진다.
  const fade = useRef(CROSSFADE);

  const play = useCallback((v: HTMLVideoElement | null) => {
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, []);

  /** 앞뒤 겹을 바꾼다. 넘길 자리에 닿았거나(rAF) 영상이 끝났을 때(ended) 불린다. */
  const swap = useCallback(() => {
    if (swapping.current) return;
    const cur = frontRef.current === "a" ? aRef.current : bRef.current;
    const other = frontRef.current === "a" ? bRef.current : aRef.current;
    if (!cur || !other) return;

    swapping.current = true;
    other.currentTime = 0;
    play(other);
    const next = frontRef.current === "a" ? "b" : "a";
    frontRef.current = next;
    setFront(next);
    // 넘어간 겹은 페이드가 끝난 뒤에 세운다 — 바로 멈추면 사라지는 게 보인다.
    window.setTimeout(() => {
      cur.pause();
      cur.currentTime = 0;
      swapping.current = false;
    }, fade.current * 1000);
  }, [play]);

  // 테마가 바뀌면 처음부터 다시. 자동재생을 놓쳐 poster만 뜨는 일이 있어 직접 부른다.
  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    swapping.current = false;
    frontRef.current = "a";
    fade.current = CROSSFADE;
    setFront("a");
    a.load();
    b.load();
    a.currentTime = 0;
    b.currentTime = 0;
    b.pause();
    play(a);
  }, [src, play]);

  /**
   * 화면 그리는 박자로 넘길 자리를 지킨다. 정지 화면일 땐 브라우저가 rAF를 멈춰 줘서
   * 안 보이는 동안 헛돌지 않는다.
   */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (swapping.current) return;
      const cur = frontRef.current === "a" ? aRef.current : bRef.current;
      if (!cur || cur.paused) return;
      const dur = cur.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      // 짧은 영상에서 페이드가 길면 거의 내내 두 겹이 돈다 — 길이의 1/4로 묶는다.
      fade.current = Math.min(CROSSFADE, dur / 4);
      if (dur - cur.currentTime <= fade.current) swap();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [swap]);

  const common = "absolute inset-0 h-full w-full object-cover transition-opacity ease-linear";

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
        preload="auto"
        poster={poster}
        // 넘길 자리를 놓쳐도 여기서 잡는다 — loop이 없어 안 그러면 얼어붙는다.
        onEnded={swap}
        style={{ transitionDuration: `${fade.current}s` }}
        className={`${common} ${front === "a" ? "opacity-100" : "opacity-0"}`}
      />
      <video
        ref={bRef}
        key={`${src}-b`}
        src={src}
        muted
        playsInline
        preload="auto"
        poster={poster}
        onEnded={swap}
        style={{ transitionDuration: `${fade.current}s` }}
        className={`${common} ${front === "b" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
