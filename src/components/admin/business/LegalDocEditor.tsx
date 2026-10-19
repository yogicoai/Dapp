"use client";

/**
 * 약관 한 종류(이용약관 · 개인정보처리방침 · 환불 안내)를 쓰고 게시하는 곳. 종류마다 하나씩, 탭 뒤에 늘 그려져 있다.
 *
 *  · 위 띠: 지금 시행 중인 판 · 시행을 기다리는 판 · 아직 없음(사이트에는 '준비 중').
 *  · 편집: 제목 · 시행일 · 본문(쉬운 표시: ## 큰 제목 · - 목록 · 1. 번호 · 빈 줄 = 문단 · --- 가로줄).
 *    넓은 화면은 오른쪽에 미리보기, 폰은 [편집 | 미리보기] 로 바꿔 본다. 미리보기는 사이트와 같은 부품(LegalDocView)이다.
 *  · 쓰는 글은 1초마다 이 브라우저에만 적어 둔다 — 창이 닫혀도 다음에 "저장 안 한 초안이 있어요"로 돌아온다.
 *    (서버에는 게시할 때만 간다. 게시한 판은 고칠 수 없고, 바꾸려면 새 판을 게시한다.)
 *  · 게시는 확인 창 한 번을 지난다 — 제목·시행일·글자 수와, 7일 안에 약관을 바꿀 때는 부드러운 경고.
 *  · 판 이력: 지난 판 보기(서랍) · 그 판으로 다시 쓰기. 서랍은 주소(?ver=종류-판)로 연다.
 */
import { useEffect, useId, useRef, useState } from "react";
import { LegalDocView } from "@/components/legal/LegalDocView";
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Drawer,
  ErrorState,
  Field,
  KeyValue,
  Skeleton,
  TextArea,
  TextInput,
  TimeText,
  useAdminQuery,
  useUrlDrawer,
  type Column,
} from "@/components/admin/kit";
import { useAdmin, useUnsavedGuard } from "@/components/admin/shell/AdminContext";
import { formatKstDateTime, groupDigits } from "@/lib/admin-console";
import {
  addDaysYmd,
  defaultEffectiveDate,
  formatDateKoLong,
  isValidYmd,
  LEGAL_BODY_MAX,
  LEGAL_DOCS,
  LEGAL_MAX_DAYS_AHEAD,
  LEGAL_TITLE_MAX,
  legalDraftKey,
  legalSkeleton,
  noticeWarning,
  parseLegalDraft,
  parseLegalMarkdown,
  parsePublishInput,
  type LegalAdminResponse,
  type LegalDraft,
  type LegalKind,
  type LegalVersion,
  type LegalVersionMeta,
} from "@/lib/legal-doc";
import { LEGAL_DRAFT_EFFECTIVE, LEGAL_DRAFTS } from "@/lib/legal-drafts";

type Form = { title: string; body: string; effectiveDate: string };

const HELP = "## 큰 제목 · ### 작은 제목 · - 목록 · 1. 번호 목록 · 빈 줄 = 문단 나눔 · --- = 가로줄";

/* ── 이 브라우저에만 적어 두는 초안 — 막힌 브라우저(사생활 보호 창)에서도 화면은 그대로 돈다 ── */

function readDraft(kind: LegalKind): LegalDraft | null {
  try {
    if (typeof window === "undefined") return null;
    return parseLegalDraft(window.localStorage.getItem(legalDraftKey(kind)));
  } catch {
    return null;
  }
}
function writeDraft(kind: LegalKind, form: Form) {
  try {
    const d: LegalDraft = { ...form, savedAt: new Date().toISOString() };
    window.localStorage.setItem(legalDraftKey(kind), JSON.stringify(d));
  } catch {
    /* 저장소가 막혔으면 초안 없이 쓴다 */
  }
}
function removeDraft(kind: LegalKind) {
  try {
    window.localStorage.removeItem(legalDraftKey(kind));
  } catch {
    /* 없어도 그만 */
  }
}

/**
 * 편집 칸의 처음 값. 시행 중인 판이 있으면 그 글로 채운다(사장님 2026-10-19 "미리보기에도 보이게 — 사이트로 이동이 아니라").
 *  · 고칠 수 있는 계정: 다음 판을 지금 글에서 고쳐 쓴다(시행일은 기본값 — 7일 뒤).
 *  · 보기만 되는 계정: 지금 판을 그대로 본다(시행일도 지금 판의 날).
 * 시행 중인 판이 없으면 예전처럼 빈 칸.
 */
function baseForm(
  kind: LegalKind,
  hasCurrent: boolean,
  today: string,
  current: Pick<LegalVersion, "title" | "body" | "effectiveDate"> | null = null,
  editable = true,
): Form {
  if (current) {
    return {
      title: current.title,
      body: current.body,
      effectiveDate: editable ? defaultEffectiveDate(kind, true, today) : current.effectiveDate,
    };
  }
  return { title: LEGAL_DOCS[kind].title, body: "", effectiveDate: defaultEffectiveDate(kind, hasCurrent, today) };
}
const sameForm = (a: Form, b: Form) => a.title === b.title && a.body === b.body && a.effectiveDate === b.effectiveDate;

/** 읽기·오류를 가린 뒤 편집기를 그린다. 다시 읽어도 편집기는 새로 만들지 않는다(쓰던 글 유지). */
export function LegalDocEditor({
  kind,
  companyName,
  onPublished,
}: {
  kind: LegalKind;
  companyName: string;
  onPublished: () => void;
}) {
  const q = useAdminQuery<LegalAdminResponse>(`/api/admin/legal?kind=${kind}`);
  if (!q.data) {
    if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
    return (
      <Card>
        <Skeleton lines={8} />
      </Card>
    );
  }
  return (
    <>
      {q.error ? (
        <Banner tone="danger" title="다시 읽지 못했어요">
          마지막으로 읽은 내용을 보여 드려요. ({q.error})
        </Banner>
      ) : null}
      <Editor
        kind={kind}
        data={q.data}
        companyName={companyName}
        reload={q.reload}
        onPublished={onPublished}
      />
    </>
  );
}

function Editor({
  kind,
  data,
  companyName,
  reload,
  onPublished,
}: {
  kind: LegalKind;
  data: LegalAdminResponse;
  companyName: string;
  reload: () => void;
  onPublished: () => void;
}) {
  const { api, say, refreshBadges } = useAdmin();
  const idBase = useId();
  const doc = LEGAL_DOCS[kind];
  const today = data.today;
  const hasCurrent = !!data.current;
  const editable = data.canEdit;

  const [base, setBase] = useState<Form>(() => baseForm(kind, hasCurrent, today, data.current, editable));
  const [form, setForm] = useState<Form>(base);
  const [touched, setTouched] = useState(false);
  // 앞서 적어 둔 초안 — 불러오거나 버리기 전에는 새로 적지 않는다(모르고 덮어쓰지 않게).
  const [stored, setStored] = useState<LegalDraft | null>(() => readDraft(kind));
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [pendingLoad, setPendingLoad] = useState<{ form: Form; label: string } | null>(null);
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);

  const dirty = !sameForm(form, base);
  useUnsavedGuard(editable && dirty, `${doc.title} 초안`);

  // 1초 동안 손을 멈추면 이 브라우저에 적어 둔다. 처음과 같아지면 지운다. 앞 초안을 고르기 전에는 손대지 않는다.
  useEffect(() => {
    if (!touched || stored) return;
    const t = setTimeout(() => {
      if (dirty) writeDraft(kind, form);
      else removeDraft(kind);
    }, 1000);
    return () => clearTimeout(t);
  }, [touched, stored, dirty, form, kind]);

  const edit = (patch: Partial<Form>) => {
    setTouched(true);
    setForm((f) => ({ ...f, ...patch }));
  };

  /** 다른 글을 편집기에 넣는다 — 쓰던 글이 있으면 한 번 묻는다. asBase 면 '아직 안 바꾼 상태'로 친다. */
  const requestLoad = (next: Form, label: string) => {
    if (dirty) setPendingLoad({ form: next, label });
    else applyLoad(next);
  };
  const applyLoad = (next: Form) => {
    setBase(next);
    setForm(next);
    setTouched(true);
    setPendingLoad(null);
  };
  const versionForm = (v: Pick<LegalVersion, "title" | "body">): Form => ({
    title: v.title,
    body: v.body,
    effectiveDate: form.effectiveDate,
  });

  /* ── 판 보기 서랍(?ver=terms-3) ── */
  const drawer = useUrlDrawer("ver");
  const openerRef = useRef<HTMLElement | null>(null);
  const prefix = `${kind}-`;
  const viewVersion =
    drawer.value && drawer.value.startsWith(prefix) && /^\d{1,6}$/.test(drawer.value.slice(prefix.length))
      ? Number(drawer.value.slice(prefix.length))
      : null;
  const one = useAdminQuery<{ version: LegalVersion }>(
    viewVersion ? `/api/admin/legal?kind=${kind}&version=${viewVersion}` : null,
  );
  const closeDrawer = () => {
    drawer.close();
    const el = openerRef.current;
    if (el) requestAnimationFrame(() => el.focus());
  };

  const rewriteFrom = async (meta: Pick<LegalVersionMeta, "version">) => {
    setLoadingVersion(meta.version);
    const r = await api<{ version: LegalVersion }>(`/api/admin/legal?kind=${kind}&version=${meta.version}`);
    setLoadingVersion(null);
    if (!r.ok) {
      say(r.error, "error");
      return;
    }
    requestLoad(versionForm(r.data.version), `제${meta.version}판`);
  };

  /* ── 게시 ── */
  const check = parsePublishInput({ kind, ...form, note: null }, today);
  const warning = check.ok ? noticeWarning(kind, form.effectiveDate, today, hasCurrent) : null;
  const nextVersion = (data.versions[0] ? Math.max(...data.versions.map((v) => v.version)) : 0) + 1;

  const publish = async (note: string | null) => {
    const parsed = parsePublishInput({ kind, ...form, note }, today);
    if (!parsed.ok) {
      setPublishError(parsed.error);
      return;
    }
    setBusy(true);
    setPublishError(null);
    const r = await api<{ ok: true; version: number | null; effectiveDate: string }>("/api/admin/legal", parsed.value);
    setBusy(false);
    if (!r.ok) {
      setPublishError(r.error);
      return;
    }
    setConfirming(false);
    removeDraft(kind);
    // 방금 게시한 글을 다음 판의 출발점으로 둔다(빈 칸으로 비우면 '본문이 비어 있어요'로 보였다)
    const fresh = baseForm(kind, true, today, { title: form.title, body: form.body, effectiveDate: form.effectiveDate }, true);
    setBase(fresh);
    setForm(fresh);
    setTouched(false);
    say("게시했어요. 사이트에 곧 반영돼요.");
    refreshBadges();
    reload();
    onPublished();
  };

  const bodyLen = form.body.length;
  const blocks = parseLegalMarkdown(form.body);

  /* ── 판 이력 표 ── */
  const statusOf = (m: LegalVersionMeta) =>
    data.current?.id === m.id ? "current" : data.upcoming?.id === m.id ? "upcoming" : m.effectiveDate > today ? "later" : "past";
  const columns: Column<LegalVersionMeta>[] = [
    {
      key: "version",
      header: "판",
      cell: (m) => <span className="font-bold tabular-nums">제{m.version}판</span>,
      mobile: "title",
      width: "80px",
    },
    {
      key: "state",
      header: "상태",
      cell: (m) => {
        const s = statusOf(m);
        return s === "current" ? (
          <Badge tone="green">시행 중</Badge>
        ) : s === "upcoming" || s === "later" ? (
          <Badge tone="amber">예정</Badge>
        ) : (
          <Badge tone="gray">지난 판</Badge>
        );
      },
      mobile: "badge",
      width: "90px",
    },
    { key: "eff", header: "시행일", cell: (m) => formatDateKoLong(m.effectiveDate), width: "130px" },
    { key: "at", header: "게시 일시", cell: (m) => <TimeText iso={m.publishedAt} mode="datetime" />, width: "150px" },
    { key: "by", header: "게시한 사람", cell: (m) => m.publishedByUsername ?? "–", width: "110px" },
    { key: "note", header: "사유", cell: (m) => <span className="break-keep text-[#6b7684]">{m.note ?? "–"}</span> },
    { key: "len", header: "글자 수", cell: (m) => groupDigits(m.bodyLength), align: "right", width: "90px" },
    {
      key: "act",
      header: "보기",
      cell: (m) => (
        <span className="flex flex-wrap justify-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              openerRef.current = e.currentTarget;
              drawer.open(`${prefix}${m.version}`);
            }}
            className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-[13px] font-bold text-[#3182f6] hover:bg-[#e8f3ff]"
          >
            보기
          </button>
          {editable ? (
            <button
              type="button"
              disabled={loadingVersion !== null}
              onClick={() => void rewriteFrom(m)}
              className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-[13px] font-bold text-[#4e5968] hover:bg-[#f2f4f6] disabled:opacity-50"
            >
              {loadingVersion === m.version ? "불러오는 중…" : "이 판으로 다시 쓰기"}
            </button>
          ) : null}
        </span>
      ),
      width: "210px",
    },
  ];

  const titleId = `${idBase}-title`;
  const dateId = `${idBase}-date`;
  const bodyId = `${idBase}-body`;

  return (
    <>
      {!data.schemaReady ? (
        <Banner tone="warn" title="데이터베이스 준비 전이에요 — 지금 사이트에는 '준비 중'으로 보여요">
          관리실 SQL(supabase-admin-console.sql)을 돌린 뒤 게시할 수 있어요. 그 전에도 초안은 이 브라우저에 적어 둬요.
        </Banner>
      ) : null}

      {/* 지금 상태 */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white px-5 py-4">
        {data.current ? (
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#4e5968]">
            <Badge tone="green">지금 시행 중</Badge>
            <span>
              제{data.current.version}판 · {formatDateKoLong(data.current.effectiveDate)}부터
            </span>
            <a
              href={doc.path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center rounded-lg px-1.5 text-[13px] font-bold text-[#3182f6] hover:bg-[#e8f3ff]"
            >
              사이트에서 보기 ↗
            </a>
          </p>
        ) : null}
        {data.upcoming ? (
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#4e5968]">
            <Badge tone="amber">예정</Badge>
            <span>
              제{data.upcoming.version}판 · {formatDateKoLong(data.upcoming.effectiveDate)}부터
            </span>
          </p>
        ) : null}
        {!data.current && !data.upcoming ? (
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#6b7684]">
            <Badge tone="gray">없음</Badge>
            아직 게시한 적 없어요 — 사이트에는 &lsquo;준비 중&rsquo;으로 보여요
          </p>
        ) : null}
        {!editable ? <p className="text-[13px] font-bold text-[#8b95a1]">이 계정은 보기만 돼요.</p> : null}
      </div>

      {stored && editable ? (
        <Banner
          tone="info"
          title={`저장 안 한 초안이 있어요 (${formatKstDateTime(stored.savedAt)})`}
          action={
            <span className="flex gap-2">
              <Button
                tone="primary"
                size="sm"
                onClick={() => {
                  const eff =
                    isValidYmd(stored.effectiveDate) && stored.effectiveDate >= today ? stored.effectiveDate : form.effectiveDate;
                  // 초안은 아직 게시 전이라 '바뀐 상태'로 둔다(base 는 그대로) — 떠날 때 묻고, 계속 적어 둔다.
                  setForm({ title: stored.title, body: stored.body, effectiveDate: eff });
                  setTouched(true);
                  setStored(null);
                }}
              >
                불러오기
              </Button>
              <Button
                tone="ghost"
                size="sm"
                onClick={() => {
                  removeDraft(kind);
                  setStored(null);
                }}
              >
                버리기
              </Button>
            </span>
          }
        >
          {stored.title} · {groupDigits(stored.body.length)}자. 불러오거나 버리기 전에는 지금 쓰는 글을 따로 적어 두지 않아요.
        </Banner>
      ) : null}

      {/* 폰: 편집 · 미리보기 바꾸기 */}
      <div role="radiogroup" aria-label="편집과 미리보기" className="flex w-fit gap-1 rounded-xl bg-white p-1 lg:hidden">
        {(["edit", "preview"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pane === p}
            onClick={() => setPane(p)}
            className={`min-h-10 rounded-lg px-4 text-sm font-bold ${pane === p ? "bg-[#191f28] text-white" : "text-[#4e5968]"}`}
          >
            {p === "edit" ? "편집" : "미리보기"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <Card className={pane === "edit" ? "" : "hidden lg:block"}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="제목" htmlFor={titleId} required counter={{ value: form.title.trim().length, max: LEGAL_TITLE_MAX }}>
                <TextInput
                  id={titleId}
                  value={form.title}
                  maxLength={LEGAL_TITLE_MAX}
                  disabled={!editable || busy}
                  onChange={(e) => edit({ title: e.target.value })}
                  invalid={form.title.trim().length === 0}
                />
              </Field>
              <Field label="시행일" htmlFor={dateId} required>
                <TextInput
                  id={dateId}
                  type="date"
                  value={form.effectiveDate}
                  min={today}
                  max={addDaysYmd(today, LEGAL_MAX_DAYS_AHEAD)}
                  disabled={!editable || busy}
                  onChange={(e) => edit({ effectiveDate: e.target.value })}
                  invalid={!isValidYmd(form.effectiveDate) || form.effectiveDate < today}
                />
              </Field>
            </div>
            <Field label="본문" htmlFor={bodyId} required help={HELP} counter={{ value: bodyLen, max: LEGAL_BODY_MAX }}>
              <TextArea
                id={bodyId}
                value={form.body}
                disabled={!editable || busy}
                onChange={(e) => edit({ body: e.target.value })}
                invalid={bodyLen > LEGAL_BODY_MAX}
                placeholder={"## 제1조 (목적)\n이 약관은 …"}
                className="min-h-[60vh] text-[15px] leading-[1.7]"
                spellCheck={false}
              />
            </Field>

            {editable ? (
              <div className="flex flex-wrap gap-2">
                {!form.body.trim() ? (
                  // 사장님과 같이 정한 초안(lib/legal-drafts, 2026-10-19) — 본문·제목·시행일을 채우기만 한다. 게시는 읽고 누른다.
                  <Button
                    tone="primary"
                    onClick={() => {
                      const d = LEGAL_DRAFTS[kind];
                      edit({
                        title: d.title,
                        body: d.body,
                        effectiveDate: LEGAL_DRAFT_EFFECTIVE >= today ? LEGAL_DRAFT_EFFECTIVE : form.effectiveDate,
                      });
                      say("준비된 초안을 넣었어요 — 읽어 보고 게시해 주세요");
                    }}
                  >
                    준비된 초안 넣기
                  </Button>
                ) : null}
                {!form.body.trim() ? (
                  <Button
                    onClick={() => {
                      edit({ body: legalSkeleton(kind, companyName) });
                      say("초안 뼈대예요 — 내용은 꼭 직접(또는 법률 검토 후) 채워 주세요");
                    }}
                  >
                    뼈대 넣기
                  </Button>
                ) : null}
                {data.current ? (
                  <Button onClick={() => requestLoad(versionForm(data.current as LegalVersion), "지금 판")}>
                    지금 판 불러오기
                  </Button>
                ) : null}
                {data.upcoming ? (
                  <Button onClick={() => requestLoad(versionForm(data.upcoming as LegalVersion), "예정 판")}>
                    예정 판 불러오기
                  </Button>
                ) : null}
                <span className="ml-auto" />
                <Button
                  tone="primary"
                  disabled={!data.schemaReady || !check.ok || busy}
                  title={!data.schemaReady ? "데이터베이스 준비 전이에요" : !check.ok ? check.error : undefined}
                  onClick={() => {
                    setPublishError(null);
                    setConfirming(true);
                  }}
                >
                  제{nextVersion}판 게시하기
                </Button>
              </div>
            ) : null}
            {editable && !check.ok && (form.body.trim() || touched) ? (
              <p className="text-[12px] font-bold text-[#c77700]">게시 전에: {check.error}</p>
            ) : null}
          </div>
        </Card>

        <Card className={`${pane === "preview" ? "" : "hidden lg:block"} lg:sticky lg:top-20`}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-bold tracking-tight text-[#191f28]">미리보기</h2>
            <span className="text-[12px] font-medium text-[#8b95a1]">사이트에 보일 모양 그대로예요</span>
          </div>
          <div className="max-h-[75vh] overflow-y-auto rounded-xl border border-[#e5e8eb] px-4 py-5">
            <p className="text-[22px] font-bold leading-tight text-[#191f28]">{form.title.trim() || doc.title}</p>
            <p className="mb-5 mt-1.5 text-[13px] font-medium text-[#6b7684]">
              {!editable && data.current
                ? `시행일 ${formatDateKoLong(data.current.effectiveDate)} · 제${data.current.version}판 (지금 시행 중)`
                : `시행일 ${isValidYmd(form.effectiveDate) ? formatDateKoLong(form.effectiveDate) : "–"} · 제${nextVersion}판`}
            </p>
            <LegalDocView blocks={blocks} compact />
          </div>
        </Card>
      </div>

      <section aria-labelledby={`${idBase}-history`} className="flex flex-col gap-3">
        <h2 id={`${idBase}-history`} className="text-[17px] font-bold tracking-tight text-[#191f28]">
          판 이력 <span className="text-[13px] font-medium text-[#8b95a1]">{data.versions.length ? `${data.versions.length}판` : ""}</span>
        </h2>
        <DataTable
          caption={`${doc.title} 판 이력`}
          columns={columns}
          rows={data.versions}
          rowKey={(m) => String(m.id)}
          empty={
            <div className="rounded-2xl bg-white px-5 py-6 text-[13px] font-medium text-[#8b95a1]">
              아직 게시한 판이 없어요. 게시하면 여기에 판마다 한 줄씩 쌓여요(게시한 판은 고칠 수 없어요).
            </div>
          }
        />
      </section>

      <Drawer
        open={viewVersion !== null}
        title={viewVersion ? `${doc.title} 제${viewVersion}판` : doc.title}
        subtitle={one.data ? `${formatDateKoLong(one.data.version.effectiveDate)} 시행` : undefined}
        onClose={closeDrawer}
        width={560}
        footer={
          editable && one.data ? (
            <Button
              tone="primary"
              onClick={() => {
                const v = one.data?.version;
                if (!v) return;
                // 쓰던 글이 있어 되묻기 창이 뜰 때는 서랍만 닫는다 — 이력 줄로 초점을 돌리면 창 뒤로 초점이 빠진다.
                if (dirty) drawer.close();
                else closeDrawer();
                requestLoad(versionForm(v), `제${v.version}판`);
              }}
            >
              이 판으로 다시 쓰기
            </Button>
          ) : null
        }
      >
        {one.data ? (
          <div className="flex flex-col gap-5">
            <KeyValue
              columns={2}
              items={[
                ["제목", one.data.version.title],
                ["시행일", formatDateKoLong(one.data.version.effectiveDate)],
                ["게시 일시", <TimeText key="at" iso={one.data.version.publishedAt} mode="datetime" />],
                ["글자 수", `${groupDigits(one.data.version.body.length)}자`],
              ]}
            />
            <div className="rounded-xl border border-[#e5e8eb] px-4 py-5">
              <LegalDocView blocks={parseLegalMarkdown(one.data.version.body)} compact />
            </div>
          </div>
        ) : one.error ? (
          <ErrorState message={one.error} onRetry={one.reload} />
        ) : (
          <Skeleton lines={10} />
        )}
      </Drawer>

      {pendingLoad ? (
        <ConfirmDialog
          title={`쓰던 글을 ${pendingLoad.label}으로 바꿀까요?`}
          body="지금 편집기에 쓰던 내용은 사라져요. 필요하면 먼저 복사해 두세요."
          confirmLabel="바꾸기"
          cancelLabel="그대로 두기"
          tone="danger"
          busy={false}
          onCancel={() => setPendingLoad(null)}
          onConfirm={() => applyLoad(pendingLoad.form)}
        />
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={`${doc.title} 제${nextVersion}판을 게시할까요?`}
          confirmLabel="게시하기"
          busy={busy}
          error={publishError}
          reason={{ label: "바꾼 까닭 (선택)", min: 0, max: 500, placeholder: "예: 결제 연동에 맞춰 환불 조항을 고침" }}
          onCancel={() => setConfirming(false)}
          onConfirm={(note) => void publish(note)}
          body={
            <KeyValue
              items={[
                ["제목", form.title.trim()],
                [
                  "시행일",
                  `${isValidYmd(form.effectiveDate) ? formatDateKoLong(form.effectiveDate) : "–"}${
                    form.effectiveDate === today ? " (오늘부터)" : ""
                  }`,
                ],
                ["글자 수", `${groupDigits(bodyLen)}자`],
              ]}
            />
          }
          extra={
            <>
              {warning ? (
                <p className="rounded-xl bg-[#fff4e0] px-4 py-3 text-[13px] font-bold leading-relaxed text-[#8a5a00]">{warning}</p>
              ) : null}
              <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-medium leading-relaxed text-[#6b7684]">
                게시한 판은 고칠 수 없어요 — 바꾸려면 새 판을 게시해요. 시행일이 되면 사이트에 이 판이 보여요.
              </p>
            </>
          }
        />
      ) : null}
    </>
  );
}
