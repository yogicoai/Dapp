/**
 * 제공 서가(세계명작·전래동화) 목록 — 공개 동화 단계를 고르고 셀 때 쓰는 가벼운 모양(id·제목·표지·숨김).
 *
 * 서버(관리실 경로 · 요금제 화면 · 공개 경로)에서만 가져온다 — 책 본문 JSON 이 통째로 딸려 오므로
 * 브라우저 화면에서 가져오지 않는다(관리실 화면은 서버가 이 목록을 실어 보낸다).
 * 순서는 서가 탭 순서(세계명작 → 전래동화), 종류 안에서는 JSON 순서(= 서가 순서).
 */
import classicBooks from "@/data/classic-books.json";
import folkBooks from "@/data/folk-books.json";
import type { CatalogBook, LibraryKind } from "./offer-settings.ts";

type RawBook = { id: string; title: string; coverImage?: string; hidden?: boolean; pages?: { image?: string }[] };

function toCatalog(list: unknown, kind: LibraryKind): CatalogBook[] {
  return (list as RawBook[]).map((b) => ({
    id: b.id,
    kind,
    title: b.title,
    // 표지가 없는 책(장화 신은 고양이 등)은 첫 쪽 그림으로
    cover: b.coverImage ?? b.pages?.[0]?.image ?? null,
    hidden: b.hidden === true,
  }));
}

export const LIBRARY_CATALOG: readonly CatalogBook[] = [
  ...toCatalog(classicBooks, "classic"),
  ...toCatalog(folkBooks, "folk"),
];

export const LIBRARY_IDS: ReadonlySet<string> = new Set(LIBRARY_CATALOG.map((b) => b.id));
