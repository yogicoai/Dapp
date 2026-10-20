-- 출시 전 보안 점검(2026-10-20) — DB 쪽에서 바로 고칠 수 있는 것만 모았다. 두 번 돌려도 된다(기존 자료는 지우지 않는다).
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run. (바탕화면 수파베이스-붙여넣기-1019 의 15번과 같은 내용)
--
--  ① 구글 성우 사용량 함수(tts_reserve) — 로그인 안 한 사람은 부를 수 없게, 한 번에 800자까지만, 한도는 함수 안에서 95만 자로 묶는다.
--     예전엔 비회원도 직접 불러 한도 값을 마음대로 넘길 수 있어, 한 번에 이번 달 칸을 꽉 채워 모든 손님 낭독을 멈출 수 있었다.
--     (/api/tts/google 은 같은 날 배포로 로그인한 회원의 토큰으로 부른다.)
--  ② 가격표 함수(pricing_now) — 누구나 부르는 함수라, 값을 고친 관리자 id(updated_by)는 비워서 돌려준다.
--  ③ 동화(books)의 id·주인은 회원이 직접 바꾸지 못하게 — 이름을 바꿔 '책이 없어졌다'며 값을 돌려받는 길을 막는다.
--     관리자 함수(security definer)·SQL 편집기는 그대로 된다.
--  ④ 부모 목소리(voice_clones) — 같은 목소리 id 를 두 사람이 가질 수 없게, 역할은 엄마·아빠만.
--  ⑤ 크기 상한 — 동화 본문 8MB · 아이 정보 64KB · 의견 글 4,000자. 아무나 큰 값을 넣어 DB 를 채우지 못하게.
--     ④·⑤는 NOT VALID — 이미 있는 줄은 검사하지 않고, 앞으로 넣고 고치는 줄만 본다.

-- ① ───────────────────────────────────────────────
create or replace function public.tts_reserve(p_add int, p_limit bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pd  text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  cur bigint;
  lim bigint := least(coalesce(p_limit, 0), 950000);
begin
  -- 서버는 1~800자만 보낸다 — 그 밖(0 이하·800 초과·빈 값)은 한도 초과처럼 거절하고 아무것도 더하지 않는다.
  if p_add is null or p_add < 1 or p_add > 800 then
    return -1;
  end if;

  select chars into cur from public.tts_usage where period = pd for update;
  if cur is null then
    cur := 0;
  end if;

  if cur + p_add > lim then
    return -1;
  end if;

  insert into public.tts_usage (period, chars)
  values (pd, p_add)
  on conflict (period) do update set chars = public.tts_usage.chars + p_add;

  return cur + p_add;
end;
$$;

revoke execute on function public.tts_reserve(int, bigint) from public, anon;
grant execute on function public.tts_reserve(int, bigint) to authenticated;

-- ② ───────────────────────────────────────────────
create or replace function public.pricing_now()
returns public.app_pricing
language plpgsql security definer stable
set search_path = public as $$
declare r public.app_pricing%rowtype;
begin
  select * into r from public.app_pricing where id = 1;
  if not found then
    r.id := 1;
    r.token_price_krw := 100;
    r.signup_bonus_tokens := 200;
    r.cost_text_per_page := 1;
    r.cost_illustrated_per_page := 2;
    r.cost_parent_voice := 15;
    r.max_books_per_user := 30;
    r.feedback_bonus_tokens := 100;
    r.max_free_rewrites := 2;
    r.single_book_krw := 1500;
    r.sub_weekly_krw := 2900;
    r.sub_weekly_tokens := 30;
    r.sub_monthly_krw := 9900;
    r.sub_monthly_tokens := 120;
    r.sub_yearly_krw := 99000;
    r.sub_yearly_tokens := 1440;
    r.updated_at := now();
  end if;
  -- 칸이 비어 있는 옛 줄도 기본값으로 메운다(alter 로 칸을 더한 직후 등).
  r.token_price_krw           := coalesce(r.token_price_krw, 100);
  r.signup_bonus_tokens       := coalesce(r.signup_bonus_tokens, 200);
  r.cost_text_per_page        := coalesce(r.cost_text_per_page, 1);
  r.cost_illustrated_per_page := coalesce(r.cost_illustrated_per_page, 2);
  r.cost_parent_voice         := coalesce(r.cost_parent_voice, 15);
  r.max_books_per_user        := coalesce(r.max_books_per_user, 30);
  r.feedback_bonus_tokens     := coalesce(r.feedback_bonus_tokens, 100);
  r.max_free_rewrites         := coalesce(r.max_free_rewrites, 2);
  r.single_book_krw           := coalesce(r.single_book_krw, 1500);
  r.sub_weekly_krw            := coalesce(r.sub_weekly_krw, 2900);
  r.sub_weekly_tokens         := coalesce(r.sub_weekly_tokens, 30);
  r.sub_monthly_krw           := coalesce(r.sub_monthly_krw, 9900);
  r.sub_monthly_tokens        := coalesce(r.sub_monthly_tokens, 120);
  r.sub_yearly_krw            := coalesce(r.sub_yearly_krw, 99000);
  r.sub_yearly_tokens         := coalesce(r.sub_yearly_tokens, 1440);
  -- 누구나 부르는 함수 — 고친 관리자 id 는 내보내지 않는다(표 열람 권한에서도 이 칸만 가려 두었다).
  r.updated_by := null;
  return r;
end; $$;

-- ③ ───────────────────────────────────────────────
create or replace function public.books_identity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 화면(회원·비회원 역할)에서 오는 고치기만 막는다. 관리자 함수(security definer)·SQL 편집기는 그대로.
  if current_user in ('anon', 'authenticated')
     and (new.id is distinct from old.id or new.owner is distinct from old.owner) then
    raise exception '동화의 id·주인은 바꿀 수 없어요' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists books_identity_guard on public.books;
create trigger books_identity_guard
  before update on public.books
  for each row execute function public.books_identity_guard();

-- ④ ───────────────────────────────────────────────
create unique index if not exists voice_clones_voice_uq
  on public.voice_clones (provider_voice_id)
  where provider_voice_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'voice_clones_role_ck') then
    alter table public.voice_clones add constraint voice_clones_role_ck check (role in ('mom', 'dad')) not valid;
  end if;
end $$;

-- ⑤ ───────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_data_size_ck') then
    alter table public.books add constraint books_data_size_ck check (pg_column_size(data) <= 8000000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_child_size_ck') then
    alter table public.profiles add constraint profiles_child_size_ck check (child is null or pg_column_size(child) <= 64000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_content_len_ck') then
    alter table public.feedback add constraint feedback_content_len_ck check (char_length(content) <= 4000) not valid;
  end if;
end $$;
