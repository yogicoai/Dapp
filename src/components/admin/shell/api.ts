/**
 * 관리자 페이지가 서버(/api/admin/*)를 부르는 한 가지 길.
 *
 * 모양은 옛 관리실 api() 그대로다 — body 가 없으면 GET, 있으면 JSON POST, 늘 cache:"no-store".
 * 로그인 토큰은 authedFetch 가 붙인다(Bearer). 쿠키가 아니라서 다른 사이트가 대신 부르는 공격(CSRF)이
 * 통하지 않는다 — 이 방식을 바꾸지 않는다.
 *
 * 401·403 이 오면 화면이 멋대로 첫 화면으로 보내지 않는다(옛 router.replace("/") 는 없앴다).
 * 대신 겉틀에 알리고(onAuthError), 겉틀이 /api/admin/me 로 다시 확인한 뒤
 *  · me 도 401 → 로그인 안내, me 도 403 → '들어올 수 없어요'로 바꾼다.
 *  · me 는 되는데 403 이면 그 일만 막힌 것이다(예: 회사 계정만 바꿀 수 있는 값) — 오류를 그대로 돌려준다.
 */
import { authedFetch } from "@/lib/supabase";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string | null; conflict?: "exists" | "in_progress" | null };

export type Api = <T>(path: string, body?: unknown) => Promise<ApiResult<T>>;

export function makeApi(onAuthError: (status: 401 | 403) => Promise<void>): Api {
  return async function api<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    try {
      const res = await authedFetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401 || res.status === 403) {
        // DB 함수가 권한으로 거절한 것(42501)도 403 이다 — 세션을 다시 확인한 뒤에야 판단한다.
        await onAuthError(res.status);
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: typeof json.error === "string" ? json.error : `서버 오류(${res.status})`,
          code: typeof json.code === "string" ? json.code : null,
          conflict: (json.conflict as "exists" | "in_progress" | null | undefined) ?? null,
        };
      }
      return { ok: true, data: json as T };
    } catch (e) {
      return { ok: false, status: 0, error: `인터넷 연결을 확인해 주세요. (${(e as Error)?.message ?? e})` };
    }
  };
}
