-- 4E Field: rollout indexes and realtime coverage for new analytics tables.

create index if not exists inspections_completed_at_idx
  on public.inspections(completed_at desc);

create index if not exists inspection_reports_generated_at_idx
  on public.inspection_reports(generated_at desc);

create index if not exists roof_measurements_created_at_idx
  on public.roof_measurements(created_at desc);

create index if not exists sync_operations_synced_at_idx
  on public.sync_operations(synced_at desc);

create index if not exists territory_suggestion_snapshots_date_idx
  on public.territory_suggestion_snapshots(snapshot_date desc, rank asc);

create index if not exists rep_performance_reports_generated_at_idx
  on public.rep_performance_reports(generated_at desc);

do $$
begin
  begin
    alter publication supabase_realtime add table public.inspection_reports;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.roof_measurements;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.territory_suggestion_snapshots;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.rep_performance_reports;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
