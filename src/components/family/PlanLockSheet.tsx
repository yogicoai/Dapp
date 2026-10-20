"use client";

/**
 * 가족 그리기 잠금 안내 — 요금제가 없는 회원이 '그리기'를 누르면 확인 창(값) 대신 이 시트를 띄운다(2026-10-20 출시 전 점검).
 *
 * 그림은 서버(/api/family/portrait)도 결제 요금제 회원만 그린다(lib/create-access — 동화 만들기와 같은 문). 예전엔 화면이 그걸 몰라
 * 확인 창 → 그리는 화면까지 간 뒤 서버가 거절하고 '다시 해 볼게요'가 되풀이됐다. 보기·옷 바꾸기·예전 그림으로 돌아가기는 그대로 쓴다.
 */

import type { Colors } from "./family-ui";
import { Sheet } from "./Sheet";
import { BigButton, SoftButton } from "./ui";

export function PlanLockSheet({ colors, onClose, onPlans }: { colors: Colors; onClose: () => void; onPlans: () => void }) {
  return (
    <Sheet onClose={onClose} label="가족 캐릭터 그리기 안내">
      <div className="flex flex-col items-center gap-2 px-1 pb-1 text-center">
        <p className="text-4xl" aria-hidden>
          🎨
        </p>
        <h2 className="break-keep text-lg font-extrabold text-neutral-800">
          가족 캐릭터 그리기는 가족 패스나 스타트팩을 시작하면 쓸 수 있어요
        </h2>
        <p className="break-keep text-sm font-medium leading-relaxed text-neutral-500">
          결제는 곧 열려요. 그동안 세계명작·전래동화를 들어 보세요.
        </p>
        <div className="mt-3 flex w-full flex-col gap-2.5">
          <BigButton colors={colors} onClick={onPlans}>
            요금제 보기
          </BigButton>
          <SoftButton onClick={onClose}>닫기</SoftButton>
        </div>
      </div>
    </Sheet>
  );
}
