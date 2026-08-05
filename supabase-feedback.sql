-- 베타 피드백 게시판 — 문제점·의견을 남기면 처음 한 번 100토큰을 드린다.
-- ─────────────────────────────────────────────────────────────
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run. (한 번만)
--
-- 왜 함수(RPC)로 만드나:
--   글쓰기와 토큰 지급이 한 몸이어야 한다. 앱에서 따로따로 하면 글만 써지고 토큰이
--   안 들어가거나, 반대로 토큰만 여러 번 받는 일이 생긴다. 아래 함수는 서버에서
--   '글 저장 + (처음이면) 토큰 지급'을 한 번에 처리하고, 보상은 계정당 딱 한 번만 준다.

-- ① 게시판 테이블
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  category   text not null default '기타',
  content    text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- 읽기: 로그인한 회원은 모두 볼 수 있다(게시판이니까).
drop policy if exists "feedback read" on public.feedback;
create policy "feedback read" on public.feedback
  for select using (auth.uid() is not null);

-- 쓰기: 본인 글만.
drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own" on public.feedback
  for insert with check (auth.uid() = owner);

-- 관리자(마스터)인지 판별 — 아래 정책들이 함께 쓴다.
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_master from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_master() to authenticated;

-- 수정·삭제: 본인 글이거나, 관리자면 모든 글.
--   관리자가 부적절한 글을 정리하거나 오탈자를 고칠 수 있어야 게시판이 굴러간다.
drop policy if exists "feedback update own or master" on public.feedback;
create policy "feedback update own or master" on public.feedback
  for update using (auth.uid() = owner or public.is_master())
  with check (auth.uid() = owner or public.is_master());

drop policy if exists "feedback delete own" on public.feedback;
drop policy if exists "feedback delete own or master" on public.feedback;
create policy "feedback delete own or master" on public.feedback
  for delete using (auth.uid() = owner or public.is_master());

-- ② 보상 지급 여부 — 계정당 한 번만 주려고 시각을 남긴다.
alter table public.profiles
  add column if not exists feedback_reward_at timestamptz;

-- ③ 글쓰기 + 첫 글 보상(100토큰)을 한 번에 처리하는 함수.
--    security definer라 서버 권한으로 돌지만, 대상은 언제나 auth.uid() 본인뿐이다.
create or replace function public.submit_feedback(p_category text, p_content text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid;
  v_rewarded timestamptz;
  v_bonus    int := 0;
  v_tokens   int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  p_content := btrim(coalesce(p_content, ''));
  if length(p_content) < 10 then
    raise exception '내용을 10자 이상 적어주세요.';
  end if;
  if length(p_content) > 2000 then
    raise exception '내용이 너무 깁니다(2000자까지).';
  end if;

  insert into public.feedback (owner, category, content)
  values (v_uid, coalesce(nullif(btrim(p_category), ''), '기타'), p_content);

  -- 보상은 계정당 한 번뿐. 이미 받았으면 글만 저장된다.
  select feedback_reward_at into v_rewarded from public.profiles where id = v_uid;
  if v_rewarded is null then
    update public.profiles
       set tokens = tokens + 100,
           feedback_reward_at = now()
     where id = v_uid
    returning tokens into v_tokens;
    v_bonus := 100;
  else
    select tokens into v_tokens from public.profiles where id = v_uid;
  end if;

  return json_build_object('bonus', v_bonus, 'tokens', v_tokens);
end;
$$;

revoke all on function public.submit_feedback(text, text) from public;
grant execute on function public.submit_feedback(text, text) to authenticated;
