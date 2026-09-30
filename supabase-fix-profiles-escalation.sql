-- ════════════════════════════════════════════════════════════════════════
-- 회원 줄(profiles)을 지우고 다시 넣어 스스로 관리자가 되는 길 막기 (2026-09-30)
-- ════════════════════════════════════════════════════════════════════════
--
-- 쓰는 법: Supabase → SQL Editor 에 이 파일을 통째로 붙여넣고 Run.
--          supabase-setup.sql 에도 같은 내용이 들어 있다(그 파일을 통째로 다시 돌려도 된다).
--
-- ✅ 몇 번을 돌려도 안전하다. 권한을 걷고, 정책·함수·지킴이를 갈아 끼우기만 한다.
--    회원·토큰·장부·책·목소리 어느 줄도 지우거나 바꾸지 않는다.
--
-- ── 무엇이 뚫려 있었나 ──────────────────────────────────────────────────
--
--  9월 14일에 "회원은 profiles 에서 child 칸만 고칠 수 있다"(setup 9번)로 토큰·관리자 칸
--  **고치기**는 막았다. 그런데 **지우기**와 **새로 넣기**는 그대로 열려 있었다.
--    · 정책 "profiles: 본인" 이 for all 이라 넣기·지우기도 "내 줄이면 된다"였고,
--    · Supabase 는 새 표를 만들면 로그인한 사람(authenticated)에게 넣기·지우기 권한을 통째로 준다.
--  그래서 로그인한 사람이 브라우저 콘솔에서 두 줄이면 끝났다.
--
--    await supabase.from('profiles').delete().eq('id', 내id)
--    await supabase.from('profiles').insert({ id: 내id, username: '아무거나', tokens: 999999, is_master: true })
--
--  → 토큰 999999 + 관리자. 관리실(전 회원 목록·환불·충전)이 다 열리고 다른 회원에게 토큰도 준다.
--  (2026-09-30 시험대에서 그대로 재현했다. 의견 표 feedback 은 이미 이렇게 막아 두었다 — setup 24번.)
--
-- ── 어떻게 막나 (세 겹) ─────────────────────────────────────────────────
--
--  ① 정책을 "본인 열람"·"본인 고치기" 둘로 나눈다. 넣기·지우기 정책은 없다.
--  ② 표 권한 — 로그인한 사람·비회원에게서 넣기·지우기(·비우기) 권한을 걷는다.
--     고치기는 지금처럼 child 칸만.
--  ③ 지킴이(profiles_guard) — 누가 나중에 권한을 실수로 다시 열어도, 앱을 쓰는 사람(anon·authenticated)은
--     회원 줄을 넣거나 지우지 못하고 토큰·관리자·아이디·의견 보상 칸을 바꾸지 못한다.
--     토큰을 깎고 채우는 함수들(spend_tokens·grant_tokens 등)과 SQL 편집기는 그대로 된다.
--
--  같이 막는 것 — 같은 모양(권한은 통째로 열려 있고 정책만 막는)의 다른 표와 함수:
--  ④ token_ledger(토큰 장부) · story_charges(대본 값 기록) · tts_usage(음성 사용량)
--     — 쓰기 정책이 없어 지금도 막혀 있다. 권한까지 걷어 두 겹으로 한다(family_portraits 와 같다).
--  ⑤ tts_reserve — 글자 수에 음수를 넣어 이번 달 사용량을 깎는 길을 막는다
--     (깎으면 무료 한도를 넘어도 성우 합성이 안 멈춰 요금이 나간다. 이 함수는 비회원도 부른다).
--
-- ── 회원에게 달라지는 것: 없다 ─────────────────────────────────────────
--  가입(트리거가 회원 줄을 만든다) · 아이 정보 저장 · 토큰 쓰기·되돌리기 · 의견 보상 · 관리실은
--  전부 함수나 child 칸으로 돌기 때문에 그대로다. 앱 코드에는 회원 줄을 넣거나 지우는 곳이 없다.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- ① 정책 — "본인" 하나(for all)를 "본인 열람" · "본인 고치기" 둘로
-- ────────────────────────────────────────────────────────────────────────
drop policy if exists "profiles: 본인" on public.profiles;

drop policy if exists "profiles: 본인 열람" on public.profiles;
create policy "profiles: 본인 열람" on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: 본인 고치기" on public.profiles;
create policy "profiles: 본인 고치기" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- "profiles: 마스터 열람"(select)은 그대로 둔다.


-- ────────────────────────────────────────────────────────────────────────
-- ② 표 권한 — 넣기·지우기를 걷는다. 고치기는 child 칸만 (setup 9번과 같게 다시 적는다)
-- ────────────────────────────────────────────────────────────────────────
-- 새 회원 줄은 가입 트리거(handle_new_user, security definer)가 만든다 — 이 권한이 없어도 된다.
-- 계정을 지우면(Supabase Auth) auth.users 에서 연쇄로 지워진다 — 이것도 이 권한과 상관없다.
-- (아래 ③ 지킴이가 이 칸을 본다. setup 1번에 이미 있는 칸이다 — 옛 DB 에 없을 때만 붙는다.)
alter table public.profiles add column if not exists feedback_reward_at timestamptz;
revoke insert, delete, truncate on public.profiles from authenticated;
revoke insert, update, delete, truncate on public.profiles from anon;
revoke update on public.profiles from authenticated;
grant  update (child) on public.profiles to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- ③ 지킴이 — 앱을 쓰는 사람은 회원 줄을 넣고 지우거나 돈·권한 칸을 못 바꾼다
-- ────────────────────────────────────────────────────────────────────────
-- current_user 로 가른다. 브라우저·서버가 PostgREST 로 들어오면 anon 이나 authenticated 다.
-- security definer 함수(spend_tokens·grant_tokens·submit_feedback·handle_new_user …) 안에서는
-- 함수 주인(postgres)이 되고, SQL 편집기도 postgres, 서버 관리 키는 service_role 이다 → 그대로 통과.
-- 그래서 이 함수는 **security definer 로 만들면 안 된다**(그러면 늘 주인으로 보여 아무것도 못 막는다).
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception '회원 정보는 가입할 때 자동으로만 만들어져요.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception '회원 정보는 직접 지울 수 없어요.' using errcode = '42501';
  end if;
  if new.id                 is distinct from old.id
     or new.username        is distinct from old.username
     or new.tokens          is distinct from old.tokens
     or new.is_master       is distinct from old.is_master
     or new.feedback_reward_at is distinct from old.feedback_reward_at
     or new.created_at      is distinct from old.created_at then
    raise exception '토큰·관리자·아이디 칸은 직접 바꿀 수 없어요.' using errcode = '42501';
  end if;
  return new;
end; $$;

revoke all on function public.profiles_guard() from public, anon, authenticated;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update or delete on public.profiles
  for each row execute function public.profiles_guard();


-- ────────────────────────────────────────────────────────────────────────
-- ④ 같은 모양의 다른 표 — 쓰기 권한까지 걷어 두 겹으로
-- ────────────────────────────────────────────────────────────────────────
-- 셋 다 쓰기는 security definer 함수만 한다(앱이 표에 직접 쓰는 곳 없음). 읽기 권한은 그대로 둔다.
revoke insert, update, delete, truncate on public.token_ledger  from anon, authenticated;
revoke insert, update, delete, truncate on public.story_charges from anon, authenticated;
revoke all on public.tts_usage from anon, authenticated;   -- 정책도 없는 표 — tts_reserve 함수로만 센다


-- ────────────────────────────────────────────────────────────────────────
-- ⑤ tts_reserve — 음수 글자 수로 사용량을 깎지 못하게
-- ────────────────────────────────────────────────────────────────────────
-- 서버(/api/tts/google)는 1~800자만 보낸다. 0 이하·빈 값은 한도 초과(-1)처럼 거절하고 아무것도 안 더한다.
create or replace function public.tts_reserve(p_add int, p_limit bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pd  text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  cur bigint;
begin
  if p_add is null or p_add < 1 then
    return -1;   -- 음수로 이번 달 사용량을 깎는 길 (2026-09-30 막음)
  end if;

  select chars into cur from public.tts_usage where period = pd for update;
  if cur is null then
    cur := 0;
  end if;

  if cur + p_add > p_limit then
    return -1;   -- 한도 초과 → 예약 거부
  end if;

  insert into public.tts_usage (period, chars)
  values (pd, p_add)
  on conflict (period) do update set chars = public.tts_usage.chars + p_add;

  return cur + p_add;
end;
$$;

grant execute on function public.tts_reserve(int, bigint) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- 확인 — 읽기만 한다. Run 하면 이 표가 나온다.
--   ① 권한 : profiles 의 authenticated·anon 은 "넣기 X · 지우기 X", 고칠 칸은 child / 없음
--            token_ledger · story_charges · tts_usage 는 두 역할 모두 "넣기 X · 지우기 X", 고칠 칸 없음
--   ② 정책 : profiles: 마스터 열람(SELECT) · 본인 고치기(UPDATE) · 본인 열람(SELECT) — "profiles: 본인"(ALL)은 없어야 한다
--   ③ 지킴이: profiles_guard 켜짐
-- ════════════════════════════════════════════════════════════════════════
with r(role) as (values ('anon'), ('authenticated')),
     t(tbl) as (values ('public.profiles'), ('public.token_ledger'), ('public.story_charges'), ('public.tts_usage'))
select '① 권한' as 구분,
       replace(t.tbl, 'public.', '') as 표,
       r.role as 대상,
       format('넣기 %s · 지우기 %s · 고칠 칸 [%s]',
              case when has_table_privilege(r.role, t.tbl, 'INSERT') then 'O' else 'X' end,
              case when has_table_privilege(r.role, t.tbl, 'DELETE') then 'O' else 'X' end,
              coalesce((select string_agg(a.attname, ', ' order by a.attnum)
                          from pg_attribute a
                         where a.attrelid = t.tbl::regclass and a.attnum > 0 and not a.attisdropped
                           and has_column_privilege(r.role, t.tbl, a.attname, 'UPDATE')), '없음')) as 내용
  from r cross join t
union all
select '② 정책', tablename::text, policyname::text, cmd
  from pg_policies where schemaname = 'public' and tablename = 'profiles'
union all
select '③ 지킴이', 'profiles', tgname::text, case when tgenabled <> 'D' then '켜짐' else '꺼짐' end
  from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal
order by 1, 2, 3;
