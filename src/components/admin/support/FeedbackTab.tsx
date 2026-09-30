"use client";

/**
 * 의견·오류 › 의견 탭 — 고객이 남긴 불만·오류 신고를 여기서 읽고 답한다 (2026-09-16 사장님 지시).
 * 옛 관리실의 FeedbackSection 을 옮겨 왔다(2026-09-30). 옛 파일은 지웠다.
 *
 * 답을 적으면 **고객의 게시판 글 아래에 그대로 보인다**. 메모는 우리끼리만 본다.
 * 처리 끝으로 표시하면 '남은 의견'에서 빠진다 — 사고 목록과 같은 방식이다.
 *
 * 옛 화면과 같게 지키는 것: 늦게 온 옛 응답 버리기(seqRef) · '전체'일 때 남은 수를 따로 다시 세기 ·
 * 공개 답변 / 우리만 보는 메모 · 네 가지 처리(답하고 처리 끝 · 답만 남기기 · 답 없이 처리 끝 · 다시 열기) ·
 * 처리 뒤엔 목록을 다시 읽기(짐작으로 안 고침).
 * 달라진 것: 처리마다 한 번 묻는다(ConfirmDialog — 답변은 고객에게 그대로 보이므로) · '전체' 보기가 주소(?all=1)에 있다 ·
 * 쓰던 답변이 있으면 메뉴로 떠날 때 묻는다 · 글쓴이를 누르면 회원 화면(/admin/members/<id>)으로 간다.
 * 관리자 계정으로 남긴 글은 서버가 빼고 준다('내 계정 것도 보기'를 켜면 함께 온다).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  FEEDBACK_NOTE_MAX,
  FEEDBACK_REPLY_MAX,
  feedbackCategoryTone,
  feedbackConfirmCopy,
  feedbackDoneMessage,
  feedbackDraftDirty,
  feedbackPatch,
  feedbackPath,
  memberHref,
  type AdminFeedbackResponse,
  type AdminFeedbackRow,
  type FeedbackActionKind,
  type FeedbackPatch,
} from "@/lib/admin-support";
import {
  Badge,
  Banner,
  ChipGroup,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Icon,
  Skeleton,
  TextArea,
  TextInput,
  TimeText,
  useTabParam,
} from "@/components/admin/kit";
import { useAdmin, useUnsavedGuard } from "@/components/admin/shell/AdminContext";

/** 떠 있는 되묻기 창 — 처리 하나, 또는 '쓰던 답변을 버리고 계속할까요?'. */
type Pending =
  | { kind: "act"; post: AdminFeedbackRow; patch: FeedbackPatch }
  | { kind: "discard"; title: string; confirmLabel: string; then: () => void }
  | null;

export function FeedbackTab({ mine }: { mine: boolean }) {
  const { api, say, setBadge, refreshBadges } = useAdmin();
  const router = useRouter();
  // '남은 의견'이 기본. '전체'는 주소 ?all=1 — 새로 고쳐도 같은 보기가 남게.
  const [allParam, setAllParam] = useTabParam("all", ["1"], "0");
  const onlyOpen = allParam !== "1";

  const [data, setData] = useState<AdminFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [actError, setActError] = useState<string | null>(null);
  /** 남은 의견 수 — 칩과 메뉴 숫자가 같은 수를 말하게 한 곳에 둔다. */
  const [openCount, setOpenCount] = useState<number | null>(null);
  /** 늦게 온 옛 응답을 버리는 번호 — 사고 목록이 쓰는 것과 같은 방식이다. */
  const seqRef = useRef(0);
  const formId = useId();

  const dirty = feedbackDraftDirty(reply, note);
  // 쓰던 답변이 있으면 메뉴·'사이트로'를 누를 때, 창을 닫을 때 한 번 묻는다.
  useUnsavedGuard(dirty, "의견 답변");

  /**
   * 남은 수를 메뉴 숫자에 알린다. '내 계정 것도 보기'가 켜져 있으면 이 수에 관리자 계정 글이 섞여 있어
   * 메뉴에 넣지 않고 서버(/api/admin/badges, 늘 뺀다)에 다시 세게 한다.
   */
  const reportCount = useCallback(
    (n: number) => {
      setOpenCount(n);
      if (mine) refreshBadges();
      else setBadge("feedback", n);
    },
    [mine, refreshBadges, setBadge],
  );

  const load = useCallback(
    async (open: boolean) => {
      const seq = ++seqRef.current;
      setLoading(true);
      const r = await api<AdminFeedbackResponse>(feedbackPath({ open, mine }));
      // '남은 의견'과 '전체'를 연달아 누르면 두 요청이 겹친다. 먼저 보낸 것이 늦게 오면
      // 칩은 '전체'인데 목록만 남은 것이 보이는 어긋남이 생기므로, 마지막 요청 것만 화면에 넣는다.
      if (seq !== seqRef.current) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setData(r.data);
      if (open) {
        reportCount(r.data.openCount);
        return;
      }
      // '전체' 응답의 openCount 는 서버의 200건 상한에 걸려 못 믿는다 — 남은 수는 따로 센다.
      // 이게 없으면 '전체' 로 두고 글을 처리했을 때 배지가 옛 숫자에 멈춘다.
      void api<AdminFeedbackResponse>(feedbackPath({ open: true, mine })).then((x) => {
        if (seq !== seqRef.current || !x.ok) return;
        reportCount(x.data.openCount);
      });
    },
    [api, mine, reportCount],
  );

  useEffect(() => {
    // 다음 차례에 읽는다 — 이펙트 안에서 곧바로 상태를 바꾸지 않게(react-hooks 규칙, 옛 화면과 같은 방식).
    void Promise.resolve().then(() => load(onlyOpen));
  }, [load, onlyOpen]);

  const startReply = (post: AdminFeedbackRow) => {
    setOpenId(post.id);
    setReply("");
    setNote("");
  };
  const closeForm = () => {
    setOpenId(null);
    setReply("");
    setNote("");
  };
  /** 쓰던 답변이 있으면 버릴지 먼저 묻고, 없으면 바로 한다. */
  const guardDraft = (title: string, confirmLabel: string, then: () => void) => {
    if (dirty) setPending({ kind: "discard", title, confirmLabel, then });
    else then();
  };

  const ask = (post: AdminFeedbackRow, kind: FeedbackActionKind) => {
    // 처리 끝·다시 열기는 쓰던 글을 보내지 않는다(feedbackPatch 가 무시한다) — 다른 글에 쓰던 답변이 섞이지 않게.
    const patch = feedbackPatch(kind, reply, note);
    if (!patch) return;
    setActError(null);
    setPending({ kind: "act", post, patch });
  };

  const act = async (post: AdminFeedbackRow, patch: FeedbackPatch) => {
    setBusy(true);
    setActError(null);
    const r = await api<{ ok: true }>("/api/admin/feedback", { id: post.id, ...patch });
    setBusy(false);
    if (!r.ok) {
      // 창을 닫지 않고 그 안에 이유를 보여 준다 — 쓰던 답변이 그대로 남는다.
      setActError(r.error);
      return;
    }
    setPending(null);
    say(feedbackDoneMessage(patch));
    // 이 글에 쓰던 답변을 보냈으면 칸을 비운다. 다른 글을 '답 없이 처리 끝'한 경우엔 쓰던 답변을 그대로 둔다.
    if (openId === post.id) closeForm();
    refreshBadges();
    await load(onlyOpen);
  };

  const openAuthor = (post: AdminFeedbackRow) => {
    const href = memberHref(post.owner);
    if (!href) return;
    guardDraft("쓰던 답변이 있어요. 회원 화면으로 갈까요?", "떠나기", () => {
      closeForm();
      router.push(href);
    });
  };

  const posts = data?.posts ?? [];

  return (
    <div className="flex flex-col gap-4">
      <FilterBar resultText={loading && !data ? "불러오는 중…" : error && !data ? undefined : `${posts.length}건`}>
        <ChipGroup
          label="의견 보기"
          value={onlyOpen ? "open" : "all"}
          onChange={(v) => setAllParam(v === "all" ? "1" : "0")}
          options={[
            { value: "open", label: "남은 의견", count: openCount },
            { value: "all", label: "전체" },
          ]}
        />
        <button
          type="button"
          onClick={() => void load(onlyOpen)}
          disabled={loading}
          className={LINK_BTN}
          aria-label="의견 목록 새로 읽기"
        >
          <Icon name="refresh" size={16} />
          {loading && data ? "읽는 중…" : "새로 읽기"}
        </button>
      </FilterBar>

      {error && data ? (
        <Banner
          tone="danger"
          title="최신 의견을 못 읽었어요"
          action={
            <button type="button" onClick={() => void load(onlyOpen)} className={LINK_BTN}>
              다시 시도
            </button>
          }
        >
          아래는 마지막으로 읽은 목록이에요. {error}
        </Banner>
      ) : null}

      {/* 못 읽었을 때 빈 화면 문구를 띄우면 "의견이 없구나"로 읽힌다 — 오류와 '정말 없음'을 나눈다. */}
      {error && !data ? <ErrorState message={error} onRetry={() => void load(onlyOpen)} /> : null}

      {!data && !error ? (
        <div className="rounded-2xl bg-white p-5" role="status" aria-label="의견을 읽는 중">
          <Skeleton lines={4} />
        </div>
      ) : null}

      {data && posts.length === 0 && !loading ? (
        <EmptyState
          icon={onlyOpen ? "check" : "inbox"}
          title={onlyOpen ? "처리할 의견이 없어요" : "아직 남긴 의견이 없어요"}
          body="고객이 앱의 의견 게시판에 글을 남기면 여기 모여요."
        />
      ) : null}

      {posts.map((post) => {
        const open = openId === post.id;
        const authorHref = memberHref(post.owner);
        return (
          <article
            key={post.id}
            aria-label={`${post.username ?? "아이디 없음"}님의 ${post.category}`}
            className={`rounded-2xl bg-white p-5 ${open ? "ring-2 ring-[#3182f6]" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Badge tone={feedbackCategoryTone(post.category)}>{post.category}</Badge>
              {authorHref ? (
                <button
                  type="button"
                  onClick={() => openAuthor(post)}
                  className="inline-flex min-h-8 items-center rounded-md text-sm font-bold text-[#191f28] underline-offset-2 hover:underline"
                >
                  {post.username ?? "(아이디 없음)"}
                </button>
              ) : (
                <span className="text-sm font-bold text-[#191f28]">{post.username ?? "(아이디 없음)"}</span>
              )}
              <span className="text-[12px] font-medium tabular-nums text-[#8b95a1]">
                토큰 {post.tokens ?? "–"} · 책 {post.books ?? "–"}권
              </span>
              {post.handled_at ? (
                <Badge tone="green">처리 끝</Badge>
              ) : (post.open_count ?? 0) > 1 ? (
                <Badge tone="amber">이 분 의견 {post.open_count}건</Badge>
              ) : null}
              <span className="ml-auto text-[12px] font-medium text-[#8b95a1]">
                <TimeText iso={post.created_at} />
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-[#191f28]">
              {post.content}
            </p>

            {post.reply ? (
              <div className="mt-3 rounded-xl bg-[#e8f3ff] px-4 py-3">
                <p className="text-[12px] font-bold text-[#1b64da]">
                  답변 · 고객에게 보여요 · {post.replied_by_username ?? "관리자"} · <TimeText iso={post.replied_at} />
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-[#191f28]">
                  {post.reply}
                </p>
              </div>
            ) : null}

            {post.master_note ? (
              <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[#f2f4f6] px-4 py-2.5 text-[13px] font-medium text-[#6b7684]">
                메모 · 우리만 봐요 · {post.master_note}
              </p>
            ) : null}

            {open ? (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-[#f2f4f6] p-4">
                <Field
                  label="답변 (고객에게 보여요)"
                  htmlFor={`${formId}-reply`}
                  counter={{ value: reply.length, max: FEEDBACK_REPLY_MAX }}
                >
                  <TextArea
                    id={`${formId}-reply`}
                    rows={3}
                    value={reply}
                    maxLength={FEEDBACK_REPLY_MAX}
                    onChange={(e) => setReply(e.target.value.slice(0, FEEDBACK_REPLY_MAX))}
                    placeholder="예: 그림이 멈추던 문제를 고쳤어요. 다시 만들어 보시겠어요?"
                  />
                </Field>
                <Field
                  label="메모 (우리만 봐요)"
                  htmlFor={`${formId}-note`}
                  counter={{ value: note.length, max: FEEDBACK_NOTE_MAX }}
                >
                  <TextInput
                    id={`${formId}-note`}
                    value={note}
                    maxLength={FEEDBACK_NOTE_MAX}
                    onChange={(e) => setNote(e.target.value.slice(0, FEEDBACK_NOTE_MAX))}
                    placeholder="예: 그림 한도 문제였음"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !dirty}
                    onClick={() => ask(post, "reply-close")}
                    className={PRIMARY_BTN}
                  >
                    답하고 처리 끝
                  </button>
                  <button
                    type="button"
                    disabled={busy || !dirty}
                    onClick={() => ask(post, "reply-only")}
                    className={SECONDARY_BTN}
                  >
                    답만 남기기
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guardDraft("쓰던 답변을 지울까요?", "지우기", closeForm)}
                    className={GHOST_BTN}
                  >
                    닫기
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => guardDraft("다른 글에 쓰던 답변이 있어요. 지우고 이 글에 답할까요?", "지우고 답하기", () => startReply(post))}
                  className={PRIMARY_BTN}
                >
                  {post.reply ? "답변 더 쓰기" : "답하기"}
                </button>
                {post.handled_at ? (
                  <button type="button" disabled={busy} onClick={() => ask(post, "reopen")} className={GHOST_BTN}>
                    다시 열기
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => ask(post, "close")} className={SECONDARY_BTN}>
                    답 없이 처리 끝
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}

      {data?.truncated ? (
        <p className="text-[12.5px] font-medium text-[#8b95a1]">최근 {posts.length}건만 보여요. 더 오래된 글은 게시판에 그대로 있어요.</p>
      ) : null}

      {pending?.kind === "act" ? (
        <ConfirmDialog
          {...feedbackConfirmCopy(pending.patch)}
          tone="primary"
          busy={busy}
          error={actError}
          extra={
            pending.patch.reply ? (
              <div className="rounded-xl bg-[#e8f3ff] px-3.5 py-2.5">
                <p className="text-[12px] font-bold text-[#1b64da]">고객에게 이렇게 보여요</p>
                <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-[#191f28]">
                  {pending.patch.reply}
                </p>
              </div>
            ) : null
          }
          onConfirm={() => void act(pending.post, pending.patch)}
          onCancel={() => {
            setPending(null);
            setActError(null);
          }}
        />
      ) : null}

      {pending?.kind === "discard" ? (
        <ConfirmDialog
          title={pending.title}
          body="지금 쓰던 답변과 메모는 저장되지 않아요."
          confirmLabel={pending.confirmLabel}
          cancelLabel="계속 쓰기"
          tone="danger"
          busy={false}
          onConfirm={() => {
            const then = pending.then;
            setPending(null);
            then();
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}

const LINK_BTN =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-[#6b7684] hover:bg-white hover:text-[#4e5968] disabled:opacity-50";
const PRIMARY_BTN =
  "inline-flex min-h-11 items-center rounded-xl bg-[#3182f6] px-4 text-sm font-bold text-white hover:bg-[#1b64da] disabled:cursor-not-allowed disabled:bg-[#b0c8f0]";
const SECONDARY_BTN =
  "inline-flex min-h-11 items-center rounded-xl bg-[#f2f4f6] px-4 text-sm font-bold text-[#4e5968] hover:bg-[#e5e8eb] disabled:cursor-not-allowed disabled:text-[#b0b8c1]";
const GHOST_BTN =
  "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold text-[#6b7684] hover:bg-[#f2f4f6] disabled:cursor-not-allowed disabled:text-[#b0b8c1]";
