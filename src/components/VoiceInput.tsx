"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * 아이가 자기 이야기를 말로 넣는 마이크 버튼.
 *
 * 브라우저 내장 음성인식(Web Speech API)을 쓴다 — 무료이고 서버가 필요 없다.
 * 안드로이드 크롬이 한국어(ko-KR)를 지원하므로 안드로이드 우선인 이 앱에 맞는다.
 * iOS Safari는 미지원이라, 지원 안 되는 기기에서는 버튼을 감춘다(입력창으로 대체).
 */

// Web Speech API는 표준 TS 타입에 없어서 필요한 만큼만 선언한다.
type SpeechRecognitionResult = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionResult) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

/**
 * 마이크 버튼을 지금은 숨긴다 — 사장님(2026-09-28): "말로 이야기해도 돼요는 없는 기기(아이폰 등)도 있으니 숨김".
 * 기기마다 보였다 안 보였다 하면 헷갈려서, 모두에게 글 칸만 보여 준다. 다시 켜려면 true 로.
 */
const VOICE_INPUT_ENABLED = false;

export function VoiceInput(props: { onResult: (text: string) => void }) {
  if (!VOICE_INPUT_ENABLED) return null;
  return <VoiceInputButton {...props} />;
}

function VoiceInputButton({ onResult }: { onResult: (text: string) => void }) {
  // 지원 여부는 안 변하니 구독 없이 마운트 시 한 번 읽는다. 서버에선 false.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "ko-KR";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  // 지원 안 하는 기기(iOS 등)에서는 아예 감춘다.
  if (!supported) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "그만 말하기" : "말로 이야기하기"}
        className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full shadow-lg transition-transform hover:scale-105 ${
          listening ? "animate-pulse bg-rose-500 ring-8 ring-rose-300/50" : "bg-white"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/func-mic.webp" alt="" className="h-14 w-14 object-contain" />
      </button>
      <span className="text-sm font-bold text-neutral-500">
        {listening ? "듣고 있어요… 말해보세요!" : "말로 이야기해도 돼요"}
      </span>
    </div>
  );
}
