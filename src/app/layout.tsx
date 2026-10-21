import type { Metadata, Viewport } from "next";
import { Dongle, Gaegu, Gowun_Dodum, Jua, Nanum_Pen_Script } from "next/font/google";
import { AppIntro } from "@/components/AppIntro";
import { AppShellMark } from "@/components/AppShellMark";
import { ConsentGate } from "@/components/ConsentGate";
import { ThemeProvider } from "@/components/ThemeProvider";
import { APP_SHELL_BOOT_SCRIPT } from "@/lib/app-shell";
import { buildSiteMetadata } from "@/lib/seo";
import { readSeo } from "@/lib/seo-server";
import "./globals.css";

const dongle = Dongle({ weight: ["300", "400", "700"], variable: "--font-dongle", preload: false });
const gaegu = Gaegu({ weight: ["400", "700"], variable: "--font-gaegu", preload: false });
const gowunDodum = Gowun_Dodum({ weight: "400", variable: "--font-gowun-dodum", preload: false });
const jua = Jua({ weight: "400", variable: "--font-jua", preload: false });
const nanumPen = Nanum_Pen_Script({ weight: "400", variable: "--font-nanum-pen", preload: false });

/*
 * 검색 노출(SEO) — 제목·설명·검색어·공유 그림·소유 확인·검색 노출 켜기는 관리실 '검색 노출(SEO)'에서 바꾼다(lib/seo).
 * 5분마다 새로 읽고, 관리실에서 저장하면 그 자리에서 다시 그린다(api/admin/seo 의 revalidatePath). DB 가 없거나 느리면 기본값.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { settings, origin } = await readSeo();
  return { ...buildSiteMetadata(settings, origin), appleWebApp: APPLE_WEB_APP };
}

const APPLE_WEB_APP: Metadata["appleWebApp"] = {
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
  capable: true,
  title: "보이스 동화",
  statusBarStyle: "black-translucent",
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
    <html
      lang="ko"
      className={`h-full antialiased ${dongle.variable} ${gaegu.variable} ${gowunDodum.variable} ${jua.variable} ${nanumPen.variable}`}
      // 첫 그림 전 스크립트가 data-app-shell·data-app-intro 를 단다(앱 안) — 서버 HTML 에 없던 속성이라 맞춰 보지 않는다
      suppressHydrationWarning
    >
      {/* 옛 아이폰(iOS 16.4 미만)은 새 이름(mobile-web-app-capable)을 모르고 이 이름만 본다.
          Next는 새 이름만 넣어 주므로 직접 하나 더 얹는다 — 둘 다 있어도 문제없다.
          이게 있어야 '홈 화면에 추가'로 열 때 주소창 없이 꽉 찬 앱으로 뜬다. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <body className="min-h-full flex flex-col">
        {/* 앱 안이면 첫 그림부터 검은 바탕·새로 켠 처음이면 '동화 나라로 이동 중'(lib/app-shell) — 무엇보다 먼저 돌아야 한다 */}
        <script dangerouslySetInnerHTML={{ __html: APP_SHELL_BOOT_SCRIPT }} />
        <AppIntro />
        <ThemeProvider>
          {children}
          {/* 로그인 직후 한 번 — 약관·개인정보·보호자 동의(lib/consent, 사장님 2026-10-19) */}
          <ConsentGate />
          <AppShellMark />
        </ThemeProvider>
      </body>
    </html>
  );
}
