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
/**
 * 이보다 짧으면 Typecast가 아예 거부한다(실측: 3초 거부, 15초 통과).
 * 저장을 막는 유일한 기준 — 나머지 품질 문제는 알려만 주고 저장은 되게 한다.
 */
const HARD_MIN_SEC = 10;
const NOISE_CHECK_MS = 2000;
/**
 * 방 소음 상한.
 *
 * 0.012는 trimSilence가 '말소리'로 치는 값(parent-voice.ts)과 똑같아서, 냉장고·에어컨
 * 정도의 조용한 방도 떨어졌다. 걸리면 첫 화면으로 튕겨 잘 읽은 문장까지 잃었다.
 * 기준을 올리고, 두 번 연달아 걸리면 건너뛸 수 있게 열어 둔다.
 */
const NOISE_RMS_MAX = 0.02;

/**
 * 마이크 입력 크기 기준.
 * 실제 낭독 파일로 재보니 알맞게 녹음된 목소리는 RMS 0.07~0.08이었다.
 * 막대는 그 값이 절반쯤 차 보이도록 눈금을 잡는다 — 막대를 끝까지 채우려고
 * 소리를 지르면 오히려 깨져서 클론이 나빠진다.
 */
const LEVEL_QUIET = 0.015; // 이 아래면 너무 작다
const LEVEL_LOUD = 0.3; // 이 위면 너무 크다
const LEVEL_FULL = 0.15; // 막대가 가득 차는 기준값

/**
 * 녹음 판정.
 *
 * 예전엔 ok/실패 두 가지뿐이라, 조금 아쉬운 녹음도 저장을 완전히 막았다.
 * 세 단계로 나눈다:
 *  · ok    — 좋다
 *  · warn  — 아쉽지만 저장은 된다(확인만 받는다). 대부분의 경우가 여기다.
 *  · block — 저장하면 안 된다. Typecast가 실제로 거부하는 길이(10초 미만)만.
 */
type VerdictLevel = "ok" | "warn" | "block";
type Verdict = { level: VerdictLevel; title: string; detail: string };

/** 문장 한 자리에 담긴 녹음. */
type Take = { blob: Blob; url: string; verdict: Verdict | null };

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
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // 지금 켜져 있는 마이크 스트림 — 오류가 나도 반드시 끌 수 있게 따로 들고 있는다.
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * 문장별 '자리'. RECORDING_SCRIPTS와 길이가 같고, 자리마다 녹음 하나가 들어간다.
   *
   * 예전엔 끝난 녹음을 배열에 계속 쌓았는데, 판정이 나쁜 녹음도 그대로 쌓이는 바람에
   * "다음 문장"도 "저장"도 사라지고 '처음부터 다시'만 남았다. 그 버튼은 잘 읽은
   * 1번 문장까지 지워서, 다시 읽고 또 실패하면 영영 못 빠져나왔다.
   * 이제 자리마다 덮어쓰기만 한다 — 한 문장을 다시 읽어도 다른 문장은 그대로다.
   */
  const [takes, setTakes] = useState<(Take | null)[]>(() =>
    RECORDING_SCRIPTS.map(() => null),
  );
  /** 지금 녹음 중인 자리 — onstop 콜백이 어느 자리인지 알아야 한다. */
  const activeIndexRef = useRef(0);
  /** 미리듣기·판정을 보여줄 자리. */
  const [reviewIndex, setReviewIndex] = useState(0);
  // 마이크 권한을 기다리는 사이 닫히면, 뒤늦게 온 스트림을 바로 꺼야 한다.
  const closedRef = useRef(false);
  // 소음 검사에 연달아 걸린 횟수 — 두 번 걸리면 그냥 진행할 수 있게 열어 준다.
  const noiseRejectsRef = useRef(0);
  /*
   * 마지막으로 잰 방 소음. 저장할 때 노이즈 게이트의 문턱이 된다.
   *
   * 브라우저 소음 제거(noiseSuppression)는 일부러 꺼 둔다 — 사람 목소리까지 깎아서
   * 클론이 덜 닮아진다. 대신 이 값으로 '말할 때는 손대지 않고 말 사이만' 누른다.
   */
  const roomNoiseRef = useRef(0);
  const [skipNoiseCheck, setSkipNoiseCheck] = useState(false);
  /**
   * 녹음 조작(소리 막대·시간·끝내기) 자리.
   *
   * 녹음이 시작되면 여기로 화면을 옮겨 준다. 대본이 길어서, 시작 버튼을 누른 자리에
   * 그대로 있으면 조작이 화면 아래로 밀려 보이지 않는다 — 다 읽고 나서 끝내려고
   * 아래로 내려야 했던 것이 그 때문이다.
   */
  const recordingControlsRef = useRef<HTMLDivElement | null>(null);

  // 녹음 중 상태 — 지금 소리 크기(0~1)와 흘러간 초. 말하면서 바로 보여 준다.
  const [level, setLevel] = useState(0);
  const [zone, setZone] = useState<"quiet" | "good" | "loud">("quiet");
  const [secs, setSecs] = useState(0);
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

  /** 녹음 중인지 — 이때만 화면을 대본 읽기에 맞춰 다시 짠다. */
  const recordingNow = phase === "recording";

  /*
   * 녹음이 시작되면 조작이 있는 곳으로 화면을 옮긴다.
   *
   * 대본이 여섯 문장이라, 시작 버튼을 누른 자리에 그대로 서 있으면 소리 막대와
   * '녹음 끝내기'가 화면 밖에 있다. 읽는 동안 내 소리가 잘 들어가는지 못 보고,
   * 다 읽고 나서야 아래로 내려 끝내야 했다.
   */
  useEffect(() => {
    if (!recordingNow) return;
    recordingControlsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [recordingNow]);

  /*
   * 팝업이 닫혔는지 표시 — 마이크 권한을 기다리는 사이 닫히면 뒤늦게 온 스트림을 바로 끈다.
   *
   * 마운트에서 반드시 false로 되돌려야 한다. React StrictMode(개발)는 마운트 → 정리 →
   * 마운트를 한 번 돌리는데, 정리에서 true로 켠 값을 되돌리지 않으면 그 뒤로 영영 true다.
   * 그러면 startRecording이 getUserMedia 직후 조용히 빠져나가서, 마이크 권한만 뜨고
   * 아무 일도 일어나지 않는다(개발에서 녹음이 아예 시작되지 않던 원인).
   */
  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

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

  // 화면을 떠날 때 미리듣기 URL을 모두 해제한다(자리별로 하나씩 들고 있다).
  const takesRef = useRef(takes);
  takesRef.current = takes;
  useEffect(
    () => () => {
      for (const take of takesRef.current) {
        if (take) URL.revokeObjectURL(take.url);
      }
    },
    [],
  );

  /** 지금까지 읽은 게 하나라도 있으면 true — 오류가 나도 첫 화면으로 되돌리지 않기 위해. */
  const hasAnyTake = () => takesRef.current.some(Boolean);

  /**
   * 닫기 — 읽어 둔 게 있으면 한 번 물어본다.
   * 예전엔 ESC 한 번에 두 문장이 말없이 사라졌다.
   */
  const requestClose = () => {
    if (hasAnyTake() && !window.confirm("읽어 둔 문장이 있어요. 닫으면 사라져요. 닫을까요?")) return;
    onCancel();
  };
  // 저장 중·녹음 중에는 끊기면 안 되므로 ESC를 막는다.
  useEscClose(requestClose, phase !== "saving" && phase !== "recording");

  /**
   * 한 문장(index)을 녹음한다. **그 자리 하나만** 덮어쓴다.
   *
   * 예전엔 '처음부터 다시'가 전체를 지웠는데, 판정이 나쁘면 그 버튼밖에 남지 않아
   * 잘 읽은 문장까지 잃고 무한히 반복됐다. 이제 다시 읽어도 다른 문장은 그대로다.
   */
  async function startRecording(index: number) {
    setError("");
    setLevel(0);
    setZone("quiet");
    setSecs(0);
    activeIndexRef.current = index;
    setReviewIndex(index);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
        },
      });
      streamRef.current = stream;
      // 기다리는 동안 팝업이 닫혔으면(ESC·닫기) 마이크를 켜두지 않는다.
      if (closedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // 소음 검사에 두 번 연달아 걸린 사람은 건너뛸 수 있다(아래 skipNoiseCheck).
      if (!skipNoiseCheck) {
        setPhase("checking");
        const roomNoise = await measureRoomNoise(stream);
        roomNoiseRef.current = roomNoise;
        if (closedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (roomNoise > NOISE_RMS_MAX) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          noiseRejectsRef.current++;
          // 읽은 게 있으면 첫 화면으로 보내지 않는다 — 거기 있는 버튼이 전부를 지웠다.
          setPhase(hasAnyTake() ? "preview" : "idle");
          setError(
            noiseRejectsRef.current >= 2
              ? "주변 소리가 계속 들려요. 조용한 곳이 없다면 아래 '그래도 녹음할게요'로 진행할 수 있어요."
              : "주변 소리가 크게 들려요. TV·음악·선풍기·에어컨을 끄고 다시 시도해주세요.",
          );
          return;
        }
      }
      noiseRejectsRef.current = 0;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        stopMeter();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        const url = URL.createObjectURL(blob);
        // 판정을 알기 전에 자리에 넣는다. 넣은 녹음은 절대 지우지 않는다 —
        // 판정이 나빠도 사람이 직접 다시 읽기 전까지는 남아 있어야 한다.
        setTakes((prev) =>
          prev.map((take, i) => {
            if (i !== index) return take;
            if (take) URL.revokeObjectURL(take.url); // 같은 자리를 다시 읽었으면 옛 URL 정리
            return { blob, url, verdict: null };
          }),
        );
        setReviewIndex(index);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setPhase("preview");
        void checkQuality(blob, index);
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
      // 여기까지 오면 마이크가 켜진 채 "확인 중" 화면에 갇힐 수 있다 — 반드시 정리한다.
      stopMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPhase(hasAnyTake() ? "preview" : "idle");
      setError("마이크를 사용할 수 없어요. 브라우저 권한을 확인해주세요.");
    }
  }

  /**
   * 녹음이 끝나면 파일을 열어 품질을 본다 — 길이·평균 크기·깨진 구간·무음 비율.
   * 다시 녹음은 몇 번이든 공짜이므로, 품질 기준을 통과한 녹음만 저장한다.
   */
  async function checkQuality(blob: Blob, index: number): Promise<void> {
    const put = (verdict: Verdict) =>
      setTakes((prev) => prev.map((take, i) => (i === index && take ? { ...take, verdict } : take)));
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

      // 저장을 막는 건 Typecast가 실제로 거부하는 길이뿐이다. 나머지는 알려만 준다 —
      // "조금 아쉬움" 때문에 저장을 막으면 부모가 빠져나갈 길이 없어진다.
      if (dur < HARD_MIN_SEC) {
        put({
          level: "block",
          title: "너무 짧아요",
          detail: `${Math.round(dur)}초예요. ${HARD_MIN_SEC}초보다 짧으면 목소리를 만들 수 없어서, 이 문장은 다시 읽어야 해요.`,
        });
      } else if (dur < MIN_SEC) {
        put({
          level: "warn",
          title: "조금 더 길게 읽으면 더 닮아요",
          detail: `${Math.round(dur)}초 녹음됐어요. 문장을 끝까지 읽으면 ${TARGET_SEC}초쯤 돼요.`,
        });
      } else if (clipRatio > 0.01) {
        put({
          level: "warn",
          title: "소리가 조금 깨졌어요",
          detail: "폰을 조금 멀리 두고 다시 읽으면 더 좋아요. 이대로 저장해도 괜찮아요.",
        });
      } else if (rms < 0.02) {
        put({
          level: "warn",
          title: "소리가 조금 작아요",
          detail: "폰을 입에서 한 뼘 거리에 두면 더 또렷해요. 이대로 저장해도 괜찮아요.",
        });
      } else if (silence > 0.45) {
        put({
          level: "warn",
          title: "조용한 구간이 많아요",
          detail: "중간에 오래 쉬지 말고 이어서 읽으면 더 잘 배워요. 이대로 저장해도 괜찮아요.",
        });
      } else {
        put({
          level: "ok",
          title: "좋은 녹음이에요!",
          detail: `${Math.round(dur)}초 · 소리 크기도 알맞아요. 들어보고 저장해 주세요.`,
        });
      }
    } catch {
      // 분석 실패는 막지 않는다 — 판정은 도우미일 뿐, 저장 자체는 되게 한다.
      // (예전엔 여기서 막아서, 브라우저가 이 파일을 못 여는 기기는 영영 저장을 못 했다.)
      put({
        level: "ok",
        title: "녹음을 확인하지 못했어요",
        detail: "품질 검사를 못 했지만 저장할 수 있어요. 들어보고 괜찮으면 저장해 주세요.",
      });
    }
  }

  async function save() {
    const filled = takes.filter((take): take is Take => Boolean(take));
    if (!consent || filled.length < RECORDING_SCRIPTS.length) return;
    if (filled.some((take) => take.verdict?.level === "block")) return;
    // 아쉬운 녹음도 저장은 되게 하되, 모르고 지나치지 않게 한 번 확인받는다.
    if (
      filled.some((take) => take.verdict?.level === "warn") &&
      !window.confirm("아쉬운 점이 있는 녹음이 있어요. 그래도 이대로 저장할까요?")
    ) {
      return;
    }
    setPhase("saving");
    setError("");
    // 읽은 것들을 문장 순서대로 이어 붙이고, 소리 크기·침묵·저주파 잡음까지 다듬어 저장한다.
    // 여기서 잘 다듬을수록 복제된 목소리가 더 닮는다.
    let audio: Blob;
    try {
      audio = await prepareVoiceWav(
        filled.map((take) => take.blob),
        roomNoiseRef.current,
      );
    } catch {
      // 녹음은 그대로 둔다 — 여기서 자리를 비우면 애써 읽은 걸 잃는다.
      setError("녹음을 음성 학습용 파일로 정리하지 못했어요. 잠시 뒤 저장을 다시 눌러 주세요.");
      setPhase("preview");
      return;
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

      {/*
        * 녹음 중에는 대본과 조작을 한 덩어리로 묶는다.
        *
        * 대본이 여섯 문장이라 길다. 예전엔 그 아래에 '녹음 끝내기'가 있어서, 다 읽고
        * 나면 버튼이 화면 밖에 있었다 — 읽다 말고 아래로 내려야 끝낼 수 있었다.
        *
        * 좁은 화면에서는 대본 칸의 높이를 30dvh로 묶어 안에서 굴리게 한다. 그러면
        * 대본이 아무리 길어도 조작이 밀려나지 않는다(대본 30dvh + 조작 약 230px이라
        * 작은 폰에서도 한 화면에 든다). 넓은 화면에서는 대본 옆에 나란히 세운다.
        */}
      <div
        className={
          recordingNow
            ? "flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4"
            : "contents"
        }
      >
        {/* 지정 문장 — 이것만 읽는다 */}
        <div
          className={`rounded-xl bg-white p-4 ${
            recordingNow ? "max-h-[30dvh] overflow-y-auto sm:max-h-[52dvh] sm:flex-1" : ""
          }`}
        >
          <p className="text-[13px] font-medium leading-relaxed text-neutral-700">
            아래 문장을 또박또박 읽어주세요:
          </p>
          <p className="mt-2 text-[15px] font-bold leading-relaxed text-neutral-800">
            <span className="mb-1 block text-[11px] text-neutral-400">
              {reviewIndex + 1}번째 문장 / {RECORDING_SCRIPTS.length}
            </span>
            “{RECORDING_SCRIPTS[reviewIndex]}”
          </p>
        </div>

        {phase === "recording" && (
          <div
            ref={recordingControlsRef}
            className="flex flex-col gap-3 sm:w-60 sm:shrink-0"
          >
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
      </div>

      {/* 신뢰 안내 — 숨기지 않고 전면에. 다만 읽는 중에는 자리를 비켜 준다. */}
      {!recordingNow && (
        <ul className="flex flex-col gap-1 text-[12px] font-medium text-neutral-500">
          <li>✓ 지정된 동화 문장만 녹음해요 — 개인 정보는 녹음되지 않아요</li>
          <li>✓ 녹음은 이 기기에만 보관돼요</li>
          <li>✓ 언제든지 삭제할 수 있어요</li>
        </ul>
      )}

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
            onClick={() => startRecording(0)}
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

      {(phase === "preview" || phase === "saving") && (
        <div className="flex flex-col gap-3">
          {/* 문장 자리 — 어느 문장을 읽었고 어떤 판정인지 한눈에. 눌러서 옮겨 다닌다.
              판정과 상관없이 항상 보인다: 예전엔 판정이 나쁘면 아무 버튼도 안 남아
              '처음부터 다시'밖에 길이 없었고, 그게 잘 읽은 문장까지 지웠다. */}
          <div className="flex gap-2">
            {RECORDING_SCRIPTS.map((_, i) => {
              const take = takes[i];
              const mark = !take
                ? "○"
                : take.verdict === null
                  ? "…"
                  : take.verdict.level === "ok"
                    ? "✅"
                    : take.verdict.level === "warn"
                      ? "⚠️"
                      : "❌";
              const active = i === reviewIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => (take ? setReviewIndex(i) : startRecording(i))}
                  className={`flex-1 rounded-xl px-2 py-2 text-[12px] font-extrabold transition ${
                    active ? "bg-white shadow" : "bg-white/50 text-neutral-500"
                  }`}
                >
                  {i + 1}번 문장 {mark}
                </button>
              );
            })}
          </div>

          {(() => {
            const take = takes[reviewIndex];
            if (!take) {
              return (
                <button
                  type="button"
                  onClick={() => startRecording(reviewIndex)}
                  className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-center text-[13px] font-extrabold text-amber-800"
                >
                  🎙️ {reviewIndex + 1}번 문장 읽기
                </button>
              );
            }
            const v = take.verdict;
            const tone =
              v === null
                ? "bg-white text-neutral-400"
                : v.level === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : v.level === "warn"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700";
            return (
              <>
                <div className={`rounded-xl px-4 py-3 ${tone}`}>
                  <p className="text-[13px] font-extrabold">
                    {v === null
                      ? "녹음을 확인하고 있어요…"
                      : `${v.level === "ok" ? "✅" : v.level === "warn" ? "⚠️" : "❌"} ${v.title}`}
                  </p>
                  {v && (
                    <p className="mt-0.5 break-keep text-[12px] font-medium leading-relaxed text-neutral-600">
                      {v.detail}
                    </p>
                  )}
                </div>
                <audio controls src={take.url} className="w-full" />
              </>
            );
          })()}

          {/* 항상 열려 있는 두 갈래 — 이 문장을 다시 읽거나, 아직 안 읽은 문장으로 가거나. */}
          <div className="flex flex-wrap gap-2">
            {takes[reviewIndex] && (
              <button
                type="button"
                onClick={() => startRecording(reviewIndex)}
                className="flex-1 rounded-2xl border-2 border-dashed border-neutral-300 bg-white px-4 py-2.5 text-[13px] font-extrabold text-neutral-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/func-remake.webp" alt="" aria-hidden className="mr-1 inline-block h-5 w-5 object-contain align-[-0.3em]" />
                이 문장 다시 읽기
              </button>
            )}
            {takes.findIndex((take) => !take) >= 0 && (
              <button
                type="button"
                onClick={() => startRecording(takes.findIndex((take) => !take))}
                className="flex-1 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] font-extrabold text-amber-800"
              >
                ➡️ {takes.findIndex((take) => !take) + 1}번 문장 읽기
              </button>
            )}
          </div>

          {takes.every(Boolean) && !takes.some((t) => t?.verdict?.level === "block") && (
            <p className="break-keep rounded-2xl bg-emerald-50 px-4 py-2.5 text-[12px] font-extrabold text-emerald-700">
              ✅ 서로 다른 문장 두 개가 모두 준비됐어요
            </p>
          )}

          <label className="flex items-start gap-2 text-[13px] font-medium text-neutral-700">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <b>제 목소리</b>가 맞으며, 우리 아이 동화 낭독을 만드는 데 사용하는 것에
              동의합니다. 녹음 원본은 이 기기에 보관되고, 목소리 복제 시 정리된 녹음이
              Typecast로 전송되며 계정에는 복제 음성 ID가 저장됩니다.
            </span>
          </label>

          {/* 저장을 막는 건 '아직 안 읽은 문장'과 '너무 짧아 못 쓰는 녹음'뿐이다.
              아쉬운 녹음(warn)은 save()에서 한 번 확인만 받고 저장된다. */}
          <button
            type="button"
            onClick={save}
            disabled={
              !consent ||
              phase === "saving" ||
              !takes.every(Boolean) ||
              takes.some((take) => take?.verdict?.level === "block")
            }
            className="rounded-full py-3 text-base font-extrabold text-white disabled:opacity-40"
            style={{ background: accent }}
          >
            {phase === "saving" ? "저장 중…" : "저장하기"}
          </button>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-2">
          <p className="break-keep text-center text-sm font-bold text-red-600">{error}</p>
          {/* 소음 검사에 두 번 걸린 사람에게만 — 조용한 곳이 없는 집이 영영 못 쓰면 안 된다. */}
          {noiseRejectsRef.current >= 2 && !skipNoiseCheck && (
            <button
              type="button"
              onClick={() => {
                setSkipNoiseCheck(true);
                setError("");
                startRecording(activeIndexRef.current);
              }}
              className="rounded-full bg-neutral-700 px-4 py-2 text-xs font-extrabold text-white"
            >
              그래도 녹음할게요
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={requestClose}
        className="text-xs font-bold text-neutral-400"
      >
        닫기
      </button>
    </div>
  );
}
