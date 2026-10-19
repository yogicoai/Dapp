-- ────────────────────────────────────────────────────────────────────────
-- 검색 노출(SEO) 설정 — 관리실 '검색 노출(SEO)' (2026-10-19)
-- ────────────────────────────────────────────────────────────────────────
-- 사장님: "검색어도 잡히게 seo 태그들을 넣을 수 있는 것들도 있었으면".
-- 사이트 제목·설명·검색어·공유 그림·대표 주소·구글/네이버 소유 확인 코드·검색 노출 켜기를 한 줄에 둔다.
-- 사이트(<head> · robots.txt · sitemap.xml)는 누구나 읽는 값이라 공개로 읽게 열고, 바꾸기는 관리자만 함수로(master_set_seo).
-- 칸이 비면 앱의 기본값(lib/seo.ts DEFAULT_SEO)을 쓴다. 이 SQL 을 돌리기 전에도 사이트는 기본값으로 그대로 뜬다.
-- 여러 번 돌려도 안전하다. Supabase → SQL Editor 에 통째로 붙여 넣고 Run.
-- ────────────────────────────────────────────────────────────────────────

create table if not exists public.app_seo_settings (
  id                  smallint primary key default 1 check (id = 1),
  site_title          text check (site_title is null or length(site_title) <= 70),
  description         text check (description is null or length(description) <= 300),
  keywords            text check (keywords is null or length(keywords) <= 500),
  og_image            text check (og_image is null or length(og_image) <= 500),
  site_url            text check (site_url is null or length(site_url) <= 200),
  google_verification text check (google_verification is null or length(google_verification) <= 200),
  naver_verification  text check (naver_verification is null or length(naver_verification) <= 200),
  indexing            boolean not null default true,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null
);
insert into public.app_seo_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_seo_settings enable row level security;
revoke all on public.app_seo_settings from anon, authenticated;
-- 사이트가 읽는 칸만 공개(고친 사람 updated_by 는 빼고)
grant select (id, site_title, description, keywords, og_image, site_url, google_verification, naver_verification, indexing, updated_at)
  on public.app_seo_settings to anon, authenticated;
drop policy if exists "seo: 누구나 읽기" on public.app_seo_settings;
create policy "seo: 누구나 읽기" on public.app_seo_settings for select to anon, authenticated using (true);

-- 바꾸기 — 관리자만. 앱(api/admin/seo)이 먼저 모양을 다듬어 보내고, 여기서는 칸 이름·길이·글자 여부를 다시 본다.
create or replace function public.master_set_seo(p_patch jsonb)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  k       text;
  v       text;
  allowed text[] := array['site_title','description','keywords','og_image','site_url','google_verification','naver_verification'];
  maxes   jsonb := '{"site_title":70,"description":300,"keywords":500,"og_image":500,"site_url":200,"google_verification":200,"naver_verification":200}';
  n       integer := 0;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception '바꿀 값이 없어요.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k = 'indexing' then
      if jsonb_typeof(p_patch -> k) <> 'boolean' then
        raise exception '검색 노출 값이 이상해요.' using errcode = '22023';
      end if;
      continue;
    end if;
    if not (k = any(allowed)) then
      raise exception '모르는 항목이에요: %', k using errcode = '22023';
    end if;
    if jsonb_typeof(p_patch -> k) not in ('string', 'null') then
      raise exception '% 값은 글자여야 해요.', k using errcode = '22023';
    end if;
    v := nullif(btrim(coalesce(p_patch ->> k, '')), '');
    if v is not null and length(v) > (maxes ->> k)::integer then
      raise exception '% 값이 너무 길어요.', k using errcode = '22023';
    end if;
  end loop;

  insert into public.app_seo_settings (id) values (1) on conflict (id) do nothing;
  for k in select jsonb_object_keys(p_patch) loop
    if k = 'indexing' then
      update public.app_seo_settings set indexing = (p_patch ->> 'indexing')::boolean where id = 1;
    else
      -- k 는 위에서 허용 목록으로 확인했다 — %I 로 칸 이름만 끼운다(값은 $1 로).
      execute format('update public.app_seo_settings set %I = $1 where id = 1', k)
        using nullif(btrim(coalesce(p_patch ->> k, '')), '');
    end if;
    n := n + 1;
  end loop;
  update public.app_seo_settings set updated_at = now(), updated_by = auth.uid() where id = 1;
  return json_build_object('ok', true, 'changed', n);
end; $$;
revoke all on function public.master_set_seo(jsonb) from public, anon;
grant execute on function public.master_set_seo(jsonb) to authenticated;
