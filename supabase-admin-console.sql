-- ════════════════════════════════════════════════════════════════════════
-- 관리실 정식판 — 실제 결제 틀 · 사업자 정보 · 약관 (2026-09-30)
-- ════════════════════════════════════════════════════════════════════════
--
-- 쓰는 법: Supabase → SQL Editor 에 이 파일을 통째로 붙여넣고 Run.
--          ⚠️ supabase-fix-profiles-escalation.sql 을 **먼저** 돌린 뒤에 돌린다
--          (그 고침이 있어야 '관리자(is_master)' 칸을 믿을 수 있다 — 여기 함수들이 그 칸으로 사람을 가린다).
--          supabase-setup.sql 26번에도 같은 내용이 들어 있다(그 파일을 통째로 다시 돌려도 된다).
--
-- ✅ 몇 번을 돌려도 안전하다. 표·칸이 없으면 만들고, 있으면 그대로 둔다. 정책·함수·지킴이는 갈아 끼우기만 한다.
--    회원·토큰·장부·책·결제 어떤 줄도 지우지 않는다.
--
-- ── 무엇을 더하나 ──────────────────────────────────────────────────────
--  ① 실제 결제(원) 틀 — payments(결제) · subscriptions(구독) · payment_refunds(결제 환불)
--     토큰 장부(token_ledger)와 다른 것이다. 카드로 '원'이 오간 기록이다.
--  ② 사업자 정보 — app_business_info(늘 한 줄: 상호·대표자·사업자등록번호·통신판매업 신고번호·주소·
--     고객센터 전화·이메일·운영 시간·호스팅) + business_info_changes(바꾼 이력)
--  ③ 약관 — app_legal_docs(이용약관 · 개인정보처리방침 · 환불·청약철회 안내). 게시할 때마다 한 판씩 쌓는다.
--  + 관리실이 부르는 master_* 함수(결제 목록·상세·환불 요청, 사업자 정보 고치기, 약관 게시·이력).
--
-- ── 누가 무엇을 ─────────────────────────────────────────────────────────
--  · 회원: 자기 결제·구독·환불만 읽는다(결제 키·결제사 원문·자동결제 키 이름·처리자 이름은 못 본다).
--  · 마스터(관리실): master_* 함수로 읽는다. 결제 환불은 '요청'만 적는다 — 실제 취소는 결제사를 붙인 뒤 서버가 한다.
--  · 사업자 정보·약관: 누구나 읽는다(사이트 맨 아래 줄 · /terms · /privacy · /refund).
--    바꾸는 사람은 회사 계정(yogico)뿐 — 가격과 같은 규칙(is_pricing_admin). 다른 마스터는 보기만 한다.
--  · 앱(브라우저)은 어느 표에도 직접 쓰지 못한다. 쓰는 길은 위 함수와 나중의 서버(서비스 키)뿐이다.
--
-- ── 보관 — 5년, 탈퇴해도 남는다 ─────────────────────────────────────────
--  전자상거래법: 대금 결제·환불 기록은 5년 보관. 회원이 탈퇴해도 결제 줄은 지워지지 않고
--  주인 칸만 비워진다(가입 아이디는 사진으로 남는다). 만든 날부터 5년 안에는 SQL 편집기로도 지울 수 없고,
--  표를 한꺼번에 비울(truncate) 수도 없다. 게시한 약관 판은 영영 고치거나 지우지 않는다.
--
-- ── 지금은 표가 비어 있다 — 결제사를 붙이면 서버가 채운다 ─────────────────
--  관리실 '결제·구독' 화면은 '결제 연동 전' 띠와 빈 화면을 보여 준다('시연 데이터 보기'는 화면에만 있는 예시다).
--  사업자 정보는 기본값(요기코퍼레이션 · Vercel Inc.) 한 줄로 시작한다 — 관리실 '사업자 정보·약관'에서 채운다.
-- ════════════════════════════════════════════════════════════════════════


-- ▼ 26번 시작 (supabase-admin-console.sql 과 같은 내용)
-- ════════════════════════════════════════════════════════════════════════
--  26. 관리실 정식판 — 실제 결제 틀 · 사업자 정보 · 약관 (2026-09-30)
-- ════════════════════════════════════════════════════════════════════════
--
--  ① 실제 결제(원) 틀 — subscriptions(구독) · payments(결제) · payment_refunds(결제 환불)
--     토큰 장부(token_ledger)와 다른 것이다. 여기는 카드로 '원'이 오간 기록이다.
--     지금은 비어 있다 — 결제사(PG)를 붙이면 서버(서비스 키)가 결제 확인·웹훅 때 채운다.
--  ② 사업자 정보 — app_business_info(늘 한 줄) + business_info_changes(바꾼 이력)
--  ③ 약관 — app_legal_docs(이용약관 · 개인정보처리방침 · 환불 안내). 게시할 때마다 한 줄(판), 고치지 않는다.
--
--  누가 무엇을:
--   · 회원: 자기 결제·구독·환불만 읽는다. 결제 키·결제사 원문·자동결제 키 이름·처리자 이름은 칸 권한으로 못 본다.
--   · 마스터: master_* 함수로만 읽는다(다른 마스터 것은 6번 master_can_see 로 가린다).
--             결제 환불은 '요청'만 적는다 — 실제 취소는 나중에 서버가 결제사에 보내고 결과를 적는다.
--   · 사업자 정보·약관은 누구나 읽는다(사이트 맨 아래 줄 · /terms). 바꾸는 사람은 회사 계정(is_pricing_admin)뿐.
--   · 앱(브라우저)은 어느 표에도 직접 쓰지 못한다 — 넣기·고치기·지우기 권한이 없다.
--
--  보관(전자상거래법 5년): 결제 기록은 회원이 탈퇴해도 남는다(주인 칸만 비고 가입 아이디 사진이 남는다).
--  만든 날부터 5년 안에는 지울 수 없고, 표를 한꺼번에 비울 수도 없다. 게시한 약관은 영영 고치거나 지우지 않는다.
-- ────────────────────────────────────────────────────────────────────────

-- 26-1 구독 — 결제보다 먼저(결제가 구독을 가리킨다)
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  owner                uuid references auth.users(id) on delete set null,   -- 탈퇴해도 기록은 남는다
  owner_username       text,                                                -- 가입 아이디 사진(지킴이가 채운다)
  plan                 text not null check (plan ~ '^[a-z0-9_]{1,40}$'),    -- monthly · yearly
  status               text not null default 'active'
                       check (status in ('trialing','active','past_due','cancelled','expired')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  next_billing_at      timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at         timestamptz,
  billing_key_ref      text check (billing_key_ref is null or length(billing_key_ref) <= 200),
                       -- 결제사 자동결제 키를 가리키는 '이름'. 키 자체(비밀)는 이 DB 에 두지 않는다
  has_billing_key      boolean generated always as (billing_key_ref is not null) stored,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscriptions_period check (current_period_start is null or current_period_end is null
                                         or current_period_end > current_period_start)
);
create index if not exists subscriptions_owner_idx  on public.subscriptions (owner, created_at desc);
create index if not exists subscriptions_status_idx on public.subscriptions (status, next_billing_at);
create unique index if not exists subscriptions_one_live on public.subscriptions (owner)
  where owner is not null and status in ('trialing','active','past_due');   -- 한 사람에 살아 있는 구독은 하나

-- 26-2 결제 — 주문 한 건에 한 줄
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        text not null unique check (order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  owner           uuid references auth.users(id) on delete set null,
  owner_username  text,
  product         text not null check (product ~ '^[a-z0-9_]{1,40}$'),     -- 요금제 코드: monthly · yearly · extra3
  order_name      text check (order_name is null or length(order_name) <= 100),
  amount          integer not null check (amount between 0 and 10000000), -- 원, 부가세 포함
  currency        text not null default 'KRW' check (currency ~ '^[A-Z]{3}$'),
  status          text not null default 'pending'
                  check (status in ('pending','paid','failed','cancelled','refunded','partial_refunded')),
                  -- cancelled = 승인 전 취소(돈 안 나감) · refunded = 승인 뒤 전액 환불
  refunded_amount integer not null default 0,
  method          text check (method is null or length(method) <= 40),
  pg              text check (pg is null or pg ~ '^[a-z0-9_-]{1,40}$'),
  pg_payment_key  text unique check (pg_payment_key is null or length(pg_payment_key) <= 200),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  failure_code    text check (failure_code is null or length(failure_code) <= 100),
  failure_message text check (failure_message is null or length(failure_message) <= 500),
  requested_at    timestamptz not null default now(),
  approved_at     timestamptz,
  cancelled_at    timestamptz,
  receipt_url     text check (receipt_url is null or (receipt_url ~ '^https://' and length(receipt_url) <= 500)),
  raw             jsonb,            -- 결제사 응답 원문. 서버가 카드번호 등은 저장 전에 뺀다(결제사도 가려서 준다)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payments_refund_range  check (refunded_amount between 0 and amount),
  constraint payments_refund_status check (
       (status = 'refunded'         and refunded_amount = amount)
    or (status = 'partial_refunded' and refunded_amount > 0 and refunded_amount < amount)
    or (status not in ('refunded','partial_refunded') and refunded_amount = 0)),
  constraint payments_approved check (status not in ('paid','refunded','partial_refunded') or approved_at is not null)
);
create index if not exists payments_owner_idx   on public.payments (owner, created_at desc);
create index if not exists payments_created_idx on public.payments (created_at desc);
create index if not exists payments_status_idx  on public.payments (status, created_at desc);
create index if not exists payments_sub_idx     on public.payments (subscription_id);

-- 26-3 결제 환불 — 토큰 환불(token_ledger)과 다른 것. 마스터는 '요청'만 적고, 실제 취소는 나중 서버가 한다
create table if not exists public.payment_refunds (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid not null references public.payments(id) on delete restrict,
  owner                 uuid references auth.users(id) on delete set null,
  owner_username        text,
  amount                integer not null check (amount between 1 and 10000000),
  reason                text not null check (length(btrim(reason)) between 2 and 500),
  status                text not null default 'requested'
                        check (status in ('requested','done','failed','withdrawn')),
  requested_by          uuid references auth.users(id) on delete set null,
  requested_by_username text,
  processed_by          uuid references auth.users(id) on delete set null,
  processed_by_username text,
  processed_note        text check (processed_note is null or length(processed_note) <= 500),
  pg_cancel_key         text check (pg_cancel_key is null or length(pg_cancel_key) <= 200),
  failure_message       text check (failure_message is null or length(failure_message) <= 500),
  requested_at          timestamptz not null default now(),
  processed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists payment_refunds_payment_idx on public.payment_refunds (payment_id);
create index if not exists payment_refunds_status_idx  on public.payment_refunds (status, requested_at desc);

-- 26-4 사업자 정보 — 늘 한 줄. 사이트 맨 아래 줄·약관 머리에 쓴다
create table if not exists public.app_business_info (
  id            smallint primary key default 1 check (id = 1),
  company_name  text not null default '요기코퍼레이션' check (length(btrim(company_name)) between 1 and 60),
  ceo_name      text check (ceo_name is null or length(ceo_name) <= 40),
  biz_no        text check (biz_no is null or biz_no ~ '^[0-9]{3}-[0-9]{2}-[0-9]{5}$'),
  mail_order_no text check (mail_order_no is null or length(mail_order_no) <= 60),
  address       text check (address is null or length(address) <= 200),
  phone         text check (phone is null or phone ~ '^[0-9+() -]{7,20}$'),
  email         text check (email is null or (length(email) <= 120 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  hours         text check (hours is null or length(hours) <= 100),
  hosting       text not null default 'Vercel Inc.' check (length(btrim(hosting)) between 1 and 60),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
insert into public.app_business_info (id) values (1) on conflict (id) do nothing;

create table if not exists public.business_info_changes (
  id                  bigint generated always as identity primary key,
  field               text not null,
  old_value           text,
  new_value           text,
  note                text,
  changed_by          uuid references auth.users(id) on delete set null,
  changed_by_username text,                -- 계정이 지워져도 누가 바꿨는지 남게 이름을 함께 적는다
  at                  timestamptz not null default now()
);
create index if not exists business_info_changes_at_idx on public.business_info_changes (at desc);

-- 26-5 약관·개인정보처리방침·환불 안내 — 게시할 때마다 한 줄(판). 지우지도 고치지도 않는다
create table if not exists public.app_legal_docs (
  id                    bigint generated always as identity primary key,
  kind                  text not null check (kind in ('terms','privacy','refund')),
  version               integer not null check (version >= 1),
  title                 text not null check (length(btrim(title)) between 1 and 100),
  body                  text not null check (length(btrim(body)) >= 1 and length(body) <= 60000),
  effective_date        date not null,
  note                  text check (note is null or length(note) <= 500),
  published_by          uuid references auth.users(id) on delete set null,
  published_by_username text,
  published_at          timestamptz not null default now(),
  unique (kind, version)
);
create index if not exists app_legal_docs_pick_idx on public.app_legal_docs (kind, effective_date desc, version desc);


-- 26-6 잠금 — 새 표는 Supabase 가 비회원·회원에게 통째로 열어 준다. 먼저 다 걷고, 읽기만 칸 단위로 준다.
alter table public.subscriptions         enable row level security;
alter table public.payments              enable row level security;
alter table public.payment_refunds       enable row level security;
alter table public.app_business_info     enable row level security;
alter table public.business_info_changes enable row level security;
alter table public.app_legal_docs        enable row level security;

revoke all on public.subscriptions, public.payments, public.payment_refunds,
              public.app_business_info, public.business_info_changes, public.app_legal_docs
  from anon, authenticated;
revoke all on sequence public.business_info_changes_id_seq, public.app_legal_docs_id_seq from anon, authenticated;
-- 나중의 서버(서비스 키)는 넣고 고칠 수 있어야 하지만, 표를 통째로 비우지는 못하게 한다.
revoke truncate on public.subscriptions, public.payments, public.payment_refunds, public.app_legal_docs from service_role;

-- 회원: 자기 줄만(아래 정책). 칸은 고객에게 보여도 되는 것만. 결제 키·원문·자동결제 키·처리자 이름은 없다.
grant select (id, order_id, owner, owner_username, product, order_name, amount, currency, status, refunded_amount,
              method, pg, subscription_id, failure_code, failure_message, requested_at, approved_at, cancelled_at,
              receipt_url, created_at, updated_at) on public.payments to authenticated;
grant select (id, owner, owner_username, plan, status, current_period_start, current_period_end, next_billing_at,
              cancel_at_period_end, cancelled_at, has_billing_key, created_at, updated_at) on public.subscriptions to authenticated;
grant select (id, payment_id, owner, amount, reason, status, requested_at, processed_at, created_at)
  on public.payment_refunds to authenticated;

-- 누구나 읽는다(사이트 맨 아래 줄·/terms). 고친 사람 칸은 뺀다.
grant select (id, company_name, ceo_name, biz_no, mail_order_no, address, phone, email, hours, hosting, updated_at)
  on public.app_business_info to anon, authenticated;
grant select (id, kind, version, title, body, effective_date, published_at)
  on public.app_legal_docs to anon, authenticated;
-- business_info_changes: 권한·정책 없음 → 표로는 아무도 못 본다. master_business_info_log 로만(pricing_changes 와 같다).

drop policy if exists "subscriptions 본인 열람" on public.subscriptions;
create policy "subscriptions 본인 열람" on public.subscriptions for select using (auth.uid() = owner);
drop policy if exists "subscriptions 마스터 열람" on public.subscriptions;
create policy "subscriptions 마스터 열람" on public.subscriptions for select using (public.master_can_see(owner));

drop policy if exists "payments 본인 열람" on public.payments;
create policy "payments 본인 열람" on public.payments for select using (auth.uid() = owner);
drop policy if exists "payments 마스터 열람" on public.payments;
create policy "payments 마스터 열람" on public.payments for select using (public.master_can_see(owner));
-- (주인 없는 줄 — 탈퇴한 회원 것 — 도 마스터에게는 보인다: master_can_see(null) 은 참이다)

drop policy if exists "payment_refunds 본인 열람" on public.payment_refunds;
create policy "payment_refunds 본인 열람" on public.payment_refunds for select using (auth.uid() = owner);
drop policy if exists "payment_refunds 마스터 열람" on public.payment_refunds;
create policy "payment_refunds 마스터 열람" on public.payment_refunds for select using (public.master_can_see(owner));

drop policy if exists "app_business_info 모두 읽기" on public.app_business_info;
create policy "app_business_info 모두 읽기" on public.app_business_info for select using (true);

drop policy if exists "app_legal_docs 모두 읽기" on public.app_legal_docs;
create policy "app_legal_docs 모두 읽기" on public.app_legal_docs for select using (true);
-- insert/update/delete 정책은 아무에게도 주지 않는다 → 아래 함수(마스터)와 나중의 서버(서비스 키)만 쓴다.


-- 26-7 지킴이 — 누가 나중에 권한을 잘못 열어도, 서버가 실수해도 결제 기록이 망가지지 않게

-- 가입 아이디 사진 — 넣을 때 주인 아이디를 적어 둔다(탈퇴해 주인 칸이 비어도 누구 결제였는지 남게).
create or replace function public.billing_fill_username()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.owner is not null and new.owner_username is null then
    new.owner_username := (select p.username from public.profiles p where p.id = new.owner);
  end if;
  return new;
end; $$;
revoke all on function public.billing_fill_username() from public, anon, authenticated;

-- 5년 보관 — 만든 날부터 5년이 안 된 결제 기록은 누구도(SQL 편집기도) 지우지 못한다.
create or replace function public.billing_keep_5y()
returns trigger language plpgsql
set search_path = public as $$
begin
  if old.created_at >= now() - interval '5 years' then
    raise exception '결제 기록은 만든 날부터 5년 동안 지울 수 없어요(전자상거래법).' using errcode = '42501';
  end if;
  return old;
end; $$;
revoke all on function public.billing_keep_5y() from public, anon, authenticated;

-- 한꺼번에 비우기(truncate) 막기 — 5년 보관 지킴이는 줄 단위라 truncate 를 못 막는다.
create or replace function public.billing_no_truncate()
returns trigger language plpgsql
set search_path = public as $$
begin
  raise exception '결제·약관 기록은 한꺼번에 비울 수 없어요.' using errcode = '42501';
end; $$;
revoke all on function public.billing_no_truncate() from public, anon, authenticated;

-- 결제 줄 — 주문번호·상품·금액·시각은 한 번 적으면 그대로. 주인은 비워지기만(탈퇴) 한다.
-- 상태는 정해진 길로만: 대기 → 완료/실패/결제 전 취소, 완료 → 부분/전액 환불, 부분 → 부분/전액 환불.
create or replace function public.payments_guard()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.id is distinct from old.id or new.order_id is distinct from old.order_id
     or new.product is distinct from old.product or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency or new.requested_at is distinct from old.requested_at
     or new.created_at is distinct from old.created_at or new.owner_username is distinct from old.owner_username then
    raise exception '결제의 주문번호·상품·금액·시각은 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if new.owner is distinct from old.owner and new.owner is not null then
    raise exception '결제의 주인은 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'pending'          and new.status in ('paid','failed','cancelled'))
    or (old.status = 'paid'             and new.status in ('partial_refunded','refunded'))
    or (old.status = 'partial_refunded' and new.status in ('partial_refunded','refunded'))) then
    raise exception '결제 상태를 %에서 %로 바꿀 수 없어요.', old.status, new.status using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.payments_guard() from public, anon, authenticated;

-- 결제 환불 줄 — 요청한 금액·사유·요청자는 그대로. 처리자는 처리하는 순간(요청됨 → 끝) 한 번만 적힌다.
-- 상태: 요청됨 → 환불 완료/환불 실패/요청 취소. 그 뒤로는 끝(다시 열지 않는다).
create or replace function public.payment_refunds_guard()
returns trigger language plpgsql
set search_path = public as $$
declare
  settling boolean := old.status = 'requested' and new.status <> 'requested';
begin
  if new.id is distinct from old.id or new.payment_id is distinct from old.payment_id
     or new.amount is distinct from old.amount or new.reason is distinct from old.reason
     or new.requested_by_username is distinct from old.requested_by_username
     or new.requested_at is distinct from old.requested_at or new.created_at is distinct from old.created_at
     or new.owner_username is distinct from old.owner_username then
    raise exception '환불 요청의 금액·사유·요청자는 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if (new.owner is distinct from old.owner and new.owner is not null)
     or (new.requested_by is distinct from old.requested_by and new.requested_by is not null) then
    raise exception '환불 요청의 주인·요청자는 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if new.processed_by is distinct from old.processed_by and new.processed_by is not null
     and not (old.processed_by is null and settling) then
    raise exception '환불 처리자는 처리할 때 한 번만 적어요.' using errcode = '42501';
  end if;
  if new.processed_by_username is distinct from old.processed_by_username
     and not (old.processed_by_username is null and settling) then
    raise exception '환불 처리자는 처리할 때 한 번만 적어요.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'requested' and new.status in ('done','failed','withdrawn')) then
    raise exception '환불 요청 상태를 %에서 %로 바꿀 수 없어요.', old.status, new.status using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.payment_refunds_guard() from public, anon, authenticated;

-- 구독 줄 — 가입 아이디 사진·만든 시각은 그대로, 주인은 비워지기만(탈퇴) 한다.
create or replace function public.subscriptions_touch()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.id is distinct from old.id or new.owner_username is distinct from old.owner_username
     or new.created_at is distinct from old.created_at then
    raise exception '구독의 가입 아이디·시작 시각은 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if new.owner is distinct from old.owner and new.owner is not null then
    raise exception '구독의 주인은 바꿀 수 없어요.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.subscriptions_touch() from public, anon, authenticated;

-- 약관 — 게시한 판은 고치지도 지우지도 않는다. 게시한 계정이 지워질 때(published_by 만 비워짐)만 지나간다.
create or replace function public.legal_docs_append_only()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.published_by is null and old.published_by is not null
     and (to_jsonb(new) - 'published_by') = (to_jsonb(old) - 'published_by') then
    return new;
  end if;
  raise exception '게시한 약관은 고치거나 지울 수 없어요 — 새 판으로 게시해 주세요.' using errcode = '42501';
end; $$;
revoke all on function public.legal_docs_append_only() from public, anon, authenticated;

drop trigger if exists subscriptions_fill_username on public.subscriptions;
create trigger subscriptions_fill_username before insert on public.subscriptions
  for each row execute function public.billing_fill_username();
drop trigger if exists payments_fill_username on public.payments;
create trigger payments_fill_username before insert on public.payments
  for each row execute function public.billing_fill_username();
drop trigger if exists payment_refunds_fill_username on public.payment_refunds;
create trigger payment_refunds_fill_username before insert on public.payment_refunds
  for each row execute function public.billing_fill_username();

drop trigger if exists subscriptions_keep_5y on public.subscriptions;
create trigger subscriptions_keep_5y before delete on public.subscriptions
  for each row execute function public.billing_keep_5y();
drop trigger if exists payments_keep_5y on public.payments;
create trigger payments_keep_5y before delete on public.payments
  for each row execute function public.billing_keep_5y();
drop trigger if exists payment_refunds_keep_5y on public.payment_refunds;
create trigger payment_refunds_keep_5y before delete on public.payment_refunds
  for each row execute function public.billing_keep_5y();

drop trigger if exists subscriptions_no_truncate on public.subscriptions;
create trigger subscriptions_no_truncate before truncate on public.subscriptions
  for each statement execute function public.billing_no_truncate();
drop trigger if exists payments_no_truncate on public.payments;
create trigger payments_no_truncate before truncate on public.payments
  for each statement execute function public.billing_no_truncate();
drop trigger if exists payment_refunds_no_truncate on public.payment_refunds;
create trigger payment_refunds_no_truncate before truncate on public.payment_refunds
  for each statement execute function public.billing_no_truncate();
drop trigger if exists app_legal_docs_no_truncate on public.app_legal_docs;
create trigger app_legal_docs_no_truncate before truncate on public.app_legal_docs
  for each statement execute function public.billing_no_truncate();

drop trigger if exists payments_guard on public.payments;
create trigger payments_guard before update on public.payments
  for each row execute function public.payments_guard();
drop trigger if exists payment_refunds_guard on public.payment_refunds;
create trigger payment_refunds_guard before update on public.payment_refunds
  for each row execute function public.payment_refunds_guard();
drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.subscriptions_touch();
drop trigger if exists app_legal_docs_append_only on public.app_legal_docs;
create trigger app_legal_docs_append_only before update or delete on public.app_legal_docs
  for each row execute function public.legal_docs_append_only();


-- 26-8 마스터가 읽는 길 — 관리실 결제·구독 화면. 전부 마스터 확인 + 다른 마스터 것은 뺀다(master_can_see).
-- 인자 이름으로 부른다(PostgREST). 모양(인자)을 하나만 둔다 — 같은 이름에 모양이 둘이면 어느 것을 부를지 헷갈린다.

-- 결제 목록. q 는 주문번호와 정확히 같거나 아이디에 들어 있으면(LIKE 가 아니라 %·_ 를 신경 쓸 일이 없다).
create or replace function public.master_payments_list(
  p_status       text        default null,
  p_q            text        default null,
  p_from         timestamptz default null,
  p_to           timestamptz default null,
  p_owner        uuid        default null,
  p_subscription uuid        default null,
  p_limit        integer     default 200)
returns table (
  id              uuid,
  order_id        text,
  owner           uuid,
  owner_username  text,
  product         text,
  order_name      text,
  amount          integer,
  currency        text,
  status          text,
  refunded_amount integer,
  method          text,
  pg              text,
  subscription_id uuid,
  requested_at    timestamptz,
  approved_at     timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz,
  total_count     bigint
)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
declare
  v_q text := left(nullif(btrim(coalesce(p_q, '')), ''), 64);
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('pending','paid','failed','cancelled','refunded','partial_refunded') then
    raise exception '모르는 결제 상태예요: %', p_status using errcode = '22023';
  end if;
  return query
    select p.id, p.order_id, p.owner, p.owner_username, p.product, p.order_name, p.amount, p.currency,
           p.status, p.refunded_amount, p.method, p.pg, p.subscription_id, p.requested_at, p.approved_at,
           p.cancelled_at, p.created_at, count(*) over ()
      from public.payments p
     where public.master_can_see(p.owner)
       and (p_status is null or p.status = p_status)
       and (p_from is null or p.created_at >= p_from)
       and (p_to is null or p.created_at < p_to)
       and (p_owner is null or p.owner = p_owner)
       and (p_subscription is null or p.subscription_id = p_subscription)
       and (v_q is null or p.order_id = v_q
            or strpos(lower(coalesce(p.owner_username, '')), lower(v_q)) > 0)
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end; $$;
revoke all on function public.master_payments_list(text, text, timestamptz, timestamptz, uuid, uuid, integer) from public, anon;
grant execute on function public.master_payments_list(text, text, timestamptz, timestamptz, uuid, uuid, integer) to authenticated;

-- 결제 한 건 — 결제 키·원문·실패 사유·영수증까지(마스터만). 구독의 자동결제 키 이름은 여기서도 안 준다.
create or replace function public.master_payment_detail(p_id uuid)
returns json
language plpgsql security definer stable
set search_path = public as $$
declare
  v_pay jsonb;
  v_refunds jsonb;
  v_sub jsonb;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select to_jsonb(p) into v_pay
    from public.payments p
   where p.id = p_id and public.master_can_see(p.owner);
  if v_pay is null then
    raise exception '결제를 찾을 수 없어요.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'payment_id', r.payment_id, 'order_id', v_pay ->> 'order_id',
           'owner', r.owner, 'owner_username', r.owner_username, 'amount', r.amount, 'reason', r.reason,
           'status', r.status, 'requested_by_username', r.requested_by_username,
           'processed_by_username', r.processed_by_username, 'processed_note', r.processed_note,
           'failure_message', r.failure_message, 'requested_at', r.requested_at, 'processed_at', r.processed_at)
           order by r.requested_at desc), '[]'::jsonb)
    into v_refunds
    from public.payment_refunds r
   where r.payment_id = p_id;
  select to_jsonb(s) - 'billing_key_ref' into v_sub
    from public.subscriptions s
   where s.id = (v_pay ->> 'subscription_id')::uuid;
  return json_build_object('payment', v_pay, 'refunds', v_refunds, 'subscription', v_sub);
end; $$;
revoke all on function public.master_payment_detail(uuid) from public, anon;
grant execute on function public.master_payment_detail(uuid) to authenticated;

-- 구독 목록. p_status = 'cancel_scheduled' 는 '해지 예약'(살아 있는데 기간 끝에 끝나는 것).
create or replace function public.master_subscriptions_list(
  p_status text    default null,
  p_q      text    default null,
  p_owner  uuid    default null,
  p_limit  integer default 200)
returns table (
  id                   uuid,
  owner                uuid,
  owner_username       text,
  plan                 text,
  status               text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  next_billing_at      timestamptz,
  cancel_at_period_end boolean,
  cancelled_at         timestamptz,
  has_billing_key      boolean,
  created_at           timestamptz,
  updated_at           timestamptz,
  total_count          bigint
)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
declare
  v_q text := left(nullif(btrim(coalesce(p_q, '')), ''), 64);
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('trialing','active','past_due','cancelled','expired','cancel_scheduled') then
    raise exception '모르는 구독 상태예요: %', p_status using errcode = '22023';
  end if;
  return query
    select s.id, s.owner, s.owner_username, s.plan, s.status, s.current_period_start, s.current_period_end,
           s.next_billing_at, s.cancel_at_period_end, s.cancelled_at, s.has_billing_key, s.created_at,
           s.updated_at, count(*) over ()
      from public.subscriptions s
     where public.master_can_see(s.owner)
       and (p_status is null
            or (p_status = 'cancel_scheduled' and s.cancel_at_period_end
                and s.status in ('trialing','active','past_due'))
            or (p_status <> 'cancel_scheduled' and s.status = p_status))
       and (p_owner is null or s.owner = p_owner)
       and (v_q is null or strpos(lower(coalesce(s.owner_username, '')), lower(v_q)) > 0)
     order by s.created_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end; $$;
revoke all on function public.master_subscriptions_list(text, text, uuid, integer) from public, anon;
grant execute on function public.master_subscriptions_list(text, text, uuid, integer) to authenticated;

-- 결제 환불 목록 — 보이는지는 그 결제의 주인으로 본다.
create or replace function public.master_payment_refunds_list(
  p_status text    default null,
  p_q      text    default null,
  p_limit  integer default 200)
returns table (
  id                    uuid,
  payment_id            uuid,
  order_id              text,
  owner                 uuid,
  owner_username        text,
  amount                integer,
  reason                text,
  status                text,
  requested_by_username text,
  processed_by_username text,
  processed_note        text,
  failure_message       text,
  requested_at          timestamptz,
  processed_at          timestamptz,
  total_count           bigint
)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
declare
  v_q text := left(nullif(btrim(coalesce(p_q, '')), ''), 64);
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('requested','done','failed','withdrawn') then
    raise exception '모르는 환불 상태예요: %', p_status using errcode = '22023';
  end if;
  return query
    select r.id, r.payment_id, p.order_id, r.owner, r.owner_username, r.amount, r.reason, r.status,
           r.requested_by_username, r.processed_by_username, r.processed_note, r.failure_message,
           r.requested_at, r.processed_at, count(*) over ()
      from public.payment_refunds r
      join public.payments p on p.id = r.payment_id
     where public.master_can_see(p.owner)
       and (p_status is null or r.status = p_status)
       and (v_q is null or p.order_id = v_q
            or strpos(lower(coalesce(r.owner_username, '')), lower(v_q)) > 0)
     order by r.requested_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end; $$;
revoke all on function public.master_payment_refunds_list(text, text, integer) from public, anon;
grant execute on function public.master_payment_refunds_list(text, text, integer) to authenticated;

-- 결제 환불 '요청' 적기 — 마스터가 고객 요청을 받아 적는다. 결제 줄(payments)은 건드리지 않는다.
-- 금액: 1원 ~ (결제 금액 − 이미 환불된 금액 − 처리 기다리는 요청 합). 같은 결제에 겹쳐 적어도 넘치지 않게 줄을 잠근다.
-- TODO(PG-HOOK-REFUND): 결제사를 붙이면 서버(서비스 키)가 'requested' 줄을 받아 결제사 취소를 부르고,
--   한 트랜잭션에서 payments.refunded_amount·status 와 이 줄의 status(done/failed)·processed_* 를 적는다.
create or replace function public.master_request_payment_refund(p_payment uuid, p_amount integer, p_reason text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  pay       public.payments%rowtype;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_pending integer;
  v_max     integer;
  v_id      uuid;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select * into pay from public.payments
   where id = p_payment and public.master_can_see(owner)
   for update;
  if not found then
    raise exception '결제를 찾을 수 없어요.' using errcode = '42501';
  end if;
  if pay.status not in ('paid','partial_refunded') then
    raise exception '결제 완료된 건만 환불을 요청할 수 있어요(지금 상태: %).', pay.status using errcode = '22023';
  end if;
  if length(v_reason) < 2 or length(v_reason) > 500 then
    raise exception '환불 사유를 2~500자로 적어 주세요.' using errcode = '22023';
  end if;
  select coalesce(sum(r.amount), 0) into v_pending
    from public.payment_refunds r
   where r.payment_id = pay.id and r.status = 'requested';
  v_max := pay.amount - pay.refunded_amount - v_pending;
  if v_max < 1 then
    raise exception '더 환불할 수 있는 금액이 없어요(이미 환불했거나 요청했어요).' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > v_max then
    raise exception '환불 금액은 1원 ~ %원이에요.', v_max using errcode = '22023';
  end if;
  insert into public.payment_refunds (payment_id, owner, owner_username, amount, reason, status,
                                      requested_by, requested_by_username)
  values (pay.id, pay.owner, pay.owner_username, p_amount, v_reason, 'requested',
          auth.uid(), (select p.username from public.profiles p where p.id = auth.uid()))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.master_request_payment_refund(uuid, integer, text) from public, anon;
grant execute on function public.master_request_payment_refund(uuid, integer, text) to authenticated;

-- 결제 환불 요청 취소 — 아직 '요청됨'인 것만. 누가·왜 취소했는지 남긴다.
create or replace function public.master_withdraw_payment_refund(p_refund uuid, p_note text)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  ref    public.payment_refunds%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select r.* into ref
    from public.payment_refunds r
    join public.payments p on p.id = r.payment_id
   where r.id = p_refund and public.master_can_see(p.owner)
   for update of r;
  if not found then
    raise exception '환불 요청을 찾을 수 없어요.' using errcode = '42501';
  end if;
  if ref.status <> 'requested' then
    raise exception '이미 처리된 요청이에요.' using errcode = '55000';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception '메모는 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;
  update public.payment_refunds
     set status = 'withdrawn', processed_by = auth.uid(),
         processed_by_username = (select p.username from public.profiles p where p.id = auth.uid()),
         processed_note = v_note, processed_at = now()
   where id = ref.id;
end; $$;
revoke all on function public.master_withdraw_payment_refund(uuid, text) from public, anon;
grant execute on function public.master_withdraw_payment_refund(uuid, text) to authenticated;


-- 26-9 사업자 정보·약관 바꾸기 — 회사 계정만(is_pricing_admin). 다른 마스터는 이력 읽기만.
-- 사업자 정보·약관도 가격과 같은 사람이 바꾼다 — 사람을 바꿀 때는 is_pricing_admin 한 줄만 고친다.

-- 사업자 정보 고치기. p_patch 는 바꿀 칸만 — 예: {"ceo_name": "홍길동", "biz_no": "123-45-67890"}
-- 빈 글자는 비움(null)으로 본다. 상호·호스팅은 비울 수 없다. 칸마다 "무엇이 무엇에서 무엇으로, 왜, 누가"를 남긴다.
-- 돌려주는 값: { changed: 실제로 바뀐 칸 수, info: 지금 사업자 정보(고친 사람 칸 빼고) }
create or replace function public.master_set_business_info(p_patch jsonb, p_note text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  k       text;
  v_new   text;
  v_old   text;
  v_label text;
  v_max   integer;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_who   text;
  n       integer := 0;
  cur     jsonb;
  allowed text[] := array['company_name','ceo_name','biz_no','mail_order_no','address','phone','email','hours','hosting'];
begin
  if not public.is_pricing_admin() then
    raise exception '이 계정은 사업자 정보를 바꿀 수 없어요.' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception '바꿀 항목이 없어요.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception '바꾼 까닭은 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  -- ① 모양 검사 — 모르는 칸 · 글자가 아닌 값 · 길이 · 모양. 하나라도 틀리면 아무것도 안 바꾼다.
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any(allowed)) then
      raise exception '모르는 항목이에요: %', k using errcode = '22023';
    end if;
    v_label := case k when 'company_name' then '상호' when 'ceo_name' then '대표자'
                      when 'biz_no' then '사업자등록번호' when 'mail_order_no' then '통신판매업 신고번호'
                      when 'address' then '사업장 주소' when 'phone' then '고객센터 전화'
                      when 'email' then '이메일' when 'hours' then '운영 시간' else '호스팅 제공자' end;
    if jsonb_typeof(p_patch -> k) not in ('string','null') then
      raise exception '% 값은 글자여야 해요.', v_label using errcode = '22023';
    end if;
    v_new := nullif(btrim(coalesce(p_patch ->> k, '')), '');
    if k in ('company_name','hosting') and v_new is null then
      raise exception '%은(는) 비워 둘 수 없어요.', v_label using errcode = '22023';
    end if;
    -- 칸마다 최대 길이(표의 check 와 같다). IF 조건 안에 CASE 를 쓰면 CASE 의 THEN 에서 조건이 끊기므로 먼저 담는다.
    v_max := case k when 'company_name' then 60 when 'ceo_name' then 40 when 'mail_order_no' then 60
                    when 'address' then 200 when 'email' then 120 when 'hours' then 100
                    when 'hosting' then 60 else 20 end;
    if v_new is not null and length(v_new) > v_max then
      raise exception '% 값이 너무 길어요.', v_label using errcode = '22023';
    end if;
    if k = 'biz_no' and v_new is not null and v_new !~ '^[0-9]{3}-[0-9]{2}-[0-9]{5}$' then
      raise exception '사업자등록번호는 000-00-00000 모양으로 적어 주세요.' using errcode = '22023';
    end if;
    if k = 'phone' and v_new is not null and v_new !~ '^[0-9+() -]{7,20}$' then
      raise exception '고객센터 전화번호 모양이 아니에요.' using errcode = '22023';
    end if;
    if k = 'email' and v_new is not null and v_new !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception '이메일 모양이 아니에요.' using errcode = '22023';
    end if;
  end loop;

  -- ② 없는 줄이면 기본값으로 한 줄 만든다(표가 비어 있어도 첫 저장이 되게). 잠그고 바꾼다.
  insert into public.app_business_info (id) values (1) on conflict (id) do nothing;
  select to_jsonb(b) into cur from public.app_business_info b where b.id = 1 for update;
  select p.username into v_who from public.profiles p where p.id = auth.uid();

  for k in select jsonb_object_keys(p_patch) loop
    v_new := nullif(btrim(coalesce(p_patch ->> k, '')), '');
    v_old := cur ->> k;
    if v_new is distinct from v_old then
      -- k 는 위에서 허용 목록으로 확인했다 — %I 로 칸 이름만 끼운다(값은 $1 로 따로 넘긴다).
      execute format('update public.app_business_info set %I = $1 where id = 1', k) using v_new;
      insert into public.business_info_changes (field, old_value, new_value, note, changed_by, changed_by_username)
      values (k, v_old, v_new, v_note, auth.uid(), v_who);
      n := n + 1;
    end if;
  end loop;

  if n > 0 then
    update public.app_business_info set updated_at = now(), updated_by = auth.uid() where id = 1;
  end if;
  return json_build_object('changed', n,
    'info', (select to_jsonb(b) - 'updated_by' from public.app_business_info b where b.id = 1));
end; $$;
revoke all on function public.master_set_business_info(jsonb, text) from public, anon;
grant execute on function public.master_set_business_info(jsonb, text) to authenticated;

-- 사업자 정보 바꾼 이력 — 마스터 모두 읽는다(회사 공통 설정이라 개인 기록이 아니다).
create or replace function public.master_business_info_log(p_limit integer default 50)
returns table (id bigint, field text, old_value text, new_value text, note text,
               changed_by_username text, at timestamptz)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return query
    select c.id, c.field, c.old_value, c.new_value, c.note, c.changed_by_username, c.at
      from public.business_info_changes c
     order by c.at desc, c.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end; $$;
revoke all on function public.master_business_info_log(integer) from public, anon;
grant execute on function public.master_business_info_log(integer) to authenticated;

-- 약관 게시 — 새 판을 한 줄 더한다(고치지 않는다). 시행일은 한국 날짜 오늘 ~ 366일 뒤.
-- 판 번호가 겹치지 않게 표를 잠그고 (마지막 판 + 1) 로 적는다.
create or replace function public.master_publish_legal_doc(
  p_kind text, p_title text, p_body text, p_effective date, p_note text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_today date := ((now() at time zone 'utc') + interval '9 hours')::date;   -- 한국 날짜(서머타임 없음)
  v_title text := btrim(coalesce(p_title, ''));
  v_body  text := replace(coalesce(p_body, ''), E'\r\n', E'\n');
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_ver   integer;
  v_id    bigint;
begin
  if not public.is_pricing_admin() then
    raise exception '이 계정은 약관을 게시할 수 없어요.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('terms','privacy','refund') then
    raise exception '모르는 문서 종류예요: %', p_kind using errcode = '22023';
  end if;
  if length(v_title) < 1 or length(v_title) > 100 then
    raise exception '제목을 1~100자로 적어 주세요.' using errcode = '22023';
  end if;
  if btrim(v_body) = '' then
    raise exception '본문을 적어 주세요.' using errcode = '22023';
  end if;
  if length(v_body) > 60000 then
    raise exception '본문은 60,000자까지 적을 수 있어요.' using errcode = '22023';
  end if;
  if p_effective is null or p_effective < v_today or p_effective > v_today + 366 then
    raise exception '시행일은 오늘부터 1년 안으로 정해 주세요.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception '바꾼 까닭은 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  lock table public.app_legal_docs in share row exclusive mode;
  select coalesce(max(d.version), 0) + 1 into v_ver from public.app_legal_docs d where d.kind = p_kind;
  insert into public.app_legal_docs (kind, version, title, body, effective_date, note, published_by, published_by_username)
  values (p_kind, v_ver, v_title, v_body, p_effective, v_note, auth.uid(),
          (select p.username from public.profiles p where p.id = auth.uid()))
  returning id into v_id;
  return json_build_object('id', v_id, 'version', v_ver, 'effective_date', p_effective);
end; $$;
revoke all on function public.master_publish_legal_doc(text, text, text, date, text) from public, anon;
grant execute on function public.master_publish_legal_doc(text, text, text, date, text) to authenticated;

-- 약관 판 이력 — 누가 왜 게시했나(표로는 이 칸을 못 읽는다). 본문 대신 글자 수만.
create or replace function public.master_legal_doc_log(p_kind text, p_limit integer default 50)
returns table (id bigint, version integer, title text, effective_date date, published_at timestamptz,
               published_by_username text, note text, body_length integer)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('terms','privacy','refund') then
    raise exception '모르는 문서 종류예요: %', p_kind using errcode = '22023';
  end if;
  return query
    select d.id, d.version, d.title, d.effective_date, d.published_at, d.published_by_username, d.note,
           length(d.body)
      from public.app_legal_docs d
     where d.kind = p_kind
     order by d.effective_date desc, d.version desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end; $$;
revoke all on function public.master_legal_doc_log(text, integer) from public, anon;
grant execute on function public.master_legal_doc_log(text, integer) to authenticated;
-- ▲ 26번 끝


-- ════════════════════════════════════════════════════════════════════════
-- 확인 — 아래가 새 표 여섯 개를 모두 보여 주면 끝이다.
-- (app_business_info · app_legal_docs · business_info_changes · payment_refunds · payments · subscriptions)
-- ════════════════════════════════════════════════════════════════════════
select table_name as 표
from information_schema.tables
where table_schema = 'public'
  and table_name in ('payments','subscriptions','payment_refunds','app_business_info',
                     'business_info_changes','app_legal_docs')
order by table_name;
