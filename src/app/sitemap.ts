import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo";
import { readSeo } from "@/lib/seo-server";

/**
 * sitemap.xml — 검색 사이트에 알려 줄 공개 화면(lib/seo PUBLIC_PATHS). 대표 주소는 관리실 값 → NEXT_PUBLIC_SITE_URL → 지금 배포 주소.
 * 검색 노출을 끄면 비운다. 5분마다 새로 읽는다.
 */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { settings, origin } = await readSeo();
  return buildSitemap(settings, origin, new Date());
}
