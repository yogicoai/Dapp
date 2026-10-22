-- ────────────────────────────────────────────────────────────────────────
-- 혜택 코드 — 요기보 회원 혜택(공용 코드) · 요기보 구매 고객 시리얼(한 번만) (2026-10-22)
-- ────────────────────────────────────────────────────────────────────────
-- 사장님(10-22 미팅): 요기보(yogibo.kr)에 회원가입하고 마케팅 수신에 동의한 고객 → 공용 코드(YOGIBO)로 동화 전체 듣기,
--   요기보에서 구매한 고객 → 난수 시리얼(한 번만)로 동화 1권 만들기. 일반 고객은 지금 정책 그대로. 웹·안드로이드 같은 화면.
--
-- 표: promo_codes(코드 한 줄 — 공용은 한 줄, 시리얼은 한 장에 한 줄) · promo_redemptions(누가 언제 어떤 코드를 썼나) ·
--     promo_attempts(틀린 입력 세기 — 마구 넣어 보기 막기) · credit_ai_budget(요금제 없이 크레딧으로 만드는 사람의 AI 한도).
-- 혜택은 이미 있는 장부에 그대로 더한다 — 동화 크레딧(book_credits, 11번) · 캐릭터 생성 크레딧(family_draw_credits, 10번).
--   쓰는 길(대본 값 charge_story p_use_credit · 가족 그리기 charge_family_portrait)은 예전과 같다.
--   전체 듣기는 promo_redemptions.library_until 까지 — 화면이 책장 단계를 '가족 패스'로 본다.
--
-- 요금제 없이 크레딧으로 만드는 사람의 한도(시리얼 1장으로 쓸 수 있는 돈을 1권 값 언저리로 묶는다):
--   · 동화 크레딧이 1권 생길 때마다(관리실 보상·혜택 코드) 줄거리 8번
--   · 그 크레딧으로 대본을 받으면 그 책 그림 (쪽수 × 2 + 10)장과 이틀의 마무리 시간(그림 올리기·다시 쓰기)
--   서버 문지기(credit_gate)가 AI 를 부르기 전에 하나씩 깎는다 — 화면을 건너뛰고 경로를 직접 불러도 같다.
--   결제 요금제 회원·관리자는 여기를 지나지 않는다(lib/create-access-server).
--
-- 10번·11번 SQL 다음에 돌린다. 여러 번 돌려도 안전하다. 서비스 키는 쓰지 않는다.
-- ────────────────────────────────────────────────────────────────────────

create table if not exists public.promo_codes (
  id                  bigint generated always as identity primary key,
  code                text not null unique check (code ~ '^[A-Z0-9]{4,24}$'),
  kind                text not null check (kind in ('shared', 'serial')),
  label               text not null check (length(btrim(label)) between 2 and 60),
  book_credits        integer not null default 0 check (book_credits between 0 and 10),
  draw_credits        integer not null default 0 check (draw_credits between 0 and 10),
  library_until       timestamptz,
  library_days        integer check (library_days between 1 and 3650),
  ends_at             timestamptz,
  max_uses            integer check (max_uses is null or max_uses >= 1),
  used_count          integer not null default 0 check (used_count >= 0),
  active              boolean not null default true,
  created_by          uuid references auth.users(id) on delete set null,
  created_by_username text,
  created_at          timestamptz not null default now(),
  constraint promo_codes_has_benefit check (book_credits > 0 or draw_credits > 0 or library_until is not null or library_days is not null),
  constraint promo_codes_one_library check (library_until is null or library_days is null)
);
create index if not exists promo_codes_kind_label_idx on public.promo_codes (kind, label);
alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;
-- 정책 없음 — 코드 목록은 아무도 표로 못 읽는다(시리얼이 새지 않게). 손님은 redeem_promo_code, 관리실은 master_* 함수로만.

create table if not exists public.promo_redemptions (
  id             bigint generated always as identity primary key,
  code_id        bigint not null references public.promo_codes(id) on delete cascade,
  owner          uuid references auth.users(id) on delete set null,
  owner_username text,
  label          text not null,
  book_credits   integer not null default 0,
  draw_credits   integer not null default 0,
  library_until  timestamptz,
  at             timestamptz not null default now()
);
-- 한 계정은 같은 코드를 한 번만(탈퇴로 계정이 지워지면 owner 가 비지만 시리얼의 '쓴 횟수'는 그대로 남는다)
create unique index if not exists promo_redemptions_once on public.promo_redemptions (code_id, owner);
create index if not exists promo_redemptions_owner_idx on public.promo_redemptions (owner, at desc);
alter table public.promo_redemptions enable row level security;
revoke all on public.promo_redemptions from anon, authenticated;
grant select (id, owner, label, book_credits, draw_credits, library_until, at) on public.promo_redemptions to authenticated;
drop policy if exists "promo_redemptions 본인 열람" on public.promo_redemptions;
create policy "promo_redemptions 본인 열람" on public.promo_redemptions
  for select to authenticated using (auth.uid() = owner);

create table if not exists public.promo_attempts (
  id    bigint generated always as identity primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  ok    boolean not null,
  at    timestamptz not null default now()
);
create index if not exists promo_attempts_owner_idx on public.promo_attempts (owner, at desc);
alter table public.promo_attempts enable row level security;
revoke all on public.promo_attempts from anon, authenticated;

create table if not exists public.credit_ai_budget (
  owner         uuid primary key references auth.users(id) on delete cascade,
  outlines_left integer not null default 0 check (outlines_left between 0 and 1000),
  images_left   integer not null default 0 check (images_left between 0 and 5000),
  story_until   timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.credit_ai_budget enable row level security;
revoke all on public.credit_ai_budget from anon, authenticated;
grant select (owner, outlines_left, images_left, story_until, updated_at) on public.credit_ai_budget to authenticated;
drop policy if exists "credit_ai_budget 본인 열람" on public.credit_ai_budget;
create policy "credit_ai_budget 본인 열람" on public.credit_ai_budget
  for select to authenticated using (auth.uid() = owner);


-- 동화 크레딧이 생기면(관리실 보상 · 혜택 코드 — 둘 다 book_credit_grants 에 한 줄) 1권마다 줄거리 8번
create or replace function public.credit_budget_on_book_grant()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if new.owner is not null and new.amount > 0 then
    insert into public.credit_ai_budget (owner, outlines_left) values (new.owner, least(new.amount * 8, 1000))
      on conflict (owner) do update
        set outlines_left = least(public.credit_ai_budget.outlines_left + new.amount * 8, 1000), updated_at = now();
  end if;
  return new;
end; $$;
revoke all on function public.credit_budget_on_book_grant() from public, anon, authenticated;
drop trigger if exists book_credit_grants_budget on public.book_credit_grants;
create trigger book_credit_grants_budget after insert on public.book_credit_grants
  for each row execute function public.credit_budget_on_book_grant();
-- 이 SQL 전에 이미 받은 동화 크레딧에도 줄거리 한도를 채워 둔다(처음 한 번 — 한도 줄이 있으면 건드리지 않는다)
insert into public.credit_ai_budget (owner, outlines_left)
select owner, least(free_left * 8, 1000) from public.book_credits where free_left > 0
on conflict (owner) do nothing;

-- 동화 크레딧으로 대본을 받으면(story_charges.credit_topup > 0) 그 책 그림 (쪽수 × 2 + 10)장과 이틀.
-- 대본이 실패해 되돌리면(refund_story 가 그 줄을 지운다) 더했던 그림 한도를 다시 뺀다.
create or replace function public.credit_budget_on_story()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  n integer;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.credit_topup, 0) > 0 then
      n := coalesce(new.pages, 6) * 2 + 10;
      insert into public.credit_ai_budget (owner, images_left, story_until)
      values (new.owner, least(n, 5000), now() + interval '2 days')
        on conflict (owner) do update
          set images_left = least(public.credit_ai_budget.images_left + n, 5000),
              story_until = greatest(coalesce(public.credit_ai_budget.story_until, now()), now() + interval '2 days'),
              updated_at  = now();
    end if;
    return new;
  end if;
  if coalesce(old.credit_topup, 0) > 0 then
    n := coalesce(old.pages, 6) * 2 + 10;
    update public.credit_ai_budget set images_left = greatest(0, images_left - n), updated_at = now() where owner = old.owner;
  end if;
  return old;
end; $$;
revoke all on function public.credit_budget_on_story() from public, anon, authenticated;
drop trigger if exists story_charges_credit_budget on public.story_charges;
create trigger story_charges_credit_budget after insert or delete on public.story_charges
  for each row execute function public.credit_budget_on_story();


-- 서버 문지기 — 결제 요금제도 관리자도 아닌 사람이 AI 경로를 부를 때(lib/create-access-server).
--   outline  줄거리: 동화 크레딧이 남았거나 크레딧 책을 마무리하는 중이고, 줄거리 한도가 남았으면 1 깎고 통과
--   story    대본: 동화 크레딧이 남았거나 마무리 중이면 통과(값은 charge_story 가 받는다 — 대본을 쓰기 전에)
--   image    쪽 그림·인물/장소 시트: 마무리 중이고 그림 한도가 남았으면 1 깎고 통과
--   upload   그림 올리기(AI 값 없음): 마무리 중이면 통과
--   portrait 가족 그리기: 캐릭터 생성 크레딧이 남았으면 통과(값은 charge_family_portrait 가 크레딧으로 받는다)
create or replace function public.credit_gate(p_kind text)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_books integer;
  v_draws integer;
  b       public.credit_ai_budget%rowtype;
  v_has   boolean;
  v_live  boolean;
begin
  if v_uid is null then
    return false;
  end if;
  if p_kind = 'portrait' then
    select free_left into v_draws from public.family_draw_credits where owner = v_uid;
    return coalesce(v_draws, 0) > 0;
  end if;

  select free_left into v_books from public.book_credits where owner = v_uid;
  v_books := coalesce(v_books, 0);
  select * into b from public.credit_ai_budget where owner = v_uid for update;
  v_has := found;
  v_live := v_has and b.story_until is not null and b.story_until > now();

  if p_kind = 'outline' then
    if (v_books > 0 or v_live) and v_has and b.outlines_left > 0 then
      update public.credit_ai_budget set outlines_left = outlines_left - 1, updated_at = now() where owner = v_uid;
      return true;
    end if;
    return false;
  elsif p_kind = 'story' then
    return v_books > 0 or v_live;
  elsif p_kind = 'image' then
    if v_live and b.images_left > 0 then
      update public.credit_ai_budget set images_left = images_left - 1, updated_at = now() where owner = v_uid;
      return true;
    end if;
    return false;
  elsif p_kind = 'upload' then
    return v_live;
  end if;
  return false;
end; $$;
revoke all on function public.credit_gate(text) from public, anon;
grant execute on function public.credit_gate(text) to authenticated;


-- 시리얼 글자 — 32자(0·O·1·I 없음)에서 고른다. gen_random_uuid() 는 강한 난수(pg_strong_random)이고,
-- 판 번호가 든 바이트(6번째)는 건너뛴다. 32 는 2의 거듭제곱이라 % 32 가 한쪽으로 치우치지 않는다.
create or replace function public.promo_random_code(p_len integer)
returns text
language plpgsql volatile
set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b   bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  out text := '';
  i   integer := 0;
begin
  if p_len is null or p_len < 4 or p_len > 24 then
    raise exception '코드 길이가 올바르지 않습니다.' using errcode = '22023';
  end if;
  while length(out) < p_len loop
    if i % 16 <> 6 then
      out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end if;
    i := i + 1;
  end loop;
  return out;
end; $$;
revoke all on function public.promo_random_code(integer) from public, anon, authenticated;


-- 손님 — 코드 넣기. 실패도 기록해야 해서(마구 넣어 보기 막기) 오류를 던지지 않고 { ok:false, reason } 으로 돌려준다.
--   reason: not_found(없는 코드) · ended(기간 끝·꺼짐) · used(이미 쓴 시리얼) · too_many(한 시간에 10번 틀림)
-- 같은 계정이 같은 코드를 다시 넣으면 더하지 않고 그때 받은 것을 돌려준다(already).
create or replace function public.redeem_promo_code(p_code text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_name  text;
  v_fails integer;
  v_until timestamptz;
  c       public.promo_codes%rowtype;
  v_prev  public.promo_redemptions%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  select count(*) into v_fails from public.promo_attempts
   where owner = v_uid and not ok and at > now() - interval '1 hour';
  if v_fails >= 10 then
    return json_build_object('ok', false, 'reason', 'too_many');
  end if;

  if length(v_code) between 4 and 24 then
    select * into c from public.promo_codes where code = v_code for update;
  end if;
  if c.id is null then
    insert into public.promo_attempts (owner, ok) values (v_uid, false);
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_prev from public.promo_redemptions where code_id = c.id and owner = v_uid;
  if found then
    return json_build_object('ok', true, 'already', true, 'kind', c.kind, 'label', v_prev.label,
                             'book_credits', v_prev.book_credits, 'draw_credits', v_prev.draw_credits,
                             'library_until', v_prev.library_until);
  end if;
  if not c.active or (c.ends_at is not null and c.ends_at <= now()) then
    insert into public.promo_attempts (owner, ok) values (v_uid, false);
    return json_build_object('ok', false, 'reason', 'ended');
  end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then
    insert into public.promo_attempts (owner, ok) values (v_uid, false);
    return json_build_object('ok', false, 'reason', 'used');
  end if;

  v_until := case
    when c.library_until is not null then c.library_until
    when c.library_days is not null then now() + make_interval(days => c.library_days)
  end;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.promo_redemptions (code_id, owner, owner_username, label, book_credits, draw_credits, library_until)
  values (c.id, v_uid, v_name, c.label, c.book_credits, c.draw_credits, v_until);
  update public.promo_codes set used_count = used_count + 1 where id = c.id;

  if c.book_credits > 0 then
    insert into public.book_credits (owner, free_left) values (v_uid, c.book_credits)
      on conflict (owner) do update
        set free_left = least(public.book_credits.free_left + c.book_credits, 1000), updated_at = now();
    insert into public.book_credit_grants (owner, owner_username, amount, note, granted_by, granted_by_username)
    values (v_uid, v_name, c.book_credits, '혜택 코드 — ' || c.label, null, '혜택 코드');
  end if;
  if c.draw_credits > 0 then
    insert into public.family_draw_credits (owner, free_left) values (v_uid, c.draw_credits)
      on conflict (owner) do update
        set free_left = least(public.family_draw_credits.free_left + c.draw_credits, 1000), updated_at = now();
    insert into public.family_draw_grants (owner, owner_username, amount, note, granted_by, granted_by_username)
    values (v_uid, v_name, c.draw_credits, '혜택 코드 — ' || c.label, null, '혜택 코드');
  end if;
  insert into public.promo_attempts (owner, ok) values (v_uid, true);

  return json_build_object('ok', true, 'already', false, 'kind', c.kind, 'label', c.label,
                           'book_credits', c.book_credits, 'draw_credits', c.draw_credits, 'library_until', v_until);
end; $$;
revoke all on function public.redeem_promo_code(text) from public, anon;
grant execute on function public.redeem_promo_code(text) to authenticated;


-- ── 관리실 ──────────────────────────────────────────────────────────────

-- 혜택 값 검사(공용 코드·시리얼 묶음 공통) — 틀리면 한국어로 막는다
create or replace function public.promo_check_benefit(
  p_label text, p_book integer, p_draw integer, p_library_until timestamptz, p_library_days integer, p_ends_at timestamptz
)
returns void
language plpgsql immutable
set search_path = public as $$
begin
  if p_label is null or length(btrim(p_label)) < 2 or length(btrim(p_label)) > 60 then
    raise exception '이름은 2~60자로 적어 주세요.' using errcode = '22023';
  end if;
  if coalesce(p_book, 0) not between 0 and 10 or coalesce(p_draw, 0) not between 0 and 10 then
    raise exception '동화·캐릭터는 0~10까지 줄 수 있어요.' using errcode = '22023';
  end if;
  if p_library_until is not null and p_library_days is not null then
    raise exception '전체 듣기는 끝나는 날과 일수 중 하나만 정해 주세요.' using errcode = '22023';
  end if;
  if p_library_days is not null and p_library_days not between 1 and 3650 then
    raise exception '전체 듣기 일수는 1~3650일이에요.' using errcode = '22023';
  end if;
  if coalesce(p_book, 0) = 0 and coalesce(p_draw, 0) = 0 and p_library_until is null and p_library_days is null then
    raise exception '줄 혜택을 하나 이상 골라 주세요.' using errcode = '22023';
  end if;
end; $$;
revoke all on function public.promo_check_benefit(text, integer, integer, timestamptz, integer, timestamptz) from public, anon, authenticated;

-- 공용 코드 만들기(예: YOGIBO) — 몇 명이 써도 되고, 한 계정은 한 번
create or replace function public.master_create_promo_code(
  p_code text, p_label text, p_book integer, p_draw integer,
  p_library_until timestamptz, p_library_days integer, p_ends_at timestamptz
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_who  text;
  v_id   bigint;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9]{4,24}$' then
    raise exception '코드는 영문·숫자 4~24자예요.' using errcode = '22023';
  end if;
  perform public.promo_check_benefit(p_label, p_book, p_draw, p_library_until, p_library_days, p_ends_at);
  if exists (select 1 from public.promo_codes where code = v_code) then
    raise exception '이미 있는 코드예요.' using errcode = '23505';
  end if;
  select username into v_who from public.profiles where id = auth.uid();
  insert into public.promo_codes (code, kind, label, book_credits, draw_credits, library_until, library_days, ends_at,
                                  max_uses, created_by, created_by_username)
  values (v_code, 'shared', btrim(p_label), coalesce(p_book, 0), coalesce(p_draw, 0), p_library_until, p_library_days,
          p_ends_at, null, auth.uid(), v_who)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'code', v_code);
end; $$;
revoke all on function public.master_create_promo_code(text, text, integer, integer, timestamptz, integer, timestamptz) from public, anon;
grant execute on function public.master_create_promo_code(text, text, integer, integer, timestamptz, integer, timestamptz) to authenticated;

-- 시리얼 묶음 만들기 — 12자리 난수 N장(한 장 한 번만). 이름(label)이 묶음을 가른다.
create or replace function public.master_create_promo_serials(
  p_label text, p_count integer, p_book integer, p_draw integer,
  p_library_until timestamptz, p_library_days integer, p_ends_at timestamptz
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_who   text;
  v_made  integer := 0;
  v_tries integer := 0;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 2000 then
    raise exception '한 번에 1~2000장까지 만들 수 있어요.' using errcode = '22023';
  end if;
  perform public.promo_check_benefit(v_label, p_book, p_draw, p_library_until, p_library_days, p_ends_at);
  if exists (select 1 from public.promo_codes where kind = 'serial' and label = v_label) then
    raise exception '같은 이름의 시리얼 묶음이 있어요. 다른 이름으로 만들어 주세요.' using errcode = '23505';
  end if;
  select username into v_who from public.profiles where id = auth.uid();
  while v_made < p_count loop
    v_tries := v_tries + 1;
    if v_tries > p_count * 3 + 10 then
      raise exception '시리얼을 만들지 못했어요. 다시 해 주세요.' using errcode = 'P0001';
    end if;
    insert into public.promo_codes (code, kind, label, book_credits, draw_credits, library_until, library_days, ends_at,
                                    max_uses, created_by, created_by_username)
    values (public.promo_random_code(12), 'serial', v_label, coalesce(p_book, 0), coalesce(p_draw, 0), p_library_until,
            p_library_days, p_ends_at, 1, auth.uid(), v_who)
    on conflict (code) do nothing;
    if found then
      v_made := v_made + 1;
    end if;
  end loop;
  return json_build_object('ok', true, 'label', v_label, 'count', v_made);
end; $$;
revoke all on function public.master_create_promo_serials(text, integer, integer, integer, timestamptz, integer, timestamptz) from public, anon;
grant execute on function public.master_create_promo_serials(text, integer, integer, integer, timestamptz, integer, timestamptz) to authenticated;

-- 한눈에 — 공용 코드 줄들 · 시리얼 묶음(이름별 장수·쓴 장수)
create or replace function public.master_promo_overview()
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return json_build_object(
    'shared', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'code', c.code, 'label', c.label, 'book_credits', c.book_credits, 'draw_credits', c.draw_credits,
               'library_until', c.library_until, 'library_days', c.library_days, 'ends_at', c.ends_at,
               'used', c.used_count, 'active', c.active, 'created_at', c.created_at, 'by', c.created_by_username)
             order by c.created_at desc, c.id desc)
        from public.promo_codes c where c.kind = 'shared'), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(x.b order by x.made desc)
        from (select min(c.created_at) as made,
                     jsonb_build_object(
                       'label', c.label, 'total', count(*), 'used', count(*) filter (where c.used_count > 0),
                       'active', count(*) filter (where c.active),
                       'book_credits', max(c.book_credits), 'draw_credits', max(c.draw_credits),
                       'library_until', max(c.library_until), 'library_days', max(c.library_days), 'ends_at', max(c.ends_at),
                       'created_at', min(c.created_at), 'by', max(c.created_by_username)) as b
                from public.promo_codes c where c.kind = 'serial' group by c.label) x), '[]'::jsonb));
end; $$;
revoke all on function public.master_promo_overview() from public, anon;
grant execute on function public.master_promo_overview() to authenticated;

-- 시리얼 묶음 내려받기용 — 코드 · 썼나 · 쓴 때
create or replace function public.master_promo_batch_codes(p_label text)
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', c.code, 'used', c.used_count > 0, 'active', c.active,
             'used_at', (select min(r.at) from public.promo_redemptions r where r.code_id = c.id))
           order by c.id)
      from public.promo_codes c where c.kind = 'serial' and c.label = btrim(coalesce(p_label, ''))), '[]'::jsonb);
end; $$;
revoke all on function public.master_promo_batch_codes(text) from public, anon;
grant execute on function public.master_promo_batch_codes(text) to authenticated;

-- 코드 하나 찾기(문의 응대 — "시리얼이 안 돼요") — 어떤 코드인지와 누가 언제 썼는지
create or replace function public.master_promo_lookup(p_code text)
returns json
language plpgsql security definer stable
set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c      public.promo_codes%rowtype;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select * into c from public.promo_codes where code = v_code;
  if not found then
    return json_build_object('found', false);
  end if;
  return json_build_object(
    'found', true, 'id', c.id, 'code', c.code, 'kind', c.kind, 'label', c.label, 'active', c.active, 'ends_at', c.ends_at,
    'used', c.used_count, 'max_uses', c.max_uses,
    'uses', coalesce((
      select jsonb_agg(jsonb_build_object('who', r.owner_username, 'at', r.at) order by r.at desc)
        from (select * from public.promo_redemptions x where x.code_id = c.id order by x.at desc limit 20) r), '[]'::jsonb));
end; $$;
revoke all on function public.master_promo_lookup(text) from public, anon;
grant execute on function public.master_promo_lookup(text) to authenticated;

-- 공용 코드 고치기 — 켜고 끄기 · 넣을 수 있는 마지막 때 · 전체 듣기 끝나는 날(이미 넣은 사람도 같이 바뀐다)
create or replace function public.master_update_promo_code(
  p_id bigint, p_active boolean, p_ends_at timestamptz, p_library_until timestamptz
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  c public.promo_codes%rowtype;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select * into c from public.promo_codes where id = p_id and kind = 'shared' for update;
  if not found then
    raise exception '코드를 찾지 못했어요.' using errcode = '22023';
  end if;
  if c.library_until is not null and p_library_until is null then
    raise exception '전체 듣기 끝나는 날을 비울 수 없어요.' using errcode = '22023';
  end if;
  update public.promo_codes
     set active = coalesce(p_active, active),
         ends_at = p_ends_at,
         library_until = case when c.library_until is not null then p_library_until else library_until end
   where id = p_id;
  if c.library_until is not null and p_library_until is distinct from c.library_until then
    update public.promo_redemptions set library_until = p_library_until where code_id = p_id;
  end if;
  return json_build_object('ok', true);
end; $$;
revoke all on function public.master_update_promo_code(bigint, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.master_update_promo_code(bigint, boolean, timestamptz, timestamptz) to authenticated;

-- 시리얼 묶음 고치기 — 켜고 끄기 · 넣을 수 있는 마지막 때(이미 쓴 시리얼의 혜택은 그대로)
create or replace function public.master_update_promo_batch(p_label text, p_active boolean, p_ends_at timestamptz)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  n integer;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  update public.promo_codes
     set active = coalesce(p_active, active), ends_at = p_ends_at
   where kind = 'serial' and label = btrim(coalesce(p_label, ''));
  get diagnostics n = row_count;
  if n = 0 then
    raise exception '시리얼 묶음을 찾지 못했어요.' using errcode = '22023';
  end if;
  return json_build_object('ok', true, 'count', n);
end; $$;
revoke all on function public.master_update_promo_batch(text, boolean, timestamptz) from public, anon;
grant execute on function public.master_update_promo_batch(text, boolean, timestamptz) to authenticated;


-- 요기보 회원 혜택(마케팅 수신동의 고객) — 공용 코드 YOGIBO: 세계명작·전래동화 전체 듣기, 2026-12-31 까지(관리실에서 바꾼다)
insert into public.promo_codes (code, kind, label, library_until, ends_at, created_by_username)
values ('YOGIBO', 'shared', '요기보 회원 혜택(마케팅 수신동의)', '2026-12-31 23:59:59+09', '2026-12-31 23:59:59+09', 'SQL')
on conflict (code) do nothing;


-- 확인
select
  (select count(*) from public.promo_codes where code = 'YOGIBO') as "요기보_공용코드",
  exists (select 1 from pg_proc where proname = 'redeem_promo_code') as "코드넣기_함수",
  exists (select 1 from pg_proc where proname = 'credit_gate') as "만들기_문지기",
  exists (select 1 from pg_trigger where tgname = 'story_charges_credit_budget') as "그림한도_트리거";
