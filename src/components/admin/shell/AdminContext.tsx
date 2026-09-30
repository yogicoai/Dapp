"use client";

/**
 * 관리자 페이지 공용 상태 — 주소(화면)를 옮겨도 살아 있어야 하는 것만 여기 둔다.
 *
 * 왜 필요한가: 관리실이 여러 주소로 나뉘면서, 화면을 옮기면 그 화면의 상태가 통째로 사라진다
 * (이 앱은 cacheComponents 를 켜지 않아 떠난 화면을 살려 두지 않는다). 그래서
 *  · 누구로 들어왔나(me) · 서버 부르기(api) · 알림(say) · '18분 전'을 셀 시계(clock)
 *  · 메뉴 배지 · 방금 한 환불의 사유·처리자(recentRefunds) · 저장 안 한 내용 표시
 * 는 겉틀(AdminShell)이 들고, 화면들은 useAdmin() 으로 꺼내 쓴다.
 */
import { createContext, useContext, useEffect, useId } from "react";
import type { AdminBadges, AdminMe } from "@/lib/admin-console";
import type { Api } from "./api";
import type { NavigateGuard } from "./Nav";

export type { AdminMe, AdminBadges };
export type BadgeKey = keyof AdminBadges;

export type AdminCtx = {
  me: AdminMe;
  api: Api;
  /** 아래 가운데 잠깐 뜨는 알림(2.8초). */
  say: (msg: string, tone?: "info" | "error") => void;
  /** '방금 · 18분 전'을 셀 기준 시각(ms). 읽기에 성공할 때(touchClock)와 1분마다 옮긴다. */
  clock: number;
  touchClock: () => void;
  badges: AdminBadges;
  setBadge: (k: BadgeKey, n: number) => void;
  /** 배지를 서버에서 다시 센다 — 20초에 한 번까지만 실제로 부른다. */
  refreshBadges: () => void;
  /**
   * 방금 이 창에서 한 환불의 사유·처리자(장부 id → 값). 사고 목록 함수가 환불 뒤 그 줄을 더 안 주면
   * DB 에서 다시 읽을 길이 없어서, 창을 연 동안만 들고 있는다(새로 고침하면 사라진다).
   * 회원 화면에서 환불하고 의견·오류 화면으로 가도 보이게 겉틀이 든다.
   */
  recentRefunds: ReadonlyMap<string, { by: string; note: string }>;
  rememberRefund: (entry: string, v: { by: string; note: string }) => void;
  /**
   * 관리실 안 링크를 누를 때 거치는 문 — 저장 안 한 내용·도는 일이 있으면 멈추고 "떠날까요?"를 묻는다.
   * 메뉴만 막으면 화면 안 링크(사고 서랍의 '고객 보기', 대시보드 카드)로는 묻지 않고 떠나서 쓰던 답변이 사라진다.
   * 화면에서는 kit 의 AdminLink 로 쓴다(onClick 에 이걸 건다).
   */
  guardNavigate: NavigateGuard;
};

export const AdminContext = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin 은 관리자 페이지 겉틀(AdminShell) 안에서만 쓸 수 있어요.");
  return ctx;
}

/* ── 저장 안 한 내용 ─────────────────────────────────────────────────── */

export type UnsavedRegistry = {
  set: (id: string, entry: { dirty: boolean; label: string; note?: string }) => void;
  remove: (id: string) => void;
};

export const UnsavedContext = createContext<UnsavedRegistry | null>(null);

/**
 * 저장 안 한 내용이 있다고 겉틀에 알린다. dirty 가 true 인 동안에는
 *  · 왼쪽 메뉴·위 메뉴·'사이트로'·화면 안 AdminLink 를 누르면 "저장 안 한 내용이 있어요. 떠날까요?"를 묻고
 *  · 창을 닫거나 새로 고치면 브라우저가 한 번 더 묻는다(beforeunload).
 * 브라우저 '뒤로' 단추는 앱 안에서 막을 방법이 없다 — 그건 받아들인다.
 * note 를 주면 '떠나면 사라져요' 대신 그 문장으로 알린다 — 쓰던 글이 아니라 도는 일(그림 옮기기)일 때.
 */
export function useUnsavedGuard(dirty: boolean, label: string, note?: string): void {
  const reg = useContext(UnsavedContext);
  const id = useId();
  useEffect(() => {
    if (!reg) return;
    reg.set(id, { dirty, label, note });
  }, [reg, id, dirty, label, note]);
  useEffect(() => {
    if (!reg) return;
    return () => reg.remove(id);
  }, [reg, id]);
}
