-- ────────────────────────────────────────────────────────────────────────
-- 한 사람에게만 보이는 영상 — 비공개 보관함 'private-media' (2026-09-28)
-- ────────────────────────────────────────────────────────────────────────
-- 돼지 삼형제 13쪽 영상(아이 얼굴이 들어 있음)을 fe 계정에서만 보이게 하려고 만들었다.
-- 파일은 회원 자기 폴더(<회원 id>/파일)에 둔다. 회원은 **자기 폴더만 읽을 수 있고**, 쓰기·지우기는
-- 아무도 못 한다(올리기는 관리자가 서비스 키로만). 그래서 다른 아이디는 주소를 알아도 못 연다.
-- 여러 번 돌려도 안전하다.

insert into storage.buckets (id, name, public)
values ('private-media', 'private-media', false)
on conflict (id) do update set public = false;

drop policy if exists "private-media 본인 폴더 읽기" on storage.objects;
create policy "private-media 본인 폴더 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'private-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- 확인 — 두 칸 모두 true 면 정상
select
  exists (select 1 from storage.buckets where id = 'private-media' and public = false) as "비공개_보관함",
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'private-media 본인 폴더 읽기') as "본인_폴더만_읽기";



-- ════════════════════════════════════════════════════════════════════════
-- 요금제 정책 · 공개 동화 · 크레딧 · 회원 요금제 (2026-10-01, 10-02 더함)
-- ════════════════════════════════════════════════════════════════════════
--
-- 쓰는 법: Supabase → SQL Editor 에 이 파일을 통째로 붙여넣고 Run.
--          관리실 SQL(supabase-admin-console.sql)을 이미 돌린 뒤라면 따로 더 할 것은 없다
--          (여기 함수들이 쓰는 is_pricing_admin() · is_master_user() · master_can_see() 는 supabase-setup.sql 에 있다).
--
-- ✅ 몇 번을 돌려도 안전하다. 표·칸이 없으면 만들고, 있으면 그대로 둔다. 정책·함수는 갈아 끼우기만 한다.
--    이 파일의 예전 판(10-01)을 이미 돌렸어도 이 판을 한 번 더 돌리면 새 칸·새 표만 더해진다.
--    돌리자마자 사이트가 달라지지 않는다 — 빈 칸('{}' · '[]')은 "앱의 기본값을 쓴다"는 뜻이고,
--    책장 자물쇠 스위치는 꺼진 채로 시작하며, 회원 요금제는 아무에게도 지정되지 않은 채로 시작한다.
--
-- ── 무엇을 더하나 ──────────────────────────────────────────────────────
--  ① app_offer_settings(늘 한 줄) — 요금제·가격 화면의 값
--      plan_settings   가족 패스(월간·연간)·스타트팩 값과 구성
--                      {"monthly": {"priceWon": 19900, "booksPerMonth": 4, "familyCharacters": 4, "voices": 1,
--                                   "voiceRemakesPerMonth": 1, "drawTokensPerMonth": 5, "drawTokensFirstMonth": 10},
--                       "yearly": {...같은 칸...}, "starter": {"priceWon": 4900, "books": 1, "familyCharacters": 1, "voices": 1}}
--      library_tiers   책마다 어느 단계부터 열리나 — {"classic-cinderella": "free", "folk-heungbu": "starter", ...}
--                      단계: free(무료, 비회원도) · starter(스타트팩부터) · pass(가족 패스만)
--      library_gate_on 책장에 자물쇠를 붙이나(관리실 스위치)
--      credit_packs    가격별 크레딧 묶음 — [{"priceWon": 4900, "credits": 50}, ...] (1~5개)
--      credit_costs    쓰는 곳별 크레딧 — {"book": 50, "character": 20, "voice": 15, "draw": 5}
--     + offer_settings_changes(바꾼 이력) · master_set_offer_settings(바꾸기) · master_offer_settings_log(이력)
--  ② member_plans(회원 한 명에 한 줄) — 관리자가 지정한 회원 요금제(free · starter · monthly · yearly)와 끝나는 때
--     + member_plan_changes(바꾼 이력) · master_set_member_plan(지정·풀기) · master_member_plan(한 사람 읽기)
--  ③ member_deletions — 관리실에서 지운 회원 기록(누가·언제·왜) · master_delete_member(지우기, 10-02 더함)
--     · master_member_deletions(기록 읽기)
--
-- ── 누가 무엇을 ─────────────────────────────────────────────────────────
--  · 요금제·가격 값은 누구나 읽는다(요금제 화면 · 책장). 고친 사람 칸(updated_by)은 못 읽는다.
--    바꾸는 사람은 회사 계정(yogico)뿐 — 가격과 같은 규칙(is_pricing_admin). 다른 마스터는 보기만 한다.
--  · 회원 요금제는 그 회원 본인과 관리자만 읽는다(요금제 · 끝나는 때만 — 사유·지정한 사람은 관리자 함수로만).
--    지정·풀기는 관리자(is_master_user)가 한다 — 토큰 충전과 같은 규칙(다른 관리자 계정에는 못 한다).
--  · 이력은 관리자만 함수로 읽는다(표로는 아무도 못 본다).
-- ════════════════════════════════════════════════════════════════════════


-- ① 요금제·가격 값 ────────────────────────────────────────────────────────

create table if not exists public.app_offer_settings (
  id              smallint primary key default 1 check (id = 1),
  library_tiers   jsonb not null default '{}'::jsonb check (jsonb_typeof(library_tiers) = 'object'),
  library_gate_on boolean not null default false,
  credit_packs    jsonb not null default '[]'::jsonb check (jsonb_typeof(credit_packs) = 'array'),
  credit_costs    jsonb not null default '{}'::jsonb check (jsonb_typeof(credit_costs) = 'object'),
  plan_settings   jsonb not null default '{}'::jsonb check (jsonb_typeof(plan_settings) = 'object'),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);
-- 예전 판(10-01)을 돌린 DB 에는 plan_settings 칸이 없다 — 더한다.
alter table public.app_offer_settings
  add column if not exists plan_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(plan_settings) = 'object');
insert into public.app_offer_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.offer_settings_changes (
  id                  bigint generated always as identity primary key,
  field               text not null,
  old_value           jsonb,
  new_value           jsonb,
  note                text,
  changed_by          uuid references auth.users(id) on delete set null,
  changed_by_username text,                -- 계정이 지워져도 누가 바꿨는지 남게 이름을 함께 적는다
  at                  timestamptz not null default now()
);
create index if not exists offer_settings_changes_at_idx on public.offer_settings_changes (at desc);

-- 잠금 — 새 표는 Supabase 가 비회원·회원에게 통째로 열어 준다. 먼저 다 걷고, 읽기만 칸 단위로 준다.
alter table public.app_offer_settings     enable row level security;
alter table public.offer_settings_changes enable row level security;
revoke all on public.app_offer_settings, public.offer_settings_changes from anon, authenticated;
revoke all on sequence public.offer_settings_changes_id_seq from anon, authenticated;

grant select (id, library_tiers, library_gate_on, credit_packs, credit_costs, plan_settings, updated_at)
  on public.app_offer_settings to anon, authenticated;
drop policy if exists "app_offer_settings 모두 읽기" on public.app_offer_settings;
create policy "app_offer_settings 모두 읽기" on public.app_offer_settings for select using (true);
-- offer_settings_changes: 권한·정책 없음 → 표로는 아무도 못 본다. master_offer_settings_log 로만.

-- 숫자 칸 검사 도우미 — JSON 숫자이고, 정수이고, lo~hi 안인가. 칸이 없으면(null) 거짓.
create or replace function public.offer_int_ok(v jsonb, lo numeric, hi numeric)
returns boolean
language plpgsql immutable
set search_path = public as $$
begin
  if v is null or jsonb_typeof(v) <> 'number' then
    return false;
  end if;
  return (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
     and (v #>> '{}')::numeric between lo and hi;
end; $$;
revoke all on function public.offer_int_ok(jsonb, numeric, numeric) from public, anon, authenticated;


-- 바꾸기. p_patch 는 바꿀 칸만 — 예: {"library_gate_on": true, "credit_costs": {"book": 50, ...}}
-- 하나라도 틀리면 아무것도 안 바꾼다. 칸마다 "무엇이 무엇에서 무엇으로, 왜, 누가"를 남긴다.
-- 범위는 앱(lib/offer-settings.ts 의 PASS_TERM_FIELDS · STARTER_TERM_FIELDS 등)과 같다 — offer-settings.test 가 맞춰 본다.
-- 돌려주는 값: { changed: 실제로 바뀐 칸 수, settings: 지금 값(고친 사람 칸 빼고) }
create or replace function public.master_set_offer_settings(p_patch jsonb, p_note text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  k       text;
  per     text;
  v       jsonb;
  e       jsonb;
  v_old   jsonb;
  cur     jsonb;
  cnt     integer;
  n       integer := 0;
  prices  integer[];
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_who   text;
  allowed text[] := array['library_tiers','library_gate_on','credit_packs','credit_costs','plan_settings'];
begin
  if not public.is_pricing_admin() then
    raise exception '이 계정은 요금제·가격 설정을 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception '바꿀 항목이 없어요.' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) < 2 then
    raise exception '왜 바꾸는지 두 글자 이상 적어 주세요.' using errcode = '22023';
  end if;
  if length(v_note) > 500 then
    raise exception '바꾼 까닭은 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  -- ① 모양 검사 — 하나라도 틀리면 아무것도 안 바꾼다.
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any(allowed)) then
      raise exception '모르는 항목이에요: %', k using errcode = '22023';
    end if;
    v := p_patch -> k;

    if k = 'library_tiers' then
      if jsonb_typeof(v) <> 'object' then
        raise exception '공개 동화 단계 모양이 아니에요.' using errcode = '22023';
      end if;
      select count(*) into cnt from jsonb_object_keys(v);
      if cnt < 1 or cnt > 300 then
        raise exception '공개 동화 단계 모양이 아니에요.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_each(v) t
                  where t.key !~ '^(classic|folk)-[a-z0-9-]{1,60}$'
                     or jsonb_typeof(t.value) <> 'string'
                     or (t.value #>> '{}') not in ('free','starter','pass')) then
        raise exception '단계는 무료·스타트팩·가족 패스 가운데서 골라 주세요.' using errcode = '22023';
      end if;

    elsif k = 'library_gate_on' then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception '켜기·끄기 값이 아니에요.' using errcode = '22023';
      end if;

    elsif k = 'credit_packs' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) < 1 or jsonb_array_length(v) > 5 then
        raise exception '크레딧 묶음은 1~5개로 정해 주세요.' using errcode = '22023';
      end if;
      prices := array[]::integer[];
      for e in select x from jsonb_array_elements(v) as t(x) loop
        if jsonb_typeof(e) <> 'object'
           or not public.offer_int_ok(e -> 'priceWon', 500, 1000000)
           or not public.offer_int_ok(e -> 'credits', 1, 1000000) then
          raise exception '묶음 값은 500~1,000,000원, 크레딧은 1~1,000,000 사이 정수로 적어 주세요.' using errcode = '22023';
        end if;
        if (e ->> 'priceWon')::integer = any(prices) then
          raise exception '같은 값의 크레딧 묶음이 두 개예요.' using errcode = '22023';
        end if;
        prices := prices || (e ->> 'priceWon')::integer;
      end loop;

    elsif k = 'credit_costs' then
      if jsonb_typeof(v) <> 'object' then
        raise exception '크레딧 쓰는 값 모양이 아니에요.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_object_keys(v) as t(x) where t.x not in ('book','character','voice','draw'))
         or (select count(*) from jsonb_object_keys(v)) <> 4 then
        raise exception '크레딧 쓰는 곳은 동화·가족 캐릭터·가족 목소리·가족 그리기 넷이에요.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_each(v) t where not public.offer_int_ok(t.value, 0, 100000)) then
        raise exception '크레딧 쓰는 값은 0~100,000 사이 정수로 적어 주세요.' using errcode = '22023';
      end if;

    else -- plan_settings
      if jsonb_typeof(v) <> 'object'
         or exists (select 1 from jsonb_object_keys(v) as t(x) where t.x not in ('monthly','yearly','starter'))
         or jsonb_typeof(v -> 'monthly') is distinct from 'object'
         or jsonb_typeof(v -> 'yearly') is distinct from 'object'
         or jsonb_typeof(v -> 'starter') is distinct from 'object' then
        raise exception '요금제 값은 월간·연간·스타트팩 세 묶음으로 보내 주세요.' using errcode = '22023';
      end if;
      foreach per in array array['monthly','yearly'] loop
        e := v -> per;
        if exists (select 1 from jsonb_object_keys(e) as t(x)
                    where t.x not in ('priceWon','booksPerMonth','familyCharacters','voices',
                                      'voiceRemakesPerMonth','drawTokensPerMonth','drawTokensFirstMonth'))
           or not public.offer_int_ok(e -> 'priceWon', 1000, 10000000)
           or not public.offer_int_ok(e -> 'booksPerMonth', 1, 100)
           or not public.offer_int_ok(e -> 'familyCharacters', 1, 20)
           or not public.offer_int_ok(e -> 'voices', 0, 10)
           or not public.offer_int_ok(e -> 'voiceRemakesPerMonth', 0, 10)
           or not public.offer_int_ok(e -> 'drawTokensPerMonth', 0, 100)
           or not public.offer_int_ok(e -> 'drawTokensFirstMonth', 0, 200) then
          raise exception '가족 패스(%) 값이 맞지 않아요 — 칸과 범위를 확인해 주세요.', per using errcode = '22023';
        end if;
      end loop;
      e := v -> 'starter';
      if exists (select 1 from jsonb_object_keys(e) as t(x)
                  where t.x not in ('priceWon','books','familyCharacters','voices'))
         or not public.offer_int_ok(e -> 'priceWon', 0, 1000000)
         or not public.offer_int_ok(e -> 'books', 0, 20)
         or not public.offer_int_ok(e -> 'familyCharacters', 0, 20)
         or not public.offer_int_ok(e -> 'voices', 0, 10) then
        raise exception '스타트팩 값이 맞지 않아요 — 칸과 범위를 확인해 주세요.' using errcode = '22023';
      end if;
    end if;
  end loop;

  -- ② 없는 줄이면 기본값으로 한 줄 만든다(표가 비어 있어도 첫 저장이 되게). 잠그고 바꾼다.
  insert into public.app_offer_settings (id) values (1) on conflict (id) do nothing;
  select to_jsonb(s) into cur from public.app_offer_settings s where s.id = 1 for update;
  select p.username into v_who from public.profiles p where p.id = auth.uid();

  for k in select jsonb_object_keys(p_patch) loop
    v := p_patch -> k;
    v_old := cur -> k;
    if v is distinct from v_old then
      if k = 'library_gate_on' then
        update public.app_offer_settings set library_gate_on = (v #>> '{}')::boolean where id = 1;
      else
        -- k 는 위에서 허용 목록으로 확인했다 — %I 로 칸 이름만 끼운다(값은 $1 로 따로 넘긴다).
        execute format('update public.app_offer_settings set %I = $1 where id = 1', k) using v;
      end if;
      insert into public.offer_settings_changes (field, old_value, new_value, note, changed_by, changed_by_username)
      values (k, v_old, v, v_note, auth.uid(), v_who);
      n := n + 1;
    end if;
  end loop;

  if n > 0 then
    update public.app_offer_settings set updated_at = now(), updated_by = auth.uid() where id = 1;
  end if;
  return json_build_object('changed', n,
    'settings', (select to_jsonb(s) - 'updated_by' from public.app_offer_settings s where s.id = 1));
end; $$;
revoke all on function public.master_set_offer_settings(jsonb, text) from public, anon;
grant execute on function public.master_set_offer_settings(jsonb, text) to authenticated;

-- 바꾼 이력 — 마스터 모두 읽는다(회사 공통 설정이라 개인 기록이 아니다).
create or replace function public.master_offer_settings_log(p_limit integer default 50)
returns table (id bigint, field text, old_value jsonb, new_value jsonb, note text,
               changed_by_username text, at timestamptz)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return query
    select c.id, c.field, c.old_value, c.new_value, c.note, c.changed_by_username, c.at
      from public.offer_settings_changes c
     order by c.at desc, c.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end; $$;
revoke all on function public.master_offer_settings_log(integer) from public, anon;
grant execute on function public.master_offer_settings_log(integer) to authenticated;


-- ② 회원 요금제 ─────────────────────────────────────────────────────────

create table if not exists public.member_plans (
  owner           uuid primary key references auth.users(id) on delete cascade,
  plan            text not null check (plan in ('free','starter','monthly','yearly')),
  ends_at         timestamptz,             -- 비어 있으면 관리자가 풀 때까지
  note            text check (note is null or length(note) <= 500),
  set_by          uuid references auth.users(id) on delete set null,
  set_by_username text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.member_plan_changes (
  id                  bigint generated always as identity primary key,
  owner               uuid references auth.users(id) on delete set null,
  owner_username      text,
  old_plan            text,                -- 비어 있으면 '지정 없음'
  new_plan            text,
  old_ends_at         timestamptz,
  new_ends_at         timestamptz,
  note                text,
  changed_by          uuid references auth.users(id) on delete set null,
  changed_by_username text,
  at                  timestamptz not null default now()
);
create index if not exists member_plan_changes_owner_idx on public.member_plan_changes (owner, at desc);

alter table public.member_plans        enable row level security;
alter table public.member_plan_changes enable row level security;
revoke all on public.member_plans, public.member_plan_changes from anon, authenticated;
revoke all on sequence public.member_plan_changes_id_seq from anon, authenticated;

-- 회원 본인(책장 자물쇠)과 관리자(회원 목록)는 요금제·끝나는 때만 읽는다. 사유·지정한 사람은 master_member_plan 으로만.
grant select (owner, plan, ends_at, updated_at) on public.member_plans to authenticated;
drop policy if exists "member_plans 본인 열람" on public.member_plans;
create policy "member_plans 본인 열람" on public.member_plans for select using (auth.uid() = owner);
drop policy if exists "member_plans 마스터 열람" on public.member_plans;
create policy "member_plans 마스터 열람" on public.member_plans for select using (public.master_can_see(owner));
-- member_plan_changes: 권한·정책 없음 → 표로는 아무도 못 본다. master_member_plan 으로만.

-- 지정·풀기. p_plan 이 null 이면 지정을 푼다(지정 없음 = 결제 전 베타라 모두 열림).
-- 끝나는 때는 비우거나(풀 때까지) 지금 뒤 5년 안. 사유 필수. 바뀐 것이 없으면 아무것도 적지 않는다.
-- 돌려주는 값: { changed: 0|1, plan: 지금 줄(지정한 사람 id 빼고) 또는 null }
create or replace function public.master_set_member_plan(p_owner uuid, p_plan text, p_ends_at timestamptz, p_note text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  cur       public.member_plans%rowtype;
  had       boolean;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_who     text;
  v_name    text;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_owner is null or not exists (select 1 from public.profiles where id = p_owner) then
    raise exception '회원을 찾지 못했어요.' using errcode = '22023';
  end if;
  if not public.master_can_see(p_owner) then
    raise exception '다른 관리자 계정의 요금제는 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if p_plan is not null and p_plan not in ('free','starter','monthly','yearly') then
    raise exception '모르는 요금제예요.' using errcode = '22023';
  end if;
  if p_plan is null and p_ends_at is not null then
    raise exception '지정을 풀 때는 끝나는 때를 비워 주세요.' using errcode = '22023';
  end if;
  if p_ends_at is not null and (p_ends_at <= now() or p_ends_at > now() + interval '5 years') then
    raise exception '끝나는 날은 오늘 뒤 5년 안으로 정해 주세요.' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) < 2 then
    raise exception '왜 바꾸는지 두 글자 이상 적어 주세요.' using errcode = '22023';
  end if;
  if length(v_note) > 500 then
    raise exception '바꾼 까닭은 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  select * into cur from public.member_plans where owner = p_owner for update;
  had := found;

  -- 바뀐 것이 없으면 그대로 돌려준다(이력도 남기지 않는다)
  if (not had and p_plan is null)
     or (had and cur.plan = p_plan and cur.ends_at is not distinct from p_ends_at) then
    return json_build_object('changed', 0,
      'plan', (select to_jsonb(m) - 'set_by' from public.member_plans m where m.owner = p_owner));
  end if;

  select username into v_who from public.profiles where id = auth.uid();
  select username into v_name from public.profiles where id = p_owner;

  if p_plan is null then
    delete from public.member_plans where owner = p_owner;
  else
    insert into public.member_plans (owner, plan, ends_at, note, set_by, set_by_username)
    values (p_owner, p_plan, p_ends_at, v_note, auth.uid(), v_who)
    on conflict (owner) do update
      set plan = excluded.plan, ends_at = excluded.ends_at, note = excluded.note,
          set_by = excluded.set_by, set_by_username = excluded.set_by_username, updated_at = now();
  end if;

  insert into public.member_plan_changes
    (owner, owner_username, old_plan, new_plan, old_ends_at, new_ends_at, note, changed_by, changed_by_username)
  values
    (p_owner, v_name, case when had then cur.plan end, p_plan, case when had then cur.ends_at end, p_ends_at,
     v_note, auth.uid(), v_who);

  return json_build_object('changed', 1,
    'plan', (select to_jsonb(m) - 'set_by' from public.member_plans m where m.owner = p_owner));
end; $$;
revoke all on function public.master_set_member_plan(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.master_set_member_plan(uuid, text, timestamptz, text) to authenticated;

-- 한 사람 읽기 — 지금 요금제(사유·지정한 사람 포함)와 바꾼 이력 30줄.
create or replace function public.master_member_plan(p_owner uuid)
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if not public.master_can_see(p_owner) then
    raise exception '이 회원은 볼 수 없어요.' using errcode = '42501';
  end if;
  return json_build_object(
    'plan', (select to_jsonb(m) - 'set_by' from public.member_plans m where m.owner = p_owner),
    'log', coalesce((
      select jsonb_agg(to_jsonb(c) - 'changed_by' - 'owner' order by c.at desc, c.id desc)
        from (select * from public.member_plan_changes x
               where x.owner = p_owner
               order by x.at desc, x.id desc
               limit 30) c), '[]'::jsonb));
end; $$;
revoke all on function public.master_member_plan(uuid) from public, anon;
grant execute on function public.master_member_plan(uuid) to authenticated;

-- ③ 회원 지우기(탈퇴 처리) ─────────────────────────────────────────────────
-- 관리실 회원 화면의 [회원 지우기] — 계정을 지우면 프로필·동화·토큰 장부·목소리·가족 그림 기록이 함께 지워진다
-- (on delete cascade). 결제·환불 기록은 주인 칸만 비고 5년 남는다(전자상거래법). cafe24 그림 파일은 남는다.
-- 바로 지워진다(되돌릴 수 없다) — 시험 계정이나 본인이 지워 달라고 한 경우에 쓴다.
-- 고객이 스스로 탈퇴하고 90일 보관 뒤 지우는 길(사장님 2026-09-14 결정)은 출시 때 따로 만든다.

create table if not exists public.member_deletions (
  id                  bigint generated always as identity primary key,
  member_id           uuid not null,       -- 지운 회원 id — 계정은 이미 없어서 참조를 걸지 않는다
  member_username     text,
  books               integer,             -- 지울 때 있던 동화 수(기록용)
  note                text,
  deleted_by          uuid references auth.users(id) on delete set null,
  deleted_by_username text,
  at                  timestamptz not null default now()
);
create index if not exists member_deletions_at_idx on public.member_deletions (at desc);
alter table public.member_deletions enable row level security;
revoke all on public.member_deletions from anon, authenticated;
revoke all on sequence public.member_deletions_id_seq from anon, authenticated;
-- 권한·정책 없음 → 표로는 아무도 못 본다. master_member_deletions 로만.

-- 지우기. 관리자만, 다른 관리자 계정·내 계정은 못 지운다. 아이디를 그대로 따라 적어야 하고 사유 필수.
-- 기록을 먼저 적고 계정을 지운다 — 한 덩어리라 계정 지우기가 실패하면 기록도 남지 않는다.
create or replace function public.master_delete_member(p_owner uuid, p_username text, p_note text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_name   text;
  v_master boolean;
  v_books  integer;
  v_who    text;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_owner is null or p_owner = auth.uid() then
    raise exception '내 계정은 여기서 지울 수 없어요.' using errcode = '42501';
  end if;
  select username, coalesce(is_master, false) into v_name, v_master from public.profiles where id = p_owner;
  if not found then
    raise exception '회원을 찾지 못했어요.' using errcode = '22023';
  end if;
  if v_master then
    raise exception '관리자 계정은 지울 수 없어요.' using errcode = '42501';
  end if;
  if v_name is distinct from btrim(coalesce(p_username, '')) then
    raise exception '아이디가 맞지 않아요 — 지울 회원의 아이디를 그대로 적어 주세요.' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) < 2 then
    raise exception '왜 지우는지 두 글자 이상 적어 주세요.' using errcode = '22023';
  end if;
  if length(v_note) > 500 then
    raise exception '지우는 까닭은 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  select count(*) into v_books from public.books where owner = p_owner;
  select username into v_who from public.profiles where id = auth.uid();
  insert into public.member_deletions (member_id, member_username, books, note, deleted_by, deleted_by_username)
  values (p_owner, v_name, v_books, v_note, auth.uid(), v_who);

  delete from auth.users where id = p_owner;
  if not found then
    raise exception '계정을 지우지 못했어요(이미 지워졌을 수 있어요).' using errcode = '22023';
  end if;
  return json_build_object('ok', true, 'username', v_name, 'books', v_books);
end; $$;
revoke all on function public.master_delete_member(uuid, text, text) from public, anon;
grant execute on function public.master_delete_member(uuid, text, text) to authenticated;

-- 지운 회원 기록 — 관리자 모두 읽는다.
create or replace function public.master_member_deletions(p_limit integer default 50)
returns table (id bigint, member_id uuid, member_username text, books integer, note text,
               deleted_by_username text, at timestamptz)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return query
    select d.id, d.member_id, d.member_username, d.books, d.note, d.deleted_by_username, d.at
      from public.member_deletions d
     order by d.at desc, d.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end; $$;
revoke all on function public.master_member_deletions(integer) from public, anon;
grant execute on function public.master_member_deletions(integer) to authenticated;

-- 사이트(데이터 API)가 새 표·칸·함수를 바로 알아보게
notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════
-- 확인 — 아래가 다섯 줄(app_offer_settings · member_deletions · member_plan_changes · member_plans ·
--        offer_settings_changes)을 보여 주면 끝이다.
-- ════════════════════════════════════════════════════════════════════════
select table_name as 표
from information_schema.tables
where table_schema = 'public'
  and table_name in ('app_offer_settings', 'offer_settings_changes', 'member_plans', 'member_plan_changes',
                     'member_deletions')
order by table_name;
