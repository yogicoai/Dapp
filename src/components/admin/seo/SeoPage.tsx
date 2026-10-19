"use client";

/**
 * 관리실 '검색 노출(SEO)' — 사이트 제목·설명·검색어·공유 그림·대표 주소·구글/네이버 소유 확인·검색 노출 켜기(lib/seo).
 *
 * 비워 둔 칸은 기본값(회색 안내)으로 나간다. 오른쪽에 구글 검색 결과·카카오톡 공유 모양을 입력 중인 값으로 보여 준다.
 * 저장하면 서버(api/admin/seo)가 모든 화면의 <head> 를 다시 그리게 한다. 소유 확인 칸은 검색 사이트가 준
 * <meta …> 한 줄을 통째로 붙여 넣어도 된다(코드만 꺼내 저장한다).
 */
import { useEffect, useId, useState } from "react";
import { DEFAULT_SEO, parseSeoPatch, SEO_LIMITS, SITE_NAME, splitKeywords, type SeoColumn, type SeoSettings } from "@/lib/seo";
import {
  Banner,
  Card,
  CardTitle,
  ErrorState,
  Field,
  PageHeader,
  PageSkeleton,
  SaveBar,
  Switch,
  TextArea,
  TextInput,
  TimeText,
  useAdminQuery,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

type Values = Record<SeoColumn, string> & { indexing: boolean };
type SeoResponse = { schemaReady: boolean; values: Values; effective: SeoSettings; origin: string; updatedAt: string | null };

const FIELDS: { col: SeoColumn; label: string; placeholder: string; help: string; long?: boolean }[] = [
  { col: "site_title", label: "사이트 제목", placeholder: DEFAULT_SEO.siteTitle, help: "검색 결과의 파란 제목·브라우저 탭 이름이에요. 30~40자가 잘려 보이지 않아요." },
  { col: "description", label: "설명", placeholder: DEFAULT_SEO.description, help: "검색 결과 제목 아래 두세 줄이에요. 80~120자가 좋아요.", long: true },
  {
    col: "keywords",
    label: "검색어",
    placeholder: DEFAULT_SEO.keywords.join(", "),
    help: "쉼표로 나눠 적어요. 네이버·다음은 이 값을 참고하고, 구글은 본문을 더 봐요.",
    long: true,
  },
  { col: "og_image", label: "공유 그림 주소", placeholder: DEFAULT_SEO.ogImage, help: "카카오톡·페이스북에 링크를 보낼 때 뜨는 그림이에요. 1200×630 이 좋아요(https 주소 또는 /로 시작하는 사이트 안 경로)." },
  { col: "site_url", label: "대표 주소", placeholder: "https://정식-도메인", help: "정식 도메인을 연결하면 적어요. 비우면 지금 배포 주소를 써요." },
  {
    col: "google_verification",
    label: "구글 소유 확인 코드",
    placeholder: "구글 서치 콘솔 › HTML 태그의 content 값",
    help: "구글 서치 콘솔에서 'HTML 태그'로 확인할 때 받은 코드예요. <meta …> 한 줄을 통째로 붙여도 돼요.",
  },
  {
    col: "naver_verification",
    label: "네이버 소유 확인 코드",
    placeholder: "네이버 서치어드바이저 › HTML 태그의 content 값",
    help: "네이버 서치어드바이저 › 사이트 등록에서 'HTML 태그'로 받은 코드예요. <meta …> 한 줄을 통째로 붙여도 돼요.",
  },
];

const EMPTY: Values = {
  site_title: "",
  description: "",
  keywords: "",
  og_image: "",
  site_url: "",
  google_verification: "",
  naver_verification: "",
  indexing: true,
};

function changedCols(a: Values, b: Values): (SeoColumn | "indexing")[] {
  const out: (SeoColumn | "indexing")[] = [];
  for (const f of FIELDS) if (a[f.col].trim() !== b[f.col].trim()) out.push(f.col);
  if (a.indexing !== b.indexing) out.push("indexing");
  return out;
}

export function SeoPage() {
  const { api, say } = useAdmin();
  const q = useAdminQuery<SeoResponse>("/api/admin/seo");
  const idBase = useId();
  const [draft, setDraft] = useState<Values>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = q.data?.values ?? EMPTY;

  // 서버 값이 오면(처음·저장 뒤) 입력 칸을 그 값으로 맞춘다
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.data) setDraft(q.data.values);
  }, [q.data]);

  if (!q.data && q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  if (!q.data) return <PageSkeleton />;

  const changes = changedCols(draft, saved);
  const editable = q.data.schemaReady && !busy;
  // 미리보기 — 비운 칸은 기본값으로
  const pv = {
    title: draft.site_title.trim() || DEFAULT_SEO.siteTitle,
    description: draft.description.trim() || DEFAULT_SEO.description,
    image: draft.og_image.trim() || DEFAULT_SEO.ogImage,
    origin: draft.site_url.trim() || q.data.origin,
  };

  async function save() {
    const patch: Record<string, unknown> = {};
    for (const c of changes) patch[c] = c === "indexing" ? draft.indexing : draft[c];
    const check = parseSeoPatch(patch);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api<SeoResponse & { ok: boolean }>("/api/admin/seo", { patch });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say("저장했어요. 사이트 전체에 바로 반영돼요(검색 사이트에는 다시 들를 때 반영돼요).");
    q.reload();
  }

  return (
    <>
      <PageHeader
        title="검색 노출(SEO)"
        description="네이버·구글 검색 결과와 카카오톡 공유에 보이는 제목·설명·그림을 정해요. 비워 둔 칸은 기본값으로 나가요."
        meta={q.data.updatedAt ? <>마지막 저장 <TimeText iso={q.data.updatedAt} /></> : undefined}
      />

      {!q.data.schemaReady ? (
        <Banner tone="warn" title="데이터베이스 준비 전이에요">
          Supabase SQL 편집기에서 supabase-seo.sql 을 한 번 돌려 주세요. 그 전에는 기본값으로 나가고, 여기서 저장할 수 없어요.
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Card>
          <CardTitle>검색·공유에 보이는 값</CardTitle>
          <div className="flex flex-col gap-4">
            {FIELDS.map((f) => {
              const id = `${idBase}-${f.col}`;
              const changed = draft[f.col].trim() !== saved[f.col].trim();
              const max = SEO_LIMITS[f.col];
              const common = {
                id,
                value: draft[f.col],
                placeholder: f.placeholder,
                maxLength: f.col === "google_verification" || f.col === "naver_verification" ? 400 : max,
                autoComplete: "off",
                disabled: !editable,
                className: changed ? "border-[#3182f6]! bg-[#f4f9ff]!" : "",
              };
              const setVal = (v: string) => setDraft((d) => ({ ...d, [f.col]: v }));
              return (
                <Field
                  key={f.col}
                  label={f.label}
                  htmlFor={id}
                  help={changed ? <span className="font-bold text-[#3182f6]">바뀜 · 저장하면 반영돼요</span> : f.help}
                  counter={f.col === "site_title" || f.col === "description" ? { value: draft[f.col].length, max } : undefined}
                >
                  {f.long ? (
                    <TextArea {...common} rows={2} onChange={(e) => setVal(e.target.value)} />
                  ) : (
                    <TextInput {...common} onChange={(e) => setVal(e.target.value)} />
                  )}
                </Field>
              );
            })}
            <Switch
              checked={draft.indexing}
              onChange={(v) => setDraft((d) => ({ ...d, indexing: v }))}
              label="검색 사이트에 보이기"
              description="끄면 모든 화면에 '검색에 넣지 마세요' 표시를 달고 robots.txt 도 막아요. 정식 오픈 전 잠시 숨길 때 써요."
              disabled={!editable}
            />
            {error ? <p className="text-sm font-bold text-[#f04452]">{error}</p> : null}
          </div>
        </Card>

        <div className="flex flex-col gap-6 lg:sticky lg:top-20">
          <Card>
            <CardTitle hint="입력 중인 값">검색 결과에 이렇게 보여요</CardTitle>
            <div className="rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_#e5e8eb]">
              <p className="truncate text-xs text-[#4e5968]">{pv.origin.replace(/^https?:\/\//, "")}</p>
              <p className="mt-0.5 line-clamp-2 text-[17px] font-medium leading-snug text-[#1a0dab]">{pv.title}</p>
              <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-[#4d5156]">{pv.description}</p>
            </div>
            {!draft.indexing ? (
              <p className="mt-2 text-[12px] font-bold text-[#f04452]">검색 노출이 꺼져 있어 검색 결과에는 나오지 않아요.</p>
            ) : null}
          </Card>
          <Card>
            <CardTitle hint="카카오톡·페이스북">링크를 보내면 이렇게 보여요</CardTitle>
            <div className="overflow-hidden rounded-2xl bg-white shadow-[inset_0_0_0_1px_#e5e8eb]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pv.image} alt="공유 그림 미리보기" className="aspect-[1200/630] w-full bg-[#f2f4f6] object-cover" />
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-bold text-[#191f28]">{pv.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-[#6b7684]">{pv.description}</p>
                <p className="mt-1 text-[11px] text-[#8b95a1]">{SITE_NAME}</p>
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle>검색 사이트에 등록하기</CardTitle>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-[#4e5968]">
              <li>네이버 서치어드바이저·구글 서치 콘솔에 대표 주소를 등록하고 &lsquo;HTML 태그&rsquo;로 소유 확인 코드를 받아요.</li>
              <li>코드를 위 칸에 붙여 넣고 저장한 뒤, 그 사이트에서 &lsquo;소유 확인&rsquo;을 눌러요.</li>
              <li>
                사이트맵 제출 칸에 <b>{pv.origin}/sitemap.xml</b> 을 넣어요.
              </li>
            </ol>
            <p className="mt-2 text-[12px] text-[#8b95a1]">
              검색어 {splitKeywords(draft.keywords).length || DEFAULT_SEO.keywords.length}개 · 검색 결과에 반영되기까지 며칠 걸릴 수 있어요.
            </p>
          </Card>
        </div>
      </div>

      <SaveBar
        visible={!!q.data.schemaReady && changes.length > 0}
        summary={
          <span>
            바뀌는 칸 <b className="font-bold text-[#191f28]">{changes.length}개</b>
          </span>
        }
        onSave={() => void save()}
        onReset={() => {
          setDraft(saved);
          setError(null);
        }}
        busy={busy}
        saveLabel="저장하기"
      />
    </>
  );
}
