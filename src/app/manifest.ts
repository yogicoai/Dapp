import type { MetadataRoute } from "next";
import { READ_ALOUD_VOICE } from "@/lib/plans";

/**
 * PWA manifest. TWA로 Play 스토어에 올리면 여기 orientation이 그대로 먹혀서
 * 안드로이드 앱에서는 가로가 강제된다. 브라우저에서는 무시되므로 세로일 때는
 * OrientationHint가 한 번 권하고 비켜준다.
 *
 * 아이콘(2026-10-20 안드로이드 출시 준비): 앱 설치·TWA(Bubblewrap)·플레이 스토어가 이 아이콘을 쓴다.
 * 지금은 우주나라 마스코트(우주복 아이, themes/space/mascot)를 얼굴 중심으로 자른 임시 아이콘(public/icons/app, 10-20 사장님 고름) —
 * 정식 아이콘이 나오면 파일만 바꾼다. maskable 은 안드로이드가 가장자리를 약 10%씩 더 자르니 조금 넓게 잘랐다.
 * maskable 은 안드로이드가 동그랗게·네모로 잘라도 얼굴이 가운데 80% 안에 들게 조금 넓게 잘랐다.
 * TWA 의 시작 주소는 이 start_url 이 아니라 Bubblewrap 설정의 startUrl("/?app=android", lib/app-shell)이다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우리 가족 보이스 동화",
    short_name: "보이스 동화",
    description: `아이가 주인공인 그림동화를 ${READ_ALOUD_VOICE}로 읽어줍니다.`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "ko",
    icons: [
      { src: "/icons/app/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
