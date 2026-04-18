-- 4E Field: paginated, viewport-aware doors map pin listing.

create or replace function public.list_knock_door_pins_paginated(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search_term text default null,
  p_status_filters text[] default null,
  p_min_lat double precision default null,
  p_max_lat double precision default null,
  p_min_lng double precision default null,
  p_max_lng double precision default null,
  p_manager_view boolean default false
)
returns table (
  address text,
  address_normalized text,
  lat double precision,
  lng double precision,
  knocks integer,
  potential_lead_count integer,
  last_knocked_at timestamptz,
  last_outcome text,
  last_homeowner_name text,
  last_potential_lead_at timestamptz,
  resolved_lead_status text,
  last_knocked_rep_id uuid,
  last_knocked_rep_name text,
  rep_count integer,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_is_manager boolean := false;
  allow_manager_view boolean := false;
  safe_page integer := greatest(1, coalesce(p_page, 1));
  safe_page_size integer := least(100, greatest(1, coalesce(p_page_size, 25)));
  safe_offset integer;
  search_query text := lower(trim(coalesce(p_search_term, '')));
begin
  requester_id := auth.uid();
  if requester_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = requester_id
      and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
  ) into requester_is_manager;

  allow_manager_view := requester_is_manager and coalesce(p_manager_view, false);
  safe_offset := (safe_page - 1) * safe_page_size;

  return query
  with events_scoped as (
    select
      e.id,
      trim(e.address) as address,
      public.normalize_address_key(e.address) as address_normalized,
      e.latitude,
      e.longitude,
      e.created_at,
      e.outcome,
      e.homeowner_name,
      e.rep_id
    from public.knock_events e
    where nullif(trim(coalesce(e.address, '')), '') is not null
      and (
        allow_manager_view
        or e.rep_id = requester_id
      )
  ),
  events_agg as (
    select
      es.address_normalized,
      count(*)::integer as knocks,
      max(es.created_at) as last_knocked_at,
      count(distinct es.rep_id)::integer as rep_count
    from events_scoped es
    group by es.address_normalized
  ),
  latest_event as (
    select distinct on (es.address_normalized)
      es.address,
      es.address_normalized,
      es.latitude,
      es.longitude,
      es.created_at,
      es.outcome,
      nullif(trim(coalesce(es.homeowner_name, '')), '') as homeowner_name,
      es.rep_id
    from events_scoped es
    order by es.address_normalized, es.created_at desc, es.id desc
  ),
  latest_event_rep as (
    select distinct on (es.address_normalized)
      es.address_normalized,
      es.rep_id,
      es.created_at,
      es.id
    from events_scoped es
    where es.rep_id is not null
    order by es.address_normalized, es.created_at desc, es.id desc
  ),
  leads_scoped as (
    select
      l.id,
      trim(l.address) as address,
      public.normalize_address_key(l.address) as address_normalized,
      l.latitude,
      l.longitude,
      l.created_at,
      l.updated_at,
      nullif(trim(coalesce(l.homeowner_name, '')), '') as homeowner_name,
      nullif(trim(coalesce(l.lead_status, '')), '') as lead_status,
      l.rep_id
    from public.knock_potential_leads l
    where nullif(trim(coalesce(l.address, '')), '') is not null
      and (
        allow_manager_view
        or l.rep_id = requester_id
        or l.lead_status = 'do_not_knock'
      )
  ),
  leads_agg as (
    select
      ls.address_normalized,
      count(*)::integer as potential_lead_count,
      max(ls.created_at) as last_potential_lead_at
    from leads_scoped ls
    group by ls.address_normalized
  ),
  latest_lead as (
    select distinct on (ls.address_normalized)
      ls.address,
      ls.address_normalized,
      ls.latitude,
      ls.longitude,
      ls.created_at,
      ls.updated_at,
      ls.homeowner_name,
      ls.lead_status
    from leads_scoped ls
    order by ls.address_normalized, coalesce(ls.updated_at, ls.created_at) desc, ls.id desc
  ),
  all_address_keys as (
    select ea.address_normalized
    from events_agg ea
    union
    select la.address_normalized
    from leads_agg la
  ),
  combined as (
    select
      coalesce(le.address, ll.address) as address,
      keys.address_normalized,
      coalesce(le.latitude, ll.latitude) as lat,
      coalesce(le.longitude, ll.longitude) as lng,
      coalesce(ea.knocks, 0) as knocks,
      coalesce(la.potential_lead_count, 0) as potential_lead_count,
      ea.last_knocked_at,
      le.outcome as last_outcome,
      coalesce(le.homeowner_name, ll.homeowner_name) as last_homeowner_name,
      la.last_potential_lead_at,
      case
        when ll.lead_status in ('new', 'contacted', 'appointment_set', 'not_interested', 'do_not_knock')
          then ll.lead_status
        else null
      end as resolved_lead_status,
      case when allow_manager_view then ler.rep_id else null end as last_knocked_rep_id,
      case
        when allow_manager_view and ler.rep_id is not null
          then coalesce(nullif(trim(coalesce(p.full_name, '')), ''), ler.rep_id::text)
        else null
      end as last_knocked_rep_name,
      coalesce(ea.rep_count, 0) as rep_count,
      coalesce(ea.last_knocked_at, la.last_potential_lead_at) as activity_sort_at
    from all_address_keys keys
    left join events_agg ea
      on ea.address_normalized = keys.address_normalized
    left join latest_event le
      on le.address_normalized = keys.address_normalized
    left join latest_event_rep ler
      on ler.address_normalized = keys.address_normalized
    left join leads_agg la
      on la.address_normalized = keys.address_normalized
    left join latest_lead ll
      on ll.address_normalized = keys.address_normalized
    left join public.profiles p
      on p.id = ler.rep_id
  ),
  filtered as (
    select
      c.*,
      coalesce(c.resolved_lead_status, 'no_lead') as status_key
    from combined c
    where (
      search_query = ''
      or c.address ilike ('%' || search_query || '%')
      or coalesce(c.last_homeowner_name, '') ilike ('%' || search_query || '%')
      or coalesce(c.last_outcome, '') ilike ('%' || search_query || '%')
      or coalesce(c.resolved_lead_status, '') ilike ('%' || search_query || '%')
      or coalesce(c.last_knocked_rep_name, '') ilike ('%' || search_query || '%')
    )
    and (
      p_status_filters is null
      or cardinality(p_status_filters) = 0
      or coalesce(c.resolved_lead_status, 'no_lead') = any(p_status_filters)
    )
    and (
      p_min_lat is null
      or p_max_lat is null
      or p_min_lng is null
      or p_max_lng is null
      or (
        c.lat is not null
        and c.lng is not null
        and c.lat between p_min_lat and p_max_lat
        and c.lng between p_min_lng and p_max_lng
      )
    )
  ),
  counted as (
    select
      f.address,
      f.address_normalized,
      f.lat,
      f.lng,
      f.knocks,
      f.potential_lead_count,
      f.last_knocked_at,
      f.last_outcome,
      f.last_homeowner_name,
      f.last_potential_lead_at,
      f.resolved_lead_status,
      f.last_knocked_rep_id,
      f.last_knocked_rep_name,
      f.rep_count,
      count(*) over() as total_count,
      f.activity_sort_at
    from filtered f
  )
  select
    c.address,
    c.address_normalized,
    c.lat,
    c.lng,
    c.knocks,
    c.potential_lead_count,
    c.last_knocked_at,
    c.last_outcome,
    c.last_homeowner_name,
    c.last_potential_lead_at,
    c.resolved_lead_status,
    c.last_knocked_rep_id,
    c.last_knocked_rep_name,
    c.rep_count,
    c.total_count
  from counted c
  order by c.activity_sort_at desc nulls last, c.address asc
  limit safe_page_size
  offset safe_offset;
end;
$$;

revoke all on function public.list_knock_door_pins_paginated(
  integer,
  integer,
  text,
  text[],
  double precision,
  double precision,
  double precision,
  double precision,
  boolean
) from public;

grant execute on function public.list_knock_door_pins_paginated(
  integer,
  integer,
  text,
  text[],
  double precision,
  double precision,
  double precision,
  double precision,
  boolean
) to authenticated;

grant execute on function public.list_knock_door_pins_paginated(
  integer,
  integer,
  text,
  text[],
  double precision,
  double precision,
  double precision,
  double precision,
  boolean
) to service_role;
