/**
 * 사이트 맨 아래 사업자 정보 줄이 쓰는 훅 — 공개 정보 GET 하나만 한다.
 *
 * 왜 따로 있나: 맨 아래 줄(components/pay/SiteFooter)은 결제 시연 파일이라 서버를 부르거나 DB 를 만질 수 없다
 * (pay-demo 규칙 — 시연 파일에 서버로 가는 글자가 한 줄도 없어야 한다). 그런데 사업자 정보·약관은 이제
 * 관리실에서 바꾼다. 그래서 '공개 정보 경로 하나를 읽기만 하는' 이 훅만 시연 파일에 허용했다
 * (pay-demo.guard.test 의 G-T6 이 이 파일 모양을 지킨다: 부르는 곳 하나, GET 만, 로그인·DB·저장소 없음).
 *
 *  · 서버 화면(/terms 등)이 이미 읽어 넘겨준 값이 있으면 그걸 쓰고 부르지 않는다.
 *  · 없으면 첫 그림은 늘 기본값이다 — 서버 HTML 과 첫 화면이 같아야 해서(값이 다르면 React 가 경고한다).
 *    읽고 나면 그 값으로 바꾼다. 줄 수는 같아서 화면이 흔들리지 않는다.
 *  · 한 번 읽은 값은 창을 연 동안 모든 화면이 나눠 쓴다. 실패하면 기본값을 쓰고, 다음 화면에서 다시 읽어 본다.
 *
 * 상대 경로만 쓴다(src/lib 의 다른 파일과 같이).
 */
import { useEffect, useState } from "react";
import { asSiteInfo, FALLBACK_SITE_INFO, type SiteInfo } from "./site-info.ts";

export type { SiteInfo };

let pending: Promise<SiteInfo> | null = null;

/** 공개 정보를 한 번 읽는다(창 안에서 나눠 쓴다). 실패하면 기본값 — 그리고 다음에 다시 읽게 비운다. */
export function loadSiteInfo(): Promise<SiteInfo> {
  if (!pending) {
    pending = fetch("/api/site-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json === null) throw new Error("site-info");
        return asSiteInfo(json);
      })
      .catch(() => {
        pending = null;
        return FALLBACK_SITE_INFO;
      });
  }
  return pending;
}

/**
 * 맨 아래 줄 값. initial 을 주면(서버 화면이 읽어 둔 값) 그대로 쓰고 부르지 않는다.
 */
export function useSiteInfo(initial?: SiteInfo | null): SiteInfo {
  const [loaded, setLoaded] = useState<SiteInfo | null>(null);
  const skip = !!initial;
  useEffect(() => {
    if (skip) return;
    let alive = true;
    void loadSiteInfo().then((v) => {
      if (alive) setLoaded(v);
    });
    return () => {
      alive = false;
    };
  }, [skip]);
  return initial ?? loaded ?? FALLBACK_SITE_INFO;
}
