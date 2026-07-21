import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리 가족 보이스 동화",
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
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
