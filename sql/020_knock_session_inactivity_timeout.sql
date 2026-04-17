-- 4E Field: auto-pause stale knock sessions after inactivity.

create or replace function public.timeout_stale_knock_sessions(inactivity_minutes integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  timed_out_count integer := 0;
begin
  if inactivity_minutes < 1 then
    raise exception 'inactivity_minutes must be at least 1';
  end if;

  update public.knock_sessions s
  set
    status = 'paused',
    paused_at = coalesce(s.paused_at, now()),
    ended_at = null,
    updated_at = now()
  where s.status = 'active'
    and s.ended_at is null
    and coalesce(s.last_heartbeat_at, s.started_at) <= now() - make_interval(mins => inactivity_minutes);

  get diagnostics timed_out_count = row_count;
  return timed_out_count;
end;
$$;

revoke all on function public.timeout_stale_knock_sessions(integer) from public;
grant execute on function public.timeout_stale_knock_sessions(integer) to authenticated;
grant execute on function public.timeout_stale_knock_sessions(integer) to service_role;
