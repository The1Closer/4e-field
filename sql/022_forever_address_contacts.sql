-- 4E Field: forever address-level contact list with sticky contract status.

create table if not exists public.knock_address_contacts_forever (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  address_normalized text not null,
  homeowner_name text,
  homeowner_phone text,
  homeowner_email text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_source text not null default 'unknown',
  last_knock_event_id uuid,
  last_rep_id uuid references auth.users(id) on delete set null,
  contracted_ever boolean not null default false,
  contracted_ever_at timestamptz,
  contracted_source_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(address)) > 0),
  check (char_length(trim(address_normalized)) > 0)
);

create unique index if not exists knock_address_contacts_forever_address_normalized_idx
  on public.knock_address_contacts_forever(address_normalized);

create index if not exists knock_address_contacts_forever_last_seen_idx
  on public.knock_address_contacts_forever(last_seen_at desc);

create index if not exists knock_address_contacts_forever_contracted_idx
  on public.knock_address_contacts_forever(contracted_ever, last_seen_at desc);

alter table public.knock_address_contacts_forever enable row level security;

revoke all on table public.knock_address_contacts_forever from public;
grant select on table public.knock_address_contacts_forever to authenticated;
grant select on table public.knock_address_contacts_forever to service_role;

-- Reuse the existing shared updated_at trigger helper from migration 002.
drop trigger if exists set_knock_address_contacts_forever_updated_at on public.knock_address_contacts_forever;
create trigger set_knock_address_contacts_forever_updated_at
before update on public.knock_address_contacts_forever
for each row
execute function public.set_updated_at();

create or replace function public.normalize_address_key(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\\s+', ' ', 'g'));
$$;

create or replace function public.build_homeowner_address(
  street text,
  city text,
  state text,
  zip text
)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      concat_ws(
        ', ',
        nullif(trim(coalesce(street, '')), ''),
        nullif(
          trim(
            concat_ws(
              ' ',
              nullif(trim(coalesce(city, '')), ''),
              nullif(trim(coalesce(state, '')), ''),
              nullif(trim(coalesce(zip, '')), '')
            )
          ),
          ''
        )
      )
    ),
    ''
  );
$$;

create or replace function public.sync_knock_address_contact_forever_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_address text;
  next_address text;
  next_name text;
  next_phone text;
  next_email text;
  next_seen_at timestamptz;
begin
  next_address := trim(coalesce(new.address, ''));
  if next_address = '' then
    return new;
  end if;

  normalized_address := public.normalize_address_key(next_address);
  if normalized_address = '' then
    return new;
  end if;

  next_name := nullif(trim(coalesce(new.homeowner_name, '')), '');
  next_phone := nullif(trim(coalesce(new.homeowner_phone, '')), '');
  next_email := nullif(trim(coalesce(new.homeowner_email, '')), '');
  next_seen_at := coalesce(new.created_at, now());

  insert into public.knock_address_contacts_forever (
    address,
    address_normalized,
    homeowner_name,
    homeowner_phone,
    homeowner_email,
    first_seen_at,
    last_seen_at,
    last_source,
    last_knock_event_id,
    last_rep_id
  )
  values (
    next_address,
    normalized_address,
    next_name,
    next_phone,
    next_email,
    next_seen_at,
    next_seen_at,
    'knock_event',
    new.id,
    new.rep_id
  )
  on conflict (address_normalized)
  do update set
    address = excluded.address,
    homeowner_name = coalesce(excluded.homeowner_name, public.knock_address_contacts_forever.homeowner_name),
    homeowner_phone = coalesce(excluded.homeowner_phone, public.knock_address_contacts_forever.homeowner_phone),
    homeowner_email = coalesce(excluded.homeowner_email, public.knock_address_contacts_forever.homeowner_email),
    first_seen_at = least(public.knock_address_contacts_forever.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.knock_address_contacts_forever.last_seen_at, excluded.last_seen_at),
    last_source = 'knock_event',
    last_knock_event_id = excluded.last_knock_event_id,
    last_rep_id = coalesce(excluded.last_rep_id, public.knock_address_contacts_forever.last_rep_id);

  return new;
end;
$$;

drop trigger if exists sync_knock_address_contact_forever_from_event on public.knock_events;
create trigger sync_knock_address_contact_forever_from_event
after insert or update of address, homeowner_name, homeowner_phone, homeowner_email, rep_id, created_at
on public.knock_events
for each row
execute function public.sync_knock_address_contact_forever_from_event();

create or replace function public.refresh_knock_address_contacts_forever()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  knock_upserts integer := 0;
  crm_upserts integer := 0;
  contract_rows integer := 0;
  threshold_sort_order integer := null;
begin
  with latest_knocks as (
    select distinct on (public.normalize_address_key(e.address))
      trim(e.address) as address,
      public.normalize_address_key(e.address) as address_normalized,
      nullif(trim(coalesce(e.homeowner_name, '')), '') as homeowner_name,
      nullif(trim(coalesce(e.homeowner_phone, '')), '') as homeowner_phone,
      nullif(trim(coalesce(e.homeowner_email, '')), '') as homeowner_email,
      e.created_at as event_created_at,
      e.id as knock_event_id,
      e.rep_id as rep_id
    from public.knock_events e
    where nullif(trim(coalesce(e.address, '')), '') is not null
    order by public.normalize_address_key(e.address), e.created_at desc, e.id desc
  )
  insert into public.knock_address_contacts_forever (
    address,
    address_normalized,
    homeowner_name,
    homeowner_phone,
    homeowner_email,
    first_seen_at,
    last_seen_at,
    last_source,
    last_knock_event_id,
    last_rep_id
  )
  select
    lk.address,
    lk.address_normalized,
    lk.homeowner_name,
    lk.homeowner_phone,
    lk.homeowner_email,
    lk.event_created_at,
    lk.event_created_at,
    'knock_event'::text,
    lk.knock_event_id,
    lk.rep_id
  from latest_knocks lk
  on conflict (address_normalized)
  do update set
    address = excluded.address,
    homeowner_name = coalesce(excluded.homeowner_name, public.knock_address_contacts_forever.homeowner_name),
    homeowner_phone = coalesce(excluded.homeowner_phone, public.knock_address_contacts_forever.homeowner_phone),
    homeowner_email = coalesce(excluded.homeowner_email, public.knock_address_contacts_forever.homeowner_email),
    first_seen_at = least(public.knock_address_contacts_forever.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.knock_address_contacts_forever.last_seen_at, excluded.last_seen_at),
    last_source = case
      when excluded.last_seen_at >= public.knock_address_contacts_forever.last_seen_at then 'knock_event'
      else public.knock_address_contacts_forever.last_source
    end,
    last_knock_event_id = case
      when excluded.last_seen_at >= public.knock_address_contacts_forever.last_seen_at
        then excluded.last_knock_event_id
      else public.knock_address_contacts_forever.last_knock_event_id
    end,
    last_rep_id = coalesce(excluded.last_rep_id, public.knock_address_contacts_forever.last_rep_id);

  get diagnostics knock_upserts = row_count;

  with crm_contacts as (
    select
      j.id as job_id,
      j.created_at,
      public.build_homeowner_address(h.address, h.city, h.state, h.zip) as full_address,
      nullif(trim(coalesce(h.name, '')), '') as homeowner_name,
      nullif(trim(coalesce(h.phone, '')), '') as homeowner_phone,
      nullif(trim(coalesce(h.email, '')), '') as homeowner_email,
      jr.profile_id as rep_id
    from public.jobs j
    join public.homeowners h
      on h.id::text = j.homeowner_id::text
    left join lateral (
      select jr_inner.profile_id
      from public.job_reps jr_inner
      where jr_inner.job_id = j.id
      order by jr_inner.profile_id asc
      limit 1
    ) jr on true
    where public.build_homeowner_address(h.address, h.city, h.state, h.zip) is not null
  ),
  latest_crm as (
    select distinct on (public.normalize_address_key(c.full_address))
      trim(c.full_address) as address,
      public.normalize_address_key(c.full_address) as address_normalized,
      c.homeowner_name,
      c.homeowner_phone,
      c.homeowner_email,
      c.created_at,
      c.rep_id
    from crm_contacts c
    order by public.normalize_address_key(c.full_address), c.created_at desc, c.job_id desc
  )
  insert into public.knock_address_contacts_forever (
    address,
    address_normalized,
    homeowner_name,
    homeowner_phone,
    homeowner_email,
    first_seen_at,
    last_seen_at,
    last_source,
    last_rep_id
  )
  select
    c.address,
    c.address_normalized,
    c.homeowner_name,
    c.homeowner_phone,
    c.homeowner_email,
    c.created_at,
    c.created_at,
    'crm_job'::text,
    c.rep_id
  from latest_crm c
  on conflict (address_normalized)
  do update set
    address = excluded.address,
    homeowner_name = coalesce(excluded.homeowner_name, public.knock_address_contacts_forever.homeowner_name),
    homeowner_phone = coalesce(excluded.homeowner_phone, public.knock_address_contacts_forever.homeowner_phone),
    homeowner_email = coalesce(excluded.homeowner_email, public.knock_address_contacts_forever.homeowner_email),
    first_seen_at = least(public.knock_address_contacts_forever.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.knock_address_contacts_forever.last_seen_at, excluded.last_seen_at),
    last_source = case
      when excluded.last_seen_at >= public.knock_address_contacts_forever.last_seen_at then 'crm_job'
      else public.knock_address_contacts_forever.last_source
    end,
    last_rep_id = coalesce(public.knock_address_contacts_forever.last_rep_id, excluded.last_rep_id);

  get diagnostics crm_upserts = row_count;

  select ps.sort_order
  into threshold_sort_order
  from public.pipeline_stages ps
  where lower(regexp_replace(trim(coalesce(ps.name, '')), '\\s+', ' ', 'g')) = 'contracted awaiting deposit'
  order by ps.sort_order asc nulls last
  limit 1;

  if threshold_sort_order is null then
    select ps.sort_order
    into threshold_sort_order
    from public.pipeline_stages ps
    where lower(regexp_replace(trim(coalesce(ps.name, '')), '\\s+', ' ', 'g')) like '%contracted%awaiting%deposit%'
    order by ps.sort_order asc nulls last
    limit 1;
  end if;

  if threshold_sort_order is not null then
    with contracted_candidates as (
      select distinct on (public.normalize_address_key(public.build_homeowner_address(h.address, h.city, h.state, h.zip)))
        j.id as job_id,
        trim(public.build_homeowner_address(h.address, h.city, h.state, h.zip)) as address,
        public.normalize_address_key(public.build_homeowner_address(h.address, h.city, h.state, h.zip)) as address_normalized,
        nullif(trim(coalesce(h.name, '')), '') as homeowner_name,
        nullif(trim(coalesce(h.phone, '')), '') as homeowner_phone,
        nullif(trim(coalesce(h.email, '')), '') as homeowner_email,
        j.created_at,
        jr.profile_id as rep_id
      from public.jobs j
      join public.homeowners h
        on h.id::text = j.homeowner_id::text
      left join public.pipeline_stages ps
        on ps.id::text = j.stage_id::text
      left join lateral (
        select jr_inner.profile_id
        from public.job_reps jr_inner
        where jr_inner.job_id = j.id
        order by jr_inner.profile_id asc
        limit 1
      ) jr on true
      where public.build_homeowner_address(h.address, h.city, h.state, h.zip) is not null
        and coalesce(ps.sort_order, 0) >= threshold_sort_order
      order by public.normalize_address_key(public.build_homeowner_address(h.address, h.city, h.state, h.zip)),
        j.created_at desc,
        j.id desc
    )
    insert into public.knock_address_contacts_forever (
      address,
      address_normalized,
      homeowner_name,
      homeowner_phone,
      homeowner_email,
      first_seen_at,
      last_seen_at,
      last_source,
      last_rep_id,
      contracted_ever,
      contracted_ever_at,
      contracted_source_job_id
    )
    select
      c.address,
      c.address_normalized,
      c.homeowner_name,
      c.homeowner_phone,
      c.homeowner_email,
      c.created_at,
      c.created_at,
      'crm_job'::text,
      c.rep_id,
      true,
      now(),
      c.job_id
    from contracted_candidates c
    on conflict (address_normalized)
    do update set
      contracted_ever = true,
      contracted_ever_at = coalesce(public.knock_address_contacts_forever.contracted_ever_at, now()),
      contracted_source_job_id = coalesce(
        public.knock_address_contacts_forever.contracted_source_job_id,
        excluded.contracted_source_job_id
      ),
      homeowner_name = coalesce(excluded.homeowner_name, public.knock_address_contacts_forever.homeowner_name),
      homeowner_phone = coalesce(excluded.homeowner_phone, public.knock_address_contacts_forever.homeowner_phone),
      homeowner_email = coalesce(excluded.homeowner_email, public.knock_address_contacts_forever.homeowner_email),
      last_seen_at = greatest(public.knock_address_contacts_forever.last_seen_at, excluded.last_seen_at),
      last_source = case
        when excluded.last_seen_at >= public.knock_address_contacts_forever.last_seen_at then 'crm_job'
        else public.knock_address_contacts_forever.last_source
      end,
      last_rep_id = coalesce(public.knock_address_contacts_forever.last_rep_id, excluded.last_rep_id)
    where public.knock_address_contacts_forever.contracted_ever is false;

    get diagnostics contract_rows = row_count;
  end if;

  return jsonb_build_object(
    'knockUpserts', knock_upserts,
    'crmUpserts', crm_upserts,
    'contractUpdates', contract_rows,
    'contractThresholdSortOrder', threshold_sort_order
  );
end;
$$;

revoke all on function public.refresh_knock_address_contacts_forever() from public;
grant execute on function public.refresh_knock_address_contacts_forever() to authenticated;
grant execute on function public.refresh_knock_address_contacts_forever() to service_role;

-- Rep visibility: rows tied to their knock history or assigned CRM jobs.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_address_contacts_forever'
      and policyname = 'rep_select_scoped_knock_address_contacts_forever'
  ) then
    create policy rep_select_scoped_knock_address_contacts_forever on public.knock_address_contacts_forever
      for select
      using (
        exists (
          select 1
          from public.knock_events e
          where e.rep_id = auth.uid()
            and public.normalize_address_key(e.address) = knock_address_contacts_forever.address_normalized
        )
        or exists (
          select 1
          from public.jobs j
          join public.job_reps jr
            on jr.job_id = j.id
          join public.homeowners h
            on h.id::text = j.homeowner_id::text
          where jr.profile_id = auth.uid()
            and public.normalize_address_key(public.build_homeowner_address(h.address, h.city, h.state, h.zip)) =
              knock_address_contacts_forever.address_normalized
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_address_contacts_forever'
      and policyname = 'manager_read_knock_address_contacts_forever'
  ) then
    create policy manager_read_knock_address_contacts_forever on public.knock_address_contacts_forever
      for select
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;
end $$;

-- Initial backfill from historical knock + CRM data and current contract stages.
select public.refresh_knock_address_contacts_forever();
