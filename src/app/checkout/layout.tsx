import type { Metadata } from "next";

/**
 * 결제(시연) 겉틀 — 검색엔진 색인만 막는다(/checkout, /checkout/done, /checkout/fail).
 * 화면은 로그인 세션을 브라우저에서 읽어야 해서 클라이언트 부품이고, metadata 는 여기서 준다.
 */
export const metadata: Metadata = {
  title: "결제 (시연)", // 뒤의 사이트 이름은 app/layout 제목 틀이 붙인다
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
