/**
 * 서버 문지기 — AI 를 부르는 경로(줄거리·대본·쪽 그림·인물/장소 그림·그림 올리기·가족 그림)가 맨 앞에서 부른다.
 * 누가 만들 수 있나는 lib/create-access(관리자 또는 살아 있는 결제 요금제). 화면에서만 숨기면 주소로 직접 부를 수 있어
 * 서버에서 막는다(9월 메모의 '쪽 그림 공짜' 구멍 — 가입이 열리면 누구나 부를 수 있게 된다).
 *
 * 부른 사람의 토큰(caller.db)으로 자기 요금제 줄만 읽는다(member_plans '본인 열람' 정책). 서비스 키는 쓰지 않는다.
 * 관리자는 읽지 않고 바로 통과.
 *
 * 요금제가 없으면(또는 못 읽으면) 크레딧으로 만드는 길을 DB 에 묻는다 — credit_gate(supabase-promo-codes.sql, 2026-10-22).
 * 요기보 구매 고객 시리얼·관리실 보상으로 받은 동화 크레딧이 있으면 그 한 권을 만들 수 있고, DB 가 줄거리·그림 한도를
 * 하나씩 깎아 시리얼 1장으로 쓸 수 있는 돈을 1권 값 언저리로 묶는다. 함수가 없거나(SQL 전) 오류면 막는다 —
 * 돈이 드는 길이라 모르면 열어 두지 않는다.
 */
import { NextResponse } from "next/server";
import type { Caller } from "./api-auth";
import { canCreateWith, CREATE_LOCKED_CODE, CREATE_LOCKED_MESSAGE } from "./create-access";

/** 경로 종류 — DB 문지기가 무엇을 볼지·깎을지 정한다 */
export type CreateKind = "outline" | "story" | "image" | "upload" | "portrait";

export async function canCreate(caller: Caller, kind: CreateKind): Promise<boolean> {
  if (caller.isMaster) return true;
  const { data, error } = await caller.db.from("member_plans").select("plan,ends_at").eq("owner", caller.uid).maybeSingle();
  if (!error && canCreateWith(false, (data ?? null) as { plan: unknown; ends_at: string | null } | null, Date.now())) return true;
  const gate = await caller.db.rpc("credit_gate", { p_kind: kind });
  return !gate.error && gate.data === true;
}

/** 막을 때 돌려줄 답 — 화면이 code 로 알아보고 요금제 안내를 띄운다 */
export function createLockedResponse(): Response {
  return NextResponse.json({ error: CREATE_LOCKED_MESSAGE, code: CREATE_LOCKED_CODE }, { status: 403 });
}
