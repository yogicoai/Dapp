"use client";

/**
 * 회원 목록(/admin/members) — 가입한 회원과 동화 수·토큰·부모 목소리·남은 의견.
 * 설정 화면 '관리실'의 회원 목록(펼치면 책·목소리)을 옮겨 와 표로 다시 짰다(2026-09-30).
 *
 *  · 목록은 서버가 최근 가입 순으로 300명까지 준다(관리자 계정은 없다). 찾기·기간·정렬은 화면에서 거른다.
 *  · 거르기는 주소(?q=&period=&sort=&fb=1)에 둔다 — 새로 고침·뒤로 가기에도 같은 목록이 보이게.
 *    검색어는 칠 때마다 주소를 바꾸지 않고 잠깐(0.3초) 멈췄을 때 바꾼다(글자마다 화면을 다시 부르지 않게).
 *  · 300명 밖의 회원은 아이디를 정확히 적어 [정확히 찾기]로 연다.
 *  · 줄을 누르면 그 회원 화면(/admin/members/<id>) — 토큰 충전·환불·만들기 기록은 거기서 한다.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDateKo, parseUsername, type CustomerResponse } from "@/lib/admin";
import { groupDigits, withParams } from "@/lib/admin-console";
import {
  filterMembers,
  isDefaultMemberFilter,
  memberFilterParams,
  MEMBER_PERIODS,
  MEMBER_SORTS,
  parseMemberFilter,
  type MemberFilter,
  type MemberListRow,
  type MembersListResponse,
} from "@/lib/admin-members";
import {
  Badge,
  Banner,
  Button,
  ChipGroup,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  SearchInput,
  Switch,
  useAdminQuery,
  type Column,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";
import { rememberMembersList, VoiceBadges } from "./member-ui";

export function MembersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { api, clock } = useAdmin();
  const f = parseMemberFilter(new URLSearchParams(sp.toString()));
  const q = useAdminQuery<MembersListResponse>("/api/admin/customers");

  // 검색칸은 바로 반응하고, 주소는 멈췄을 때 바꾼다. 주소가 밖에서 바뀌면(뒤로 가기) 칸도 따라간다.
  // 내가 방금 적은 값(sentQ)이 주소에 도착한 것이면 칸을 건드리지 않는다 — 그 사이 더 친 글자가 지워지지 않게.
  const [qInput, setQInput] = useState(f.q);
  const [urlQ, setUrlQ] = useState(f.q);
  const [sentQ, setSentQ] = useState(f.q);
  if (urlQ !== f.q) {
    setUrlQ(f.q);
    if (f.q !== sentQ) {
      setSentQ(f.q);
      setQInput(f.q);
    }
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** 거르기 몇 칸을 주소에 적는다 — 지금 주소(다른 칸)를 그대로 두고, 기록은 남기지 않는다. */
  const patch = (p: Partial<MemberFilter>) => {
    const search = typeof window !== "undefined" ? window.location.search : sp.toString();
    router.replace(`${pathname}${withParams(search, memberFilterParams(p))}`, { scroll: false });
  };
  const sendQ = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSentQ(v.trim().slice(0, 40)); // 주소 쪽(parseMemberFilter)과 같은 모양으로 기억한다
    patch({ q: v });
  };
  const onSearch = (v: string) => {
    setQInput(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => sendQ(v), 300);
  };

  const view: MemberFilter = { ...f, q: qInput };
  /** 회원 화면으로 — 지금 거르기(주소에 아직 안 간 검색어 포함)를 적어 두고 간다. [회원 목록]이 그대로 돌아오게. */
  const openMember = (id: string) => {
    rememberMembersList(id, withParams("", memberFilterParams(view)));
    router.push(`/admin/members/${id}`);
  };
  const all = q.data?.customers ?? [];
  const rows = filterMembers(all, view, clock);

  // 목록에 없을 때 — 아이디를 정확히 적었으면 서버에 직접 묻는다(300명 밖 회원).
  const [lookup, setLookup] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const exact = parseUsername(qInput);
  const findExact = async () => {
    if (!exact.ok) return;
    setLookup({ busy: true, error: null });
    const r = await api<CustomerResponse>(`/api/admin/customer?username=${encodeURIComponent(exact.value)}`);
    if (r.ok) {
      setLookup({ busy: false, error: null });
      openMember(r.data.profile.id);
    } else setLookup({ busy: false, error: r.error });
  };

  const columns: Column<MemberListRow>[] = [
    { key: "username", header: "아이디", mobile: "title", cell: (r) => <span className="font-bold">{r.username}</span> },
    {
      key: "joined",
      header: "가입일",
      cell: (r) => (
        <span className="tabular-nums text-[#4e5968]">
          <span className="md:hidden">가입 </span>
          {formatDateKo(r.createdAt)}
        </span>
      ),
    },
    { key: "books", header: "동화", align: "right", cell: (r) => `동화 ${groupDigits(r.books)}권` },
    { key: "tokens", header: "토큰", align: "right", cell: (r) => `${groupDigits(r.tokens)}토큰` },
    { key: "voices", header: "목소리", cell: (r) => <VoiceBadges voices={r.voices} /> },
    {
      key: "feedback",
      header: "남은 의견",
      mobile: "badge",
      cell: (r) =>
        r.openFeedback > 0 ? (
          <Badge tone="red">의견 {groupDigits(r.openFeedback)}건</Badge>
        ) : (
          <span className="text-[#b0b8c1]" aria-label="남은 의견 없음">
            –
          </span>
        ),
    },
  ];

  const filtered = !isDefaultMemberFilter(view);
  const reset = () => {
    setQInput("");
    setSentQ("");
    if (timer.current) clearTimeout(timer.current);
    router.replace(`${pathname}${withParams(sp.toString(), memberFilterParams({ q: "", period: "all", sort: "new", fbOnly: false }))}`, {
      scroll: false,
    });
  };

  return (
    <>
      <PageHeader
        title="회원"
        description="가입한 회원의 동화·토큰·부모 목소리를 봐요. 회원을 누르면 토큰 충전·환불과 만들기 기록이 있어요."
        meta={q.data ? `전체 ${groupDigits(q.data.total)}명` : undefined}
      />

      <FilterBar onReset={filtered ? reset : undefined} resultText={q.data ? `${groupDigits(rows.length)}명` : undefined}>
        <SearchInput value={qInput} onChange={onSearch} onSubmit={sendQ} placeholder="아이디로 찾기" label="아이디로 찾기" maxLength={40} />
        <ChipGroup label="가입 기간" options={[...MEMBER_PERIODS]} value={f.period} onChange={(v) => patch({ period: v as MemberFilter["period"] })} />
        <ChipGroup label="정렬" options={[...MEMBER_SORTS]} value={f.sort} onChange={(v) => patch({ sort: v as MemberFilter["sort"] })} />
        <Switch checked={f.fbOnly} onChange={(v) => patch({ fbOnly: v })} label="남은 의견 있는 회원만" />
      </FilterBar>

      {q.data?.partial.length ? (
        <Banner tone="warn" title="일부 숫자를 못 읽었어요">
          {q.data.partial.map((p) => ({ books: "동화 수", feedback: "남은 의견", voices: "목소리" })[p]).join(" · ")}는 실제보다 적게
          보일 수 있어요.
        </Banner>
      ) : null}

      {!q.data && q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : (
        <DataTable
          caption="회원 목록"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={q.loading && !q.data}
          onRowClick={(r) => openMember(r.id)}
          empty={
            all.length === 0 ? (
              <EmptyState icon="users" title="아직 가입한 회원이 없어요" body="첫 회원이 가입하면 여기 보여요." />
            ) : (
              <EmptyState
                icon="search"
                title="조건에 맞는 회원이 없어요"
                body={
                  exact.ok ? (
                    <>
                      목록에는 최근 가입한 회원만 있어요. 아이디를 정확히 적었다면 직접 찾아볼 수 있어요.
                      {lookup.error ? <span className="mt-1 block font-bold text-[#f04452]">{lookup.error}</span> : null}
                    </>
                  ) : (
                    "찾는 말이나 거르기를 바꿔 보세요."
                  )
                }
                action={
                  exact.ok ? (
                    <Button tone="primary" onClick={() => void findExact()} disabled={lookup.busy}>
                      {lookup.busy ? "찾는 중…" : `'${exact.value}' 정확히 찾기`}
                    </Button>
                  ) : filtered ? (
                    <Button onClick={reset}>거르기 풀기</Button>
                  ) : undefined
                }
              />
            )
          }
          footer={
            q.data?.truncated
              ? `최근 가입 ${groupDigits(q.data.customers.length)}명만 보여요. 더 앞선 회원은 아이디를 정확히 적어 찾아 주세요.`
              : undefined
          }
        />
      )}
    </>
  );
}
