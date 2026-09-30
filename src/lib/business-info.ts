/**
 * 사업자 정보 — 전자상거래법 표시 사항(요금제 화면 맨 아래 줄).
 * null 은 화면에 "(등록 예정)"으로 나온다. 값은 사장님이 채운다(결정 D3).
 * DB(app_business_info)가 비었거나 아직 없을 때 쓰는 기본값 — 실제 값은 관리실 '사업자 정보·약관'에서 적는다.
 * import 없는 순수 상수 파일이다.
 */
export const BUSINESS_INFO = {
  /** 법인 정식 상호(주식회사 표기 등) 확인 필요 */
  name: "요기코퍼레이션",
  ceo: null as string | null,
  /** 사업자등록번호 */
  bizNo: null as string | null,
  /** 통신판매업 신고번호 */
  mailOrderNo: null as string | null,
  address: null as string | null,
  /** 고객센터 전화 */
  phone: null as string | null,
  email: null as string | null,
  /** 고객센터 운영 시간 */
  hours: null as string | null,
  /** 호스팅 제공자 */
  hosting: "Vercel Inc.",
} as const;

export const INFO_TBD = "(등록 예정)";

/** 값이 없으면 "(등록 예정)" */
export function infoText(v: string | null): string {
  return v && v.trim() ? v : INFO_TBD;
}
