-- 4E Field: weekly/monthly rep performance report snapshots.

create table if not exists public.rep_performance_reports (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  timezone text not null default 'UTC',
  week_start_dow integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (rep_id, period_type, period_start, period_end)
);

create index if not exists rep_performance_reports_period_idx
  on public.rep_performance_reports(period_type, period_start desc);

create index if not exists rep_performance_reports_rep_idx
  on public.rep_performance_reports(rep_id, generated_at desc);

alter table public.rep_performance_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rep_performance_reports' and policyname='rep_select_own_rep_performance_reports'
  ) then
    create policy rep_select_own_rep_performance_reports on public.rep_performance_reports
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rep_performance_reports' and policyname='manager_read_rep_performance_reports'
  ) then
    create policy manager_read_rep_performance_reports on public.rep_performance_reports
      for select using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.rep_performance_reports;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
