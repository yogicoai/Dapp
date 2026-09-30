"use client";

/**
 * 사이트 맨 아래 사업자 정보 줄 — 전자상거래법 표시 사항.
 *
 * 값은 관리실 '사업자 정보·약관'에서 적는다(사장님, 2026-09-30). 이 부품은 공개 정보를 읽는 훅(useSiteInfo)으로
 * 그 값을 받고, 아직 못 읽었거나 DB 가 없으면 lib/business-info 의 기본값을 쓴다 — 비어 있는 값은 "(등록 예정)".
 * 약관·개인정보처리방침·환불 안내는 시행 중인 판이 있을 때만 링크가 되고, 없으면 "(준비 중)" 글자로 남는다.
 * 내부 가격 문서로는 절대 링크하지 않는다.
 *
 *  · SiteFooterView — 받은 값을 그리기만 한다(관리실 미리보기도 이걸 쓴다).
 *  · SiteFooter — 서버 화면이 읽어 둔 값(info)이 있으면 그걸, 없으면 훅이 읽은 값을 그린다.
 * 기본값이든 DB 값이든 줄 수가 같아서 읽고 난 뒤 화면이 흔들리지 않는다.
 */

import Link from "next/link";
import { infoText } from "@/lib/business-info";
import { useSiteInfo, type SiteInfo } from "@/lib/site-info-client";

const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-neutral-800";

const DOC_LINK = `rounded underline underline-offset-2 ${FOCUS}`;

export function SiteFooterView({ info, compact = false }: { info: SiteInfo; compact?: boolean }) {
  const b = info.business;
  const d = info.docs;
  return (
    <footer
      className={`break-keep rounded-2xl bg-white/80 p-4 font-medium leading-relaxed text-neutral-600 ${
        compact ? "mt-2 text-[10.5px]" : "mt-4 text-[11px]"
      }`}
    >
      <p className="font-extrabold text-neutral-700">{b.name}</p>
      <p>
        대표 {infoText(b.ceo)} · 사업자등록번호 {infoText(b.bizNo)}
      </p>
      <p>통신판매업 신고번호 {infoText(b.mailOrderNo)}</p>
      <p>주소 {infoText(b.address)}</p>
      <p>
        고객센터 {infoText(b.phone)}
        {b.hours ? ` (${b.hours})` : ""} · 이메일 {infoText(b.email)}
      </p>
      <p>호스팅 제공 {b.hosting}</p>
      <p className="mt-1.5">
        {d.terms.ready ? (
          <Link href="/terms" className={DOC_LINK}>
            이용약관
          </Link>
        ) : (
          "이용약관 (준비 중)"
        )}
        {" · "}
        {d.privacy.ready ? (
          <Link href="/privacy" className={`${DOC_LINK} font-extrabold text-neutral-700`}>
            개인정보처리방침
          </Link>
        ) : (
          <span className="font-extrabold text-neutral-700">개인정보처리방침 (준비 중)</span>
        )}
      </p>
      {/* 손가락으로 누르기 쉽게 한 줄을 따로 쓴다(높이 44px) */}
      <Link
        href={d.refund.ready ? "/refund" : "/plans#refund"}
        className={`-ml-1 inline-flex min-h-11 items-center rounded-full px-1 font-extrabold text-neutral-700 underline underline-offset-2 ${FOCUS}`}
      >
        환불 안내 ›
      </Link>
    </footer>
  );
}

export function SiteFooter({ compact = false, info }: { compact?: boolean; info?: SiteInfo | null }) {
  const value = useSiteInfo(info);
  return <SiteFooterView info={value} compact={compact} />;
}
