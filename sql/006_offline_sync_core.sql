-- 4E Field: offline sync queue core tables (idempotent replay + receipts).

create table if not exists public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  client_operation_id text not null,
  operation_type text not null check (operation_type in ('insert', 'update', 'upsert', 'delete')),
  resource_type text not null,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'synced', 'failed')),
  attempts integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rep_id, client_operation_id)
);

create table if not exists public.sync_receipts (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.sync_operations(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  receipt_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (rep_id, receipt_key)
);

create index if not exists sync_operations_rep_status_idx
  on public.sync_operations(rep_id, status, queued_at asc);

create index if not exists sync_operations_resource_idx
  on public.sync_operations(resource_type, resource_id);

create index if not exists sync_receipts_rep_created_idx
  on public.sync_receipts(rep_id, created_at desc);

-- Reuse helper from 002 if present.
create or replace function public.sync_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_operations_set_updated_at on public.sync_operations;
create trigger sync_operations_set_updated_at
before update on public.sync_operations
for each row
execute function public.sync_set_updated_at();

alter table public.sync_operations enable row level security;
alter table public.sync_receipts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sync_operations' and policyname='rep_select_own_sync_operations'
  ) then
    create policy rep_select_own_sync_operations on public.sync_operations
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sync_operations' and policyname='rep_insert_own_sync_operations'
  ) then
    create policy rep_insert_own_sync_operations on public.sync_operations
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sync_operations' and policyname='rep_update_own_sync_operations'
  ) then
    create policy rep_update_own_sync_operations on public.sync_operations
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sync_operations' and policyname='manager_read_sync_operations'
  ) then
    create policy manager_read_sync_operations on public.sync_operations
      for select using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sync_receipts' and policyname='rep_select_own_sync_receipts'
  ) then
    create policy rep_select_own_sync_receipts on public.sync_receipts
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sync_receipts' and policyname='rep_insert_own_sync_receipts'
  ) then
    create policy rep_insert_own_sync_receipts on public.sync_receipts
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sync_receipts' and policyname='manager_read_sync_receipts'
  ) then
    create policy manager_read_sync_receipts on public.sync_receipts
      for select using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.sync_operations;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.sync_receipts;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
