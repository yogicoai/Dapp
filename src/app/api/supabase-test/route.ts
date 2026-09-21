import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// Supabase 연결·테이블 확인용 임시 진단. 검증 끝나면 이 파일은 지운다.
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "env 미설정 (URL/ANON_KEY)" }, { status: 500 });
  }
  const sb = getSupabase()!;
  const out: Record<string, unknown> = {};
  for (const t of ["profiles", "books"]) {
    const { error } = await sb.from(t).select("id").limit(1);
    out[t] = error
      ? { message: error.message, code: (error as { code?: string }).code, details: (error as { details?: string }).details, hint: (error as { hint?: string }).hint }
      : "✅ 존재·조회OK";
  }
  const { error: authErr } = await sb.auth.getSession();
  out.auth = authErr ? `❌ ${authErr.message}` : "✅ ok";
  out.urlHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").slice(0, 30);
  out.keyPrefix = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").slice(0, 15);
  return NextResponse.json({ ok: true, ...out });
}
