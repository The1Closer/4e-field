-- 4E Field: idempotency support for inspection_reports.
-- Adds client_report_id (UUID minted on the client) so duplicate POSTs from
-- double-click / network retry collapse into the same row instead of inserting
-- duplicates.

alter table public.inspection_reports
  add column if not exists client_report_id uuid;

create unique index if not exists inspection_reports_inspection_client_uidx
  on public.inspection_reports(inspection_id, client_report_id)
  where client_report_id is not null;

create index if not exists inspection_reports_client_report_idx
  on public.inspection_reports(client_report_id)
  where client_report_id is not null;
