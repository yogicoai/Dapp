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
