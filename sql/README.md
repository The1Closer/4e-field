# Field App SQL Migrations

Run these in order in Supabase SQL editor.

1. `001_knocking_core.sql`
2. `002_knocking_updates.sql`
3. `003_knock_event_edit_window.sql`
4. `004_potential_leads.sql`
5. `005_potential_lead_workspace.sql`
6. `006_offline_sync_core.sql`
7. `007_inspections_core.sql`
8. `008_inspection_media_and_tags.sql`
9. `009_inspection_perimeter_and_components.sql`
10. `010_roof_measurements_full.sql`
11. `011_inspection_and_measurement_reports.sql`
12. `012_territory_hex_metrics.sql`
13. `013_territory_suggestion_snapshots.sql`
14. `014_rep_performance_reports.sql`
15. `015_reporting_notification_support.sql`
16. `016_pipeline_stage_sort_order_approval.sql`
17. `017_rollup_indexes_and_realtime.sql`
18. `018_guided_inspection_workflow_v2.sql`
19. `019_manager_delete_knock_events.sql`
20. `020_knock_session_inactivity_timeout.sql`
21. `021_job_geocode_cache.sql`
22. `022_forever_address_contacts.sql`

Notes:
- Files are idempotent-safe where practical (`if not exists`, policy guards).
- Migration 016 locks insurance approval to pipeline stage sort order (`approved` threshold), not stage id.
- Migration 021 adds persisted job geocode cache used by territory heat map.
