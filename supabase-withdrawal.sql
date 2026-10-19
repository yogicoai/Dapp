-- ────────────────────────────────────────────────────────────────────────
-- 회원 탈퇴 · 동화 삭제 — 90일 보관 뒤 완전히 지우기 (2026-10-19)
-- ────────────────────────────────────────────────────────────────────────
-- 사장님 결정(2026-09-14): 동화를 삭제하거나 회원을 탈퇴하면 90일 보관한 뒤 지운다.
-- 그 90일은 고객 문의(다시 그리기·환불) 처리용이다. 결제·환불 기록은 이 약속에서 빠진다(법정 보관 — 결제 표들은
-- 회원이 지워져도 owner 칸만 비고 남는다, supabase-admin-console.sql).
--
-- 어떻게:
--   ① data_retention — 지운 것을 그대로 담아 두는 보관함. 90일(purge_after)이 지나면 관리실 '탈퇴·삭제 보관함'의
--      [90일 지난 것 정리]가 cafe24 폴더를 지우고 담아 둔 내용(snapshot)을 비운다. 줄 자체는 날짜만 남긴다.
--   ② books 를 지우면(회원이 지우든, 탈퇴로 함께 지워지든, 관리자가 회원을 지우든) 지우기 직전에 그 책을
--      보관함에 한 줄로 넣는다(books_retain_on_delete). 그 책 그림 폴더(books/<폴더>/<책 id>)도 함께 적는다.
--      가족 그림(family/<회원 id>)은 여러 책이 함께 쓰므로 책을 지울 때는 적지 않는다.
--   ③ withdraw_me('탈퇴', 사유) — 회원이 스스로 탈퇴. 프로필·만들기 기록·가족 그림 기록·토큰 장부 등을 한 줄로 담고
--      (동화는 ②가 한 권씩), 계정(auth.users)을 지운다 → 나머지는 on delete cascade 로 함께 지워진다.
--      계정이 바로 없어지므로 같은 구글 계정으로 곧바로 새로 가입할 수 있다(옛 데이터는 따라오지 않는다).
--   ④ 90일 안에 같은 이메일로 다시 가입하면 가입 축하 토큰을 주지 않는다(profiles_rejoin_without_bonus) —
--      탈퇴·재가입을 되풀이해 토큰을 받는 것을 막는다.
--   ⑤ 관리자 함수 — 목록(master_retention_list) · 정리할 것(master_retention_due) · 정리했음(master_retention_mark_purged).
--      cafe24 파일 지우기는 서버(api/admin/retention)가 한다 — DB 는 파일을 지울 수 없다.
--
-- 표에는 아무도 직접 들어오지 못한다(정책 없음). 위 함수로만 쓴다. 서비스 키는 쓰지 않는다.
-- 여러 번 돌려도 안전하다. Supabase → SQL Editor 에 통째로 붙여 넣고 Run.
-- ────────────────────────────────────────────────────────────────────────

-- 보관 기간 — 바꾸려면 여기 한 곳만(앱 안내 문구 lib/retention.ts RETENTION_DAYS 도 같이)
create or replace function public.retention_interval()
returns interval language sql immutable as $$ select interval '90 days' $$;

-- ① 보관함
create table if not exists public.data_retention (
  id               bigint generated always as identity primary key,
  kind             text not null check (kind in ('book', 'member')),
  member_id        uuid,                 -- 지운 회원 id — 계정이 없어진 뒤에도 남아야 해서 참조를 걸지 않는다
  member_username  text,
  member_email     text,                 -- 탈퇴(member)만 — 90일 안에 같은 이메일로 다시 가입했는지 볼 때만 쓴다
  book_id          text,                 -- 동화(book)만
  title            text,
  reason           text,                 -- '동화 삭제' · '회원 탈퇴 — (사유)' · '관리자 삭제' …
  snapshot         jsonb,                -- 지운 내용 그대로 — 정리하면 비운다
  folders          text[] not null default '{}',  -- 정리할 때 cafe24 에서 지울 폴더(올릴 때와 같은 상대 경로)
  created_at       timestamptz not null default now(),
  purge_after      timestamptz not null,
  purged_at        timestamptz,
  purged_by        uuid references auth.users(id) on delete set null
);
create index if not exists data_retention_due_idx on public.data_retention (purge_after) where purged_at is null;
create index if not exists data_retention_email_idx on public.data_retention (member_email)
  where kind = 'member' and purged_at is null;
create index if not exists data_retention_created_idx on public.data_retention (created_at desc);
alter table public.data_retention enable row level security;
revoke all on public.data_retention from anon, authenticated;
-- 정책 없음 → 표로는 아무도 못 본다. 아래 함수로만.


-- ② 동화를 지우면 보관함으로
-- 그림 폴더는 api/upload-art 가 올리는 books/<폴더>/<safeSegment(책 id)>/ 이다(safeSegment = 소문자 · [a-z0-9_-] 만 · 40자).
-- 책 데이터 안의 주소에서 이 책 id 로 끝나는 폴더만 고른다 — 다른 책·가족 그림 폴더는 건드리지 않는다.
create or replace function public.retain_deleted_book()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_safe    text := left(regexp_replace(lower(coalesce(old.id, '')), '[^a-z0-9_-]', '', 'g'), 40);
  v_folders text[];
  v_name    text;
  v_reason  text := coalesce(nullif(current_setting('app.retention_reason', true), ''), '동화 삭제');
begin
  if v_safe <> '' then
    select array_agg(distinct m[1]) into v_folders
      from regexp_matches(coalesce(old.data::text, ''), '(books/[a-z0-9_-]+/' || v_safe || ')/', 'g') as m;
  end if;
  select username into v_name from public.profiles where id = old.owner;
  insert into public.data_retention (kind, member_id, member_username, book_id, title, reason, snapshot, folders, purge_after)
  values ('book', old.owner, v_name, old.id, old.title, v_reason, to_jsonb(old), coalesce(v_folders, '{}'),
          now() + public.retention_interval());
  return old;
end; $$;
revoke all on function public.retain_deleted_book() from public, anon, authenticated;

drop trigger if exists books_retain_on_delete on public.books;
create trigger books_retain_on_delete
  before delete on public.books
  for each row execute function public.retain_deleted_book();


-- ③ 회원이 스스로 탈퇴
create or replace function public.withdraw_me(p_confirm text, p_reason text default null)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_master boolean;
  v_email  text;
  v_snap   jsonb;
  v_rows   jsonb;
  v_t      text;
  v_books  integer;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
  v_until  timestamptz := now() + public.retention_interval();
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_confirm, '')) <> '탈퇴' then
    raise exception '확인 글자가 맞지 않아요 — ''탈퇴''라고 적어 주세요.' using errcode = '22023';
  end if;
  select username, coalesce(is_master, false) into v_name, v_master from public.profiles where id = v_uid;
  if not found then
    raise exception '회원 정보를 찾지 못했어요.' using errcode = '22023';
  end if;
  if v_master then
    raise exception '관리자 계정은 탈퇴할 수 없어요.' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;

  -- 동화 말고 이 회원에게 딸린 것 — 표가 없는 DB 도 있어 있는 표만 담는다
  select to_jsonb(p) into v_rows from public.profiles p where p.id = v_uid;
  v_snap := jsonb_build_object('profile', v_rows);
  foreach v_t in array array['book_jobs', 'family_portraits', 'family_portrait_pics', 'voice_clones', 'token_ledger',
                             'token_grants', 'story_charges', 'member_plans', 'feedback'] loop
    if to_regclass('public.' || v_t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.owner = $1', v_t)
        into v_rows using v_uid;
      v_snap := v_snap || jsonb_build_object(v_t, v_rows);
    end if;
  end loop;
  select count(*) into v_books from public.books where owner = v_uid;

  insert into public.data_retention (kind, member_id, member_username, member_email, title, reason, snapshot, folders, purge_after)
  values ('member', v_uid, v_name, v_email, v_name, '회원 탈퇴' || coalesce(' — ' || v_reason, ''), v_snap,
          array['family/' || v_uid::text], v_until);

  -- 동화는 한 권씩 보관함으로(books_retain_on_delete) — 프로필이 아직 있을 때 지워야 아이디가 같이 적힌다
  perform set_config('app.retention_reason', '회원 탈퇴', true);
  delete from public.books where owner = v_uid;
  perform set_config('app.retention_reason', '', true);

  -- 이 회원 줄은 위에서 넣었다 — 프로필이 지워질 때 profiles_retain_on_delete 가 한 줄 더 넣지 않게
  perform set_config('app.retention_member', v_uid::text, true);
  delete from auth.users where id = v_uid;
  if not found then
    raise exception '계정을 닫지 못했어요. 잠시 뒤 다시 해 주세요.' using errcode = '22023';
  end if;
  return json_build_object('ok', true, 'books', v_books, 'purgeAfter', v_until);
end; $$;
revoke all on function public.withdraw_me(text, text) from public, anon;
grant execute on function public.withdraw_me(text, text) to authenticated;


-- ③-2 탈퇴가 아닌 길로 계정이 지워질 때(관리실 [회원 지우기] · Supabase 화면에서 지움) — 프로필과 가족 그림 폴더라도 보관함에.
-- 다른 표(만들기 기록 등)는 지우는 순서가 정해져 있지 않아 이미 지워졌을 수 있어 담지 않는다. 동화는 ②가 한 권씩 담는다.
create or replace function public.retain_deleted_profile()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if coalesce(current_setting('app.retention_member', true), '') = old.id::text then
    return old;  -- withdraw_me 가 이미 담았다
  end if;
  insert into public.data_retention (kind, member_id, member_username, title, reason, snapshot, folders, purge_after)
  values ('member', old.id, old.username, old.username, '계정 삭제(관리자)', jsonb_build_object('profile', to_jsonb(old)),
          array['family/' || old.id::text], now() + public.retention_interval());
  return old;
end; $$;
revoke all on function public.retain_deleted_profile() from public, anon, authenticated;

drop trigger if exists profiles_retain_on_delete on public.profiles;
create trigger profiles_retain_on_delete
  before delete on public.profiles
  for each row execute function public.retain_deleted_profile();


-- ④ 90일 안에 같은 이메일로 다시 가입하면 가입 축하 토큰은 0개
create or replace function public.rejoin_without_bonus()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  v_email text;
begin
  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is not null and exists (
       select 1 from public.data_retention r
        where r.kind = 'member'
          and r.purged_at is null
          and r.member_email = v_email
          and r.created_at > now() - public.retention_interval()) then
    new.tokens := 0;
  end if;
  return new;
end; $$;
revoke all on function public.rejoin_without_bonus() from public, anon, authenticated;

drop trigger if exists profiles_rejoin_without_bonus on public.profiles;
create trigger profiles_rejoin_without_bonus
  before insert on public.profiles
  for each row execute function public.rejoin_without_bonus();


-- ⑤ 관리자 — 보관함 목록
create or replace function public.master_retention_list(p_limit integer default 100)
returns table (id bigint, kind text, member_id uuid, member_username text, book_id text, title text, reason text,
               folders integer, created_at timestamptz, purge_after timestamptz, purged_at timestamptz,
               purged_by_username text)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return query
    select r.id, r.kind, r.member_id, r.member_username, r.book_id, r.title, r.reason,
           coalesce(array_length(r.folders, 1), 0), r.created_at, r.purge_after, r.purged_at, p.username
      from public.data_retention r
      left join public.profiles p on p.id = r.purged_by
     order by (r.purged_at is null) desc, r.purge_after asc, r.id desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end; $$;
revoke all on function public.master_retention_list(integer) from public, anon;
grant execute on function public.master_retention_list(integer) to authenticated;

-- 정리할 것 — 90일이 지났고 아직 정리 안 한 줄. 지울 폴더 가운데 아직 쓰이는 것은 뺀다(안전):
--   · books/… 폴더를 살아 있는 동화가 아직 가리키면(관리자가 책을 옮겼거나 같은 id 로 되살렸으면) 빼고
--   · family/<회원 id> 폴더는 그 회원 계정이 아직 있으면 뺀다.
create or replace function public.master_retention_due(p_limit integer default 20)
returns table (id bigint, kind text, folders text[])
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return query
    select r.id, r.kind,
           coalesce(array(
             select f from unnest(r.folders) as f
              where not (f like 'books/%' and exists (
                          select 1 from public.books b where position(f || '/' in b.data::text) > 0))
                and not (f like 'family/%' and exists (
                          select 1 from public.profiles p where p.id::text = split_part(f, '/', 2)))
           ), '{}')
      from public.data_retention r
     where r.purged_at is null and r.purge_after <= now()
     order by r.purge_after asc, r.id asc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
end; $$;
revoke all on function public.master_retention_due(integer) from public, anon;
grant execute on function public.master_retention_due(integer) to authenticated;

-- 정리했음 — 담아 둔 내용·이메일·이름을 비우고 날짜만 남긴다. 90일이 안 지난 줄은 건드리지 않는다.
create or replace function public.master_retention_mark_purged(p_ids bigint[])
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  n integer;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  update public.data_retention
     set snapshot = null, member_email = null, member_username = null, title = null, folders = '{}',
         purged_at = now(), purged_by = auth.uid()
   where id = any(coalesce(p_ids, '{}')) and purged_at is null and purge_after <= now();
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.master_retention_mark_purged(bigint[]) from public, anon;
grant execute on function public.master_retention_mark_purged(bigint[]) to authenticated;
