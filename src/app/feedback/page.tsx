"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { loadSession } from "@/lib/auth";
import { acctKey } from "@/lib/supabase";
import {
  deleteFeedback,
  FEEDBACK_CATEGORIES,
  feedbackRewardTaken,
  loadFeedback,
  submitFeedback,
  updateFeedback,
  type FeedbackPost,
} from "@/lib/feedback";
import { usePricing } from "@/lib/use-pricing";

/**
 * 의견 쪽지 — "우리 가족 의견 나무".
 * 2026-10-20(출시 전): 쪽지는 쓴 사람과 관리자만 본다(supabase-feedback-private-1020.sql — 아이 이름이 다른 부모에게 보이지 않게).
 * 첫 쪽지 보상은 관리실 가격표 값(0 이면 안내를 감춘다).
 *
 * 베타에서 가장 아쉬운 건 "불편한데 말할 곳이 없어서 그냥 안 쓰는" 경우다.
 * 그래서 남기는 자리를 앱 안에 두고, 처음 글에는 토큰으로 고맙다고 한다.
 * 보상은 계정당 한 번뿐이며 글 저장과 함께 서버에서 처리된다(supabase-setup.sql).
 *
 * 생김새는 동화책 결을 따른다 — 쪽지가 붙은 나무. 부모가 쓰는 화면이지만 아이도
 * 옆에서 보는 화면이라, 딱딱한 고객센터가 아니라 동화의 한 장면처럼 보이게 했다.
 *
 * 고치기·떼기는 **자기 글만**이다. 관리자 일(답변·처리·내부 메모)은 관리실이 전담한다
 * (관리자 페이지 의견·오류 /admin/support → /api/admin/feedback → master_feedback_reply). 예전엔 여기서도
 * 관리자에게 남의 글 단추를 띄웠는데, DB 는 마스터끼리 서로 못 보게 막아 둬서
 * (master_can_see) 다른 마스터 글에서는 눌러도 "권한이 없어요" 만 나왔다.
 * 답변이 달린 글은 아예 잠긴다 — feedback_guard 트리거가 막는다.
 */

/** 쪽지 색 — 글마다 돌려 쓰면 게시판이 알록달록한 쪽지 벽처럼 보인다. */
const NOTE_SKINS = [
  { bg: "#fff8e1", pin: "#f6c453", tape: "#ffe9a8" },
  { bg: "#eaf7ff", pin: "#7cc4f0", tape: "#c9e9fb" },
  { bg: "#fdeef3", pin: "#f2a0bd", tape: "#fbd5e2" },
  { bg: "#eefaf0", pin: "#86ceA0", tape: "#cbeed6" },
];
const TILTS = ["-rotate-1", "rotate-1", "rotate-[0.5deg]", "-rotate-[0.5deg]"];

export default function FeedbackPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { accent } = theme.colors;
  // 보상 토큰은 관리실에서 정한 값(app_pricing)을 읽어 쓴다 — 약속한 숫자와 실제 지급이 같아야 한다.
  const pricing = usePricing();

  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [rewardTaken, setRewardTaken] = useState(true);

  const [category, setCategory] = useState<string>(FEEDBACK_CATEGORIES[0].t);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // 연타로 두 번 올라가는 것을 즉시 막는다
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ bonus: number } | null>(null);
  /*
   * 쪽지별 오류 — 고치기·떼기가 실패한 까닭은 그 쪽지 안에 띄운다.
   * 예전엔 글쓰기 카드 한 곳에만 떠서, 목록 아래쪽 쪽지에서 누른 사람에게는 아무 말도 안 보였다.
   */
  const [postErr, setPostErr] = useState<{ id: string; msg: string } | null>(null);

  // 공지 접기 — 읽고 나면 닫을 수 있게. 계정별로 기억하고, 언제든 다시 펼 수 있다.
  const NOTICE_KEY = "voice-storybook:feedback-notice-closed";
  const [noticeOpen, setNoticeOpen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용, 마운트 후 반영
    setNoticeOpen(window.localStorage.getItem(acctKey(NOTICE_KEY)) !== "1");
  }, []);
  function closeNotice() {
    setNoticeOpen(false);
    try {
      window.localStorage.setItem(acctKey(NOTICE_KEY), "1");
    } catch {
      /* 무시 */
    }
  }
  function openNotice() {
    setNoticeOpen(true);
    try {
      window.localStorage.removeItem(acctKey(NOTICE_KEY));
    } catch {
      /* 무시 */
    }
  }

  // 고치는 중인 글 — 글쓴이가 자기 글을 고칠 때만 쓴다.
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCat, setEditCat] = useState<string>(FEEDBACK_CATEGORIES[0].t);

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSession();
      if (!alive) return;
      // 게시판은 회원 전용 — 토큰을 드려야 해서 계정이 있어야 한다.
      if (!s.uid) {
        router.replace("/login");
        return;
      }
      setUid(s.uid);
      const [list, taken] = await Promise.all([loadFeedback(), feedbackRewardTaken()]);
      if (!alive) return;
      setPosts(list);
      setRewardTaken(taken);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  async function send() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await submitFeedback(category, content.trim());
      setContent("");
      setDone({ bonus: r.bonus });
      if (r.bonus > 0) setRewardTaken(true);
      setPosts(await loadFeedback());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("이 쪽지를 떼어낼까요?")) return;
    setPostErr(null);
    try {
      await deleteFeedback(id);
      // 지운 뒤에는 서버에서 다시 받아 온다 — 화면에서만 사라지는 착시를 막는다.
      setPosts(await loadFeedback());
    } catch (e) {
      setPostErr({ id, msg: (e as Error).message });
      setPosts(await loadFeedback()); // 실패했으면 원래 글이 그대로 보이게 되돌린다
    }
  }

  function startEdit(p: FeedbackPost) {
    setEditId(p.id);
    setEditText(p.content);
    setEditCat(p.category);
    setPostErr(null);
  }

  async function saveEdit() {
    if (!editId) return;
    const id = editId;
    setPostErr(null);
    try {
      await updateFeedback(id, editCat, editText);
      setPosts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, content: editText.trim(), category: editCat } : p)),
      );
      setEditId(null);
    } catch (e) {
      setPostErr({ id, msg: (e as Error).message });
    }
  }

  const canSend = content.trim().length >= 10 && !busy;

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.background} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover" />
      <div className="fixed inset-0 -z-10 bg-white/50" />

      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-5 py-6">
        <Link
          href="/"
          className="self-start rounded-full bg-white/85 px-4 py-2 text-sm font-bold text-neutral-700 shadow backdrop-blur"
        >
          ← 책장으로
        </Link>

        {/* 머리말 — 마스코트가 쪽지를 받아 가는 그림 */}
        <header className="flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.mascot}
            alt=""
            className="h-20 w-20 animate-[float_3s_ease-in-out_infinite] rounded-full border-4 border-white object-cover shadow-lg"
          />
          <h1 className="break-keep text-2xl font-extrabold text-neutral-800">
            의견 쪽지 나무 🌳
          </h1>
          <p className="break-keep text-sm font-bold leading-relaxed text-neutral-500">
            불편한 점, 안 되는 것, 있었으면 하는 기능을 쪽지로 남겨주세요.
            <br />
            하나하나 다 읽고 고칠게요. 쪽지는 나와 관리자만 볼 수 있어요.
          </p>
          {!rewardTaken && pricing.feedback_bonus_tokens > 0 && (
            <p className="animate-pulse break-keep rounded-full bg-amber-100 px-4 py-1.5 text-sm font-extrabold text-amber-700 shadow-sm">
              🎁 첫 쪽지를 남기면 {pricing.feedback_bonus_tokens}토큰을 드려요
            </p>
          )}
        </header>

        {/* 쪽지 쓰기 — 실제 쪽지처럼 테이프를 붙였다 */}
        <section className="relative rounded-[28px] bg-[#fffdf6] p-5 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
          <span
            aria-hidden
            className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-[-2deg] rounded-sm bg-[#ffe9a8] opacity-90 shadow-sm"
          />
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_CATEGORIES.map((c) => {
                const active = category === c.t;
                return (
                  <button
                    key={c.t}
                    type="button"
                    onClick={() => setCategory(c.t)}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`break-keep rounded-full px-3.5 py-2 text-xs font-extrabold transition ${
                      active
                        ? "text-white shadow"
                        : "bg-white text-neutral-500 shadow-sm hover:bg-neutral-50"
                    }`}
                  >
                    {c.e} {c.t}
                  </button>
                );
              })}
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 2000))}
              rows={5}
              placeholder="예) 동화를 만들다가 그림이 안 나왔어요. / 성우 목소리를 더 넣어주세요."
              className="w-full resize-none rounded-2xl border-2 border-dashed border-neutral-200 bg-white p-4 text-[15px] font-medium leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-300"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-neutral-400">
                {content.trim().length < 10
                  ? `${10 - content.trim().length}자만 더 적어주세요`
                  : `${content.trim().length}자`}
              </span>
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                style={canSend ? { background: accent } : undefined}
                className="rounded-full px-6 py-2.5 text-sm font-extrabold text-white shadow transition disabled:bg-neutral-300 disabled:shadow-none"
              >
                {busy ? "보내는 중…" : "📌 쪽지 붙이기"}
              </button>
            </div>

            {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
            {done && (
              <p className="break-keep rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-700">
                {done.bonus > 0
                  ? `고맙습니다! ${done.bonus}토큰을 드렸어요 🎁`
                  : "고맙습니다! 쪽지를 붙였어요 📌"}
              </p>
            )}
          </div>
        </section>

        {/* 쪽지 목록 */}
        <section className="flex flex-col gap-4 pb-8">
          <h2 className="text-sm font-extrabold text-neutral-500">
            내 쪽지 {posts.length > 0 && `${posts.length}장`}
          </h2>

          {/* 관리자 공지 — 늘 맨 위에 붙어 있는 쪽지. DB 글이 아니라 화면에 박아 두었다:
              실수로 지워질 일이 없고, 게시판이 비어 있어도 "여기가 뭐 하는 곳인지"가 먼저 보인다. */}
          {!noticeOpen ? (
            <button
              type="button"
              onClick={openNotice}
              className="self-start rounded-full bg-white/85 px-4 py-2 text-xs font-extrabold text-amber-700 shadow backdrop-blur transition hover:bg-white"
            >
              📌 관리자 공지 보기
            </button>
          ) : (
          <article className="relative rotate-[0.3deg] rounded-2xl bg-gradient-to-b from-[#fff6df] to-[#ffeec7] px-5 pb-5 pt-7 shadow-[0_10px_22px_rgba(0,0,0,0.16)] ring-2 ring-amber-200">
            <span
              aria-hidden
              className="absolute -top-2.5 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-white bg-amber-400 shadow"
            />
            <button
              type="button"
              onClick={closeNotice}
              aria-label="공지 닫기"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-sm font-extrabold text-amber-700 shadow-sm transition hover:bg-white"
            >
              ✕
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm">
                📌 공지
              </span>
              <span className="text-[11px] font-extrabold text-amber-700">👑 관리자</span>
            </div>
            <p className="mt-2 break-keep text-[15px] font-extrabold leading-relaxed text-neutral-800">
              함께 만들어 주셔서 고맙습니다 🌱
            </p>
            <p className="mt-1.5 whitespace-pre-line break-keep text-[14px] font-medium leading-relaxed text-neutral-700">
              {[
                "쓰시다가 불편했던 점, 잘 안 되는 것, 이런 게 있으면 좋겠다 싶은 것을",
                "편하게 쪽지로 남겨주세요. 쪽지는 쓰신 분과 관리자만 볼 수 있어요.",
                "",
                "남겨주신 이야기는 하나하나 읽고 서비스에 반영하겠습니다.",
                "작은 의견도 아이들이 볼 동화를 더 좋게 만듭니다.",
              ].join("\n")}
            </p>
            {pricing.feedback_bonus_tokens > 0 && (
              <p className="mt-2.5 break-keep rounded-xl bg-white/70 px-3 py-2 text-[13px] font-extrabold text-amber-800">
                🎁 처음 쪽지를 남겨주시는 분께 {pricing.feedback_bonus_tokens}토큰을 드려요
              </p>
            )}
          </article>
          )}

          {!ready ? (
            <p className="rounded-3xl bg-white/85 px-4 py-8 text-center text-sm font-bold text-neutral-400">
              쪽지를 모으는 중이에요…
            </p>
          ) : posts.length === 0 ? (
            <p className="break-keep rounded-3xl bg-white/85 px-4 py-8 text-center text-sm font-bold text-neutral-400">
              아직 남긴 쪽지가 없어요. 첫 쪽지를 남겨주세요! 🌱
            </p>
          ) : (
            posts.map((p, i) => {
              const skin = NOTE_SKINS[i % NOTE_SKINS.length];
              const tilt = TILTS[i % TILTS.length];
              const mine = p.owner === uid;
              const editing = editId === p.id;
              // 답변이 달린 글은 DB(feedback_guard)가 잠근다 — 눌러도 안 되는 단추를 띄우지 않는다.
              const locked = Boolean(p.reply);
              return (
                <article
                  key={p.id}
                  style={{ background: skin.bg }}
                  className={`relative ${tilt} rounded-2xl px-5 pb-4 pt-6 shadow-[0_8px_18px_rgba(0,0,0,0.13)] transition-transform hover:rotate-0`}
                >
                  {/* 압정 */}
                  <span
                    aria-hidden
                    style={{ background: skin.pin }}
                    className="absolute -top-2 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-white shadow"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-extrabold text-neutral-600">
                      {FEEDBACK_CATEGORIES.find((c) => c.t === p.category)?.e ?? "✏️"} {p.category}
                    </span>
                    <span className="text-[11px] font-bold text-neutral-400">
                      {p.username ?? "회원"} · {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                    {mine && !editing && !locked && (
                      <span className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="text-[11px] font-bold text-neutral-400 hover:text-neutral-700"
                        >
                          고치기
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          className="text-[11px] font-bold text-neutral-400 hover:text-rose-500"
                        >
                          떼기
                        </button>
                      </span>
                    )}
                    {mine && !editing && locked && (
                      <span className="ml-auto break-keep text-[11px] font-bold text-neutral-400">
                        답변이 달린 글은 고치거나 지울 수 없어요
                      </span>
                    )}
                  </div>

                  {editing ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {FEEDBACK_CATEGORIES.map((c) => (
                          <button
                            key={c.t}
                            type="button"
                            onClick={() => setEditCat(c.t)}
                            style={editCat === c.t ? { background: accent } : undefined}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold transition ${
                              editCat === c.t ? "text-white" : "bg-white/80 text-neutral-500"
                            }`}
                          >
                            {c.e} {c.t}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value.slice(0, 2000))}
                        rows={4}
                        className="w-full resize-none rounded-xl bg-white/90 p-3 text-[14px] font-medium leading-relaxed text-neutral-800 outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="rounded-full bg-white/80 px-4 py-1.5 text-xs font-extrabold text-neutral-500"
                        >
                          그만두기
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          style={{ background: accent }}
                          className="rounded-full px-4 py-1.5 text-xs font-extrabold text-white"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 whitespace-pre-wrap break-keep text-[14px] font-medium leading-relaxed text-neutral-700">
                      {p.content}
                    </p>
                  )}

                  {/* 고치기·떼기가 실패했으면 그 까닭을 이 쪽지 안에서 바로 보여 준다. */}
                  {postErr?.id === p.id && (
                    <p className="mt-2 break-keep text-[12px] font-bold text-rose-600">{postErr.msg}</p>
                  )}

                  {/* 관리자가 단 답변 — 관리실에서 적은 글이 여기 그대로 보인다(2026-09-16). */}
                  {p.reply && !editing && (
                    <div className="mt-3 rounded-xl bg-white/80 px-3.5 py-3">
                      <p className="text-[11px] font-extrabold text-neutral-500">
                        💬 만든 사람 답변
                        {p.repliedAt ? ` · ${new Date(p.repliedAt).toLocaleDateString("ko-KR")}` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-keep text-[14px] font-medium leading-relaxed text-neutral-700">
                        {p.reply}
                      </p>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
