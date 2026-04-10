-- 4E Field: full roof measurement model (area + linear features).

create table if not exists public.roof_measurements (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete set null,
  linked_job_id uuid,
  rep_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'completed', 'archived')),
  total_area_sqft numeric(12,2) not null default 0,
  total_squares numeric(10,2) not null default 0,
  ridge_feet numeric(10,2) not null default 0,
  hip_feet numeric(10,2) not null default 0,
  valley_feet numeric(10,2) not null default 0,
  rake_feet numeric(10,2) not null default 0,
  eave_feet numeric(10,2) not null default 0,
  starter_feet numeric(10,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roof_measurement_polygons (
  id uuid primary key default gen_random_uuid(),
  measurement_id uuid not null references public.roof_measurements(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  polygon_index integer not null default 0,
  points jsonb not null default '[]'::jsonb,
  area_sqft numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.roof_measurement_segments (
  id uuid primary key default gen_random_uuid(),
  measurement_id uuid not null references public.roof_measurements(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  segment_type text not null check (segment_type in ('ridge', 'hip', 'valley', 'rake', 'eave', 'starter', 'other')),
  points jsonb not null default '[]'::jsonb,
  length_feet numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists roof_measurements_rep_created_idx
  on public.roof_measurements(rep_id, created_at desc);

create index if not exists roof_measurements_job_idx
  on public.roof_measurements(linked_job_id, created_at desc);

create index if not exists roof_measurement_segments_measurement_idx
  on public.roof_measurement_segments(measurement_id, segment_type);

create index if not exists roof_measurement_polygons_measurement_idx
  on public.roof_measurement_polygons(measurement_id, polygon_index);

create or replace function public.roof_measurements_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists roof_measurements_set_updated_at on public.roof_measurements;
create trigger roof_measurements_set_updated_at
before update on public.roof_measurements
for each row
execute function public.roof_measurements_set_updated_at();

alter table public.roof_measurements enable row level security;
alter table public.roof_measurement_polygons enable row level security;
alter table public.roof_measurement_segments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roof_measurements' and policyname='rep_select_own_roof_measurements'
  ) then
    create policy rep_select_own_roof_measurements on public.roof_measurements
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roof_measurements' and policyname='rep_insert_own_roof_measurements'
  ) then
    create policy rep_insert_own_roof_measurements on public.roof_measurements
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roof_measurements' and policyname='rep_update_own_roof_measurements'
  ) then
    create policy rep_update_own_roof_measurements on public.roof_measurements
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roof_measurement_polygons' and policyname='rep_select_own_roof_measurement_polygons'
  ) then
    create policy rep_select_own_roof_measurement_polygons on public.roof_measurement_polygons
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roof_measurement_polygons' and policyname='rep_insert_own_roof_measurement_polygons'
  ) then
    create policy rep_insert_own_roof_measurement_polygons on public.roof_measurement_polygons
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roof_measurement_segments' and policyname='rep_select_own_roof_measurement_segments'
  ) then
    create policy rep_select_own_roof_measurement_segments on public.roof_measurement_segments
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='roof_measurement_segments' and policyname='rep_insert_own_roof_measurement_segments'
  ) then
    create policy rep_insert_own_roof_measurement_segments on public.roof_measurement_segments
      for insert with check (auth.uid() = rep_id);
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.roof_measurements;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.roof_measurement_polygons;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.roof_measurement_segments;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
