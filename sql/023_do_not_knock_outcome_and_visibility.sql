-- 4E Field: support do_not_knock as a knock outcome and make DNK lead pins visible to all reps.

alter table public.knock_events
  drop constraint if exists knock_events_outcome_check;

alter table public.knock_events
  add constraint knock_events_outcome_check
  check (outcome in ('no_answer', 'no', 'soft_set', 'inspection', 'do_not_knock'));

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'authenticated_read_do_not_knock_potential_leads'
  ) then
    create policy authenticated_read_do_not_knock_potential_leads on public.knock_potential_leads
      for select to authenticated
      using (lead_status = 'do_not_knock');
  end if;
end $$;
