-- ============================================================
-- المرحلة ٨ — تطبيع بيانات المزرعة من farms.data (jsonb)
-- إلى جداول (PROMPT §4): plots, cycles, tasks, stock,
-- harvests, sales, costs, docs — RLS مالك فقط على الجميع.
-- الترحيل عبر scripts/migrate-jsonb.ts، وجدول farms يبقى
-- كمصدر قديم حتى اكتمال التحقق ثم يُعطَّل الكتابة إليه.
-- ============================================================

create table if not exists public.plots (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  area_m2    numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cycles (
  id           uuid primary key,
  owner        uuid not null references auth.users (id) on delete cascade,
  plot_id      uuid references public.plots (id) on delete set null,
  crop         text not null,
  start_date   date not null,
  harvest_days integer,
  status       text not null default 'active',
  created_at   timestamptz not null default now()
);

create table if not exists public.tasks (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  due        date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.stock (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  qty        numeric not null default 0,
  unit       text not null,
  min_qty    numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.harvests (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  crop       text not null,
  qty        numeric not null,
  unit       text not null,
  date       date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  item       text not null,
  amount     numeric not null,
  date       date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.costs (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  item       text not null,
  amount     numeric not null,
  date       date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.docs (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  expiry     date,
  created_at timestamptz not null default now()
);

-- فهارس المالك
create index if not exists plots_owner_idx    on public.plots (owner);
create index if not exists cycles_owner_idx   on public.cycles (owner);
create index if not exists tasks_owner_idx    on public.tasks (owner, done, due);
create index if not exists stock_owner_idx    on public.stock (owner);
create index if not exists harvests_owner_idx on public.harvests (owner);
create index if not exists sales_owner_idx    on public.sales (owner);
create index if not exists costs_owner_idx    on public.costs (owner);
create index if not exists docs_owner_idx     on public.docs (owner, expiry);

-- RLS: المالك فقط على الجداول الثمانية
do $$
declare t text;
begin
  foreach t in array array['plots','cycles','tasks','stock','harvests','sales','costs','docs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_owner_all" on public.%I', t, t);
    execute format(
      'create policy "%s_owner_all" on public.%I for all using (auth.uid() = owner) with check (auth.uid() = owner)',
      t, t
    );
  end loop;
end $$;
