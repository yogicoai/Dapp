"use client";

import { useEffect, useRef, useState } from "react";
import { useEscClose } from "@/lib/use-esc-close";
import {
  RECORDING_SCRIPT,
  saveCustomVoices,
  saveVoiceAudio,
  loadCustomVoices,
  type CustomVoice,
} from "@/lib/voices";

type Phase = "idle" | "recording" | "preview" | "saving";

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
  onDone,
  onCancel,
}: {
  label: string; // "엄마" | "아빠"
  emoji: string;
  accent: string;
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
  // 마이크 권한을 기다리는 사이 닫히면, 뒤늦게 온 스트림을 바로 꺼야 한다.
  const closedRef = useRef(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      closedRef.current = true;
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // 이전 미리듣기 URL은 새것이 생기거나 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 기다리는 동안 팝업이 닫혔으면(ESC·닫기) 마이크를 켜두지 않는다.
      if (closedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: rec.mimeType });
        setPreviewUrl(URL.createObjectURL(blobRef.current));
        stream.getTracks().forEach((t) => t.stop());
        setPhase("preview");
      };
      recorderRef.current = rec;
      rec.start();
      setPhase("recording");
    } catch {
      setError("마이크를 사용할 수 없어요. 브라우저 권한을 확인해주세요.");
    }
  }

  async function save() {
    if (!blobRef.current || !consent) return;
    setPhase("saving");
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
      await saveVoiceAudio(id, blobRef.current);
      saveCustomVoices([...loadCustomVoices(), voice]);
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
          “{RECORDING_SCRIPT}”
        </p>
      </div>

      {/* 신뢰 안내 — 숨기지 않고 전면에 */}
      <ul className="flex flex-col gap-1 text-[12px] font-medium text-neutral-500">
        <li>✓ 지정된 동화 문장만 녹음해요 — 개인 정보는 녹음되지 않아요</li>
        <li>✓ 녹음은 이 기기에만 보관돼요</li>
        <li>✓ 언제든지 삭제할 수 있어요</li>
      </ul>

      {phase === "idle" && (
        <button
          type="button"
          onClick={startRecording}
          className="rounded-full py-3 text-base font-extrabold text-white"
          style={{ background: accent }}
        >
          🎙️ 녹음 시작
        </button>
      )}

      {phase === "recording" && (
        <button
          type="button"
          onClick={() => recorderRef.current?.stop()}
          className="animate-pulse rounded-full bg-red-500 py-3 text-base font-extrabold text-white"
        >
          ⏹ 녹음 끝내기 (읽기가 끝나면 눌러주세요)
        </button>
      )}

      {(phase === "preview" || phase === "saving") && (
        <div className="flex flex-col gap-3">
          {previewUrl && <audio controls src={previewUrl} className="w-full" />}

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
            <button
              type="button"
              onClick={startRecording}
              className="flex-1 rounded-full bg-white py-2.5 text-sm font-extrabold text-neutral-600 shadow"
            >
              🔄 다시 녹음
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!consent || phase === "saving"}
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
