"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FLAGS } from "@/components/FlagFilter";
import { ThemePicker } from "@/components/ThemePicker";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import {
  deleteMyBook,
  loadChild,
  loadLang,
  loadMyBooks,
  loadTextPos,
  saveChild,
  saveLang,
  saveTextPos,
  setMyBookHidden,
  type Gender,
} from "@/lib/prefs";
import type { Book } from "@/lib/types";
import { useEscClose } from "@/lib/use-esc-close";
import {
  PRESET_VOICES,
  TYPECAST_VOICES,
  VOICE_RATES,
  buildPresetUtterance,
  deleteVoiceAudio,
  findTypecast,
  loadCustomVoices,
  loadSelectedVoiceId,
  loadVoiceAudio,
  loadVoiceRate,
  saveCustomVoices,
  saveSelectedVoiceId,
  saveVoiceRate,
  type CustomVoice,
  type PresetVoice,
  type TypecastPreset,
} from "@/lib/voices";

const AGES = [3, 4, 5, 6, 7, 8];
const GENDERS: { value: Gender; label: string; icon: string }[] = [
  { value: "girl", label: "여자", icon: "/icons/gender-girl.webp" },
  { value: "boy", label: "남자", icon: "/icons/gender-boy.webp" },
];

/**
 * 옵션(⚙️) — 부모가 만지는 화면.
 *
 * 아이 정보·나라(테마)·언어를 여기 모은다. 메인은 아이가 보는 화면이라
 * 컨트롤을 걷어내고, 바뀌는 값은 저장해서 만들기 위저드가 미리 채운다.
 * 모든 변경은 즉시 저장된다 (저장 버튼 없음 — 부모 조작을 최소로).
 */
export default function SettingsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { accent } = theme.colors;

  // 설정값은 서버 렌더 중 localStorage에서 읽지 않는다. 마운트 후 불러와야
  // 저장된 값이 있는 브라우저에서도 서버 HTML과 첫 클라이언트 렌더가 같다.
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<Gender>("girl");
  const [lang, setLang] = useState("ko");

  // 목소리 — 프리셋 선택 + 엄마·아빠 녹음 관리
  const [voiceId, setVoiceId] = useState("basic");
  const [voiceRate, setVoiceRate] = useState(1);
  // 책 화면 — 글자 위치(위/아래)
  const [textPos, setTextPos] = useState<ReturnType<typeof loadTextPos>>("bottom");
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [recording, setRecording] = useState<{ label: string; emoji: string } | null>(null);
  // 내 동화 — 만든 책 전체. 여기서 책장 노출(숨기기/보이기)과 영구 삭제를 관리한다.
  const [myBooks, setMyBooks] = useState<Book[]>([]);

  // localStorage 값들은 클라 전용이라 마운트 후에 반영한다(hydration 안전).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = loadChild();
    if (stored) {
      setName(stored.name);
      setAge(stored.age);
      setGender(stored.gender);
    }
    setLang(loadLang());
    setVoiceId(loadSelectedVoiceId());
    setVoiceRate(loadVoiceRate());
    setTextPos(loadTextPos());
    setCustomVoices(loadCustomVoices());
    setMyBooks(loadMyBooks());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 책장 노출 토글(숨기기/보이기) — 숨기면 책장에서 내려가고, 보이면 다시 뜬다.
  function toggleHide(id: string, hidden: boolean) {
    setMyBookHidden(id, hidden);
    setMyBooks((prev) => prev.map((b) => (b.id === id ? { ...b, hidden } : b)));
    flashSaved();
  }
  // 영구 삭제 — 복원 불가라 경고를 띄우고 한 번 더 확인받는다.
  function purgeBook(id: string, title: string) {
    if (!window.confirm(`⚠️ "${title}"을(를) 영구 삭제할까요?\n\n완전히 지워지며 복원할 수 없어요.`)) return;
    deleteMyBook(id);
    setMyBooks((prev) => prev.filter((b) => b.id !== id));
    flashSaved();
  }

  // ESC로 설정을 닫는다(홈으로). 녹음 팝업이 열려 있으면 팝업이 먼저 닫히고,
  // 한 번 더 누르면 설정이 닫힌다.
  useEscClose(() => router.push("/"), !recording);

  // 저장 버튼이 없는 대신, 바뀔 때마다 "저장됐어요"를 잠깐 보여줘 안심시킨다.
  const [savedTick, setSavedTick] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSaved = () => {
    setSavedTick(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedTick(false), 1500);
  };
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // 나라(테마) 변경은 ThemePicker 안에서 저장된다 — 바뀐 것만 감지해 표시한다.
  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    flashSaved();
  }, [theme.id]);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  /** 미리듣기를 멈춘다 (TTS·오디오 둘 다). */
  const stopPreview = () => {
    window.speechSynthesis?.cancel();
    previewAudioRef.current?.pause();
  };

  /** 칩을 누르면 선택 + 그 목소리로 인사말이 바로 들린다. */
  const pickVoice = (id: string, preset?: PresetVoice) => {
    setVoiceId(id);
    saveSelectedVoiceId(id);
    flashSaved();
    stopPreview();
    if (preset && "speechSynthesis" in window) {
      // 책 읽어주기와 같은 로직(음성 배정·높낮이·속도 과장) — 미리 들은 대로 읽힌다.
      window.speechSynthesis.speak(buildPresetUtterance(preset.sample, preset, voiceRate));
    }
  };

  // 성우 칩 — 누르면 선택 + 인사말을 그 성우 목소리로 받아 들려준다.
  // 같은 인사말은 기기에 캐시되므로 크레딧은 처음 한 번만 나간다.
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const pickTypecast = (tc: TypecastPreset) => {
    setVoiceId(tc.id);
    saveSelectedVoiceId(tc.id);
    flashSaved();
    stopPreview();
    setTtsError(null);
    // 미리듣기는 '미리 구운 샘플 파일'만 재생한다 → 크레딧 0. 실시간 합성은 안 한다.
    // 아직 샘플이 없는 성우는 소리 없이 선택만 된다(크레딧 안 씀).
    const el = previewAudioRef.current ?? new Audio();
    previewAudioRef.current = el;
    el.src = `/casting/preview-${tc.id}.mp3`;
    el.playbackRate = voiceRate;
    setPreviewingId(tc.id);
    el.onended = () => setPreviewingId(null);
    el.onerror = () => setPreviewingId(null); // 샘플 파일 없음 — 조용히 넘긴다
    el.play().catch(() => setPreviewingId(null));
  };

  /** 읽기 속도 — 고르면 지금 목소리로 그 속도를 바로 들려준다. */
  const pickRate = (rate: number) => {
    setVoiceRate(rate);
    saveVoiceRate(rate);
    flashSaved();
    stopPreview();
    // 성우를 골라둔 상태면 그 성우 목소리로 들려준다 — 인사말은 캐시라 무료다.
    const tc = findTypecast(voiceId);
    if (tc) {
      // 속도 미리듣기도 구운 샘플 파일로만 — 크레딧 0.
      const el = previewAudioRef.current ?? new Audio();
      previewAudioRef.current = el;
      el.src = `/casting/preview-${tc.id}.mp3`;
      el.playbackRate = rate;
      setPreviewingId(tc.id);
      el.onended = () => setPreviewingId(null);
      el.onerror = () => setPreviewingId(null);
      el.play().catch(() => setPreviewingId(null));
      return;
    }
    const preset = PRESET_VOICES.find((v) => v.id === voiceId) ?? PRESET_VOICES[0];
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(buildPresetUtterance(preset.sample, preset, rate));
    }
  };

  /** 엄마·아빠 칩 — 녹음해둔 실제 목소리가 재생된다. */
  const previewCustom = async (v: CustomVoice) => {
    stopPreview();
    const blob = await loadVoiceAudio(v.id).catch(() => null);
    if (!blob) return;
    const el = previewAudioRef.current ?? new Audio();
    previewAudioRef.current = el;
    el.src = URL.createObjectURL(blob);
    el.playbackRate = voiceRate;
    el.play().catch(() => {});
  };

  const removeCustom = async (v: CustomVoice) => {
    await deleteVoiceAudio(v.id).catch(() => {});
    const next = customVoices.filter((x) => x.id !== v.id);
    setCustomVoices(next);
    saveCustomVoices(next);
    flashSaved();
    if (voiceId === v.id) pickVoice("basic");
  };

  const persistChild = (next: { name?: string; age?: number | null; gender?: Gender }) => {
    const merged = {
      name: next.name ?? name,
      age: next.age !== undefined ? next.age : age,
      gender: next.gender ?? gender,
    };
    saveChild(merged);
    flashSaved();
  };

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={theme.background}
        alt=""
        className="fixed inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="fixed inset-0 -z-10 bg-white/30" />

      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-6 pb-10 pt-20">
        <Link
          href="/"
          className="absolute left-4 top-4 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-neutral-700 backdrop-blur"
        >
          ← 돌아가기
        </Link>

        {/* 설정 항목이 많아 화면보다 길어질 수 있다 — 카드에 최대 높이를 주고
            안에서 스크롤되게 해 위아래가 짤리지 않게 한다. */}
        <div className="flex max-h-[calc(100dvh-7rem)] flex-col gap-5 overflow-y-auto rounded-[28px] bg-white/90 p-7 shadow-xl backdrop-blur">
          <h1 className="text-center text-2xl font-extrabold text-neutral-800">⚙️ 설정</h1>
          {/* 저장 버튼이 없는 이유를 화면이 직접 말해준다 + 바뀔 때마다 확인 표시 */}
          <p className="-mt-4 text-center text-xs font-bold" aria-live="polite">
            {savedTick ? (
              <span className="text-emerald-600">✓ 저장됐어요</span>
            ) : (
              <span className="text-neutral-400">바꾸는 대로 자동 저장돼요</span>
            )}
          </p>

          {/* ── 아이 정보 ── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold text-neutral-400">아이 정보</h2>

            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                persistChild({ name: e.target.value });
              }}
              maxLength={20}
              placeholder="아이 이름"
              className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-lg font-bold outline-none focus:border-neutral-400"
            />

            <div className="flex flex-wrap gap-2">
              {AGES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAge(a);
                    persistChild({ age: a });
                  }}
                  style={age === a ? { background: accent } : undefined}
                  className={`h-11 w-11 rounded-full text-base font-extrabold transition ${
                    age === a
                      ? "scale-110 text-white shadow"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => {
                    setGender(g.value);
                    persistChild({ gender: g.value });
                  }}
                  style={gender === g.value ? { background: accent } : undefined}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2.5 font-bold transition ${
                    gender === g.value
                      ? "text-white shadow"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.icon} alt="" className="h-8 w-8 object-contain" />
                  </span>
                  <span className="text-xs">{g.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── 나라(테마) ── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">나라 고르기</h2>
            <ThemePicker />
          </section>

          {/* ── 목소리 (성우 전용) ── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">읽어주는 목소리</h2>

            {/* 성우 목소리 (Typecast) — 진짜 성우가 읽어준다. 브라우저 기계음 프리셋은
                UI에서 뺐다 (성우를 못 받는 오프라인 등에서만 뒤에서 대체로 쓰인다). */}
            <p className="text-[11px] font-medium text-neutral-400">
              진짜 성우가 감정을 담아 읽어줘요 (인터넷 필요)
            </p>
            <div className="flex flex-wrap gap-2">
              {TYPECAST_VOICES.map((v) => {
                const active = voiceId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => pickTypecast(v)}
                    aria-pressed={active}
                    title={v.desc}
                    style={active ? { background: accent } : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-base leading-none">
                      {previewingId === v.id ? "⏳" : v.emoji}
                    </span>
                    {v.label}
                  </button>
                );
              })}
            </div>
            {ttsError && <p className="text-[11px] font-bold text-rose-500">{ttsError}</p>}

            {/* 녹음한 엄마·아빠 목소리 (클로닝 붙기 전까지 준비 중) */}
            {customVoices.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customVoices.map((v) => (
                  <span
                    key={v.id}
                    className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-2 text-sm font-bold text-amber-800"
                  >
                    <button
                      type="button"
                      onClick={() => previewCustom(v)}
                      aria-label={`${v.label} 목소리 들어보기`}
                      className="flex items-center gap-1.5"
                    >
                      <span className="text-lg leading-none">{v.emoji}</span>
                      {v.label} 🔊
                    </button>
                    <span className="rounded-full bg-white/70 px-1.5 text-[10px]">녹음 완료 · 준비 중</span>
                    <button
                      type="button"
                      aria-label={`${v.label} 목소리 삭제`}
                      onClick={() => removeCustom(v)}
                      className="text-amber-600"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 읽기 속도 — 느리다고 느끼는 집을 위해. 누르면 그 속도로 바로 들린다. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-neutral-400">읽기 속도</span>
              {VOICE_RATES.map((r) => {
                const active = voiceRate === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => pickRate(r.value)}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? "text-white shadow"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* 엄마·아빠 추가 */}
            {!recording && (
              <div className="flex gap-2">
                {[
                  { label: "엄마", emoji: "👩" },
                  { label: "아빠", emoji: "👨" },
                ]
                  .filter((o) => !customVoices.some((v) => v.label === o.label))
                  .map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setRecording(o)}
                      className="rounded-full border-2 border-dashed border-neutral-300 px-4 py-2 text-sm font-bold text-neutral-500 hover:border-neutral-400"
                    >
                      + {o.emoji} {o.label} 목소리 추가
                    </button>
                  ))}
              </div>
            )}

            {recording && (
              <VoiceRecorder
                label={recording.label}
                emoji={recording.emoji}
                accent={accent}
                onDone={(v) => {
                  setCustomVoices([...customVoices, v]);
                  setRecording(null);
                  flashSaved();
                }}
                onCancel={() => setRecording(null)}
              />
            )}

            <p className="text-[11px] font-medium text-neutral-400">
              엄마·아빠 목소리는 녹음해두면, 목소리 낭독 기능이 열릴 때 자동으로
              연결돼요. 캐릭터 목소리는 지금 바로 쓸 수 있어요.
            </p>
          </section>

          {/* ── 책 화면 ── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">책 글자 위치</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "bottom", label: "아래쪽", icon: "⬇️" },
                  { value: "top", label: "위쪽", icon: "⬆️" },
                  { value: "center", label: "가운데", icon: "🎯" },
                  { value: "left", label: "왼쪽 가운데", icon: "⬅️" },
                  { value: "right", label: "오른쪽 가운데", icon: "➡️" },
                ] as const
              ).map((p) => {
                const active = textPos === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setTextPos(p.value);
                      saveTextPos(p.value);
                      flashSaved();
                    }}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    <span aria-hidden>{p.icon}</span>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-medium text-neutral-400">
              동화책에서 글이 그림의 어느 쪽에 얹힐지 골라요.
            </p>
          </section>

          {/* ── 언어 ── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">동화 언어</h2>
            <div className="flex items-center gap-3">
              {FLAGS.map((f) => {
                const active = f.lang === lang;
                return (
                  <button
                    key={f.lang}
                    type="button"
                    onClick={() => {
                      setLang(f.lang);
                      saveLang(f.lang);
                      flashSaved();
                    }}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-full border-2 py-1.5 pl-1.5 pr-3.5 font-bold transition ${
                      active
                        ? "border-neutral-300 bg-white shadow"
                        : "border-transparent bg-neutral-100 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <span className="block h-7 w-7 overflow-hidden rounded-full border border-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.src} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="text-sm text-neutral-700">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 내 동화 관리 ── 만든 책 전체. 책장 노출(숨기기/보이기)과 영구 삭제를
              여기서만 한다(책장에는 관리 버튼을 두지 않는다). 하나도 없으면 칸을 감춘다. */}
          {myBooks.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm font-extrabold text-neutral-400">
                내 동화 ({myBooks.length})
              </h2>
              <p className="-mt-1 text-xs font-medium text-neutral-400">
                만든 동화 목록이에요. 책장에서 숨기거나, 영구 삭제할 수 있어요.
              </p>
              <ul className="flex flex-col gap-2">
                {myBooks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 rounded-2xl bg-neutral-100 px-3 py-2"
                  >
                    <span className="flex flex-1 items-center gap-1.5 truncate">
                      <span className="truncate text-sm font-bold text-neutral-700">
                        {b.title}
                      </span>
                      {b.hidden && (
                        <span className="shrink-0 rounded-full bg-neutral-300 px-1.5 py-0.5 text-[10px] font-extrabold text-neutral-600">
                          숨김
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleHide(b.id, !b.hidden)}
                      className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-neutral-700 shadow-sm"
                    >
                      {b.hidden ? "보이기" : "숨기기"}
                    </button>
                    <button
                      type="button"
                      onClick={() => purgeBook(b.id, b.title)}
                      className="shrink-0 rounded-full bg-red-500 px-3 py-1.5 text-xs font-extrabold text-white"
                    >
                      영구 삭제
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 모두 자동 저장이라 이 버튼은 "닫기"일 뿐이지만, 마무리 버튼이 있어야 안심한다. */}
          <button
            type="button"
            onClick={() => router.push("/")}
            style={{ background: accent }}
            className="mt-1 rounded-full py-3 text-lg font-extrabold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            확인
          </button>
        </div>
      </main>
    </div>
  );
}
