import { COMPANY_ADMIN, type AdminMe } from "@/lib/admin-console";
import { json, masterOnly } from "../_guard";

/**
 * GET /api/admin/me — 관리자 페이지 겉틀이 화면을 열기 전에 가장 먼저 부른다.
 *
 * 왜 따로 두나: 이 앱은 로그인 세션이 브라우저에 있어서 서버 페이지(/admin)는 누가 왔는지 모른다.
 * 그래서 겉틀은 데이터 없이 뜨고, 이 경로가 200 을 줄 때만 메뉴와 화면을 그린다.
 *  · 로그인 안 함 → 401(로그인 안내) · 마스터 아님 → 403(들어올 수 없어요) — masterOnly 가 정한다.
 *  · 누가 마스터인지는 DB 의 profiles.is_master 로만 판단한다(브라우저가 보낸 값은 믿지 않는다).
 * canEditCompany 는 버튼을 미리 잠그는 **안내**일 뿐이다 — 실제로 막는 것은 DB 함수(is_pricing_admin)다.
 */
export const GET = masterOnly(async (caller) => {
  const body: AdminMe = { username: caller.username, canEditCompany: caller.username === COMPANY_ADMIN };
  return json(body);
});
