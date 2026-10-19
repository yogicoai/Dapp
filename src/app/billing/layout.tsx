import type { Metadata } from "next";

/** 내 결제·구독 겉틀 — 검색엔진 색인만 막는다. */
export const metadata: Metadata = {
  title: "내 결제·구독", // 뒤의 사이트 이름은 app/layout 제목 틀이 붙인다
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
