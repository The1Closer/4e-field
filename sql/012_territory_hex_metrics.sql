-- 4E Field: territory hex-like rollup metrics by date.

create or replace function public.territory_hex_key(lat double precision, lng double precision, precision_scale integer default 2)
returns text
language sql
immutable
as $$
  select concat(
    round(lat::numeric, precision_scale),
    ':',
    round(lng::numeric, precision_scale)
  )
$$;

create table if not exists public.territory_hex_daily_metrics (
  id bigserial primary key,
  metric_date date not null,
  hex_key text not null,
  center_lat double precision,
  center_lng double precision,
  zip text,
  knocks integer not null default 0,
  talks integer not null default 0,
  inspections integer not null default 0,
  contingencies integer not null default 0,
  conversions integer not null default 0,
  approvals integer not null default 0,
  jobs_total integer not null default 0,
  score numeric(8,4) not null default 0,
  created_at timestamptz not null default now(),
  unique (metric_date, hex_key)
);

create index if not exists territory_hex_daily_metrics_date_idx
  on public.territory_hex_daily_metrics(metric_date desc);

create index if not exists territory_hex_daily_metrics_zip_idx
  on public.territory_hex_daily_metrics(zip, metric_date desc);

alter table public.territory_hex_daily_metrics enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='territory_hex_daily_metrics' and policyname='authenticated_select_territory_hex_daily_metrics'
  ) then
    create policy authenticated_select_territory_hex_daily_metrics on public.territory_hex_daily_metrics
      for select using (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.territory_hex_daily_metrics;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
