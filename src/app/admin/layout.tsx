import type { Metadata } from "next";

/**
 * 관리실(/admin) 겉틀 — 서버 쪽에서 검색엔진 색인만 막는다.
 *
 * 왜 서버 layout 인가: 페이지(page.tsx)는 로그인 세션을 브라우저에서 읽어야 해서 클라이언트
 * 컴포넌트다. 클라이언트 컴포넌트는 metadata 를 내보낼 수 없어서 여기서 준다.
 * 이 겉틀은 데이터를 한 줄도 싣지 않는다 — 관리 데이터는 전부 /api/admin/* 에서 마스터 확인 뒤에만 나간다.
 */
export const metadata: Metadata = {
  title: "보이스 동화 관리실",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
