import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 홈 디렉터리에 떠도는 package-lock.json 때문에 워크스페이스 루트를
  // 잘못 추론하는 것을 막는다 (dev 서버 기동 시 경고 원인).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
