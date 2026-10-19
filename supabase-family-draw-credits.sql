-- ────────────────────────────────────────────────────────────────────────
-- 캐릭터 무료 생성 횟수 — 관리실에서 고객에게 더해 준다 (2026-10-19)
-- ────────────────────────────────────────────────────────────────────────
-- 사장님: "캐릭터 생성 관련 횟수 부여하는 것도 마스터 쪽에서 관리할 수 있게 — 고객 클레임 발생했을 때의 해결".
--
--   · family_draw_credits(회원 한 줄) — 남은 무료 생성 횟수. 관리실이 더해 주고, 고객이 쿠키가 나갈 그리기를 할 때
--     쿠키 대신 이것부터 한 번 쓴다(새 캐릭터 처음 그리기든 다시 그리기든 — 한 번 = 그 그리기 값 전부).
--     원래 무료인 '포함된 다시 그리기'에는 쓰지 않는다(아깝지 않게). 누가 무료인지는 화면이 정해 보낸다
--     (보낸 값 0 = 무료로 알고 누름) — 여러 명을 한꺼번에 그려도 화면에 보인 값 그대로 받는다.
--   · family_draw_grants — 누가·언제·몇 번·왜 더해 줬나(관리실 회원 상세에서 본다).
--   · family_portraits.last_free — 마지막 그리기가 무료 횟수로 했나. 그리기에 실패해 되돌리면(family_portrait_undo)
--     쿠키처럼 무료 횟수도 되돌려 준다.
--   · charge_family_portrait · family_portrait_undo 는 이 내용을 더해 갈아 끼운다(나머지 셈은 그대로).
--     같은 함수가 supabase/family-portraits.sql · supabase-setup.sql 에도 있다 — 세 파일이 같은 판이다.
--   · master_grant_family_draws(회원, 횟수, 사유) · master_family_draws(회원) — 관리자만.
--
-- 고객은 자기 남은 횟수만 읽는다(가족 화면 안내). 바꾸는 길은 위 함수뿐. 서비스 키는 쓰지 않는다.
-- 여러 번 돌려도 안전하다.
-- ────────────────────────────────────────────────────────────────────────

create table if not exists public.family_draw_credits (
  owner      uuid primary key references auth.users(id) on delete cascade,
  free_left  integer not null default 0 check (free_left between 0 and 1000),
  updated_at timestamptz not null default now()
);
alter table public.family_draw_credits enable row level security;
revoke all on public.family_draw_credits from anon, authenticated;
grant select (owner, free_left, updated_at) on public.family_draw_credits to authenticated;
drop policy if exists "family_draw_credits 본인 열람" on public.family_draw_credits;
create policy "family_draw_credits 본인 열람" on public.family_draw_credits
  for select to authenticated using (auth.uid() = owner);

create table if not exists public.family_draw_grants (
  id                  bigint generated always as identity primary key,
  owner               uuid references auth.users(id) on delete set null,
  owner_username      text,
  amount              integer not null check (amount between 1 and 10),
  note                text not null check (length(note) between 2 and 500),
  granted_by          uuid references auth.users(id) on delete set null,
  granted_by_username text,
  at                  timestamptz not null default now()
);
create index if not exists family_draw_grants_owner_idx on public.family_draw_grants (owner, at desc);
alter table public.family_draw_grants enable row level security;
revoke all on public.family_draw_grants from anon, authenticated;
-- 정책 없음 → 표로는 아무도 못 본다. master_family_draws 로만.

alter table public.family_portraits add column if not exists last_free boolean not null default false;


-- 그리기 되돌리기 — 무료 횟수로 한 그리기면 그 횟수도 돌려준다(그 밖은 그대로).
create or replace function public.family_portrait_undo(p_owner uuid, p_member text)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  fp  public.family_portraits%rowtype;
  led public.token_ledger%rowtype;
begin
  select * into fp from public.family_portraits
   where owner = p_owner and member_id = p_member
   for update;
  if not found or fp.draws <= fp.delivered then
    return false;
  end if;

  update public.family_portraits
     set draws = draws - 1, lease = null, last_free = false, updated_at = now()
   where owner = p_owner and member_id = p_member;

  if fp.last_entry is not null then
    select * into led from public.token_ledger
     where id = fp.last_entry and owner = p_owner
     for update;
    if found and led.refunded_at is null then
      update public.token_ledger set refunded_at = now() where id = led.id;
      update public.profiles set tokens = tokens + led.amount where id = led.owner;
    end if;
  end if;

  -- 무료 횟수로 한 그리기였으면 그 한 번을 돌려준다(2026-10-19)
  if fp.last_free then
    insert into public.family_draw_credits (owner, free_left) values (p_owner, 1)
      on conflict (owner) do update set free_left = least(public.family_draw_credits.free_left + 1, 1000), updated_at = now();
  end if;
  return true;
end; $$;
revoke all on function public.family_portrait_undo(uuid, text) from public, anon, authenticated;


-- 그리기 값 받기 — 쿠키가 나갈 그리기면 무료 횟수부터 쓴다(2026-10-19). 그 밖의 셈은 그대로.
create or replace function public.charge_family_portrait(p_member text, p_expected integer default null)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  me       public.profiles%rowtype;
  fp       public.family_portraits%rowtype;
  v_amount integer;
  v_entry  uuid;
  v_lease  uuid;
  v_left   integer;
  v_free   integer := 0;
  v_used   boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_member is null or p_member !~ '^[a-z0-9-]{1,40}$' then
    raise exception '가족 id 가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception '회원 정보를 찾을 수 없습니다.' using errcode = '42501';
  end if;

  -- 마스터는 면제. 세지도 않는다 — 점검하느라 여러 번 그리는 계정이다.
  if me.is_master then
    return json_build_object('status', 'ok', 'charged', 0, 'entry', null, 'draw', 0, 'lease', null, 'tokens', me.tokens);
  end if;

  insert into public.family_portraits (owner, member_id) values (me.id, p_member)
    on conflict (owner, member_id) do nothing;
  -- 잠근다 — 같은 사람을 두 번 동시에 누르면 둘 다 '처음(2)'이나 둘 다 '무료'로 세어지지 않게.
  select * into fp from public.family_portraits
   where owner = me.id and member_id = p_member
   for update;

  -- 앞 그리기가 아직 안 끝났다
  if fp.draws > fp.delivered then
    if fp.updated_at > now() - interval '90 seconds' then
      return json_build_object(
        'status', 'busy',
        'draws', fp.draws,
        'retry_after', greatest(1, ceil(extract(epoch from (fp.updated_at + interval '90 seconds' - now()))))::integer,
        'tokens', me.tokens);
    end if;
    perform public.family_portrait_undo(me.id, p_member);
    select * into fp from public.family_portraits
     where owner = me.id and member_id = p_member;
  end if;

  if fp.draws <= 0 then
    v_amount := 2;          -- 처음 그리기(다시 그리기 1번 포함)
  elsif fp.draws = 1 then
    v_amount := 0;          -- 포함된 다시 그리기
  else
    v_amount := 1;          -- 그 뒤 다시 그리기
  end if;

  -- 관리실이 더해 준 무료 횟수 — 잠그고 읽는다(두 번 눌러 둘 다 무료가 되지 않게).
  select free_left into v_free from public.family_draw_credits where owner = me.id for update;
  v_free := coalesce(v_free, 0);
  -- 쿠키가 나갈 그리기에만 쓰고, 화면이 '무료'로 보여 준 그리기(보낸 값 < 값)이거나 보낸 값이 없을 때만 쓴다.
  -- 화면이 쿠키로 보여 준 그리기는 쿠키로 받는다 — 여러 명을 한꺼번에 그릴 때 요청이 닿는 순서와 상관없이
  -- 누가 무료인지 화면과 서버가 같게.
  if v_amount > 0 and v_free > 0 and (p_expected is null or p_expected < v_amount) then
    v_used := true;
    v_amount := 0;
  end if;

  if p_expected is not null and v_amount > p_expected then
    select tokens into v_left from public.profiles where id = me.id;
    return json_build_object('status', 'price', 'cost', v_amount, 'draws', fp.draws, 'tokens', v_left, 'free_left', v_free);
  end if;

  if v_used then
    update public.family_draw_credits set free_left = free_left - 1, updated_at = now() where owner = me.id;
    v_free := v_free - 1;
  end if;

  if v_amount > 0 then
    v_entry := public.spend_tokens(v_amount, 'family-portrait');   -- 모자라면 22003 으로 던진다
  else
    v_entry := null;        -- spend_tokens 는 0 을 거절한다 — 무료분은 장부 없이
  end if;

  v_lease := gen_random_uuid();
  update public.family_portraits
     set draws = draws + 1, last_entry = v_entry, lease = v_lease, last_free = v_used, updated_at = now()
   where owner = me.id and member_id = p_member
   returning draws into fp.draws;

  select tokens into v_left from public.profiles where id = me.id;
  return json_build_object('status', 'ok', 'charged', v_amount, 'entry', v_entry,
                           'draw', fp.draws, 'lease', v_lease, 'tokens', v_left,
                           'free_used', v_used, 'free_left', v_free);
end; $$;
revoke all on function public.charge_family_portrait(text, integer) from public, anon;
grant execute on function public.charge_family_portrait(text, integer) to authenticated;


-- 관리자 — 무료 횟수 더해 주기(1~10번, 사유 필수). 다른 관리자 계정에는 못 준다(관리자는 원래 값이 안 나간다).
create or replace function public.master_grant_family_draws(p_owner uuid, p_amount integer, p_note text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_name text;
  v_master boolean;
  v_who  text;
  v_left integer;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select username, coalesce(is_master, false) into v_name, v_master from public.profiles where id = p_owner;
  if not found then
    raise exception '회원을 찾지 못했어요.' using errcode = '22023';
  end if;
  if v_master then
    raise exception '관리자 계정은 원래 값이 나가지 않아요.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10 then
    raise exception '한 번에 1~10번까지 더해 줄 수 있어요.' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) < 2 then
    raise exception '왜 더해 주는지 두 글자 이상 적어 주세요.' using errcode = '22023';
  end if;
  if length(v_note) > 500 then
    raise exception '사유는 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  insert into public.family_draw_credits (owner, free_left) values (p_owner, p_amount)
    on conflict (owner) do update set free_left = least(public.family_draw_credits.free_left + p_amount, 1000), updated_at = now()
  returning free_left into v_left;
  select username into v_who from public.profiles where id = auth.uid();
  insert into public.family_draw_grants (owner, owner_username, amount, note, granted_by, granted_by_username)
  values (p_owner, v_name, p_amount, v_note, auth.uid(), v_who);
  return json_build_object('ok', true, 'free_left', v_left);
end; $$;
revoke all on function public.master_grant_family_draws(uuid, integer, text) from public, anon;
grant execute on function public.master_grant_family_draws(uuid, integer, text) to authenticated;

-- 관리자 — 남은 무료 횟수와 더해 준 기록(최근 30줄)
create or replace function public.master_family_draws(p_owner uuid)
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return json_build_object(
    'free_left', coalesce((select free_left from public.family_draw_credits where owner = p_owner), 0),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object('amount', g.amount, 'note', g.note, 'by', g.granted_by_username, 'at', g.at)
                       order by g.at desc, g.id desc)
        from (select * from public.family_draw_grants x where x.owner = p_owner order by x.at desc, x.id desc limit 30) g),
      '[]'::jsonb));
end; $$;
revoke all on function public.master_family_draws(uuid) from public, anon;
grant execute on function public.master_family_draws(uuid) to authenticated;
