/**
 * AI 호출 기록을 DB 에 적는 곳(서버 경로용) — 부른 회원의 권한 그대로 log_ai_usage RPC 를 부른다.
 * 표(ai_usage)는 직접 쓰지 못하게 잠겨 있고, 이 함수가 '누가 불렀나'(auth.uid())를 스스로 적는다(supabase-ai-usage.sql).
 * 서비스 키는 쓰지 않는다(lib/api-auth 머리글과 같은 까닭).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiUsageSink } from "./ai-usage.ts";

export function dbUsageSink(db: SupabaseClient): AiUsageSink {
  return async (records) => {
    const { error } = await db.rpc("log_ai_usage", { p_rows: records });
    if (error) throw new Error(error.message);
  };
}
