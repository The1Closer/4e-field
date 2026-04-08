-- 4E Field: potential leads that appear on the Doors Map without creating jobs.

create table if not exists public.knock_potential_leads (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  address_normalized text not null,
  homeowner_name text,
  notes text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(address)) > 0)
);

create unique index if not exists knock_potential_leads_rep_address_idx
  on public.knock_potential_leads(rep_id, address_normalized);

create index if not exists knock_potential_leads_created_idx
  on public.knock_potential_leads(created_at desc);

create or replace function public.normalize_knock_potential_lead_address()
returns trigger
language plpgsql
as $$
begin
  new.address := trim(coalesce(new.address, ''));
  if new.address = '' then
    raise exception 'Address is required';
  end if;

  new.address_normalized := lower(regexp_replace(new.address, '\s+', ' ', 'g'));
  return new;
end;
$$;

drop trigger if exists normalize_knock_potential_lead_address on public.knock_potential_leads;
create trigger normalize_knock_potential_lead_address
before insert or update on public.knock_potential_leads
for each row
execute function public.normalize_knock_potential_lead_address();

-- Requires set_updated_at() from 002_knocking_updates.sql.
drop trigger if exists set_knock_potential_leads_updated_at on public.knock_potential_leads;
create trigger set_knock_potential_leads_updated_at
before update on public.knock_potential_leads
for each row
execute function public.set_updated_at();

alter table public.knock_potential_leads enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'rep_select_own_knock_potential_leads'
  ) then
    create policy rep_select_own_knock_potential_leads on public.knock_potential_leads
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'rep_insert_own_knock_potential_leads'
  ) then
    create policy rep_insert_own_knock_potential_leads on public.knock_potential_leads
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'rep_update_own_knock_potential_leads'
  ) then
    create policy rep_update_own_knock_potential_leads on public.knock_potential_leads
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'rep_delete_own_knock_potential_leads'
  ) then
    create policy rep_delete_own_knock_potential_leads on public.knock_potential_leads
      for delete using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'manager_read_knock_potential_leads'
  ) then
    create policy manager_read_knock_potential_leads on public.knock_potential_leads
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
    alter publication supabase_realtime add table public.knock_potential_leads;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
