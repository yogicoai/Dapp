/**
 * 서버 문지기 — AI 를 부르는 경로(줄거리·대본·쪽 그림·인물/장소 그림·그림 올리기·가족 그림)가 맨 앞에서 부른다.
 * 누가 만들 수 있나는 lib/create-access(관리자 또는 살아 있는 결제 요금제). 화면에서만 숨기면 주소로 직접 부를 수 있어
 * 서버에서 막는다(9월 메모의 '쪽 그림 공짜' 구멍 — 가입이 열리면 누구나 부를 수 있게 된다).
 *
 * 부른 사람의 토큰(caller.db)으로 자기 요금제 줄만 읽는다(member_plans '본인 열람' 정책). 서비스 키는 쓰지 않는다.
 * 못 읽으면(표가 없거나 DB 오류) 막는다 — 돈이 드는 길이라 모르면 열어 두지 않는다. 관리자는 읽지 않고 바로 통과.
 */
import { NextResponse } from "next/server";
import type { Caller } from "./api-auth";
import { canCreateWith, CREATE_LOCKED_CODE, CREATE_LOCKED_MESSAGE } from "./create-access";

export async function canCreate(caller: Caller): Promise<boolean> {
  if (caller.isMaster) return true;
  const { data, error } = await caller.db.from("member_plans").select("plan,ends_at").eq("owner", caller.uid).maybeSingle();
  if (error) return false;
  return canCreateWith(false, (data ?? null) as { plan: unknown; ends_at: string | null } | null, Date.now());
}

/** 막을 때 돌려줄 답 — 화면이 code 로 알아보고 요금제 안내를 띄운다 */
export function createLockedResponse(): Response {
  return NextResponse.json({ error: CREATE_LOCKED_MESSAGE, code: CREATE_LOCKED_CODE }, { status: 403 });
}
