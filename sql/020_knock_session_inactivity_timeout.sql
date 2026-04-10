-- 4E Field: auto-end stale knock sessions after inactivity.

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
    status = 'ended',
    ended_at = now(),
    paused_at = null,
    session_seconds = greatest(
      0,
      floor(extract(epoch from (now() - s.started_at)))::integer
      - coalesce(s.total_paused_seconds, 0)
      - case
          when s.status = 'paused' and s.paused_at is not null
            then greatest(0, floor(extract(epoch from (now() - s.paused_at)))::integer)
          else 0
        end
    ),
    updated_at = now()
  where s.status in ('active', 'paused')
    and s.ended_at is null
    and coalesce(s.last_heartbeat_at, s.started_at) <= now() - make_interval(mins => inactivity_minutes);

  get diagnostics timed_out_count = row_count;
  return timed_out_count;
end;
$$;

revoke all on function public.timeout_stale_knock_sessions(integer) from public;
grant execute on function public.timeout_stale_knock_sessions(integer) to authenticated;
grant execute on function public.timeout_stale_knock_sessions(integer) to service_role;
