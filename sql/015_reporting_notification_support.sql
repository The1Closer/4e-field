-- 4E Field: notification payload support for report-ready and sync events.

alter table public.notifications
  add column if not exists category text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists notifications_category_created_idx
  on public.notifications(category, created_at desc);
