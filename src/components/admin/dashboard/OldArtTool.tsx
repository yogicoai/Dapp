"use client";

/**
 * 대시보드 '정리할 일' — 옛 책 그림을 이미지 호스팅(cafe24)으로 옮기는 한 번짜리 정리 작업.
 * 설정 화면 관리실에 있던 것(settings/page.tsx 의 migrateOldArt·'옛 책 그림 정리' 칸)을 그대로 옮겼다(2026-09-30).
 *
 * 왜: 예전 책은 그림이 DB 안(data: 주소)에 들어 있어 책을 열 때마다 전송량이 나간다.
 * 옮기는 일(migrateBookArt)은 원래 브라우저에서 사장님 로그인으로 돌았다 — 파일을 책 주인의 아이디 폴더에
 * 넣어야 해서다. 서버 경로로 다시 짜는 것은 이번 범위 밖이라, 관리자 페이지에서 이 칸 하나만
 * 브라우저 로그인을 직접 쓴다(다른 화면은 전부 /api/admin/* 만 부른다).
 *
 *  · 남은 책이 0 권이면 칸을 감춘다 — 할 일이 없는데 단추가 남아 있으면 "왜 아직 있지?" 하고 다시 누르게 된다.
 *    단 방금 돌린 결과는 한 번 보여 준다.
 *  · 누르면 몇 권인지 먼저 세고 한 번 더 묻는다(옛 window.confirm 대신 확인창).
 *  · 도는 동안 메뉴를 누르면 "떠날까요?"를 묻고(useUnsavedGuard), 화면을 떠나면 멈춘다. 멈춰도 옮긴 데까지는 남는다.
 */
import { useEffect, useRef, useState } from "react";
import { loadAllUsers } from "@/lib/auth";
import { migrateBookArt, type MigrateProgress } from "@/lib/migrate-art";
import { countBooksWithEmbeddedArt, loadAllBooksBrief } from "@/lib/prefs";
import { currentUid } from "@/lib/supabase";
import { Button, Card, CardTitle, ConfirmDialog, Icon, Skeleton } from "@/components/admin/kit";
import { useAdmin, useUnsavedGuard } from "@/components/admin/shell/AdminContext";

type Plan = { targets: { id: string; owner: string; title: string }[]; names: Record<string, string> };

/**
 * 확인창 문장 — 카드 제목의 'N권 남음'(그림이 아직 DB 에 있는 책)과 같은 수로 묻는다.
 * 대상 목록은 모든 책이라(이미 옮긴 책은 건너뛴다) 그 수로 물으면 카드의 3권이 250권으로 보여 겁을 주게 된다.
 * 남은 수를 못 셌으면(-1·null) 전체 수로만 묻는다.
 */
function artConfirmText(remaining: number | null, total: number): string {
  const tail = "몇 분 걸릴 수 있고, 이 화면을 열어 두셔야 해요.";
  if (remaining !== null && remaining > 0) {
    return `그림이 남은 동화 ${remaining}권을 옮길까요? (전체 ${total}권을 확인하고 이미 옮긴 책은 건너뛰어요) ${tail}`;
  }
  return `동화 ${total}권을 확인해 남은 그림을 옮길까요? ${tail}`;
}
type Result = { tone: "ok" | "warn"; text: string };

export function OldArtTool() {
  const { me } = useAdmin();
  // null = 세는 중, -1 = 못 셌다(칸은 보여 준다 — 남았는지 모르면 감추지 않는다)
  const [count, setCount] = useState<number | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<MigrateProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const stop = useRef(false);

  useUnsavedGuard(running, "그림 옮기기", "떠나면 옮기기가 멈춰요 — 옮긴 데까지는 그대로 남아요.");
  // 화면을 떠나면 멈춘다(설정 화면과 같다) — 옮긴 데까지는 그대로 남는다.
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    // 개수만 센다(그림은 안 받는다). 상태는 응답이 온 뒤에 바꾼다.
    void countBooksWithEmbeddedArt()
      .then((n) => alive && setCount(n))
      .catch(() => alive && setCount(-1));
    return () => {
      alive = false;
    };
  }, []);

  /** 대상 책과 폴더 이름(회원 id → 아이디)을 먼저 모은다 — 확인창에 몇 권인지 보여 주려고. */
  async function prepare() {
    setPreparing(true);
    setResult(null);
    try {
      // 관리자 계정이 볼 수 있는 책 전부(내 책 포함). 폴더 이름을 모르는 주인은 회원 id 그대로 쓴다.
      const [books, users, uid] = await Promise.all([loadAllBooksBrief(), loadAllUsers(), currentUid()]);
      if (books.length === 0) {
        setResult({ tone: "ok", text: "옮길 동화가 없어요." });
        return;
      }
      const names: Record<string, string> = {};
      for (const u of users) names[u.id] = u.username;
      if (uid && me.username) names[uid] = me.username;
      setPlan({ targets: books.map((b) => ({ id: b.id, owner: b.owner, title: b.title })), names });
    } catch {
      setResult({ tone: "warn", text: "동화 목록을 읽지 못했어요. 다시 눌러 주세요." });
    } finally {
      setPreparing(false);
    }
  }

  async function run(p: Plan) {
    setPlan(null);
    stop.current = false;
    setRunning(true);
    setResult(null);
    try {
      const r = await migrateBookArt(
        p.targets,
        (ownerId) => p.names[ownerId] ?? ownerId,
        setProgress,
        () => stop.current,
      );
      setResult({
        tone: r.failed ? "warn" : "ok",
        text:
          `끝났어요 — ${r.moved}권에서 그림 ${r.images}장을 옮겼어요.` +
          (r.skipped ? ` (이미 옮겨진 책 ${r.skipped}권)` : "") +
          (r.failed ? ` ${r.failed}권은 실패했어요 — 다시 눌러 주세요.` : ""),
      });
      // 남은 권수를 다시 센다(0 이 되면 칸이 사라지고 결과 한 줄만 남는다).
      void countBooksWithEmbeddedArt()
        .then(setCount)
        .catch(() => setCount(-1));
    } catch {
      setResult({ tone: "warn", text: "옮기는 중 문제가 생겼어요. 다시 눌러 주세요." });
    } finally {
      setProgress(null);
      setRunning(false);
    }
  }

  const resultLine = result ? (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-bold ${
        result.tone === "ok" ? "bg-[#e6f7ef] text-[#00976b]" : "bg-[#fff4e0] text-[#c77700]"
      }`}
    >
      <Icon name={result.tone === "ok" ? "check" : "alert"} size={16} className="mt-0.5" />
      <span className="break-keep">{result.text}</span>
    </p>
  ) : null;

  // 할 일이 없으면 칸을 감춘다 — 방금 돌린 결과만 한 줄 남긴다.
  if (count === 0 && !running) return resultLine;

  return (
    <Card>
      <CardTitle hint={count !== null && count > 0 ? `${count}권 남음` : undefined}>정리할 일 · 옛 책 그림 옮기기</CardTitle>
      {count === null ? (
        <Skeleton lines={1} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="break-keep text-[13px] font-medium leading-relaxed text-[#6b7684]">
            예전에 만든 동화는 그림이 데이터베이스 안에 들어 있어, 책을 열 때마다 전송량이 나가요. 그림을 이미지 호스팅으로
            옮기면 전송량이 거의 안 나가고 책도 빨리 열려요.{" "}
            <b className="text-[#4e5968]">한 번만 누르면 되고, 중간에 멈춰도 옮긴 데까지는 그대로 남아요.</b>
          </p>
          {running ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f9fafb] px-3.5 py-3">
              <p aria-live="polite" className="min-w-0 break-all text-[13px] font-bold tabular-nums text-[#191f28]">
                {progress
                  ? `${progress.bookNo} / ${progress.bookCount}권 · ${progress.title}` +
                    (progress.imageCount > 0 ? ` (그림 ${progress.imageDone}/${progress.imageCount}장)` : "")
                  : "준비하는 중…"}
              </p>
              <Button tone="secondary" size="sm" onClick={() => (stop.current = true)}>
                멈추기
              </Button>
            </div>
          ) : (
            <div>
              <Button tone="primary" onClick={() => void prepare()} disabled={preparing}>
                {preparing ? "동화를 세는 중…" : "그림 옮기기"}
              </Button>
            </div>
          )}
          {resultLine}
        </div>
      )}

      {plan ? (
        <ConfirmDialog
          title="옛 책 그림 옮기기"
          body={artConfirmText(count, plan.targets.length)}
          confirmLabel="옮기기 시작"
          busy={false}
          onConfirm={() => void run(plan)}
          onCancel={() => setPlan(null)}
        />
      ) : null}
    </Card>
  );
}
