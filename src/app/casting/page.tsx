"use client";

import Link from "next/link";
import { useRef, useState } from "react";

/**
 * 캐릭터 캐스팅 오디션 (개발용 — 주소로만 접근).
 *
 * 역할마다 후보 성우들이 같은 대사를 연기한다. 들어보고 다른 후보가 나으면
 * 이름만 알려주면 그 목소리로 전체 대사를 다시 뽑는다 (무료 크레딧).
 */

const ROLES: {
  role: string;
  emoji: string;
  line: string;
  candidates: { name: string; src: string; picked?: boolean }[];
}[] = [
  {
    role: "흥부",
    emoji: "👨‍🌾",
    line: "보물이 쏟아진다! 제비야, 정말 고맙다!",
    candidates: [
      { name: "Sewoo (채택 — 연기용)", src: "/casting/heungbu-sewoo.mp3", picked: true },
      { name: "Sanghyun (기존)", src: "/casting/heungbu-sanghyun.mp3" },
    ],
  },
  {
    role: "놀부",
    emoji: "😤",
    line: "으악! 이게 뭐야! 도깨비잖아!",
    candidates: [
      { name: "Wade (채택 — 연기용)", src: "/casting/nolbu-wade.mp3", picked: true },
      { name: "Bboddo (캐릭터 보이스)", src: "/casting/nolbu-bboddo.mp3" },
      { name: "Minuk (기존)", src: "/casting/nolbu-minuk.mp3" },
    ],
  },
  {
    role: "제비",
    emoji: "🐦",
    line: "짹짹! 도와주세요! 다리를 다쳤어요…",
    candidates: [
      { name: "Daidai (채택 — 연기용)", src: "/casting/swallow-daidai.mp3", picked: true },
      { name: "Sua (기존)", src: "/casting/swallow-sua.mp3" },
      { name: "Okji", src: "/casting/swallow-okji.mp3" },
    ],
  },
  {
    role: "도깨비",
    emoji: "👹",
    line: "우르르 쿵쿵! 심술쟁이 놀부를 혼내 주자!",
    candidates: [
      { name: "Deokhwan (채택 — 연기용)", src: "/casting/dokkaebi-deokhwan.mp3", picked: true },
      { name: "Juwan (기존)", src: "/casting/dokkaebi-juwan.mp3" },
    ],
  },
];

export default function CastingPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const play = (src: string) => {
    const el = audioRef.current ?? new Audio();
    audioRef.current = el;
    el.src = src;
    setPlaying(src);
    el.onended = () => setPlaying(null);
    el.play().catch(() => setPlaying(null));
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-neutral-800">
          캐스팅 오디션 <span className="text-sm font-bold text-neutral-400">(개발용)</span>
        </h1>
        <Link href="/" className="text-sm font-bold text-neutral-400 hover:text-neutral-600">
          ← 서재
        </Link>
      </div>
      <p className="text-xs font-medium text-neutral-400">
        역할마다 같은 대사를 후보들이 연기해요. 더 나은 후보가 있으면 이름만 알려주세요 —
        전체 대사를 그 목소리로 다시 뽑습니다.
      </p>

      {ROLES.map((r) => (
        <section key={r.role} className="flex flex-col gap-2 rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-neutral-800">
            {r.emoji} {r.role}
            <span className="ml-2 text-xs font-bold text-neutral-400">“{r.line}”</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {r.candidates.map((c) => (
              <button
                key={c.src}
                type="button"
                onClick={() => play(c.src)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
                  c.picked
                    ? "bg-amber-400 text-white shadow"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {playing === c.src ? "🔊" : "▶"} {c.name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
