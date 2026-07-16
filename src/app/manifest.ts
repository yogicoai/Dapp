import type { MetadataRoute } from "next";

/**
 * PWA manifest. TWA로 Play 스토어에 올리면 여기 orientation이 그대로 먹혀서
 * 안드로이드 앱에서는 가로가 강제된다. 브라우저에서는 무시되므로 세로일 때는
 * OrientationGate가 안내를 대신한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우리 아이 보이스 동화",
    short_name: "보이스 동화",
    description: "아이가 주인공인 그림동화를 엄마·아빠 목소리로 읽어줍니다.",
    start_url: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "ko",
  };
}
