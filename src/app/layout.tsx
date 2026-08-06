import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리 가족 보이스 동화",
  description: "아이가 주인공인 그림동화를 엄마·아빠 목소리로 읽어줍니다.",
  /*
   * 아이폰용 — '홈 화면에 추가'로 열었을 때 주소창 없이 꽉 찬 앱으로 뜨게 한다.
   *
   * 아이폰 사파리에는 전체화면 기능 자체가 없어서, 브라우저 탭 안에서는 어떤
   * 방법으로도 전체화면이 안 된다. 홈 화면 앱으로 여는 것이 유일한 길이다.
   * manifest의 display:standalone은 안드로이드·크롬용이고, 아이폰은 예전부터
   * 이 apple 설정을 봐서 판단한다(신형 iOS도 이걸 함께 보므로 넣어 둔다).
   *
   * 상태표시줄은 검은 반투명 — 배경 그림이 위까지 이어져 책처럼 보인다.
   */
  appleWebApp: {
    capable: true,
    title: "보이스 동화",
    statusBarStyle: "black-translucent",
  },
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
      {/* 옛 아이폰(iOS 16.4 미만)은 새 이름(mobile-web-app-capable)을 모르고 이 이름만 본다.
          Next는 새 이름만 넣어 주므로 직접 하나 더 얹는다 — 둘 다 있어도 문제없다.
          이게 있어야 '홈 화면에 추가'로 열 때 주소창 없이 꽉 찬 앱으로 뜬다. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
