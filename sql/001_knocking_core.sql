-- 4E Field: Knocking core schema
-- Creates sessions, events, and location track points for field reps.

create table if not exists public.knock_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  rep_name text,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  ended_at timestamptz,
  total_paused_seconds integer not null default 0,
  session_seconds integer,
  latest_latitude double precision,
  latest_longitude double precision,
  latest_address text,
  last_heartbeat_at timestamptz,
  knocks integer not null default 0,
  talks integer not null default 0,
  inspections integer not null default 0,
  contingencies integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knock_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.knock_sessions(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('knock', 'door_hanger')),
  outcome text check (outcome in ('no_answer', 'no', 'soft_set', 'inspection')),
  address text,
  latitude double precision,
  longitude double precision,
  homeowner_name text,
  homeowner_phone text,
  homeowner_email text,
  knocks_delta integer not null default 0,
  talks_delta integer not null default 0,
  inspections_delta integer not null default 0,
  contingencies_delta integer not null default 0,
  linked_job_id uuid,
  linked_task_id uuid,
  is_locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.knock_location_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.knock_sessions(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  accuracy_meters double precision,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists knock_sessions_one_open_per_rep_idx
  on public.knock_sessions(rep_id)
  where status in ('active', 'paused');

create index if not exists knock_sessions_rep_status_idx
  on public.knock_sessions(rep_id, status, started_at desc);

create index if not exists knock_sessions_heartbeat_idx
  on public.knock_sessions(last_heartbeat_at desc);

create index if not exists knock_events_rep_created_idx
  on public.knock_events(rep_id, created_at desc);

create index if not exists knock_events_session_created_idx
  on public.knock_events(session_id, created_at desc);

create index if not exists knock_location_points_session_recorded_idx
  on public.knock_location_points(session_id, recorded_at desc);

create index if not exists knock_location_points_rep_recorded_idx
  on public.knock_location_points(rep_id, recorded_at desc);

alter table public.knock_sessions enable row level security;
alter table public.knock_events enable row level security;
alter table public.knock_location_points enable row level security;

-- Rep policies (own rows)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_sessions' and policyname = 'rep_select_own_knock_sessions'
  ) then
    create policy rep_select_own_knock_sessions on public.knock_sessions
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_sessions' and policyname = 'rep_insert_own_knock_sessions'
  ) then
    create policy rep_insert_own_knock_sessions on public.knock_sessions
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_sessions' and policyname = 'rep_update_own_knock_sessions'
  ) then
    create policy rep_update_own_knock_sessions on public.knock_sessions
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_events' and policyname = 'rep_select_own_knock_events'
  ) then
    create policy rep_select_own_knock_events on public.knock_events
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_events' and policyname = 'rep_insert_own_knock_events'
  ) then
    create policy rep_insert_own_knock_events on public.knock_events
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_location_points' and policyname = 'rep_select_own_knock_points'
  ) then
    create policy rep_select_own_knock_points on public.knock_location_points
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_location_points' and policyname = 'rep_insert_own_knock_points'
  ) then
    create policy rep_insert_own_knock_points on public.knock_location_points
      for insert with check (auth.uid() = rep_id);
  end if;
end $$;

-- Manager read policies (sales/ops manager roles in profiles.role)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_sessions' and policyname = 'manager_read_knock_sessions'
  ) then
    create policy manager_read_knock_sessions on public.knock_sessions
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
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_events' and policyname = 'manager_read_knock_events'
  ) then
    create policy manager_read_knock_events on public.knock_events
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
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knock_location_points' and policyname = 'manager_read_knock_points'
  ) then
    create policy manager_read_knock_points on public.knock_location_points
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

-- Optional realtime publication membership.
do $$
begin
  begin
    alter publication supabase_realtime add table public.knock_sessions;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.knock_events;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.knock_location_points;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
