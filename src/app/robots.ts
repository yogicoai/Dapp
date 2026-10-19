import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo";
import { readSeo } from "@/lib/seo-server";

/**
 * robots.txt — 검색 사이트에 들어와도 되는 곳·안 되는 곳(lib/seo PRIVATE_PATHS)과 sitemap 주소.
 * 관리실 '검색 노출(SEO)'에서 검색 노출을 끄면 전부 막는다. 5분마다 새로 읽는다.
 */
export const revalidate = 300;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { settings, origin } = await readSeo();
  return buildRobots(settings, origin);
}
