"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PRICING, loadPricing, type Pricing } from "@/lib/pricing";

/**
 * 지금 가격을 화면에서 쓴다 — 관리실에서 사장님이 정한 값(app_pricing).
 *
 * 처음엔 지금까지 쓰던 상수로 그리고, 읽어 오면 그 값으로 바뀐다. 못 읽으면 상수 그대로다.
 * 그래서 이 고리가 늦어도 화면이 비지 않고, 옛 DB(표가 없는)에서도 예전처럼 돈다.
 *
 * ⚠️ 실제로 깎이는 액수는 DB 함수가 정한다(charge_story · charge_illustration).
 * 여기 값은 **보여 주는 숫자**다 — 같은 표에서 읽으므로 화면과 실제가 어긋나지 않는다.
 */
export function usePricing(): Pricing {
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  useEffect(() => {
    let alive = true;
    void loadPricing().then((p) => {
      if (alive) setPricing(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return pricing;
}
