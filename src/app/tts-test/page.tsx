"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/supabase";

/**
 * Typecast 목소리 시청실 (개발용 — 메뉴에 노출하지 않는다, 주소로만 접근).
 *
 * 유료 전환 전에 "성우 목소리가 어느 정도인지" 귀로 확인하고, 프리셋 캐릭터
 * (또랑또랑·삐약이·곰아저씨·요정님)에 붙일 음성을 고르는 방이다.
 * 재생할 때마다 글자 수만큼 무료 크레딧(월 3만 자)이 나간다.
 */

type Voice = {
  id: string;
  name: string;
  model: string;
  emotions: string[];
  gender: string;
  age: string;
};

const SAMPLE =
  "옛날 옛적, 깊은 숲속에 작은 집이 한 채 있었어요. 오늘 밤에도 재미있는 이야기가 시작된답니다.";

const GENDERS = [
  { value: "", label: "전체" },
  { value: "female", label: "여자" },
  { value: "male", label: "남자" },
];

const AGES = [
  { value: "", label: "전체" },
  { value: "child", label: "어린이" },
  { value: "teenager", label: "청소년" },
  { value: "young_adult", label: "청년" },
  { value: "middle_age", label: "중년" },
  { value: "elder", label: "노년" },
];

const AGE_KO: Record<string, string> = {
  child: "어린이",
  teenager: "청소년",
  young_adult: "청년",
  middle_age: "중년",
  elder: "노년",
};

export default function TtsTestPage() {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState(SAMPLE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [query, setQuery] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    authedFetch("/api/tts/voices")
      .then(async (r) => {
        const data = (await r.json()) as { voices?: Voice[]; error?: string };
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        setVoices(data.voices ?? []);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const play = async (v: Voice) => {
    if (busyId) return;
    setBusyId(v.id);
    setError(null);
    try {
      const r = await authedFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId: v.id, model: v.model }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      el.pause();
      el.src = URL.createObjectURL(blob);
      await el.play();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const shown = (voices ?? []).filter(
    (v) =>
      (!gender || v.gender === gender) &&
      (!age || v.age === age) &&
      (!query || v.name.toLowerCase().includes(query.toLowerCase())),
  );

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-bold transition ${
      active ? "bg-amber-400 text-white shadow" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
    }`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-neutral-800">
          Typecast 목소리 시청실 <span className="text-sm font-bold text-neutral-400">(개발용)</span>
        </h1>
        <Link href="/" className="text-sm font-bold text-neutral-400 hover:text-neutral-600">
          ← 서재
        </Link>
      </div>

      <p className="text-xs font-medium text-neutral-400">
        재생할 때마다 글자 수만큼 무료 크레딧(월 30,000자)이 차감돼요. 지금 문장은{" "}
        {text.length}자입니다.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        rows={3}
        className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
      />

      {/* 필터 — 597개 중에서 캐릭터 후보를 좁힌다 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {GENDERS.map((g) => (
          <button key={g.value} type="button" className={chip(gender === g.value)} onClick={() => setGender(g.value)}>
            {g.label}
          </button>
        ))}
        <span className="mx-1 text-neutral-300">|</span>
        {AGES.map((a) => (
          <button key={a.value} type="button" className={chip(age === a.value)} onClick={() => setAge(a.value)}>
            {a.label}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름 검색 (예: Sanghyun)"
        className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
      />

      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-600">{error}</div>
      )}

      {!voices && !error && (
        <p className="text-sm font-bold text-neutral-400">음성 목록을 불러오는 중…</p>
      )}

      {voices && (
        <>
          <p className="text-xs font-bold text-neutral-400">
            {shown.length}개 / 전체 {voices.length}개
          </p>
          <div className="flex flex-col gap-2 pb-8">
            {shown.slice(0, 100).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => play(v)}
                disabled={busyId !== null}
                className={`flex items-center justify-between rounded-2xl bg-white px-5 py-3.5 text-left shadow-sm transition hover:shadow ${
                  busyId === v.id ? "opacity-60" : ""
                }`}
              >
                <span>
                  <span className="block text-sm font-extrabold text-neutral-800">{v.name}</span>
                  <span className="block text-[11px] font-medium text-neutral-400">
                    {v.gender === "male" ? "남자" : "여자"} · {AGE_KO[v.age] ?? v.age}
                    {v.emotions.length > 0 ? ` · 감정 ${v.emotions.length}종` : ""}
                  </span>
                </span>
                <span className="text-lg" aria-hidden>
                  {busyId === v.id ? "…" : "▶"}
                </span>
              </button>
            ))}
            {shown.length > 100 && (
              <p className="text-center text-xs font-bold text-neutral-400">
                100개까지만 표시 — 필터로 더 좁혀보세요.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
