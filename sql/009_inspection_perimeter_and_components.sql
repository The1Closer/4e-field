-- 4E Field: perimeter findings + component presence section.

alter table public.inspections
  add column if not exists perimeter_findings jsonb not null default '{}'::jsonb,
  add column if not exists component_presence jsonb not null default '{}'::jsonb,
  add column if not exists required_photo_counts jsonb not null default '{"perimeter":8,"roof":8,"damage":10}'::jsonb;

create table if not exists public.inspection_perimeter_checks (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  check_key text not null check (check_key in ('siding', 'gutters', 'downspouts', 'windows', 'damage_overall')),
  condition text not null default 'not_visible' check (condition in ('good', 'damaged', 'missing', 'not_visible')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, check_key)
);

create table if not exists public.inspection_component_presence (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  component_key text not null,
  is_present boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, component_key)
);

create index if not exists inspection_perimeter_checks_inspection_idx
  on public.inspection_perimeter_checks(inspection_id, check_key);

create index if not exists inspection_component_presence_inspection_idx
  on public.inspection_component_presence(inspection_id, component_key);

create or replace function public.inspection_section_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inspection_perimeter_checks_set_updated_at on public.inspection_perimeter_checks;
create trigger inspection_perimeter_checks_set_updated_at
before update on public.inspection_perimeter_checks
for each row
execute function public.inspection_section_set_updated_at();

drop trigger if exists inspection_component_presence_set_updated_at on public.inspection_component_presence;
create trigger inspection_component_presence_set_updated_at
before update on public.inspection_component_presence
for each row
execute function public.inspection_section_set_updated_at();

alter table public.inspection_perimeter_checks enable row level security;
alter table public.inspection_component_presence enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_perimeter_checks' and policyname='rep_select_own_inspection_perimeter_checks'
  ) then
    create policy rep_select_own_inspection_perimeter_checks on public.inspection_perimeter_checks
      for select using (auth.uid() = rep_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_perimeter_checks' and policyname='rep_insert_own_inspection_perimeter_checks'
  ) then
    create policy rep_insert_own_inspection_perimeter_checks on public.inspection_perimeter_checks
      for insert with check (auth.uid() = rep_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_perimeter_checks' and policyname='rep_update_own_inspection_perimeter_checks'
  ) then
    create policy rep_update_own_inspection_perimeter_checks on public.inspection_perimeter_checks
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_component_presence' and policyname='rep_select_own_inspection_component_presence'
  ) then
    create policy rep_select_own_inspection_component_presence on public.inspection_component_presence
      for select using (auth.uid() = rep_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_component_presence' and policyname='rep_insert_own_inspection_component_presence'
  ) then
    create policy rep_insert_own_inspection_component_presence on public.inspection_component_presence
      for insert with check (auth.uid() = rep_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_component_presence' and policyname='rep_update_own_inspection_component_presence'
  ) then
    create policy rep_update_own_inspection_component_presence on public.inspection_component_presence
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.inspection_perimeter_checks;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.inspection_component_presence;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
