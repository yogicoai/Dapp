"use client";

/**
 * 가족 사진관 '옷 갈아입기' 시트(사장님 2026-09-30 — lib/family-outfit 머리말). 꾸미기 시트(StudioSheet)의
 * '옷 갈아입기 · 지금 옷' 줄에서 온다(가족 화면·홈 꾸미기 — 모든 회원).
 *
 * 테마 타일을 누르면 **가족 모두가 함께** 그 테마 옷으로 갈아입고 사진관 배경도 그 테마 짝 배경으로 바뀐다(배경은 꾸미기
 * 시트에서 다시 바꿔도 된다). '원래 옷으로'는 옷만 벗는다(배경은 그대로). 값·쿠키는 없다 — 서버(api/family/outfit)가 미리
 * 그려 둔 몸에 원래 머리를 얹기만 해서 한 사람 몇 초, 돈 0원.
 *  - 위: 단체 사진 미리보기(StudioSheet 와 같은 자리·크기 — lib/family-studio studioSheetFit). 옷이 있는 사람은 바로 그 옷,
 *    아직인 사람은 평소 옷으로 보였다가 옷이 오면 바뀐다.
 *  - 가운데: 입히는 동안 사람마다 형편(기다려요 · 입는 중 · 입었어요 · 준비 중 · 성별을 알려 주면 · 멈췄어요 + 다시 해 볼게요).
 *    다 입으면 한 줄로 줄어든다.
 *  - 아래: '원래 옷으로' + 테마 8개 타일(예시 가족 미리보기 — public/family-outfits).
 * 한 번 만든 옷은 사람마다 기억한다(부르는 쪽 onOutfit → member.outfits) — 같은 얼굴 그림·같은 몸 판이면 다시 부르지 않는다
 * (lib/family-outfit dressPlan). 두 사람씩 부르고, 다른 테마를 누르면 아직 시작 안 한 앞 테마 차례는 버린다(시작한 것은 끝까지
 * 받아 기억해 둔다). 서버가 '잠깐 기다려요'(429)면 알려 준 만큼 쉬고 다시 부른다. 시트를 열 때 지금 테마를 아직 안 입은 사람이
 * 있으면(새로 고정한 얼굴 등) 그 사람만 이어서 입힌다.
 * 몸 창고 목록(bodies.json)은 사이트에서 한 번 읽는다 — 그 몸이 아직 없는 사람은 부르지 않고 '준비 중'(평소 옷)으로 둔다.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FamilyMember } from "@/lib/family";
import {
  OUTFIT_BODIES_JSON,
  OUTFIT_ORIGINAL_PREVIEW,
  OUTFIT_THEMES,
  dressPlan,
  normalizeBodyLibrary,
  normalizeOutfit,
  outfitTheme,
  type BodyLibrary,
  type DressStatus,
  type MemberOutfit,
  type OutfitThemeId,
} from "@/lib/family-outfit";
import {
  EMPTY_STUDIO,
  newerStudio,
  sidePreviewWidth,
  stampStudio,
  studioReducer,
  studioSheetFit,
  type FamilyStudio,
} from "@/lib/family-studio";
import { flushChildSave, type ChildPrefs, type Gender } from "@/lib/prefs";
import { authedFetch } from "@/lib/supabase";
import { useScreenWakeLock } from "@/lib/use-wake-lock";
import { displayName, type Colors } from "./family-ui";
import { FamilyGroupPhoto } from "./FamilyGroupPhoto";
import { FaceAvatar } from "./Figures";
import { CheckIcon } from "./icons";
import { Sheet } from "./Sheet";
import { BigButton } from "./ui";

/** 한 사람 입히기 형편(보이는 테마 것만 화면에 선다) */
type Job = {
  status: "wait" | "work" | "done" | "error" | "no-body" | "no-gender";
  message?: string;
  /** 다시 해 볼 수 있나(로그인·권한·그림 문제는 다시 해도 같다) */
  retry?: boolean;
  /** 서버가 잠깐 기다리라고 했다 */
  waiting?: boolean;
};

/** 한 번에 입히는 사람 수 */
const PARALLEL = 2;
/** 서버 요청 제한 — 함수 제한 60초 + 여유 */
const REQUEST_TIMEOUT_MS = 70_000;
/** '잠깐 기다려요'(429)를 받으면 이만큼까지 쉬고 다시 — 몇 번까지 */
const WAIT_MAX_S = 20;
const WAIT_TRIES = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jobKey = (theme: OutfitThemeId, id: string) => `${theme}:${id}`;

/**
 * 받침에 맞는 조사 — josa('추석 한복', '을', '를') → '추석 한복을', josa('잠옷 파티', '을', '를') → '잠옷 파티를'.
 * rieulNone 이면 ㄹ 받침은 받침 없는 쪽('설날로' — '으로/로').
 */
function josa(word: string, withBatchim: string, without: string, rieulNone = false): string {
  const w = word.trim();
  const c = w.charCodeAt(w.length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return `${w}${without}`;
  const jong = (c - 0xac00) % 28;
  return `${w}${jong !== 0 && !(rieulNone && jong === 8) ? withBatchim : without}`;
}

/* 화면 모양(StudioSheet 와 같은 셈) — "stack:200" · "side:150" */
function fitNow(): string {
  const f = studioSheetFit(window.innerWidth, window.innerHeight);
  return `${f.side ? "side" : "stack"}:${f.height}`;
}
function subscribeFit(cb: () => void): () => void {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

export function OutfitPicker({
  colors,
  members,
  childAge,
  childGender,
  parents,
  background,
  studio,
  onStudio,
  onOutfit,
  onClose,
}: {
  colors: Colors;
  /** 단체 사진에 설 사람(homeMembers) — 고정된 그림이 있는 사람만 옷을 입는다 */
  members: FamilyMember[];
  childAge: number | null;
  childGender?: Gender;
  parents?: ChildPrefs["parents"];
  /** 나라 배경(theme.background) */
  background: string;
  /** 저장된 사진관(배경·스티커·옷 테마) — 부르는 쪽이 onStudio 값을 바로 들고 있다 */
  studio?: FamilyStudio | null;
  /** 사진관이 바뀔 때마다(꾸민 때 at 이 찍힌 값) — 부르는 쪽이 saveChild 로 저장한다 */
  onStudio: (s: FamilyStudio) => void;
  /** 한 사람의 옷 한 벌을 받았다 — 부르는 쪽이 member.outfits 에 저장한다 */
  onOutfit: (memberId: string, theme: OutfitThemeId, outfit: MemberOutfit) => void;
  /** 꾸미기 시트로 돌아가기 */
  onClose: () => void;
}) {
  const { accent, accentDark } = colors;
  const fit = useSyncExternalStore(subscribeFit, fitNow, () => "stack:200");
  const side = fit.startsWith("side:");
  const height = Number(fit.slice(fit.indexOf(":") + 1)) || 200;

  // 사진관 — 이 시트에서 마지막으로 바꾼 값과 부르는 쪽 값 중 더 새것(StudioSheet 와 같은 방식)
  const [mine, setMine] = useState<FamilyStudio | null>(null);
  const draft = newerStudio(studio, mine) ?? EMPTY_STUDIO;
  const worn = draft.outfit ?? null;
  const people = members.filter((m) => m.portrait);
  const who = { childAge, childGender };

  /* 비동기 입히기가 늘 최신 값을 보도록 ref 에도 둔다(화면은 props·state 를 본다) */
  const membersRef = useRef(members);
  const wornRef = useRef<OutfitThemeId | null>(worn);
  const onOutfitRef = useRef(onOutfit);
  useEffect(() => {
    membersRef.current = members;
    wornRef.current = worn;
    onOutfitRef.current = onOutfit;
  });

  /* 몸 창고 목록 — undefined 읽는 중 · null 못 읽음(그래도 서버에 물어본다) */
  const [lib, setLib] = useState<BodyLibrary | null | undefined>(undefined);
  const libRef = useRef<BodyLibrary | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(OUTFIT_BODIES_JSON, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((raw: unknown) => {
        if (!live) return;
        const next = raw ? normalizeBodyLibrary(raw) : null;
        libRef.current = next;
        setLib(next);
      });
    return () => {
      live = false;
    };
  }, []);

  /* 입히기 — 차례(queue)·지금 부르는 수·사람마다 형편 */
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const queue = useRef<{ id: string; theme: OutfitThemeId }[]>([]);
  const queued = useRef(new Set<string>());
  const running = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 시트를 닫거나 앱을 내리면 기다리던 저장(800ms)을 바로 올린다(StudioSheet 와 같다)
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushChildSave();
    };
    window.addEventListener("pagehide", flushChildSave);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushChildSave);
      document.removeEventListener("visibilitychange", onHidden);
      flushChildSave();
    };
  }, []);

  const setJob = useCallback((theme: OutfitThemeId, id: string, job: Job) => {
    if (alive.current) setJobs((prev) => ({ ...prev, [jobKey(theme, id)]: job }));
  }, []);

  /** 한 사람 — 서버에 한 번(잠깐 기다리라면 쉬고 다시) */
  const dressOne = useCallback(
    async (id: string, theme: OutfitThemeId): Promise<void> => {
      const m = membersRef.current.find((x) => x.id === id);
      const p = m?.portrait;
      if (!m || !p) return;
      const libNow = libRef.current ?? null;
      const item = dressPlan([m], theme, libNow, { childAge, childGender })[0];
      if (!item || item.status === "ready") {
        setJob(theme, id, { status: "done" });
        return;
      }
      if (item.status === "no-body") {
        setJob(theme, id, { status: "no-body" });
        return;
      }
      if (item.status === "no-gender" || !item.body) {
        setJob(theme, id, { status: "no-gender" });
        return;
      }
      const age = m.role === "child" ? childAge : (m.age ?? childAge);
      const payload = {
        memberId: m.id,
        theme,
        portraitUrl: p.url,
        body: item.body,
        ...(p.headRatio !== undefined ? { headRatio: p.headRatio } : {}),
        ...(p.opaque ? { opaque: true } : {}),
        ...(typeof age === "number" && age > 0 ? { age } : {}),
      };
      setJob(theme, id, { status: "work" });
      for (let attempt = 0; ; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        let res: Response | null = null;
        let data: Record<string, unknown> = {};
        try {
          res = await authedFetch("/api/family/outfit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
          data = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
        } catch {
          res = null;
        } finally {
          clearTimeout(timer);
        }
        const code = typeof data.code === "string" ? data.code : "";
        const said = typeof data.error === "string" && data.error.length <= 160 ? data.error : "";
        if (res?.ok) {
          const outfit = normalizeOutfit(data);
          if (outfit && outfit.from === p.url) {
            onOutfitRef.current(m.id, theme, outfit);
            setJob(theme, id, { status: "done" });
          } else {
            setJob(theme, id, { status: "error", retry: true, message: "옷을 받지 못했어요. 다시 해 주세요." });
          }
          return;
        }
        if (res?.status === 429 && attempt < WAIT_TRIES && alive.current) {
          const wait = Math.min(WAIT_MAX_S, Math.max(1, Number(data.retryAfter) || 3));
          setJob(theme, id, { status: "work", waiting: true });
          await sleep(wait * 1000);
          if (!alive.current) return;
          setJob(theme, id, { status: "work" });
          continue;
        }
        if (code === "body-missing") {
          setJob(theme, id, { status: "no-body" });
          return;
        }
        const final = code === "login" || code === "dev" || code === "source" || code === "input" || code === "setup";
        setJob(theme, id, {
          status: "error",
          retry: !final,
          message: said || (res ? "옷을 입히다 멈췄어요. 잠시 뒤 다시 해 주세요." : "연결이 끊겼어요. 연결되면 다시 해 주세요."),
        });
        return;
      }
    },
    [childAge, childGender, setJob],
  );

  /**
   * 차례 돌리기 — 일꾼 둘이 차례가 빌 때까지 한 사람씩 입힌다. 보이는 테마가 아닌 차례는 버린다(누른 테마가 먼저).
   * 시트를 닫으면 새로 시작하지 않는다(부르던 것은 끝까지 받아 저장한다).
   */
  const pump = useCallback(() => {
    const worker = async () => {
      running.current++;
      try {
        while (alive.current) {
          const next = queue.current.shift();
          if (!next) return;
          const key = jobKey(next.theme, next.id);
          try {
            if (next.theme === wornRef.current) await dressOne(next.id, next.theme);
          } finally {
            queued.current.delete(key);
          }
        }
      } finally {
        running.current--;
      }
    };
    while (alive.current && running.current < PARALLEL && queue.current.length > 0) void worker();
  }, [dressOne]);

  /** 이 테마를 아직 안 입은 사람을 차례에 넣는다(이미 차례에 있거나 입는 중이면 두 번 넣지 않는다) */
  const enqueue = useCallback(
    (theme: OutfitThemeId, ids?: string[]) => {
      const plan = dressPlan(membersRef.current, theme, libRef.current ?? null, { childAge, childGender });
      const add: Record<string, Job> = {};
      for (const item of plan) {
        if (ids && !ids.includes(item.member.id)) continue;
        const key = jobKey(theme, item.member.id);
        if (item.status === "no-body" || item.status === "no-gender") {
          add[key] = { status: item.status };
          continue;
        }
        if (item.status === "ready") {
          add[key] = { status: "done" };
          continue;
        }
        if (queued.current.has(key)) continue;
        queued.current.add(key);
        queue.current.push({ id: item.member.id, theme });
        add[key] = { status: "wait" };
      }
      if (alive.current) setJobs((prev) => ({ ...prev, ...add }));
      pump();
    },
    [childAge, childGender, pump],
  );

  // 입은 테마가 정해지거나 바뀌면(시트를 연 때 · 타일 · 다른 기기에서 온 더 새 사진관 값) 그 테마를 아직 안 입은 사람을
  // 이어서 입힌다 — 몸 창고 목록을 읽은 뒤에. 이미 차례에 있거나 입는 중이면 두 번 넣지 않는다(enqueue).
  useEffect(() => {
    if (lib === undefined || !worn) return;
    enqueue(worn);
  }, [worn, lib, enqueue]);

  /** 사진관 바꾸기 — 바뀐 게 없으면 저장하지 않는다(StudioSheet apply 와 같다) */
  const applyOutfit = (theme: OutfitThemeId | null) => {
    const next = studioReducer(draft, { type: "outfit", theme });
    if (next === draft) return;
    const stamped = stampStudio(next);
    setMine(stamped);
    wornRef.current = theme;
    onStudio(stamped);
  };

  const pick = (theme: OutfitThemeId | null) => {
    applyOutfit(theme);
    if (theme) enqueue(theme);
  };

  /* ── 보이는 테마의 형편 ── */
  const plan = worn ? dressPlan(people, worn, lib ?? null, who) : [];
  const rows = plan.map((item) => {
    const key = jobKey(worn as OutfitThemeId, item.member.id);
    const job: Job =
      item.status === "ready"
        ? { status: "done" }
        : (jobs[key] ?? { status: item.status === "dress" ? "wait" : (item.status as Exclude<DressStatus, "ready" | "dress">) });
    return { member: item.member, job };
  });
  const busy = rows.some((r) => r.job.status === "wait" || r.job.status === "work");
  const held = useScreenWakeLock(busy);
  const doneN = rows.filter((r) => r.job.status === "done").length;
  const skipped = rows.filter((r) => r.job.status === "no-body" || r.job.status === "no-gender");
  const failed = rows.filter((r) => r.job.status === "error");
  const theme = outfitTheme(worn);

  /* ── 미리보기 ── */
  const photo = (
    <div className="relative rounded-3xl bg-white p-[5px]" style={{ boxShadow: `0 0 0 2px ${accent}, 0 10px 20px -8px rgba(60,40,25,.3)` }}>
      <FamilyGroupPhoto
        members={members}
        childAge={childAge}
        parents={parents}
        height={height}
        background={background}
        className="rounded-[20px]"
        studio={draft}
      />
    </div>
  );

  /* ── 형편 ── */
  const statusText = (j: Job) => {
    switch (j.status) {
      case "done":
        return (
          <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold text-emerald-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
              <CheckIcon size={12} />
            </span>
            입었어요
          </span>
        );
      case "work":
        return (
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-extrabold" style={{ color: accentDark }}>
            <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
            {j.waiting ? "잠깐 기다려요" : "입는 중…"}
          </span>
        );
      case "wait":
        return <span className="shrink-0 text-sm font-bold text-neutral-500">기다려요</span>;
      case "no-body":
        return <span className="shrink-0 break-keep text-right text-[13px] font-bold text-neutral-500">이 옷은 아직 준비 중 · 평소 옷</span>;
      case "no-gender":
        return (
          <span className="shrink-0 break-keep text-right text-[13px] font-bold text-neutral-500">성별을 알려 주면 입어요 · 평소 옷</span>
        );
      default:
        return null;
    }
  };

  const progress =
    theme && rows.length > 0 ? (
      busy || failed.length > 0 || skipped.length > 0 ? (
        <div className="w-full pt-2" aria-live="polite">
          <p className="px-1 text-[13px] font-extrabold text-neutral-600">
            {busy
              ? `${josa(theme.label, "으로", "로", true)} 갈아입는 중 · ${rows.length}명 중 ${doneN}명${held ? "" : " · 화면을 켜 둔 채 기다려 주세요"}`
              : `${theme.label} · ${rows.length}명 중 ${doneN}명이 입었어요`}
          </p>
          <div className="mt-1.5 flex w-full flex-col rounded-[20px] bg-stone-50 px-3.5 py-0.5 shadow-[inset_0_0_0_1px_#f0ede8]">
            {rows.map(({ member: m, job: j }, i) => (
              <div
                key={m.id}
                className={`flex min-h-[46px] flex-wrap items-center gap-2.5 py-1 ${i < rows.length - 1 ? "border-b border-stone-200/70" : ""}`}
              >
                <FaceAvatar member={m} size={32} childGender={childGender} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-neutral-800">{displayName(m)}</span>
                {j.status === "error" ? (
                  <span className="flex w-full flex-wrap items-center gap-2 pl-[42px]">
                    <span className="min-w-0 flex-1 break-keep text-[13px] font-bold text-rose-600">{j.message ?? "멈췄어요."}</span>
                    {j.retry && (
                      <button
                        type="button"
                        onClick={() => worn && enqueue(worn, [m.id])}
                        className="min-h-11 shrink-0 rounded-full px-3.5 text-[13px] font-extrabold text-white"
                        style={{ background: accentDark }}
                      >
                        다시 해 볼게요
                      </button>
                    )}
                  </span>
                ) : (
                  statusText(j)
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 px-1 pt-2 text-[13px] font-extrabold text-emerald-700" aria-live="polite">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600">
            <CheckIcon size={12} />
          </span>
          가족 모두 {josa(theme.label, "을", "를")} 입었어요
        </p>
      )
    ) : null;

  /* ── 타일 ── */
  const tileSub = (id: OutfitThemeId): string => {
    const t = outfitTheme(id);
    if (!lib) return t?.hint ?? "";
    const p = dressPlan(people, id, lib, who);
    if (p.length > 0 && p.every((x) => x.status === "ready")) return "바로 입어요";
    const canWear = p.filter((x) => x.status === "ready" || x.status === "dress").length;
    if (p.length > 0 && canWear === 0) return "준비 중이에요";
    if (canWear < p.length) return `${p.length}명 중 ${canWear}명 입어요`;
    return t?.hint ?? "";
  };

  const cols = side ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-4";
  const grid = (
    <div className="w-full pt-3">
      <div className={`grid gap-1.5 ${cols}`}>
        <OutfitTile
          label="원래 옷으로"
          sub="평소 옷"
          src={OUTFIT_ORIGINAL_PREVIEW}
          on={worn === null}
          colors={colors}
          onPick={() => pick(null)}
        />
        {OUTFIT_THEMES.map((t) => (
          <OutfitTile
            key={t.id}
            label={t.label}
            sub={tileSub(t.id)}
            src={t.preview}
            on={worn === t.id}
            colors={colors}
            onPick={() => pick(t.id)}
          />
        ))}
      </div>
    </div>
  );

  const title = (
    <div className="w-full px-1 pt-2">
      <h2 className="text-[19px] font-extrabold text-neutral-800">옷 갈아입기</h2>
      <p className="mt-0.5 break-keep text-[13px] font-semibold leading-snug text-neutral-500">
        가족 모두 같은 테마 옷으로 갈아입어요. 얼굴은 그대로예요. 배경도 어울리게 바뀌어요.
      </p>
    </div>
  );
  const done = (
    <div className="mt-4 w-full">
      <BigButton colors={colors} onClick={onClose}>
        다 됐어요
      </BigButton>
    </div>
  );

  return (
    <Sheet onClose={onClose} label="옷 갈아입기" wide={side}>
      <div className="w-full">
        {side ? (
          /* 가로로 눕힌 폰 — 왼쪽 미리보기(붙어 있음) · 오른쪽 고르기 */
          <div className="flex w-full items-start gap-4">
            <div className="sticky top-0 z-10 shrink-0 bg-white pb-2 pt-2" style={{ width: sidePreviewWidth(height) }}>
              {photo}
            </div>
            <div className="min-w-0 flex-1">
              {title}
              {progress}
              {grid}
              {done}
            </div>
          </div>
        ) : (
          <>
            {title}
            <div className="sticky top-0 z-10 w-full bg-white pb-2 pt-2">{photo}</div>
            {progress}
            {grid}
            {done}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** 테마 타일 하나 — 고른 칸은 나라 색 테두리 + 체크(StudioSheet 배경 칸과 같은 모양) */
function OutfitTile({
  label,
  sub,
  src,
  on,
  colors,
  onPick,
}: {
  label: string;
  sub: string;
  src: string;
  on: boolean;
  colors: Colors;
  onPick: () => void;
}) {
  const { accent, accentDark } = colors;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className="flex min-w-0 flex-col items-center gap-1 rounded-2xl p-1 text-center transition hover:bg-neutral-50"
    >
      <span
        className="relative block aspect-video w-full overflow-hidden rounded-xl bg-neutral-100"
        style={{ boxShadow: on ? `0 0 0 3px ${accent}` : "inset 0 0 0 1px rgba(0,0,0,.06)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        {on && (
          <span
            aria-hidden
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full shadow"
            style={{ background: accent }}
          >
            <CheckIcon size={12} />
          </span>
        )}
      </span>
      <span className="break-keep text-[12px] font-bold leading-tight" style={{ color: on ? accentDark : "#525252" }}>
        {label}
      </span>
      <span className="break-keep text-[11px] font-semibold leading-tight text-neutral-500">{sub}</span>
    </button>
  );
}

export default OutfitPicker;
