"use client";

/**
 * 사업자 정보 — 사이트 맨 아래 줄(전자상거래법 표시 사항)을 적는 칸 + "사이트에 이렇게 보여요" 미리보기 + 바꾼 이력.
 *
 *  · 바꾼 이력은 fe 계정에서만 보인다(lib/admin-console seesChangeLog — 사장님 2026-10-19 "yogico 계정 안에서는 안 보여도 될 듯").
 *    기록은 그대로 쌓인다(DB). 화면에서만 감춘다.
 *  · 칸을 벗어나면 바로 검사한다(사업자등록번호는 숫자 10자리·검증 숫자, 모양도 000-00-00000 으로 맞춘다).
 *    검사는 바꾼 칸만 한다 — DB 에 이미 있는 값이 앱 검사보다 느슨해도 다른 칸 저장을 막지 않게.
 *  · 저장은 아래 저장 줄 → 확인 창(무엇이 무엇으로 바뀌나 + 바꾼 까닭 고르기) → 서버 → 다시 읽기.
 *    화면이 먼저 바뀐 척하지 않는다(다시 읽은 값으로 칸을 새로 채운다).
 *  · 저장하지 않은 값이 있으면 메뉴를 옮길 때 한 번 묻는다(겉틀의 저장 안 한 내용 표시).
 *  · 회사 계정이 아니면 칸이 잠긴다. DB 가 아직 없으면 기본값을 보여 주고 잠근다.
 */
import { useId, useMemo, useState } from "react";
import { SiteFooterView } from "@/components/pay/SiteFooter";
import {
  Banner,
  Card,
  CardTitle,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  SaveBar,
  Skeleton,
  TextInput,
  TimeText,
  type AdminQuery,
  type Column,
} from "@/components/admin/kit";
import { useAdmin, useUnsavedGuard } from "@/components/admin/shell/AdminContext";
import { seesChangeLog } from "@/lib/admin-console";
import {
  BUSINESS_FIELDS,
  businessFieldLabel,
  mergeBusinessInfo,
  validateBusinessField,
  type BusinessAdminResponse,
  type BusinessChange,
  type BusinessColumn,
  type BusinessInfoView,
} from "@/lib/site-info";

type Draft = Record<BusinessColumn, string>;

/** 입력 칸 첫 값 — DB 가 준비됐으면 DB 값 그대로, 아니면 지금 사이트에 보이는 기본값(잠긴 채로 보여 준다). */
function draftFrom(data: BusinessAdminResponse): Draft {
  const out = {} as Draft;
  for (const f of BUSINESS_FIELDS) {
    const v = data.schemaReady ? data.values[f.column] : (data.info[f.key] as string | null);
    out[f.column] = v ?? "";
  }
  return out;
}

/** 읽기·오류·준비 전을 가려서 입력 칸을 그린다. */
export function BusinessInfoPanel({ query }: { query: AdminQuery<BusinessAdminResponse> }) {
  const { data, error, reload } = query;
  if (!data) {
    if (error) return <ErrorState message={error} onRetry={reload} />;
    return (
      <Card>
        <Skeleton lines={6} />
      </Card>
    );
  }
  return (
    <>
      {error ? (
        <Banner tone="danger" title="다시 읽지 못했어요">
          마지막으로 읽은 값을 보여 드려요. ({error})
        </Banner>
      ) : null}
      {!data.schemaReady ? (
        <Banner tone="warn" title="데이터베이스 준비 전이에요 — 지금 사이트에는 기본값이 보여요">
          관리실 SQL(supabase-admin-console.sql)을 돌리면 여기서 등록할 수 있어요.
        </Banner>
      ) : null}
      {/* 저장 뒤 다시 읽으면 고친 시각이 바뀐다 — 열쇠가 바뀌어 칸을 새 값으로 처음부터 채운다 */}
      <BusinessInfoForm key={`${data.schemaReady}:${data.updatedAt ?? "none"}`} data={data} onSaved={reload} />
    </>
  );
}

const LOG_COLUMNS: Column<BusinessChange>[] = [
  { key: "at", header: "일시", cell: (r) => <TimeText iso={r.at} mode="datetime" />, width: "150px" },
  { key: "field", header: "항목", cell: (r) => <span className="font-bold">{businessFieldLabel(r.field)}</span>, mobile: "title", width: "150px" },
  {
    key: "change",
    header: "전 → 후",
    cell: (r) => (
      <span className="break-all">
        <span className="text-[#8b95a1]">{r.oldValue ?? "(비어 있음)"}</span>
        <span className="mx-1 text-[#b0b8c1]">→</span>
        <span className="font-bold text-[#191f28]">{r.newValue ?? "(비움)"}</span>
      </span>
    ),
  },
  { key: "note", header: "사유", cell: (r) => <span className="break-keep text-[#6b7684]">{r.note ?? "–"}</span> },
  { key: "by", header: "바꾼 사람", cell: (r) => r.changedByUsername ?? "–", width: "110px" },
];

function BusinessInfoForm({ data, onSaved }: { data: BusinessAdminResponse; onSaved: () => void }) {
  const { api, say, refreshBadges, me } = useAdmin();
  const showLog = seesChangeLog(me);
  const idBase = useId();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(data));
  const [touched, setTouched] = useState<ReadonlySet<BusinessColumn>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const editable = data.canEdit && data.schemaReady;

  /** 칸마다 검사 결과와 '바뀌었나'. 바꾼 칸만 검사 오류로 친다. */
  const rows = useMemo(
    () =>
      BUSINESS_FIELDS.map((f) => {
        const from = data.values[f.column];
        const raw = draft[f.column];
        const r = validateBusinessField(f.column, raw);
        const to = r.ok ? r.value : raw.trim() || null;
        const changed = data.schemaReady && to !== from;
        return { f, from, to, changed, error: changed && !r.ok ? r.error : null };
      }),
    [draft, data],
  );
  const changes = rows.filter((r) => r.changed);
  const invalid = changes.some((r) => r.error);

  useUnsavedGuard(editable && changes.length > 0, "사업자 정보");

  /** 미리보기 — 입력 중인 값으로 사이트와 똑같이(빈 칸은 '(등록 예정)'). */
  const preview: BusinessInfoView = useMemo(() => mergeBusinessInfo(draft), [draft]);

  const touch = (c: BusinessColumn) =>
    setTouched((prev) => {
      if (prev.has(c)) return prev;
      const next = new Set(prev);
      next.add(c);
      return next;
    });

  const onBlur = (c: BusinessColumn) => {
    touch(c);
    // 사업자등록번호는 맞는 숫자면 칸을 벗어날 때 모양을 맞춰 준다(1248100998 → 124-81-00998).
    if (c === "biz_no") {
      const r = validateBusinessField(c, draft[c]);
      if (r.ok && r.value && r.value !== draft[c]) setDraft((d) => ({ ...d, biz_no: r.value as string }));
    }
  };

  const openConfirm = () => {
    if (invalid) {
      setTouched(new Set(changes.map((r) => r.f.column)));
      say("빨간 칸을 먼저 고쳐 주세요", "error");
      return;
    }
    setSaveError(null);
    setConfirming(true);
  };

  const save = async (note: string | null) => {
    const patch = Object.fromEntries(changes.map((r) => [r.f.column, r.to]));
    setBusy(true);
    setSaveError(null);
    const r = await api<{ ok: true; changed: number }>("/api/admin/business", { patch, note });
    setBusy(false);
    if (!r.ok) {
      setSaveError(r.error);
      return;
    }
    setConfirming(false);
    say(r.data.changed > 0 ? "저장했어요. 사이트에 1~5분 안에 반영돼요." : "바뀐 값이 없어요.");
    refreshBadges();
    onSaved();
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <Card>
          <CardTitle hint={data.updatedAt ? <>마지막 저장 <TimeText iso={data.updatedAt} /></> : undefined}>
            사이트 맨 아래 줄
          </CardTitle>
          {data.schemaReady && !data.canEdit ? (
            <p className="mb-4 rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-bold text-[#6b7684]">
              이 계정은 보기만 돼요. 지금 값은 그대로 보실 수 있어요.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {rows.map(({ f, changed, error }) => {
              const id = `${idBase}-${f.column}`;
              const showError = touched.has(f.column) ? error : null;
              return (
                <div key={f.column} className={f.column === "address" || f.column === "hours" ? "sm:col-span-2" : ""}>
                  <Field
                    label={f.label}
                    htmlFor={id}
                    required={f.required}
                    error={showError}
                    help={
                      changed && !showError ? (
                        <span className="font-bold text-[#3182f6]">바뀜 · 저장하면 사이트에 반영돼요</span>
                      ) : (
                        f.help
                      )
                    }
                  >
                    <TextInput
                      id={id}
                      value={draft[f.column]}
                      placeholder={f.placeholder}
                      maxLength={f.column === "biz_no" ? 14 : f.max}
                      inputMode={f.inputMode}
                      autoComplete="off"
                      disabled={!editable || busy}
                      invalid={!!showError}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => ({ ...d, [f.column]: v }));
                      }}
                      onBlur={() => onBlur(f.column)}
                      // 바뀐 칸은 파란 테두리 — 입력 칸 기본 테두리보다 앞서게 ! 를 붙인다.
                      className={changed && !showError ? "border-[#3182f6]! bg-[#f4f9ff]!" : ""}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 사이트에 이렇게 보여요 — 입력 중인 값으로. 미리보기 안의 링크는 누를 수 없게(inert) 둔다. */}
        <Card className="lg:sticky lg:top-20">
          <CardTitle hint="입력 중인 값">사이트에 이렇게 보여요</CardTitle>
          <div inert className="rounded-2xl bg-[#f2f4f6] p-3">
            <SiteFooterView info={{ business: preview, docs: data.docs, source: "db" }} />
          </div>
          <p className="mt-3 break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">
            비워 둔 칸은 사이트에 &lsquo;(등록 예정)&rsquo;으로 보여요. 약관 링크는 그 문서를 게시하고 시행일이 되면 켜져요.
          </p>
        </Card>
      </div>

      {showLog ? (
        <section aria-labelledby={`${idBase}-log`} className="flex flex-col gap-3">
          <h2 id={`${idBase}-log`} className="text-[17px] font-bold tracking-tight text-[#191f28]">
            바꾼 이력 <span className="text-[13px] font-medium text-[#8b95a1]">{data.log.length ? `최근 ${data.log.length}건` : ""}</span>
          </h2>
          <DataTable
            caption="사업자 정보 바꾼 이력"
            columns={LOG_COLUMNS}
            rows={data.log}
            rowKey={(r) => String(r.id)}
            empty={
              <div className="rounded-2xl bg-white px-5 py-6 text-[13px] font-medium text-[#8b95a1]">아직 바꾼 적이 없어요.</div>
            }
          />
        </section>
      ) : null}

      <SaveBar
        visible={editable && changes.length > 0}
        summary={
          <span>
            바뀌는 칸 <b className="font-bold text-[#191f28]">{changes.length}개</b>
            {invalid ? <span className="ml-2 font-bold text-[#f04452]">고칠 칸이 있어요</span> : null}
          </span>
        }
        onSave={openConfirm}
        onReset={() => {
          setDraft(draftFrom(data));
          setTouched(new Set());
        }}
        busy={busy}
        saveLabel="저장하기"
      />

      {confirming ? (
        <ConfirmDialog
          title="사업자 정보를 바꿀까요?"
          confirmLabel="저장하기"
          busy={busy}
          error={saveError}
          reason={{ label: "바꾼 까닭 (선택)", min: 0, max: 500, placeholder: "예: 사업자등록증 받음" }}
          onCancel={() => setConfirming(false)}
          onConfirm={(note) => void save(note)}
          body={
            <ul className="flex flex-col gap-2">
              {changes.map((r) => (
                <li key={r.f.column} className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-bold text-[#8b95a1]">{r.f.label}</span>
                  <span className="break-all text-sm">
                    <span className="text-[#8b95a1]">{r.from ?? "(비어 있음)"}</span>
                    <span className="mx-1 text-[#b0b8c1]">→</span>
                    <span className="font-bold text-[#191f28]">{r.to ?? "(비움)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          }
          extra={
            <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-medium leading-relaxed text-[#6b7684]">
              {showLog ? "저장하면 사이트 맨 아래 줄에 1~5분 안에 반영되고, 바꾼 이력에 남아요." : "저장하면 사이트 맨 아래 줄에 1~5분 안에 반영돼요."}
            </p>
          }
        />
      ) : null}
    </>
  );
}
