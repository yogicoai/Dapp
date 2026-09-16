"use client";

/**
 * 의견(게시판) — 고객이 남긴 불만·오류 신고를 여기서 읽고 답한다 (2026-09-16, 사장님 지시).
 *
 * 답을 적으면 **고객의 게시판 글 아래에 그대로 보인다**. 메모는 우리끼리만 본다.
 * 처리 끝으로 표시하면 '남은 의견'에서 빠진다 — 사고 목록과 같은 방식이다.
 * 다른 마스터(fe)가 남긴 글은 애초에 목록에 오지 않는다(DB 가 거른다).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminFeedbackResponse, AdminFeedbackRow } from "@/app/api/admin/feedback/route";
import { Button, Card, Chip, Empty, when } from "./ui";

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
type Api = <T>(path: string, body?: unknown) => Promise<ApiResult<T>>;

const CATEGORY_TONE: Record<string, "red" | "blue" | "green" | "gray"> = {
  "오류 신고": "red",
  "이런 게 있으면 좋겠어요": "blue",
  "사용 후기": "green",
};

export function FeedbackSection({
  api,
  say,
  clock,
  onOpenCustomer,
  onCount,
}: {
  api: Api;
  say: (m: string) => void;
  clock: number;
  /** 글쓴이를 '고객' 화면에서 바로 열기 위해. */
  onOpenCustomer: (username: string) => void;
  /** 남은 의견 수를 사이드바 배지에 알린다. */
  onCount?: (n: number) => void;
}) {
  const [data, setData] = useState<AdminFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** 남은 의견 수 — 사이드바 배지와 칩이 같은 수를 말하게 한 곳에 둔다. */
  const [openCount, setOpenCount] = useState<number | null>(null);
  /** 늦게 온 옛 응답을 버리는 번호 — 사고·고객 목록(page.tsx)이 쓰는 것과 같은 방식이다. */
  const seqRef = useRef(0);

  const load = useCallback(
    async (open: boolean) => {
      const seq = ++seqRef.current;
      setLoading(true);
      const r = await api<AdminFeedbackResponse>(`/api/admin/feedback${open ? "?open=1" : ""}`);
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
        setOpenCount(r.data.openCount);
        onCount?.(r.data.openCount);
        return;
      }
      // '전체' 응답의 openCount 는 서버의 200건 상한에 걸려 못 믿는다 — 남은 수는 따로 센다.
      // 이게 없으면 '전체' 로 두고 글을 처리했을 때 배지가 옛 숫자에 멈춘다.
      void api<AdminFeedbackResponse>("/api/admin/feedback?open=1").then((x) => {
        if (seq !== seqRef.current || !x.ok) return;
        setOpenCount(x.data.openCount);
        onCount?.(x.data.openCount);
      });
    },
    [api, onCount],
  );

  useEffect(() => {
    void Promise.resolve().then(() => load(onlyOpen));
  }, [load, onlyOpen]);

  const act = async (post: AdminFeedbackRow, patch: { reply?: string; note?: string; handled?: boolean }) => {
    setBusy(true);
    const r = await api<{ ok: true }>("/api/admin/feedback", { id: post.id, ...patch });
    setBusy(false);
    if (!r.ok) {
      say(r.error);
      return;
    }
    say(patch.reply ? "답변을 남겼어요" : patch.handled === false ? "다시 열었어요" : "처리했어요");
    setOpenId(null);
    setReply("");
    setNote("");
    await load(onlyOpen);
  };

  const posts = data?.posts ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="gray" pressed={onlyOpen} onClick={() => setOnlyOpen(true)}>
          남은 의견 {openCount ?? ""}
        </Chip>
        <Chip tone="gray" pressed={!onlyOpen} onClick={() => setOnlyOpen(false)}>
          전체
        </Chip>
        {/* 못 읽었을 때 '0건' 은 "오늘은 의견이 없구나" 로 읽히므로 아무 말도 하지 않는다. */}
        <span className="ml-auto text-[13px] font-medium text-[#8b95a1]">
          {loading ? "불러오는 중…" : error ? "" : `${posts.length}건`}
        </span>
      </div>

      {error ? (
        <Card className="bg-[#ffeff0]">
          <p className="text-sm font-bold text-[#f04452]">{error}</p>
          <div className="mt-3">
            <Button tone="secondary" size="sm" disabled={loading} onClick={() => void load(onlyOpen)}>
              {loading ? "읽는 중…" : "다시 읽기"}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* 빈 화면 문구는 '정말 없다'는 뜻이라, 못 읽었을 때(error)와 아직 못 받았을 때(data 없음)는 띄우지 않는다. */}
      {!error && data && posts.length === 0 && !loading ? (
        <Empty>{onlyOpen ? "처리할 의견이 없어요 👏" : "아직 남긴 의견이 없어요"}</Empty>
      ) : null}

      {posts.map((post) => {
        const open = openId === post.id;
        return (
          <Card key={post.id} as="article" className={open ? "ring-2 ring-[#3182f6]" : ""}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={CATEGORY_TONE[post.category] ?? "gray"}>{post.category}</Chip>
              <button
                type="button"
                onClick={() => post.username && onOpenCustomer(post.username)}
                className="text-sm font-bold text-[#191f28] underline-offset-2 hover:underline"
              >
                {post.username ?? "(아이디 없음)"}
              </button>
              <span className="text-[12px] font-medium text-[#b0b8c1]">
                토큰 {post.tokens ?? "–"} · 책 {post.books ?? "–"}권
              </span>
              {post.handled_at ? (
                <Chip tone="green">처리 끝</Chip>
              ) : (post.open_count ?? 0) > 1 ? (
                <Chip tone="amber">이 분 의견 {post.open_count}건</Chip>
              ) : null}
              <span className="ml-auto text-[12px] font-medium text-[#b0b8c1]">{when(post.created_at, clock)}</span>
            </div>

            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-[#191f28]">
              {post.content}
            </p>

            {post.reply ? (
              <div className="mt-3 rounded-xl bg-[#e8f3ff] px-4 py-3">
                <p className="text-[12px] font-bold text-[#1b64da]">
                  답변 · {post.replied_by_username ?? "마스터"} · {when(post.replied_at, clock)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-[#191f28]">
                  {post.reply}
                </p>
              </div>
            ) : null}

            {post.master_note ? (
              <p className="mt-2 rounded-xl bg-[#f2f4f6] px-4 py-2.5 text-[13px] font-medium text-[#6b7684]">
                메모 · {post.master_note}
              </p>
            ) : null}

            {open ? (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-[#f2f4f6] p-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-bold text-[#4e5968]">답변 (고객에게 보여요)</span>
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value.slice(0, 2000))}
                    placeholder="예: 그림이 멈추던 문제를 고쳤어요. 다시 만들어 보시겠어요?"
                    className="resize-none rounded-xl border border-[#e5e8eb] bg-white px-3.5 py-2.5 text-sm font-medium leading-relaxed text-[#191f28] outline-none placeholder:text-[#c4cad1] focus:border-[#3182f6]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-bold text-[#4e5968]">메모 (우리만 봐요)</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    placeholder="예: 그림 한도 문제였음"
                    className="rounded-xl border border-[#e5e8eb] bg-white px-3.5 py-2.5 text-sm font-medium text-[#191f28] outline-none placeholder:text-[#c4cad1] focus:border-[#3182f6]"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    tone="primary"
                    disabled={busy || (!reply.trim() && !note.trim())}
                    onClick={() => act(post, { reply: reply.trim() || undefined, note: note.trim() || undefined, handled: true })}
                  >
                    {busy ? "보내는 중…" : "답하고 처리 끝"}
                  </Button>
                  <Button
                    tone="secondary"
                    disabled={busy || (!reply.trim() && !note.trim())}
                    onClick={() => act(post, { reply: reply.trim() || undefined, note: note.trim() || undefined })}
                  >
                    답만 남기기
                  </Button>
                  <Button tone="ghost" disabled={busy} onClick={() => setOpenId(null)}>
                    닫기
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  tone="primary"
                  size="sm"
                  onClick={() => {
                    setOpenId(post.id);
                    setReply("");
                    setNote("");
                  }}
                >
                  {post.reply ? "답변 더 쓰기" : "답하기"}
                </Button>
                {post.handled_at ? (
                  <Button tone="ghost" size="sm" disabled={busy} onClick={() => act(post, { handled: false })}>
                    다시 열기
                  </Button>
                ) : (
                  <Button tone="secondary" size="sm" disabled={busy} onClick={() => act(post, { handled: true })}>
                    답 없이 처리 끝
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
