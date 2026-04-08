-- 4E Field: allow in-session knock edits and lock after session end.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_events'
      and policyname = 'rep_update_open_session_knock_events'
  ) then
    create policy rep_update_open_session_knock_events on public.knock_events
      for update
      using (
        auth.uid() = rep_id
        and exists (
          select 1
          from public.knock_sessions s
          where s.id = knock_events.session_id
            and s.rep_id = auth.uid()
            and s.status in ('active', 'paused')
        )
      )
      with check (
        auth.uid() = rep_id
        and exists (
          select 1
          from public.knock_sessions s
          where s.id = knock_events.session_id
            and s.rep_id = auth.uid()
            and s.status in ('active', 'paused')
        )
      );
  end if;
end $$;

create or replace function public.prevent_locked_knock_event_updates()
returns trigger
language plpgsql
as $$
declare
  session_status text;
begin
  if old.is_locked = true then
    raise exception 'Locked knock event cannot be modified';
  end if;

  if old.linked_job_id is not null or old.linked_task_id is not null then
    raise exception 'CRM-linked knock event cannot be modified';
  end if;

  select s.status
    into session_status
  from public.knock_sessions s
  where s.id = old.session_id;

  if session_status is null or session_status not in ('active', 'paused') then
    raise exception 'Knock event can only be edited during an active or paused session';
  end if;

  -- Only allow limited edits to contact/address fields and simple knock outcomes.
  if new.session_id is distinct from old.session_id
     or new.rep_id is distinct from old.rep_id
     or new.action is distinct from old.action
     or coalesce(new.knocks_delta, 0) is distinct from coalesce(old.knocks_delta, 0)
     or coalesce(new.talks_delta, 0) is distinct from coalesce(old.talks_delta, 0)
     or coalesce(new.inspections_delta, 0) is distinct from coalesce(old.inspections_delta, 0)
     or coalesce(new.contingencies_delta, 0) is distinct from coalesce(old.contingencies_delta, 0)
     or new.linked_job_id is distinct from old.linked_job_id
     or new.linked_task_id is distinct from old.linked_task_id
     or new.is_locked is distinct from old.is_locked
     or new.metadata is distinct from old.metadata
     or new.created_at is distinct from old.created_at then
    raise exception 'Only address, homeowner contact fields, and simple outcome edits are allowed';
  end if;

  if old.action = 'knock' then
    if new.outcome not in ('no_answer', 'no') then
      raise exception 'Knock edits only support "no_answer" or "no" outcomes';
    end if;
  elsif old.action = 'door_hanger' then
    if new.outcome is not null then
      raise exception 'Door hanger outcome must remain null';
    end if;
  else
    raise exception 'Unknown knock action';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_knock_event_updates on public.knock_events;
create trigger prevent_locked_knock_event_updates
before update on public.knock_events
for each row
execute function public.prevent_locked_knock_event_updates();
