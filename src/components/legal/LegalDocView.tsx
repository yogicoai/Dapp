/**
 * 약관 본문 그리기 — 덩어리(parseLegalMarkdown 의 결과)를 글자로만 그린다.
 *
 * 관리실에서 적은 글이 고객 화면에 그대로 뜨는 곳이라, HTML 을 끼워 넣는 길을 아예 두지 않는다
 * (legal-doc.test 가 이 폴더에 그런 코드가 없는지 본다). <script> 도 [링크](주소) 도 글자로 보일 뿐이다.
 * 훅이 없는 부품이라 서버 화면(/terms)과 관리실 미리보기(브라우저) 양쪽에서 그대로 쓴다.
 */
import type { LegalBlock } from "@/lib/legal-doc";

export function LegalDocView({ blocks, compact = false }: { blocks: readonly LegalBlock[]; compact?: boolean }) {
  if (blocks.length === 0) {
    return <p className="text-[14px] font-medium text-[#8b95a1]">본문이 비어 있어요.</p>;
  }
  return (
    <div className={`break-keep text-[#191f28] ${compact ? "text-[14px] leading-[1.7]" : "text-[15px] leading-[1.75]"}`}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h2":
            return (
              <h2 key={i} className="mb-2 mt-7 text-[19px] font-bold leading-snug tracking-tight first:mt-0">
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mb-1.5 mt-5 text-[16px] font-bold leading-snug first:mt-0">
                {b.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="my-2.5 whitespace-pre-line">
                {b.text}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="my-2.5 list-disc pl-5">
                {b.items.map((it, j) => (
                  <li key={j} className="my-1 whitespace-pre-line pl-0.5">
                    {it}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} start={b.start} className="my-2.5 list-decimal pl-5">
                {b.items.map((it, j) => (
                  <li key={j} className="my-1 whitespace-pre-line pl-0.5">
                    {it}
                  </li>
                ))}
              </ol>
            );
          case "hr":
            return <hr key={i} className="my-6 border-0 border-t border-[#e5e8eb]" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
