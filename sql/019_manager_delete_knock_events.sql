-- 4E Field: allow management to remove incorrect knock pins/events from Doors Map.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_events'
      and policyname = 'manager_delete_knock_events'
  ) then
    create policy manager_delete_knock_events on public.knock_events
      for delete
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
