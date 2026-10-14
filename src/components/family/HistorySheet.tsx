"use client";

/**
 * 예전 그림으로 돌아가기(사장님 2026-10-14 "이전에 내가 생성했던 캐릭터로 돌아가게 해주는 기능",
 * "이전 캐릭터 생성한 얼굴이 마음에 들었을 수도 있잖아").
 *
 * 사람 메뉴(MemberSheet)에서 연다. 그 사람을 그린 그림을 새것부터 작은 그림으로 늘어놓고, 하나를 고르면 그 그림을
 * 고정 그림으로 되돌린다. 새로 그리지 않으니 쿠키가 들지 않는다 — 이미 값을 치르고 그린 그림이다.
 *  - 목록은 서버가 cafe24 의 회원 폴더에서 읽는다(api/family/portrait/history GET). 가족 데이터에는 고정한 그림과 확인 전
 *    그림만 남아서, 그 전 그림은 폴더의 파일로만 되찾을 수 있다.
 *  - 작은 그림은 흰 바탕 그림(ref)으로 보여 준다 — 배경이 지워졌는지 몰라도 깨끗하게 보인다.
 *  - since 보다 앞서 그린 그림은 감춘다 — 뺐다가 다시 넣은 사람에게 예전 사람의 그림을 보이지 않는다(뺄 때 "그린 그림도
 *    같이 지워져요"라고 알렸다. lib/family-history picturesSince).
 *  - '이 그림으로 돌아가기'를 누르면 서버가 그 그림을 한 번 더 검사하고(POST) 배경이 지워진 그림인지 알려 준다 → onRestore.
 */

import { useEffect, useState } from "react";
import type { FamilyMember } from "@/lib/family";
import { picturesSince, type PastPicture } from "@/lib/family-history";
import { authedFetch } from "@/lib/supabase";
import { displayName, stemOf, type Colors } from "./family-ui";
import { Sheet } from "./Sheet";
import { BigButton, CookiePill } from "./ui";

/** 되돌릴 그림 — transparent 가 false 면 흰 바탕 그림(화면이 곱하기로 얹는다) */
export type RestoredPicture = PastPicture & { transparent: boolean };

/** '10월 2일 오후 3:07' — 같은 날 여러 장을 그렸을 수 있어 시각까지 */
function whenText(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function HistorySheet({
  colors,
  member: m,
  since,
  onClose,
  onRestore,
}: {
  colors: Colors;
  member: FamilyMember;
  /** 이 사람을 (다시) 넣은 때 — 그 앞의 그림은 감춘다 */
  since?: string;
  onClose: () => void;
  onRestore: (pic: RestoredPicture) => void;
}) {
  const [pics, setPics] = useState<PastPicture[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = displayName(m);
  const current = m.portrait?.url;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authedFetch(`/api/family/portrait/history?memberId=${encodeURIComponent(m.id)}`, { cache: "no-store" });
        const d = (await res.json().catch(() => ({}))) as { pics?: PastPicture[]; error?: string };
        if (!alive) return;
        if (!res.ok || !Array.isArray(d.pics)) {
          setError(d.error ?? "예전 그림을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.");
          setPics([]);
          return;
        }
        setPics(picturesSince(d.pics, since));
      } catch {
        if (!alive) return;
        setError("예전 그림을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.");
        setPics([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [m.id, since]);

  const chosen = pics?.find((p) => p.url === picked) ?? null;
  const restore = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch("/api/family/portrait/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: m.id, url: chosen.url }),
      });
      const d = (await res.json().catch(() => ({}))) as Partial<RestoredPicture> & { error?: string };
      if (!res.ok || typeof d.url !== "string" || typeof d.ref !== "string") {
        setError(d.error ?? "이 그림으로 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
        return;
      }
      onRestore({ url: d.url, ref: d.ref, at: typeof d.at === "string" ? d.at : chosen.at, transparent: d.transparent !== false });
    } catch {
      setError("이 그림으로 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label={`${name} 예전 그림`} dismissible={!busy}>
      <h2 className="mt-4 break-keep text-center text-xl font-extrabold text-neutral-800">{stemOf(m)} 예전 그림</h2>
      <p className="mt-1.5 break-keep text-center text-[13px] font-medium leading-normal text-neutral-500">
        마음에 들었던 그림을 고르면 그 모습으로 돌아가요.
        <br />
        이미 그린 그림이라 쿠키가 들지 않아요.
      </p>

      {pics === null ? (
        <p className="my-10 rounded-full bg-neutral-100 px-5 py-2.5 text-sm font-extrabold text-neutral-600" role="status">
          예전 그림을 불러오는 중…
        </p>
      ) : pics.length === 0 ? (
        <p className="my-8 break-keep text-center text-sm font-bold text-neutral-500" role="status">
          {error || "아직 돌아갈 예전 그림이 없어요."}
        </p>
      ) : (
        <ul className="mt-4 grid w-full grid-cols-3 gap-2.5" aria-label="예전 그림">
          {pics.map((p) => {
            const on = p.url === picked;
            const now = p.url === current;
            return (
              <li key={p.url}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? null : p.url)}
                  className="relative flex w-full flex-col items-center overflow-hidden rounded-2xl bg-white pb-1.5 transition"
                  style={{ boxShadow: on ? `0 0 0 3px ${colors.accent}` : "0 0 0 1px #ece8e1" }}
                >
                  {/* 흰 바탕 그림(ref) — 배경이 지워졌는지 몰라도 깨끗하게 보인다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.ref} alt={`${whenText(p.at)}에 그린 ${stemOf(m)} 그림`} loading="lazy" className="aspect-[3/4] w-full object-contain" />
                  <span className="mt-1 px-1 text-center text-[11px] font-bold leading-tight text-neutral-500">{whenText(p.at)}</span>
                  {now && (
                    <span
                      className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white"
                      style={{ background: colors.accentDark }}
                    >
                      지금
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pics !== null && pics.length > 0 && error && (
        <p className="mt-3 break-keep text-center text-[13px] font-bold text-rose-600" role="alert">
          {error}
        </p>
      )}

      {pics !== null && pics.length > 0 && (
        <div className="mt-4 w-full">
          <BigButton colors={colors} onClick={() => void restore()} disabled={!chosen || busy || chosen.url === current}>
            {busy ? "바꾸는 중…" : chosen && chosen.url === current ? "지금 쓰는 그림이에요" : "이 그림으로 돌아가기"}
            {!busy && chosen && chosen.url !== current && <CookiePill colors={colors} text="쿠키 0개" />}
          </BigButton>
          <p className="mt-2 break-keep text-center text-xs font-semibold text-neutral-500">
            이미 만든 동화는 그대로예요. 다음 동화부터 고른 모습으로 그려요.
          </p>
        </div>
      )}
      <button type="button" onClick={onClose} disabled={busy} className="mt-2 min-h-11 px-3.5 text-sm font-extrabold text-neutral-500 disabled:opacity-50">
        닫기
      </button>
    </Sheet>
  );
}
