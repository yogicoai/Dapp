"use client";

/**
 * 대시보드 '최근 7일' 작은 막대 — 한 줄에 한 가지(새 회원 또는 만든 동화), 한국 날짜 하루에 막대 하나.
 *
 * 그리는 규칙(dataviz 원칙): 한 가지 값이라 범례 없이 제목이 이름을 대신한다. 색은 한 가지.
 * 막대는 24px 이하로 가늘게, 위만 4px 둥글게, 바닥선에서 자란다. 숫자는 모든 막대가 아니라
 * 오늘과 가장 큰 날에만 붙이고(나머지는 마우스를 올리면), 화면 읽기 프로그램에는 표로 전부 준다.
 * 글자는 늘 글자색으로(막대 색을 글자에 입히지 않는다). 축·눈금선은 두지 않는다 — 7칸이라 필요 없다.
 * 만든 동화 막대는 설계의 #8b95a1 대신 #6b7684 — 흰 바탕 대비가 3:1 에 못 미쳐(2.96) 한 단계 진하게 했다.
 */
import { shortDayLabel, type DayBucket } from "@/lib/admin-dashboard";
import { groupDigits } from "@/lib/admin-console";

const COLOR = { blue: "bg-[#3182f6]", gray: "bg-[#6b7684]" } as const;

export function WeekBars({
  title,
  unit,
  tone,
  days,
  pick,
}: {
  title: string;
  unit: string;
  tone: keyof typeof COLOR;
  days: DayBucket[];
  pick: (d: DayBucket) => number | null;
}) {
  const values = days.map(pick);
  const known = values.every((v): v is number => typeof v === "number");
  const max = known ? Math.max(0, ...(values as number[])) : 0;
  const maxAt = known && max > 0 ? values.lastIndexOf(max) : -1;
  const today = days.length - 1;
  const sum = known ? (values as number[]).reduce((s, v) => s + v, 0) : null;

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-bold text-[#191f28]">{title}</span>
        <span className="text-[12px] font-medium tabular-nums text-[#8b95a1]">
          {sum === null ? "–" : `7일 ${groupDigits(sum)}${unit}`}
        </span>
      </figcaption>

      {!known ? (
        <p className="flex h-[112px] items-center justify-center rounded-xl bg-[#f9fafb] text-[13px] font-medium text-[#8b95a1]">
          이 숫자를 못 읽었어요
        </p>
      ) : (
        <div aria-hidden className="grid h-[112px] grid-cols-7 items-end gap-0.5 border-b border-[#e5e8eb]">
          {days.map((d, i) => {
            const v = values[i] as number;
            const pct = max > 0 ? Math.max(v > 0 ? 4 : 0, Math.round((v / max) * 100)) : 0;
            const label = i === today || i === maxAt;
            return (
              <div key={d.day} className="group relative flex h-full flex-col items-center justify-end">
                {/* 오늘·가장 큰 날만 숫자를 늘 보여 주고, 나머지는 마우스를 올리면 */}
                <span
                  className={`mb-1 text-[11px] font-bold tabular-nums text-[#4e5968] transition-opacity motion-reduce:transition-none ${
                    label && v > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {groupDigits(v)}
                </span>
                <span
                  className={`block w-full max-w-6 rounded-t-[4px] ${v > 0 ? COLOR[tone] : "bg-transparent"}`}
                  style={{ height: `${Math.min(80, pct * 0.8)}px` }}
                />
              </div>
            );
          })}
        </div>
      )}
      <div aria-hidden className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => (
          <span
            key={d.day}
            className={`text-center text-[11px] tabular-nums ${i === today ? "font-bold text-[#191f28]" : "font-medium text-[#8b95a1]"}`}
          >
            {i === today ? "오늘" : shortDayLabel(d.day)}
          </span>
        ))}
      </div>

      {/* 화면 읽기 프로그램용 — 막대 대신 날짜별 숫자 표 */}
      <table className="sr-only">
        <caption>{`${title} — 최근 7일, 한국 날짜`}</caption>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">{title}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{values[i] === null ? "못 읽음" : `${groupDigits(values[i] as number)}${unit}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
