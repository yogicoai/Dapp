"use client";

/**
 * 관리자 페이지 공용 훅 — 서버 읽기(useAdminQuery)와 '주소에 담는 화면 상태'(탭·서랍·스위치).
 *
 * 왜 주소에 담나: 이 앱은 떠난 화면을 살려 두지 않는다(cacheComponents 꺼짐). 탭·거르기·열린 서랍을
 * 화면 상태로만 들면 새로 고침·뒤로 가기 때 다 사라진다. 주소에 두면 같은 링크로 같은 화면이 다시 열린다.
 * 이 훅들은 useSearchParams 를 쓴다 — 부르는 화면은 page.tsx 의 <Suspense> 안에 있어야 한다(빌드 규칙).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { withParams } from "@/lib/admin-console";
import { useAdmin } from "../shell/AdminContext";

/* ── 서버 읽기 ─────────────────────────────────────────────────────────── */

export type AdminQuery<T> = {
  data: T | null;
  error: string | null;
  /** 마지막 응답의 HTTP 상태(0 = 연결 실패). 아직 응답이 없으면 null. */
  status: number | null;
  loading: boolean;
  reload: () => void;
};

type QueryState<T> = { path: string | null; tick: number; data: T | null; error: string | null; status: number | null };

/**
 * GET /api/admin/** 하나를 읽는다. path 가 null 이면 부르지 않는다.
 *  · 순서 번호로 늦게 온 옛 응답을 버린다(옛 관리실 incSeq 와 같은 방식).
 *  · 다시 읽는 동안에도 앞 데이터를 그대로 보여 준다(깜빡임 없이). 주소가 바뀌면 비운다 —
 *    거르기처럼 '같은 목록의 다른 모양'이면 keepOnChange 로 앞 데이터를 남긴다.
 *  · 성공하면 겉틀의 시계를 옮긴다('방금 · 18분 전'이 읽은 시각 기준이 되게).
 * loading 은 따로 들지 않고 "지금 주소·차례의 응답이 아직 없다"로 계산한다 — 이펙트 안에서
 * 동기로 상태를 바꾸지 않으려고(react-hooks 규칙) 이렇게 셈한다.
 */
export function useAdminQuery<T>(path: string | null, opts?: { keepOnChange?: boolean }): AdminQuery<T> {
  const { api, touchClock } = useAdmin();
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<QueryState<T>>({ path: null, tick: -1, data: null, error: null, status: null });
  const seq = useRef(0);

  useEffect(() => {
    if (path === null) return;
    const my = ++seq.current;
    let alive = true;
    void (async () => {
      const r = await api<T>(path);
      if (!alive || my !== seq.current) return; // 그 사이 주소가 바뀌었거나 다시 읽기를 눌렀다
      if (r.ok) {
        touchClock();
        setRes({ path, tick, data: r.data, error: null, status: 200 });
      } else {
        // 실패해도 앞 데이터는 남긴다 — '다시 시도' 옆에 마지막으로 읽은 것이 보이는 편이 낫다.
        setRes((prev) => ({ path, tick, data: prev.path === path ? prev.data : null, error: r.error, status: r.status }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, tick, api, touchClock]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = path !== null && res.path === path;
  return {
    data: current || opts?.keepOnChange ? res.data : null,
    error: current ? res.error : null,
    status: current ? res.status : null,
    loading: path !== null && (res.path !== path || res.tick !== tick),
    reload,
  };
}

/* ── 주소 상태 ─────────────────────────────────────────────────────────── */

/** 주소 쿼리 몇 칸을 바꾼다. 기록을 남기지 않고(replace) 스크롤도 그대로. */
function useReplaceParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (patch: Record<string, string | null>) => {
      router.replace(`${pathname}${withParams(sp.toString(), patch)}`, { scroll: false });
    },
    [router, pathname, sp],
  );
}

/**
 * 탭 하나를 주소(?name=)에 둔다. 모르는 값이면 기본 탭. 기본 탭은 주소에서 뺀다(링크가 짧게).
 */
export function useTabParam(name: string, allowed: readonly string[], fallback: string): [string, (v: string) => void] {
  const sp = useSearchParams();
  const replace = useReplaceParams();
  const raw = sp.get(name);
  const value = raw !== null && allowed.includes(raw) ? raw : fallback;
  const set = useCallback((v: string) => replace({ [name]: v === fallback ? null : v }), [replace, name, fallback]);
  return [value, set];
}

/**
 * '내 계정 것도 보기'(?mine=1). 켜면 관리자 계정에서 생긴 기록도 이 화면 목록·숫자에 함께 센다.
 * 메뉴 배지는 이 값과 상관없이 늘 뺀다(서버가 정한다).
 */
export function useMineParam(): [boolean, (v: boolean) => void] {
  const sp = useSearchParams();
  const replace = useReplaceParams();
  const on = sp.get("mine") === "1";
  const set = useCallback((v: boolean) => replace({ mine: v ? "1" : null }), [replace]);
  return [on, set];
}

/**
 * 주소로 여닫는 겹 화면(서랍) — 여러 칸을 한 번에 다룬다(사고 서랍은 job 또는 entry).
 *  · 닫혀 있을 때 열면 push — 폰에서 '뒤로'를 누르면 전체 화면 서랍이 닫힌다.
 *  · 이미 열린 채로 다른 줄을 열면 replace — 닫기 한 번에 목록으로 돌아오게(서랍이 층층이 쌓이지 않게).
 *  · 닫을 때 이 창에서 push 로 연 것이면 back, 아니면(주소로 바로 들어옴) replace 로 칸만 뺀다.
 */
export function useUrlOverlay(keys: readonly string[]) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const pushed = useRef(false);
  const values: Record<string, string | null> = {};
  for (const k of keys) values[k] = sp.get(k);
  const isOpen = keys.some((k) => !!sp.get(k));
  const keyList = keys.join(",");

  const open = useCallback(
    (patch: Record<string, string | null>) => {
      const all: Record<string, string | null> = {};
      for (const k of keyList.split(",")) all[k] = null;
      const href = `${pathname}${withParams(sp.toString(), { ...all, ...patch })}`;
      const already = keyList.split(",").some((k) => !!sp.get(k));
      if (already) {
        router.replace(href, { scroll: false });
      } else {
        pushed.current = true;
        router.push(href, { scroll: false });
      }
    },
    [router, pathname, sp, keyList],
  );

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      router.back();
      return;
    }
    const all: Record<string, string | null> = {};
    for (const k of keyList.split(",")) all[k] = null;
    router.replace(`${pathname}${withParams(sp.toString(), all)}`, { scroll: false });
  }, [router, pathname, sp, keyList]);

  return { values, isOpen, open, close };
}

/** 칸 하나로 여닫는 서랍(?id=…). */
export function useUrlDrawer(param: string): { value: string | null; open: (v: string) => void; close: () => void } {
  const o = useUrlOverlay([param]);
  const { open: openPatch } = o;
  const open = useCallback((v: string) => openPatch({ [param]: v }), [openPatch, param]);
  return { value: o.values[param] ?? null, open, close: o.close };
}
