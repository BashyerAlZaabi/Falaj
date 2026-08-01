-- ============================================================
-- المرحلة صفر — مخطط قاعدة البيانات (PROMPT §4 + §7)
-- profiles · farms · listings · usage  +  RLS  +  trigger
-- قرار مقصود: بيانات المزرعة jsonb في صف واحد. التطبيع في المرحلة ٨.
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  activity   text,
  emirate    text,
  answers    jsonb not null default '{}'::jsonb,
  role       text  not null default 'owner',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_owner_select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_owner_insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_owner_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_owner_delete" on public.profiles
  for delete using (auth.uid() = id);

-- ---------- farms ----------
create table if not exists public.farms (
  owner      uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.farms enable row level security;

create policy "farms_owner_select" on public.farms
  for select using (auth.uid() = owner);
create policy "farms_owner_insert" on public.farms
  for insert with check (auth.uid() = owner);
create policy "farms_owner_update" on public.farms
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "farms_owner_delete" on public.farms
  for delete using (auth.uid() = owner);

-- ---------- listings ----------
create table if not exists public.listings (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users (id) on delete cascade,
  emirate    text,
  activity   text,
  area_m2    numeric,
  goal       text,
  body       text,
  status     text not null default 'draft',
  created_at timestamptz not null default now()
);

alter table public.listings enable row level security;

-- المالك يقرأ ويكتب صفوفه فقط
create policy "listings_owner_select" on public.listings
  for select using (auth.uid() = owner);
create policy "listings_owner_insert" on public.listings
  for insert with check (auth.uid() = owner);
create policy "listings_owner_update" on public.listings
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "listings_owner_delete" on public.listings
  for delete using (auth.uid() = owner);

-- استثناء واحد: العروض المفتوحة يقرأها أي مستخدم مسجّل (أساس جهة المستثمر)
create policy "listings_open_read" on public.listings
  for select to authenticated using (status = 'open');

-- ---------- usage (حد استهلاك الوكيل — PROMPT §7) ----------
-- صف لكل نداء؛ الحد يُحسب بعدّ صفوف الساعة الأخيرة لكل user_id.
create table if not exists public.usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists usage_user_time_idx
  on public.usage (user_id, created_at desc);

alter table public.usage enable row level security;

create policy "usage_owner_select" on public.usage
  for select using (auth.uid() = user_id);
create policy "usage_owner_insert" on public.usage
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- Trigger: إنشاء profiles تلقائياً لكل مستخدم جديد في auth.users
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
