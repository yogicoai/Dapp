-- RLS 무한 재귀(42P17) 수정 — 이미 스키마를 한 번 실행한 DB에 이걸 추가로 실행하세요.
-- 마스터 열람 정책이 profiles를 직접 조회해 재귀가 났던 것을, SECURITY DEFINER 함수로 바꿉니다.

drop policy if exists "books: 마스터 열람" on public.books;
drop policy if exists "profiles: 마스터 열람" on public.profiles;

create or replace function public.is_master_user()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select is_master from public.profiles where id = auth.uid()), false);
$$;

create policy "books: 마스터 열람" on public.books for select
  using (public.is_master_user());
create policy "profiles: 마스터 열람" on public.profiles for select
  using (public.is_master_user());
