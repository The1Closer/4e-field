-- 4E Field: generated reports and CRM attachment references.

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete cascade,
  measurement_id uuid references public.roof_measurements(id) on delete set null,
  rep_id uuid not null references auth.users(id) on delete cascade,
  linked_job_id uuid,
  report_type text not null check (report_type in ('inspection', 'measurement')),
  version integer not null default 1,
  title text not null,
  file_name text not null,
  file_path text not null unique,
  content_type text,
  size_bytes bigint,
  selected_photo_ids uuid[] not null default '{}',
  crm_document_id text,
  crm_job_id text,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists inspection_reports_inspection_idx
  on public.inspection_reports(inspection_id, report_type, version desc);

create index if not exists inspection_reports_job_idx
  on public.inspection_reports(linked_job_id, generated_at desc);

alter table public.inspection_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_reports' and policyname='rep_select_own_inspection_reports'
  ) then
    create policy rep_select_own_inspection_reports on public.inspection_reports
      for select using (auth.uid() = rep_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_reports' and policyname='rep_insert_own_inspection_reports'
  ) then
    create policy rep_insert_own_inspection_reports on public.inspection_reports
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_reports' and policyname='manager_read_inspection_reports'
  ) then
    create policy manager_read_inspection_reports on public.inspection_reports
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
    alter publication supabase_realtime add table public.inspection_reports;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
