"use client";

/**
 * 로그인 직후 한 번 뜨는 약관 동의 화면 — lib/consent(누구에게·언제) · lib/consent-client(기록).
 *
 * 모든 화면 위에 얹힌다(app/layout). 주소가 바뀔 때마다 한 번 물어본다 — 로그인 화면에서 돌아온 직후에도 뜨게.
 * 한 번 동의를 확인하면(또는 동의하면) 이 창을 연 동안은 다시 묻지 않는다.
 * 약관 '보기'는 새 탭으로 연다 — 체크하던 것이 사라지지 않게.
 * 동의하지 않으면 로그아웃하고 첫 화면으로(비회원 둘러보기는 된다).
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logOut, loadSession } from "@/lib/auth";
import { allAgreed, CONSENT_ITEMS, consentExempt, docsLive, NO_CHECKS, setAll, type ConsentChecks } from "@/lib/consent";
import { agreeTerms, loadMyConsent } from "@/lib/consent-client";
import { loadSiteInfo } from "@/lib/site-info-client";

export function ConsentGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<ConsentChecks>(NO_CHECKS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 이 창에서 동의를 확인했다 — 다시 묻지 않는다 */
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current || consentExempt(pathname)) return;
    let alive = true;
    void (async () => {
      const info = await loadSiteInfo();
      if (!alive || !docsLive(info.docs)) return;
      const s = await loadSession();
      if (!alive || !s.uid || s.guest || s.isMaster) return;
      const state = await loadMyConsent(s.uid);
      if (!alive) return;
      if (state === "agreed") {
        settled.current = true;
        return;
      }
      if (state === "needed") setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (!open) return null;

  const all = allAgreed(checks);

  const agree = async () => {
    if (!all || busy) return;
    setBusy(true);
    setError(null);
    const r = await agreeTerms(checks);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    settled.current = true;
    setOpen(false);
  };

  const decline = async () => {
    if (busy) return;
    setBusy(true);
    await logOut();
    setBusy(false);
    setOpen(false);
    router.replace("/");
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="flex w-full max-w-md flex-col rounded-[28px] bg-white px-5 pb-5 pt-6 shadow-2xl"
      >
        <h2 id="consent-title" className="break-keep text-center text-xl font-extrabold text-neutral-800">
          우리 가족 보이스 동화를 시작해요
        </h2>
        <p className="mt-1 text-center text-[13px] font-medium text-neutral-500">처음 한 번만 확인할게요.</p>

        <label className="mt-5 flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl bg-stone-50 px-4 shadow-[inset_0_0_0_1px_#ece7df]">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setChecks(setAll(e.target.checked))}
            className="h-5 w-5 shrink-0 accent-emerald-700"
          />
          <span className="text-[15px] font-extrabold text-neutral-800">모두 동의해요</span>
        </label>

        <ul className="mt-2 flex flex-col">
          {CONSENT_ITEMS.map((item) => (
            <li key={item.key} className="flex items-start gap-3 border-b border-stone-100 px-1 py-3 last:border-0">
              <input
                id={`consent-${item.key}`}
                type="checkbox"
                checked={checks[item.key]}
                onChange={(e) => setChecks((c) => ({ ...c, [item.key]: e.target.checked }))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700"
              />
              <label htmlFor={`consent-${item.key}`} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
                <span className="break-keep text-sm font-bold text-neutral-800">
                  <span className="text-emerald-700">(필수)</span> {item.label}
                </span>
                {item.note ? <span className="break-keep text-xs font-medium text-neutral-500">{item.note}</span> : null}
              </label>
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 shrink-0 items-center px-2 text-xs font-bold text-neutral-500 underline underline-offset-2"
                >
                  보기
                </a>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="mt-2 break-keep rounded-2xl bg-stone-50 px-4 py-3 text-xs font-medium leading-relaxed text-neutral-600">
          아이 정보는 보호자가 직접 넣고, 동화와 캐릭터를 만드는 데에만 써요. 가족 사진은 그림을 그리는 데 한 번 쓰고 저장하지 않아요.
        </p>

        {error ? <p className="mt-3 text-center text-sm font-bold text-rose-600">{error}</p> : null}

        <button
          type="button"
          onClick={() => void agree()}
          disabled={!all || busy}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-full bg-emerald-700 px-4 text-base font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "저장하는 중…" : "동의하고 시작하기"}
        </button>
        <button
          type="button"
          onClick={() => void decline()}
          disabled={busy}
          className="mt-2 min-h-11 px-3 text-sm font-bold text-neutral-500"
        >
          동의하지 않을래요(로그아웃)
        </button>
      </div>
    </div>
  );
}
