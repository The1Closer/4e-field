-- 4E Field: persisted job geocode cache for territory heat map aggregation.

create table if not exists public.job_geocode_cache (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  address text not null,
  address_hash text not null,
  latitude double precision,
  longitude double precision,
  lookup_status text not null default 'pending',
  geocoded_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_geocode_cache_address_hash
  on public.job_geocode_cache (address_hash);

alter table public.job_geocode_cache enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_geocode_cache'
      and policyname = 'job_geocode_cache_select_scoped'
  ) then
    create policy job_geocode_cache_select_scoped on public.job_geocode_cache
      for select using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
        or exists (
          select 1
          from public.job_reps jr
          where jr.profile_id = auth.uid()
            and jr.job_id = job_geocode_cache.job_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_geocode_cache'
      and policyname = 'job_geocode_cache_insert_scoped'
  ) then
    create policy job_geocode_cache_insert_scoped on public.job_geocode_cache
      for insert with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
        or exists (
          select 1
          from public.job_reps jr
          where jr.profile_id = auth.uid()
            and jr.job_id = job_geocode_cache.job_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'job_geocode_cache'
      and policyname = 'job_geocode_cache_update_scoped'
  ) then
    create policy job_geocode_cache_update_scoped on public.job_geocode_cache
      for update using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
        or exists (
          select 1
          from public.job_reps jr
          where jr.profile_id = auth.uid()
            and jr.job_id = job_geocode_cache.job_id
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
        or exists (
          select 1
          from public.job_reps jr
          where jr.profile_id = auth.uid()
            and jr.job_id = job_geocode_cache.job_id
        )
      );
  end if;
end $$;

revoke all on table public.job_geocode_cache from public;
grant select, insert, update on table public.job_geocode_cache to authenticated;
grant select, insert, update on table public.job_geocode_cache to service_role;
