import { MAKE_STEPS, type MakeStepIndex } from "@/lib/create-flow";

/**
 * 동화 만드는 순서 한 줄 — ① 대본 만들기 › ② 그림 그리기 › ③ 동화 완성.
 *
 * 2026-09-29 사장님: "순서를 알려줘야 할 듯 — 이야기 짓기 > 대본 완성 > 이미지 생성 > 이야기 완성 이런 식으로
 * 소개가 있어야 할 것 같아." 성우 화면의 '대본 만들기' 단추 위(소개)와 대본·그림·완성 화면 위,
 * 그리고 대본을 기다리는 막에 같은 줄을 둔다.
 * 부모가 지금 어디쯤이고, 그림(값이 따로 드는 단계)이 아직 남았다는 걸 한눈에 본다.
 *
 * 지금 단계는 색만으로 말하지 않는다 — 꽉 찬 동그라미·굵은 글씨·aria-current="step" 로도 알리고,
 * 지난 단계는 번호 대신 ✓ 를 단다(화면 읽기에는 '끝남'·'지금 단계'를 읽어 준다).
 * 누르는 곳이 아니다(보여 주기만 한다) — 그래서 nav(길 찾기 구역)로 두지 않고, 이름 붙인 목록으로 둔다
 * (화면 읽기가 '갈 곳이 있는 구역'으로 알리지 않게).
 *
 * 폭: 좁은 폰(360px)의 카드 안은 256px 남짓이라 글씨·동그라미를 작게 두었다. 그래도 모자라면(글씨 키움 등)
 * 가로로 넘치지 않고 다음 줄로 접힌다(flex-wrap). 카드 안에서는 부르는 쪽이 -mx-3 으로 여백을 조금 빌린다.
 *
 * @param tone light = 흰 카드 위, dark = 어두운 기다림 막·완성 화면 알약 위.
 */
export function MakeSteps({
  current,
  accent,
  tone = "light",
  className = "",
}: {
  current: MakeStepIndex;
  accent: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={className}>
      <ol aria-label="동화 만드는 순서" className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-[11px] sm:text-[12px]">
        {MAKE_STEPS.map((label, i) => {
          const done = i < current;
          const now = i === current;
          const circle = now
            ? "text-white"
            : done
              ? dark
                ? "bg-white/25 text-white"
                : "bg-neutral-200 text-neutral-600"
              : dark
                ? "border-2 border-white/60 text-white/90"
                : "border-2 border-neutral-300 text-neutral-500";
          const text = now
            ? dark
              ? "font-extrabold text-white"
              : "font-extrabold text-neutral-800"
            : dark
              ? "font-bold text-white/90"
              : done
                ? "font-bold text-neutral-600"
                : "font-bold text-neutral-500";
          return (
            <li key={label} aria-current={now ? "step" : undefined} className="flex items-center gap-0.5">
              {i > 0 && (
                <span aria-hidden className={`font-bold ${dark ? "text-white/70" : "text-neutral-400"}`}>
                  ›
                </span>
              )}
              <span
                aria-hidden
                style={now ? { background: accent } : undefined}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${circle}`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`whitespace-nowrap ${text}`}>
                <span className="sr-only">{i + 1}단계 </span>
                {label}
                {done && <span className="sr-only"> (끝남)</span>}
                {now && <span className="sr-only"> (지금 단계)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
