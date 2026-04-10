-- 4E Field: guided inspection core entities.

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.knock_sessions(id) on delete set null,
  knock_event_id uuid references public.knock_events(id) on delete set null,
  linked_job_id uuid,
  status text not null default 'in_progress' check (status in ('draft', 'in_progress', 'completed', 'archived')),
  current_step text not null default 'precheck',
  homeowner_name text,
  homeowner_phone text,
  homeowner_email text,
  homeowner_address text,
  signature_rep_name text,
  signature_signed_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_steps (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  step_key text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  skipped_reason text,
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, step_key)
);

create index if not exists inspections_rep_status_idx
  on public.inspections(rep_id, status, started_at desc);

create index if not exists inspections_job_idx
  on public.inspections(linked_job_id, created_at desc);

create index if not exists inspection_steps_inspection_idx
  on public.inspection_steps(inspection_id, created_at asc);

create or replace function public.inspections_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inspections_set_updated_at on public.inspections;
create trigger inspections_set_updated_at
before update on public.inspections
for each row
execute function public.inspections_set_updated_at();

drop trigger if exists inspection_steps_set_updated_at on public.inspection_steps;
create trigger inspection_steps_set_updated_at
before update on public.inspection_steps
for each row
execute function public.inspections_set_updated_at();

alter table public.inspections enable row level security;
alter table public.inspection_steps enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspections' and policyname='rep_select_own_inspections'
  ) then
    create policy rep_select_own_inspections on public.inspections
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspections' and policyname='rep_insert_own_inspections'
  ) then
    create policy rep_insert_own_inspections on public.inspections
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspections' and policyname='rep_update_own_inspections'
  ) then
    create policy rep_update_own_inspections on public.inspections
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspections' and policyname='manager_read_inspections'
  ) then
    create policy manager_read_inspections on public.inspections
      for select using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_steps' and policyname='rep_select_own_inspection_steps'
  ) then
    create policy rep_select_own_inspection_steps on public.inspection_steps
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_steps' and policyname='rep_insert_own_inspection_steps'
  ) then
    create policy rep_insert_own_inspection_steps on public.inspection_steps
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_steps' and policyname='rep_update_own_inspection_steps'
  ) then
    create policy rep_update_own_inspection_steps on public.inspection_steps
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_steps' and policyname='manager_read_inspection_steps'
  ) then
    create policy manager_read_inspection_steps on public.inspection_steps
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
    alter publication supabase_realtime add table public.inspections;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.inspection_steps;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
