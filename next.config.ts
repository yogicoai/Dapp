import path from "path";
import type { NextConfig } from "next";

/**
 * 모든 응답에 붙이는 보안 헤더 — 2026-10-20 출시 전 보안 점검.
 *  · 다른 사이트가 우리 화면을 틀(iframe) 안에 넣지 못하게(클릭 가로채기 막기) — X-Frame-Options · CSP frame-ancestors
 *  · 파일 종류를 브라우저가 멋대로 짐작하지 않게 — nosniff
 *  · 다른 사이트로 갈 때 주소 전체(쿼리)를 넘기지 않게 — Referrer-Policy
 *  · 쓰지 않는 위치 정보는 끈다. 마이크(녹음·말로 입력)·전체화면·화면 켜 두기는 기본값(우리 사이트만 허용) 그대로.
 * 스크립트를 막는 CSP 전체는 넣지 않았다 — 잘못 막으면 화면이 깨진다. 넣을 때는 '보고만 하기'(Report-Only)부터.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // 홈 디렉터리에 떠도는 package-lock.json 때문에 워크스페이스 루트를
  // 잘못 추론하는 것을 막는다 (dev 서버 기동 시 경고 원인).
  turbopack: {
    root: path.join(__dirname),
  },
  // 'X-Powered-By: Next.js' 를 내보내지 않는다 — 무엇으로 만든 사이트인지 굳이 알리지 않는다.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
