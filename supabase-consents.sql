-- ────────────────────────────────────────────────────────────────────────
-- 약관 동의 기록 — 로그인 직후 한 번 뜨는 동의 화면(2026-10-19)
-- ────────────────────────────────────────────────────────────────────────
-- 사장님: 약관에 "아이 정보는 보호자 동의를 받는다"고 적었으니 앱에서 동의를 받는다 — "로그인 직후 한 번 동의 화면".
--   · member_consents(회원 한 줄) — 지금 동의한 판(version)·항목·시각. 동의 화면은 이 판이 지금 판과 같으면 다시 뜨지 않는다.
--   · member_consent_log — 동의할 때마다 한 줄(나중에 "언제 무엇에 동의했나"를 보여 줄 근거). 탈퇴해도 아이디와 함께 남는다.
--   · agree_terms(판, 항목) — 화면이 부른다. 필수 항목(만 14세 이상 보호자 · 이용약관 · 개인정보 수집·이용(아이 정보·국외 이전 포함))이
--     모두 true 일 때만 적는다. 시각은 서버가 찍는다(화면이 보낸 시각은 쓰지 않는다).
--   · master_member_consent(회원) — 관리자가 회원의 동의 기록을 본다.
-- 고객은 자기 줄만 읽는다. 쓰는 길은 agree_terms 뿐. 서비스 키는 쓰지 않는다. 여러 번 돌려도 안전하다.
-- ────────────────────────────────────────────────────────────────────────

create table if not exists public.member_consents (
  owner     uuid primary key references auth.users(id) on delete cascade,
  version   text not null check (length(version) between 1 and 40),
  items     jsonb not null default '{}'::jsonb,
  agreed_at timestamptz not null default now()
);
alter table public.member_consents enable row level security;
revoke all on public.member_consents from anon, authenticated;
grant select (owner, version, items, agreed_at) on public.member_consents to authenticated;
drop policy if exists "member_consents 본인 열람" on public.member_consents;
create policy "member_consents 본인 열람" on public.member_consents
  for select to authenticated using (auth.uid() = owner);

create table if not exists public.member_consent_log (
  id        bigint generated always as identity primary key,
  owner     uuid references auth.users(id) on delete set null,
  username  text,
  version   text not null,
  items     jsonb not null,
  at        timestamptz not null default now()
);
create index if not exists member_consent_log_owner_idx on public.member_consent_log (owner, at desc);
alter table public.member_consent_log enable row level security;
revoke all on public.member_consent_log from anon, authenticated;
-- 정책 없음 → 표로는 아무도 못 본다. master_member_consent 로만.


-- 동의 적기 — 필수 항목이 모두 true 일 때만
create or replace function public.agree_terms(p_version text, p_items jsonb)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_name text;
  v_at   timestamptz := now();
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception '약관 판이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object'
     or coalesce((p_items ->> 'age14')::boolean, false) is not true
     or coalesce((p_items ->> 'terms')::boolean, false) is not true
     or coalesce((p_items ->> 'privacy')::boolean, false) is not true then
    raise exception '필수 항목에 모두 동의해 주세요.' using errcode = '22023';
  end if;

  select username into v_name from public.profiles where id = auth.uid();
  insert into public.member_consents (owner, version, items, agreed_at)
  values (auth.uid(), p_version, p_items, v_at)
  on conflict (owner) do update set version = excluded.version, items = excluded.items, agreed_at = excluded.agreed_at;
  insert into public.member_consent_log (owner, username, version, items, at)
  values (auth.uid(), v_name, p_version, p_items, v_at);
  return json_build_object('ok', true, 'version', p_version, 'agreed_at', v_at);
end; $$;
revoke all on function public.agree_terms(text, jsonb) from public, anon;
grant execute on function public.agree_terms(text, jsonb) to authenticated;

-- 관리자 — 회원의 지금 동의와 기록(최근 20줄)
create or replace function public.master_member_consent(p_owner uuid)
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return json_build_object(
    'current', (select to_jsonb(c) - 'owner' from public.member_consents c where c.owner = p_owner),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object('version', l.version, 'items', l.items, 'at', l.at) order by l.at desc, l.id desc)
        from (select * from public.member_consent_log x where x.owner = p_owner order by x.at desc, x.id desc limit 20) l),
      '[]'::jsonb));
end; $$;
revoke all on function public.master_member_consent(uuid) from public, anon;
grant execute on function public.master_member_consent(uuid) to authenticated;
