"use client";

import { useEffect, useState } from "react";
import { LATEST_UPDATE } from "@/lib/updates";
import { markUpdateNoticeSeen, updateNoticeSeen } from "@/lib/prefs";

/**
 * 새 소식(공지) — 홈 첫 화면에 한 번 펼쳐 보이고, 닫으면 작은 알약으로 접힌다.
 *
 * 왜 홈인가: 부모가 반드시 지나가는 화면이 여기뿐이다. 설정 안쪽에 두면 아무도 안 본다.
 * 왜 접히는가: 홈은 아이가 보는 화면이기도 하다. 한 번 읽은 공지가 매번 마스코트와
 * '동화 만들기' 버튼을 밀어내면 안 된다. 접은 뒤에도 알약을 누르면 언제든 다시 편다.
 *
 * 다음 공지를 올릴 때는 updates.ts의 id만 바꾸면 이미 닫은 사람에게도 다시 펼쳐진다.
 */
export function UpdateNotice() {
  const note = LATEST_UPDATE;
  /*
   * null = 아직 모른다(서버 렌더 직후). 이때는 아무것도 그리지 않는다.
   * localStorage는 브라우저에만 있어서, 처음부터 열린 채로 그리면 서버가 만든 화면과
   * 달라져 깜빡인다(hydration 불일치).
   */
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    setOpen(!updateNoticeSeen(note.id));
  }, [note.id]);

  if (open === null) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto mb-4 flex items-center gap-1.5 rounded-full bg-white/85 px-4 py-2 text-xs font-extrabold text-neutral-600 shadow backdrop-blur transition hover:bg-white"
      >
        📣 새 소식 보기
      </button>
    );
  }

  return (
    <section
      aria-label="새 소식"
      className="mx-auto mb-5 w-full max-w-xl rounded-3xl bg-white/95 p-5 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] font-extrabold text-white">
            📣 새 소식
          </span>
          <span className="text-[11px] font-extrabold text-neutral-400">{note.date}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            // 닫을 때 기록한다 — 열어만 두고 안 읽은 사람에게는 다음에 또 보여준다.
            markUpdateNoticeSeen(note.id);
            setOpen(false);
          }}
          aria-label="새 소식 닫기"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-extrabold text-neutral-500 transition hover:bg-neutral-200"
        >
          ✕
        </button>
      </div>

      <h2 className="mt-2.5 break-keep text-[15px] font-extrabold leading-relaxed text-neutral-800">
        {note.headline}
      </h2>

      {/* 소식이 다섯 줄이라 폰에서는 화면을 다 덮는다 — 반쯤에서 묶고 안에서 굴린다.
          제목과 닫기 버튼은 밖에 있어 늘 보인다. */}
      <ul className="mt-3 flex max-h-[44dvh] flex-col gap-3 overflow-y-auto pr-1">
        {note.items.map((item) => (
          <li key={item.title} className="flex gap-2.5">
            <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="break-keep text-[13.5px] font-extrabold leading-snug text-neutral-800">
                {item.title}
              </p>
              <p className="mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-600">
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {note.footer && (
        <p className="mt-4 break-keep rounded-2xl bg-neutral-50 px-3.5 py-2.5 text-[12.5px] font-bold leading-relaxed text-neutral-600">
          {note.footer}
        </p>
      )}
    </section>
  );
}
