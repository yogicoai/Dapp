import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "우리 아이 보이스 동화",
  description: "아이가 주인공인 그림동화를 엄마·아빠 목소리로 읽어줍니다.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  // 태블릿 가로 전체화면이 기준이라 확대/축소를 막는다.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
