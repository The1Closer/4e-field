-- 4E Field: Follow-up schema updates and maintenance helpers.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_knock_sessions_updated_at on public.knock_sessions;
create trigger set_knock_sessions_updated_at
before update on public.knock_sessions
for each row
execute function public.set_updated_at();

-- Hard lock events tied to CRM artifacts: once linked, block edits.
create or replace function public.prevent_locked_knock_event_updates()
returns trigger
language plpgsql
as $$
begin
  if old.is_locked = true then
    raise exception 'Locked knock event cannot be modified';
  end if;

  if old.linked_job_id is not null or old.linked_task_id is not null then
    raise exception 'CRM-linked knock event cannot be modified';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_knock_event_updates on public.knock_events;
create trigger prevent_locked_knock_event_updates
before update on public.knock_events
for each row
execute function public.prevent_locked_knock_event_updates();

-- Optional: prevent deletes for audit consistency.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='knock_events' and policyname='deny_delete_knock_events'
  ) then
    create policy deny_delete_knock_events on public.knock_events
      for delete using (false);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='knock_sessions' and policyname='deny_delete_knock_sessions'
  ) then
    create policy deny_delete_knock_sessions on public.knock_sessions
      for delete using (false);
  end if;
end $$;
