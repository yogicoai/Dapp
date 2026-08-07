"use client";

import { useEffect, useRef, useState } from "react";
import { useEscClose } from "@/lib/use-esc-close";
import {
  RECORDING_SCRIPTS,
  saveCustomVoices,
  saveVoiceAudio,
  loadCustomVoices,
  type CustomVoice,
} from "@/lib/voices";
import { prepareVoiceWav } from "@/lib/parent-voice";

type Phase = "idle" | "checking" | "recording" | "preview" | "saving";

/**
 * 녹음 길이 기준.
 *
 * Typecast 퀵 클로닝은 짧은 녹음을 아예 거부한다(실측: 3초 거부, 15초 통과).
 * 게다가 목소리 만들기는 계정당 2번뿐이라, 짧게 녹음해 놓고 토큰까지 쓴 뒤에
 * 실패를 알게 되면 안 된다. 그래서 최소 길이 전에는 끝내기 버튼을 잠근다.
 * 지정 문장(RECORDING_SCRIPT)을 자연스럽게 읽으면 40초쯤 나온다 — 그게 목표선이다.
 */
const MIN_SEC = 30;
const TARGET_SEC = 35;
const NOISE_CHECK_MS = 2000;
const NOISE_RMS_MAX = 0.012;

/**
 * 마이크 입력 크기 기준.
 * 실제 낭독 파일로 재보니 알맞게 녹음된 목소리는 RMS 0.07~0.08이었다.
 * 막대는 그 값이 절반쯤 차 보이도록 눈금을 잡는다 — 막대를 끝까지 채우려고
 * 소리를 지르면 오히려 깨져서 클론이 나빠진다.
 */
const LEVEL_QUIET = 0.015; // 이 아래면 너무 작다
const LEVEL_LOUD = 0.3; // 이 위면 너무 크다
const LEVEL_FULL = 0.15; // 막대가 가득 차는 기준값

type Verdict = { ok: boolean; title: string; detail: string };

/**
 * 엄마·아빠 목소리 녹음.
 *
 * 화면에 띄운 지정 문장만 읽게 한다 — 이름도 개인정보도 없는 동화 구절이라
 * 유출돼도 무해하고, 그걸 부모에게 그대로 말해줄 수 있다("개인 정보는 녹음되지
 * 않아요"). 동의 체크 없이는 저장 버튼이 눌리지 않는다. 녹음은 기기(IndexedDB)에
 * 보관되고, 클로닝 벤더가 붙으면 이 원본이 재료가 된다.
 */
export function VoiceRecorder({
  label,
  emoji,
  accent,
  owner,
  onDone,
  onCancel,
}: {
  label: string; // "엄마" | "아빠"
  emoji: string;
  accent: string;
  /** 로그인한 계정 uid — 녹음 목록이 계정별로 저장되게 (같은 기기의 다른 아이디에 안 보이게). */
  owner: string | null;
  onDone: (voice: CustomVoice) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  // ESC로도 닫힌다. 저장 중에는 끊기면 안 되므로 잠시 막는다.
  useEscClose(onCancel, phase !== "saving");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  /**
   * 지금까지 완성한 녹음들. 같은 문장을 두 번 읽으면 재료가 두 배가 되어 훨씬 더 닮는다
   * (퀵 클로닝은 재료 길이에 민감하다). 저장할 때 하나로 이어 붙인다.
   */
  const takesRef = useRef<Blob[]>([]);
  const [takes, setTakes] = useState(0);
  const [activeTake, setActiveTake] = useState(0);
  // 마이크 권한을 기다리는 사이 닫히면, 뒤늦게 온 스트림을 바로 꺼야 한다.
  const closedRef = useRef(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 녹음 중 상태 — 지금 소리 크기(0~1)와 흘러간 초. 말하면서 바로 보여 준다.
  const [level, setLevel] = useState(0);
  const [zone, setZone] = useState<"quiet" | "good" | "loud">("quiet");
  const [secs, setSecs] = useState(0);
  // 끝난 녹음의 품질 판정. null이면 아직 검사 중.
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  // 마이크 분석에 쓴 것들 — 녹음이 끝나면 반드시 정리한다.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMeter = () => {
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };
  useEffect(() => stopMeter, []);

  useEffect(
    () => () => {
      closedRef.current = true;
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  /** 녹음 전에 2초간 말하지 않은 방의 평균 소음을 잰다. */
  async function measureRoomNoise(stream: MediaStream): Promise<number> {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let squareSum = 0;
      let sampleCount = 0;
      const startedAt = performance.now();
      while (performance.now() - startedAt < NOISE_CHECK_MS) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
        analyser.getFloatTimeDomainData(buf);
        for (const sample of buf) squareSum += sample * sample;
        sampleCount += buf.length;
      }
      return sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0;
    } finally {
      void ctx.close().catch(() => {});
    }
  }

  // 이전 미리듣기 URL은 새것이 생기거나 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  /**
   * @param fresh true면 지금까지 읽은 것을 버리고 처음부터(= '다시 녹음').
   *              false면 이어서 한 번 더 읽는다(= '한 번 더 읽기', 재료가 쌓인다).
   */
  async function startRecording(fresh = true) {
    setError("");
    setVerdict(null);
    setLevel(0);
    setZone("quiet");
    setSecs(0);
    if (fresh) {
      takesRef.current = [];
      setTakes(0);
    }
    const takeIndex = fresh ? 0 : Math.min(takesRef.current.length, RECORDING_SCRIPTS.length - 1);
    setActiveTake(takeIndex);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
        },
      });
      // 기다리는 동안 팝업이 닫혔으면(ESC·닫기) 마이크를 켜두지 않는다.
      if (closedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setPhase("checking");
      const roomNoise = await measureRoomNoise(stream);
      if (closedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (roomNoise > NOISE_RMS_MAX) {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("idle");
        setError(
          "주변 소리가 크게 들려요. TV·음악·선풍기·에어컨을 끄고, 다른 사람의 말소리가 없는 방에서 다시 시도해주세요.",
        );
        return;
      }
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        stopMeter();
        blobRef.current = new Blob(chunksRef.current, { type: rec.mimeType });
        takesRef.current = [...takesRef.current, blobRef.current];
        setTakes(takesRef.current.length);
        setPreviewUrl(URL.createObjectURL(blobRef.current));
        stream.getTracks().forEach((t) => t.stop());
        setPhase("preview");
        void checkQuality(blobRef.current);
      };
      recorderRef.current = rec;
      rec.start();
      setPhase("recording");

      // 소리 크기 막대 — 말하는 동안 바로 보이게. 너무 작거나 깨지는 걸
      // 녹음이 끝난 뒤에야 알면 늦다(클론 실패의 가장 흔한 원인).
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let elapsedTicks = 0;
        meterTimerRef.current = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          let peak = 0;
          for (const s of buf) {
            sum += s * s;
            const a = Math.abs(s);
            if (a > peak) peak = a;
          }
          const rms = Math.sqrt(sum / buf.length);
          setLevel(Math.min(1, rms / LEVEL_FULL));
          // 판정은 막대 길이가 아니라 실제 값으로 한다 — 막대를 채우려고 소리치게 만들지 않는다.
          setZone(peak > 0.98 || rms >= LEVEL_LOUD ? "loud" : rms < LEVEL_QUIET ? "quiet" : "good");
          elapsedTicks++;
          setSecs(Math.floor(elapsedTicks / 10));
        }, 100);
      } catch {
        /* 소리 막대는 보조 장치다 — 안 되면 녹음만 계속한다 */
      }
    } catch {
      setError("마이크를 사용할 수 없어요. 브라우저 권한을 확인해주세요.");
    }
  }

  /**
   * 녹음이 끝나면 파일을 열어 품질을 본다 — 길이·평균 크기·깨진 구간·무음 비율.
   * 다시 녹음은 몇 번이든 공짜이므로, 품질 기준을 통과한 녹음만 저장한다.
   */
  async function checkQuality(blob: Blob): Promise<void> {
    setVerdict(null);
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      void ctx.close().catch(() => {});
      const data = audio.getChannelData(0);
      const dur = audio.duration;

      let sum = 0;
      let clipped = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
        if (Math.abs(data[i]) > 0.99) clipped++;
      }
      const rms = Math.sqrt(sum / data.length);
      const clipRatio = clipped / data.length;

      // 0.2초 창으로 훑어 '거의 소리가 없는' 구간의 비율을 센다.
      const win = Math.floor(audio.sampleRate * 0.2);
      let quietWins = 0;
      let wins = 0;
      for (let i = 0; i + win <= data.length; i += win) {
        let s = 0;
        for (let j = i; j < i + win; j++) s += data[j] * data[j];
        if (Math.sqrt(s / win) < 0.01) quietWins++;
        wins++;
      }
      const silence = wins > 0 ? quietWins / wins : 0;

      if (dur < MIN_SEC) {
        setVerdict({
          ok: false,
          title: "조금 더 길게 읽어주세요",
          detail: `${Math.round(dur)}초 녹음됐어요. 문장을 끝까지 읽으면 ${TARGET_SEC}초쯤 돼요.`,
        });
      } else if (clipRatio > 0.01) {
        setVerdict({
          ok: false,
          title: "소리가 깨졌어요",
          detail: "너무 크게 들어갔어요. 폰을 조금 멀리 두고 편하게 읽어주세요.",
        });
      } else if (rms < 0.02) {
        setVerdict({
          ok: false,
          title: "소리가 너무 작아요",
          detail: "폰을 입에서 한 뼘 거리에 두고, 평소 동화 읽어주듯 또렷하게 읽어주세요.",
        });
      } else if (silence > 0.45) {
        setVerdict({
          ok: false,
          title: "조용한 구간이 많아요",
          detail: "중간에 오래 쉬지 말고 이어서 읽어주시면 목소리를 더 잘 배워요.",
        });
      } else {
        setVerdict({
          ok: true,
          title: "좋은 녹음이에요!",
          detail: `${Math.round(dur)}초 · 소리 크기도 알맞아요. 들어보고 저장해 주세요.`,
        });
      }
    } catch {
      // 분석 실패는 막지 않는다 — 판정은 도우미일 뿐, 저장 자체는 되게 한다.
      setVerdict({ ok: true, title: "녹음 완료", detail: "들어보고 저장해 주세요." });
    }
  }

  async function save() {
    if (!blobRef.current || !consent || !verdict?.ok || takes < RECORDING_SCRIPTS.length) return;
    setPhase("saving");
    // 읽은 것들을 하나로 이어 붙이고, 소리 크기·침묵·저주파 잡음까지 다듬어 저장한다.
    // 여기서 잘 다듬을수록 복제된 목소리가 더 닮는다.
    let audio: Blob;
    try {
      audio = await prepareVoiceWav(takesRef.current.length > 0 ? takesRef.current : [blobRef.current]);
    } catch {
      audio = blobRef.current; // 다듬기 실패해도 저장은 되게 — 원본 그대로 쓴다
    }
    const id = `custom-${Date.now()}`;
    const voice: CustomVoice = {
      kind: "custom",
      id,
      label,
      emoji,
      createdAt: new Date().toISOString(),
      consentAt: new Date().toISOString(),
      status: "recorded",
    };
    try {
      await saveVoiceAudio(id, audio);
      saveCustomVoices([...loadCustomVoices(owner), voice], owner);
      onDone(voice);
    } catch {
      setError("저장에 실패했어요. 다시 시도해주세요.");
      setPhase("preview");
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-neutral-50 p-5">
      <h3 className="text-center text-lg font-extrabold text-neutral-800">
        {emoji} {label} 목소리 녹음
      </h3>

      {/* 지정 문장 — 이것만 읽는다 */}
      <div className="rounded-xl bg-white p-4">
        <p className="text-[13px] font-medium leading-relaxed text-neutral-700">
          아래 문장을 또박또박 읽어주세요:
        </p>
        <p className="mt-2 text-[15px] font-bold leading-relaxed text-neutral-800">
          <span className="mb-1 block text-[11px] text-neutral-400">
            {activeTake + 1}번째 문장 / {RECORDING_SCRIPTS.length}
          </span>
          “{RECORDING_SCRIPTS[activeTake]}”
        </p>
      </div>

      {/* 신뢰 안내 — 숨기지 않고 전면에 */}
      <ul className="flex flex-col gap-1 text-[12px] font-medium text-neutral-500">
        <li>✓ 지정된 동화 문장만 녹음해요 — 개인 정보는 녹음되지 않아요</li>
        <li>✓ 녹음은 이 기기에만 보관돼요</li>
        <li>✓ 언제든지 삭제할 수 있어요</li>
      </ul>

      {phase === "idle" && (
        <div className="flex flex-col gap-3">
          {/* 녹음 전 안내 — 실패하는 이유는 늘 같다(작은 소리·시끄러운 방·중간에 끊김).
              글로 적어두면 안 읽으니 그림으로 한눈에 보여준다. */}
          <p className="text-center text-[13px] font-extrabold text-neutral-700">
            이렇게 하면 목소리를 더 잘 닮아요
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                img: "/guide/rec-distance.webp",
                title: "한 뼘 거리",
                tip: "입에서 15~20cm 두고 고정해요",
              },
              {
                img: "/guide/rec-quiet.webp",
                title: "조용한 방",
                tip: "TV·선풍기·에어컨은 잠깐 꺼요",
              },
              {
                img: "/guide/rec-read.webp",
                title: "동화 읽듯이",
                tip: "목소리를 꾸미지 말고 편안하게",
              },
            ].map((g) => (
              <div key={g.title} className="flex flex-col items-center gap-1 rounded-2xl bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.img} alt="" className="aspect-square w-full rounded-xl object-cover" />
                <p className="break-keep text-center text-[11px] font-extrabold leading-tight text-neutral-700">
                  {g.title}
                </p>
                <p className="break-keep text-center text-[10px] font-medium leading-tight text-neutral-400">
                  {g.tip}
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => startRecording(true)}
            className="rounded-full py-3 text-base font-extrabold text-white"
            style={{ background: accent }}
          >
            🎙️ 녹음 시작
          </button>
          <p className="text-center text-[11px] font-medium text-neutral-400">
            서로 다른 문장 두 개를 읽어요 · 한 문장당 약 {TARGET_SEC}초예요
          </p>
          <p className="break-keep text-center text-[10px] font-medium leading-relaxed text-neutral-400">
            휴대폰 기본 마이크를 권장해요. 기침·문소리·다른 사람 목소리가 들어가면 다시
            녹음해주세요.
          </p>
        </div>
      )}

      {phase === "checking" && (
        <div className="rounded-2xl bg-sky-50 px-4 py-5 text-center">
          <p className="text-sm font-extrabold text-sky-700">🔇 2초 동안 말하지 말아주세요</p>
          <p className="mt-1 text-xs font-medium text-sky-600">방의 주변 소음을 확인하고 있어요…</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-col gap-3">
          {/* 소리 크기 막대 — 말하는 동안 실시간으로 찬다. 색으로 상태를 알려준다. */}
          {(() => {
            const color = zone === "quiet" ? "#c7c7c7" : zone === "loud" ? "#ef4444" : "#22c55e";
            const hint =
              zone === "quiet"
                ? "소리가 작아요 — 폰을 가까이 두고 말해주세요"
                : zone === "loud"
                  ? "소리가 너무 커요 — 조금 떨어져서 말해주세요"
                  : "좋아요! 그대로 읽어주세요";
            return (
              <div className="flex flex-col gap-1.5">
                <div className="h-4 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full transition-[width] duration-100"
                    style={{ width: `${Math.round(level * 100)}%`, background: color }}
                  />
                </div>
                <p className="text-center text-[12px] font-extrabold" style={{ color }}>
                  {hint}
                </p>
              </div>
            );
          })()}

          {/* 시간 — 최소치를 채워야 끝낼 수 있다. 목표선(40초)도 함께 보여준다. */}
          <div className="flex flex-col gap-1.5">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-neutral-400 transition-[width] duration-300"
                style={{ width: `${Math.min(100, (secs / TARGET_SEC) * 100)}%` }}
              />
              {/* 최소 길이 눈금 */}
              <div
                className="absolute top-0 h-full w-0.5 bg-neutral-500/70"
                style={{ left: `${(MIN_SEC / TARGET_SEC) * 100}%` }}
              />
            </div>
            <p className="text-center text-[12px] font-bold text-neutral-500">
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
              {secs < MIN_SEC
                ? ` · ${MIN_SEC - secs}초만 더 읽어주세요`
                : ` · 목표 ${TARGET_SEC}초 (지금 끝내도 좋아요)`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => recorderRef.current?.stop()}
            disabled={secs < MIN_SEC}
            className={`rounded-full py-3 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:bg-neutral-300 ${
              secs < MIN_SEC ? "" : "animate-pulse bg-red-500"
            }`}
          >
            {secs < MIN_SEC ? "읽는 중… (조금만 더!)" : "⏹ 녹음 끝내기"}
          </button>
        </div>
      )}

      {(phase === "preview" || phase === "saving") && (
        <div className="flex flex-col gap-3">
          {/* 품질 판정 — 기준을 통과하지 못하면 저장하지 않고 다시 녹음하게 한다. */}
          {verdict === null ? (
            <p className="rounded-xl bg-white px-4 py-3 text-center text-[13px] font-bold text-neutral-400">
              녹음을 확인하고 있어요…
            </p>
          ) : (
            <div
              className={`rounded-xl px-4 py-3 ${verdict.ok ? "bg-emerald-50" : "bg-amber-50"}`}
            >
              <p
                className={`text-[13px] font-extrabold ${
                  verdict.ok ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {verdict.ok ? "✅" : "⚠️"} {verdict.title}
              </p>
              <p className="mt-0.5 break-keep text-[12px] font-medium leading-relaxed text-neutral-600">
                {verdict.detail}
              </p>
            </div>
          )}

          {previewUrl && <audio controls src={previewUrl} className="w-full" />}

          {/* 첫 녹음이 합격하면 발음 구성이 다른 두 번째 문장을 반드시 읽는다. */}
          {takes < RECORDING_SCRIPTS.length && verdict?.ok ? (
            <button
              type="button"
              onClick={() => startRecording(false)}
              className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-left"
            >
              <span className="block text-[13px] font-extrabold text-amber-800">
                ➡️ 두 번째 문장 읽기
              </span>
              <span className="mt-0.5 block break-keep text-[11px] font-medium leading-relaxed text-amber-700">
                다른 발음과 질문·감탄이 담긴 문장을 한 번 더 읽어야 저장할 수 있어요.
              </span>
            </button>
          ) : takes >= RECORDING_SCRIPTS.length && verdict?.ok ? (
            <p className="break-keep rounded-2xl bg-emerald-50 px-4 py-2.5 text-[12px] font-extrabold text-emerald-700">
              ✅ 서로 다른 문장 두 개가 모두 준비됐어요
            </p>
          ) : null}

          <label className="flex items-start gap-2 text-[13px] font-medium text-neutral-700">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <b>제 목소리</b>가 맞으며, 우리 아이 동화 낭독을 만드는 데 사용하는 것에
              동의합니다.
            </span>
          </label>

          <div className="flex gap-2">
            {/* 판정이 나쁘면 저장을 막고 처음부터 다시 녹음하게 한다. */}
            <button
              type="button"
              onClick={() => startRecording(true)}
              className={`flex-1 rounded-full py-2.5 text-sm font-extrabold shadow ${
                verdict && !verdict.ok ? "bg-amber-400 text-white" : "bg-white text-neutral-600"
              }`}
            >
              🔄 처음부터 다시
            </button>
            <button
              type="button"
              onClick={save}
              disabled={
                !consent ||
                phase === "saving" ||
                !verdict?.ok ||
                takes < RECORDING_SCRIPTS.length
              }
              className="flex-1 rounded-full py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
              style={{ background: accent }}
            >
              {phase === "saving" ? "저장 중…" : "저장하기"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

      <button
        type="button"
        onClick={onCancel}
        className="text-xs font-bold text-neutral-400"
      >
        닫기
      </button>
    </div>
  );
}
