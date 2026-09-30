import type { Metadata, Viewport } from "next";
import { AdminShell } from "@/components/admin/shell/AdminShell";

/**
 * 관리자 페이지(/admin/*) 겉틀 — 서버 쪽에서는 제목 틀과 검색엔진 색인 막기만 한다.
 *
 * 왜 서버 layout 인가: 이 앱은 로그인 세션이 브라우저에 있어서 서버는 누가 왔는지 모른다.
 * 그래서 이 파일은 데이터를 한 줄도 싣지 않고, 클라이언트 겉틀(AdminShell)이 /api/admin/me 로
 * 서버에 확인한 뒤에만 메뉴와 화면을 그린다. 관리 데이터는 전부 /api/admin/* 에서 마스터 확인 뒤에만 나간다.
 * 제목은 화면마다 "회원 · 관리자"처럼 붙는다(대시보드는 기본값).
 */
export const metadata: Metadata = {
  title: { default: "대시보드 · 관리자", template: "%s · 관리자" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

// 관리실만 확대를 허용한다 — 앱은 태블릿 전체화면이 기준이라 확대를 막았지만(루트 layout),
// 관리실은 휴대폰으로 표·주문번호를 읽을 일이 있어 손가락으로 키울 수 있어야 한다.
export const viewport: Viewport = { maximumScale: 5, userScalable: true };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
