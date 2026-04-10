-- 4E Field: AI/heuristic territory suggestion snapshots.

create table if not exists public.territory_suggestion_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  rep_id uuid references auth.users(id) on delete cascade,
  area_key text not null,
  center_lat double precision,
  center_lng double precision,
  zip text,
  score numeric(8,4) not null default 0,
  rank integer not null default 1,
  reasons jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (snapshot_date, rep_id, area_key)
);

create index if not exists territory_suggestion_snapshots_rep_idx
  on public.territory_suggestion_snapshots(rep_id, snapshot_date desc, rank asc);

create index if not exists territory_suggestion_snapshots_zip_idx
  on public.territory_suggestion_snapshots(zip, snapshot_date desc);

alter table public.territory_suggestion_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='territory_suggestion_snapshots' and policyname='rep_select_own_territory_suggestion_snapshots'
  ) then
    create policy rep_select_own_territory_suggestion_snapshots on public.territory_suggestion_snapshots
      for select using (rep_id is null or rep_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='territory_suggestion_snapshots' and policyname='manager_read_territory_suggestion_snapshots'
  ) then
    create policy manager_read_territory_suggestion_snapshots on public.territory_suggestion_snapshots
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
    alter publication supabase_realtime add table public.territory_suggestion_snapshots;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
