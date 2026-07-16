-- 우리 아이 보이스 동화 — 초기 스키마
--
-- 설계상 전제 (코드보다 이 결정들이 먼저다):
--
-- 1. 아이 얼굴 사진을 받지 않는다. 그래서 어디에도 photo 컬럼이 없다.
--    캐릭터는 이름·나이·성별·그림체로 생성해서 계정에 저장하고 모든 책에 재사용한다.
--    사진은 이 앱 최대의 법적 리스크였고, 삽화가 어차피 그림체로 변환되므로
--    잃는 건 "덜 닮는 것" 하나뿐이다.
--
-- 2. 부모 목소리 원본(wav)은 우리 스토리지에 보관한다 (voices.source_audio_path).
--    클로닝은 voice_id가 벤더에 묶이므로, 원본이 없으면 벤더를 바꾸는 순간
--    가입한 부모 전원에게 재녹음을 요청해야 한다. 원본만 있으면 조용히 재클로닝한다.
--    같은 이유로 슬롯을 회수(DELETE)했다가 필요할 때 재클로닝할 수 있다.
--
-- 3. 목소리는 프리셋(벤더 제공, 슬롯 0)과 클론(부모 본인, 슬롯 1) 두 종류다.
--    프리셋은 코드 상수라 테이블이 없다. voices는 클론만 담는다.

create extension if not exists pgcrypto;

-- auth.users를 직접 건드리지 않고 확장한다 (Supabase 관례).
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create type child_gender as enum ('girl', 'boy', 'unspecified');

create table children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 1 and 20),
  -- 나이를 굳히면 아이가 자라도 그대로 남는다. 출생연도에서 파생시킨다.
  birth_year smallint not null check (birth_year between 2000 and 2100),
  -- 삽화 일관성(영어권 대명사 he/she 포함)에만 쓴다.
  -- 이야기 주제를 성별로 가르지 않는다 — 주제는 부모가 따로 고른다.
  gender child_gender not null default 'unspecified',
  created_at timestamptz not null default now()
);

create index children_user_id_idx on children (user_id);

-- 캐릭터: 후보를 여러 번 굴려보고 마음에 드는 하나를 고정한다.
-- 고정된 캐릭터 시트가 모든 책의 삽화 레퍼런스로 재주입되어 인물 일관성을 만든다.
create table characters (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children on delete cascade,
  art_style text not null,
  -- "곱슬머리에 안경 쓴 아이" 같은 선택 입력. 비워도 된다.
  appearance_note text,
  -- 캐릭터 시트 이미지. 페이지 삽화가 아니라 레퍼런스용.
  sheet_image_path text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index characters_child_id_idx on characters (child_id);

-- 아이당 활성 캐릭터는 하나뿐이다.
create unique index characters_one_active_per_child
  on characters (child_id) where is_active;

create type story_status as enum ('draft', 'generating', 'ready', 'failed');

create table stories (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children on delete cascade,
  -- 어떤 캐릭터로 만든 책인지 남긴다. 나중에 캐릭터를 새로 굴려도 이 책은 안 흔들린다.
  character_id uuid references characters on delete set null,
  title text not null default '',
  summary text not null default '',
  theme text,
  occasion text,
  status story_status not null default 'draft',
  error_message text,
  created_at timestamptz not null default now()
);

create index stories_child_id_idx on stories (child_id);

create table story_pages (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories on delete cascade,
  page_no smallint not null check (page_no > 0),
  text text not null,
  -- @@IMG@@에서 뽑은 장면 묘사. 삽화를 다시 뽑을 때 그대로 재사용한다.
  image_prompt text,
  image_path text,
  unique (story_id, page_no)
);

create type voice_status as enum ('pending', 'ready', 'failed', 'released');

-- 부모가 클론한 목소리. 프리셋은 여기 없다 (코드 상수).
create table voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  label text not null,
  -- 벤더를 명시적으로 들고 있어야 갈아탈 때 대상을 골라낼 수 있다.
  provider text not null,
  -- 벤더가 발급한 voice id. 슬롯을 회수하면 null이 되고, 원본으로 재클로닝한다.
  provider_voice_id text,
  -- 원본 녹음. 이게 없으면 벤더 이전도 슬롯 회수도 불가능하다. 절대 지우지 않는다.
  source_audio_path text not null,
  -- 부모가 "보관 안 함"을 고르면 원본을 지우고 여기에 표시한다.
  source_retained boolean not null default true,
  -- 동의 없이 만들어진 목소리가 있어선 안 된다.
  consent_at timestamptz not null,
  status voice_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index voices_user_id_idx on voices (user_id);

-- 같은 책을 다른 목소리로 들을 수 있으므로 (책, 페이지, 목소리) 조합으로 쌓인다.
-- Web Speech는 클라이언트가 즉석 재생하므로 여기 안 들어온다 (그래서 무료 티어 원가가 0).
create table story_audio (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories on delete cascade,
  page_no smallint not null check (page_no > 0),
  -- 프리셋이면 preset_key, 클론이면 voice_id. 정확히 하나만 채운다.
  preset_key text,
  voice_id uuid references voices on delete cascade,
  audio_path text not null,
  created_at timestamptz not null default now(),
  constraint story_audio_one_source check (
    (preset_key is null) <> (voice_id is null)
  )
);

create unique index story_audio_unique_take on story_audio (
  story_id, page_no, coalesce(preset_key, voice_id::text)
);

--------------------------------------------------------------------------------
-- RLS — 부모는 자기 아이 것만 본다.
--
-- 아이 이름이 박힌 동화와 부모 목소리를 다루므로 권한을 애플리케이션 코드에
-- 맡기지 않는다. 한 번의 실수가 서비스 종료 사유가 되는 종류의 데이터다.
--------------------------------------------------------------------------------

alter table profiles     enable row level security;
alter table children     enable row level security;
alter table characters   enable row level security;
alter table stories      enable row level security;
alter table story_pages  enable row level security;
alter table voices       enable row level security;
alter table story_audio  enable row level security;

create policy "본인 프로필" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "본인 아이" on children
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "본인 목소리" on voices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "본인 아이의 캐릭터" on characters
  for all using (
    exists (select 1 from children c where c.id = child_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from children c where c.id = child_id and c.user_id = auth.uid())
  );

create policy "본인 아이의 동화" on stories
  for all using (
    exists (select 1 from children c where c.id = child_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from children c where c.id = child_id and c.user_id = auth.uid())
  );

create policy "본인 동화의 페이지" on story_pages
  for all using (
    exists (
      select 1 from stories s join children c on c.id = s.child_id
      where s.id = story_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from stories s join children c on c.id = s.child_id
      where s.id = story_id and c.user_id = auth.uid()
    )
  );

create policy "본인 동화의 음성" on story_audio
  for all using (
    exists (
      select 1 from stories s join children c on c.id = s.child_id
      where s.id = story_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from stories s join children c on c.id = s.child_id
      where s.id = story_id and c.user_id = auth.uid()
    )
  );

--------------------------------------------------------------------------------
-- 스토리지 — 전부 비공개. 읽기는 서명 URL로만.
--
-- 파일 경로는 <auth.uid()>/... 로 시작한다. 그래야 정책 한 줄로 소유자를 가른다.
--------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('voice-samples', 'voice-samples', false),  -- 부모 원본 녹음. 가장 민감하다.
  ('story-images',  'story-images',  false),
  ('story-audio',   'story-audio',   false)
on conflict (id) do nothing;

create policy "본인 폴더만" on storage.objects
  for all
  using (
    bucket_id in ('voice-samples', 'story-images', 'story-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('voice-samples', 'story-images', 'story-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

--------------------------------------------------------------------------------
-- 가입하면 프로필이 자동으로 생긴다.
--------------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
