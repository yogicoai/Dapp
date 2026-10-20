import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/pay/SiteFooter";
import { getSiteInfo } from "@/lib/site-info-server";

/**
 * /account-deletion 계정 삭제 안내 — 로그인 없이 누구나 연다(2026-10-20, 안드로이드 출시 준비).
 *
 * 왜: 구글 플레이 '데이터 보안' 양식에 계정 삭제를 요청하는 웹 주소를 적어야 한다(앱 안 탈퇴와 따로).
 * 앱을 지웠거나 로그인할 수 없는 사람도 이 주소로 삭제를 요청할 수 있어야 한다 — 그래서 이메일 요청 길도 적는다.
 * 지우는 것·남기는 것·기간은 게시한 개인정보처리방침(3·4번)과 같게 쓴다(탈퇴 뒤 90일 보관 · 법정 기록).
 * 고객센터 이메일은 관리실 '사업자 정보' 값(서버에서 읽는다).
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "계정 삭제 안내",
  description: "우리 가족 보이스 동화 계정과 데이터를 지우는 방법, 지우는 정보와 보관 기간을 알려 드려요.",
};

const APP_NAME = "우리 가족 보이스 동화";
const FOCUS = "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]";

export default async function AccountDeletionPage() {
  const siteInfo = await getSiteInfo();
  const { company, email, phone } = {
    company: siteInfo.business.name,
    email: siteInfo.business.email,
    phone: siteInfo.business.phone,
  };

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col bg-white text-[#191f28]">
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 sm:pt-8">
        <Link
          href="/"
          className={`-ml-1 inline-flex min-h-11 w-fit items-center rounded-lg px-1 text-[14px] font-semibold text-[#6b7684] hover:text-[#191f28] ${FOCUS}`}
        >
          ← {APP_NAME}
        </Link>

        <h1 className="mt-4 break-keep text-[26px] font-bold leading-tight tracking-tight">계정 삭제 안내</h1>
        <p className="mt-2 break-keep text-[15px] font-medium leading-relaxed text-[#4e5968]">
          {APP_NAME}{company ? `(${company})` : ""} 계정과 그 안의 정보를 지우는 방법이에요. 앱과 웹사이트는 같은 계정을 써요.
        </p>

        <section className="mt-8 flex flex-col gap-3" aria-labelledby="how">
          <h2 id="how" className="text-[19px] font-bold">1. 앱이나 웹사이트에서 직접 지우기</h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-[#333d4b]">
            <li>로그인해요.</li>
            <li>
              <Link href="/settings" className={`font-bold text-[#3182f6] underline underline-offset-2 ${FOCUS}`}>
                설정
              </Link>
              으로 가요.
            </li>
            <li>맨 아래 ‘회원 탈퇴’를 누르고 안내에 따라 확인해요.</li>
          </ol>
          <p className="break-keep text-[14px] text-[#6b7684]">탈퇴하면 바로 로그아웃되고, 같은 계정으로 다시 들어올 수 없어요.</p>
        </section>

        <section className="mt-8 flex flex-col gap-3" aria-labelledby="mail">
          <h2 id="mail" className="text-[19px] font-bold">2. 로그인할 수 없을 때 — 이메일로 요청하기</h2>
          <p className="break-keep text-[15px] leading-relaxed text-[#333d4b]">
            앱을 지웠거나 로그인할 수 없으면 고객센터로 삭제를 요청해 주세요. 가입한 구글 계정 이메일(또는 아이디)을 함께 적어 주시면
            본인인지 확인한 뒤 늦어도 10일 안에 처리하고 결과를 알려 드려요.
          </p>
          <div className="rounded-2xl bg-[#f9fafb] px-4 py-3.5 text-[15px]">
            {email ? (
              <p>
                이메일 <span className="select-all font-bold">{email}</span>
              </p>
            ) : (
              <p>이메일 주소는 준비 중이에요.</p>
            )}
            {phone ? <p className="mt-1 text-[14px] text-[#4e5968]">전화 {phone}</p> : null}
          </div>
        </section>

        <section className="mt-8 flex flex-col gap-3" aria-labelledby="what">
          <h2 id="what" className="text-[19px] font-bold">3. 지우는 정보</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-[#333d4b]">
            <li>계정 정보(이메일, 아이디, 프로필)</li>
            <li>아이·가족 정보(이름·호칭, 나이, 생김새, 메모)</li>
            <li>만든 동화(대본·그림·낭독)와 가족 캐릭터 그림</li>
            <li>남은 쿠키·크레딧</li>
          </ul>
          <p className="break-keep text-[14px] leading-relaxed text-[#6b7684]">
            요청 처리와 분쟁 해결을 위해 탈퇴한 날부터 90일 동안 따로 보관한 뒤 완전히 지워요. 가족 캐릭터를 그릴 때 올린 사진은 그림을
            그린 직후 지워서 남아 있지 않아요.
          </p>
        </section>

        <section className="mt-8 flex flex-col gap-3" aria-labelledby="keep">
          <h2 id="keep" className="text-[19px] font-bold">4. 법에 따라 남기는 기록</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-[#333d4b]">
            <li>계약·청약철회 기록, 결제와 공급 기록: 5년(전자상거래법)</li>
            <li>소비자 불만·분쟁 처리 기록: 3년(전자상거래법)</li>
            <li>접속 기록: 3개월(통신비밀보호법)</li>
          </ul>
          <p className="break-keep text-[14px] text-[#6b7684]">
            이 기록은 법이 정한 목적 밖으로 쓰지 않고, 기간이 끝나면 지워요. 자세한 내용은{" "}
            <Link href="/privacy" className={`font-bold text-[#3182f6] underline underline-offset-2 ${FOCUS}`}>
              개인정보처리방침
            </Link>
            을 봐 주세요.
          </p>
        </section>

        <div className="mt-10">
          <SiteFooter info={siteInfo} />
        </div>
      </main>
    </div>
  );
}
