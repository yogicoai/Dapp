/**
 * /terms · /privacy · /refund 공개 문서 화면(서버). 누구나 로그인 없이 읽는다.
 *
 *  · 관리실에서 게시한 판 중 시행일이 오늘(한국 날짜) 이하인 가장 새 판을 보여 준다.
 *  · 시행일이 아직 안 온 판이 있으면 위에 "○월 ○일부터 바뀌어요"와 바뀔 내용을 접어서 보여 준다.
 *  · 게시한 판이 없으면 '준비 중' 카드 — 이때는 검색에 올리지 않는다(빈 문서가 검색 결과로 퍼지지 않게).
 *  · 본문은 덩어리를 글자로만 그린다(LegalDocView) — HTML 을 끼워 넣지 않는다.
 *  · 맨 아래 사업자 정보 줄에는 이 화면이 읽어 둔 값을 넘긴다 — 줄이 따로 한 번 더 읽지 않게.
 * DB 가 아직 없거나 못 읽으면 '준비 중'과 기본 사업자 정보로 뜬다(사이트는 SQL 전에도 뜬다).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/pay/SiteFooter";
import { formatDateKoLong, LEGAL_DOCS, parseLegalMarkdown, withObjectParticle, type LegalKind } from "@/lib/legal-doc";
import { getLegalPair, getSiteInfo } from "@/lib/site-info-server";
import { LegalDocView } from "./LegalDocView";

const APP_NAME = "우리 가족 보이스 동화";

export async function legalMetadata(kind: LegalKind): Promise<Metadata> {
  const { current } = await getLegalPair(kind);
  const title = current?.title || LEGAL_DOCS[kind].title;
  return {
    title: `${title} · ${APP_NAME}`,
    // 시행 중인 판이 없으면 색인하지 않는다('준비 중' 화면이 검색 결과에 남지 않게).
    robots: current ? undefined : { index: false, follow: true },
  };
}

const FOCUS = "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]";

export async function LegalPage({ kind }: { kind: LegalKind }) {
  const [{ current, upcoming }, siteInfo] = await Promise.all([getLegalPair(kind), getSiteInfo()]);
  const doc = LEGAL_DOCS[kind];
  const title = current?.title || doc.title;

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col bg-white text-[#191f28]">
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 sm:pt-8">
        <Link
          href="/"
          className={`-ml-1 inline-flex min-h-11 w-fit items-center rounded-lg px-1 text-[14px] font-semibold text-[#6b7684] hover:text-[#191f28] ${FOCUS}`}
        >
          ← {APP_NAME}
        </Link>

        <h1 className="mt-4 break-keep text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
        {current ? (
          <p className="mt-2 text-[14px] font-medium text-[#6b7684]">
            시행일 {formatDateKoLong(current.effectiveDate)} · 제{current.version}판
          </p>
        ) : null}

        {upcoming ? (
          <aside className="mt-5 rounded-2xl bg-[#fff4e0] px-4 py-3.5 text-[#8a5a00]">
            <p className="break-keep text-[15px] font-bold">
              {formatDateKoLong(upcoming.effectiveDate)}부터 {current ? "바뀌어요" : "시행해요"}
            </p>
            <details className="mt-1.5">
              <summary className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg text-[14px] font-bold underline underline-offset-2 ${FOCUS}`}>
                {current ? "바뀔 내용 보기" : "내용 미리 보기"}
              </summary>
              <div className="mt-2 rounded-xl bg-white px-4 py-4">
                <p className="mb-3 text-[13px] font-medium text-[#8b95a1]">
                  {upcoming.title} · 제{upcoming.version}판 · {formatDateKoLong(upcoming.effectiveDate)} 시행
                </p>
                <LegalDocView blocks={parseLegalMarkdown(upcoming.body)} compact />
              </div>
            </details>
          </aside>
        ) : null}

        {current ? (
          <article className="mt-8">
            <LegalDocView blocks={parseLegalMarkdown(current.body)} />
          </article>
        ) : (
          <section className="mt-8 rounded-2xl bg-[#f9fafb] px-5 py-8 text-center">
            <p className="break-keep text-[16px] font-bold">준비 중이에요</p>
            <p className="mt-1.5 break-keep text-[14px] font-medium text-[#6b7684]">곧 여기에 {withObjectParticle(doc.title)} 올려 둘게요.</p>
            {kind === "refund" ? (
              <Link
                href="/plans#refund"
                className={`mt-3 inline-flex min-h-11 items-center rounded-lg px-2 text-[14px] font-bold text-[#3182f6] underline underline-offset-2 ${FOCUS}`}
              >
                요금제 화면의 환불 안내 보기 →
              </Link>
            ) : null}
          </section>
        )}

        <div className="mt-10">
          <SiteFooter info={siteInfo} />
        </div>
      </main>
    </div>
  );
}
