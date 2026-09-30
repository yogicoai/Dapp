"use client";

/**
 * 사고 서랍을 주소(?job=<기록 id> 또는 ?entry=<장부 id>)로 여닫는다.
 *
 * 왜 주소인가: 서랍 상태를 화면에만 두면 새로 고침·뒤로 가기 때 사라지고, 사장님이 "이 건 봐 줘"라고
 * 링크를 건넬 수도 없다. 기록이 있는 사고는 job, 기록 없이 결제만 남은 사고는 entry 로 연다(옛 관리실의 Open 과 같다).
 * uuid 모양이 아니면 없는 것으로 본다 — 주소를 손으로 고쳐도 서버에 이상한 값이 가지 않게.
 */
import { useCallback, useMemo } from "react";
import { isUuid } from "@/lib/admin";
import { useUrlOverlay } from "../kit/hooks";

export type CaseOpen = { jobId: string | null; entry: string | null };

export function useCaseParam(): {
  open: CaseOpen | null;
  openCase: (o: CaseOpen) => void;
  closeCase: () => void;
} {
  const o = useUrlOverlay(["job", "entry"]);
  const job = o.values.job ?? null;
  const entry = o.values.entry ?? null;
  const open = useMemo<CaseOpen | null>(() => {
    if (isUuid(job)) return { jobId: job.toLowerCase(), entry: null };
    if (isUuid(entry)) return { jobId: null, entry: entry.toLowerCase() };
    return null;
  }, [job, entry]);
  const { open: openOverlay, close } = o;
  const openCase = useCallback(
    (c: CaseOpen) => openOverlay(c.jobId ? { job: c.jobId } : { entry: c.entry }),
    [openOverlay],
  );
  return { open, openCase, closeCase: close };
}
