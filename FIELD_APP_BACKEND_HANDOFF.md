# Field App Backend Handoff (4E CRM)

This document is for bootstrapping a brand-new field-app repo that must stay compatible with this CRM backend and Supabase project.

## 1) Non-Negotiable Architecture Contract

- Use the same Supabase project as this CRM.
- Field app should write core workflow data through this CRM's API routes.
- Do not use `SUPABASE_SERVICE_ROLE_KEY` in field-app client code.
- Reuse Supabase Auth users and access tokens.

Why this matters:
- API routes in this repo enforce business rules (stage automation, role checks, notifications, scheduling rules).
- Direct table writes can bypass those rules and cause data drift.

## 2) Environment Values the Field App Needs

Minimum:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CRM_API_BASE_URL=   # e.g. https://crm.yourdomain.com
```

Optional (if field app uses these features):

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_EXTERNAL_INSTALL_MAP_URL=
```

From this repo's `.env.example`:
- [`.env.example`](/workspaces/4e-crm/.env.example)

## 3) Auth Contract (Critical)

- API routes (except public endpoints) require:
  - `Authorization: Bearer <supabase_access_token>`
- Token is validated in:
  - [`src/lib/server-auth.ts`](/workspaces/4e-crm/src/lib/server-auth.ts)
- Frontend helper pattern:
  - [`src/lib/api-client.ts`](/workspaces/4e-crm/src/lib/api-client.ts)

Role model used across backend:
- `admin`
- `manager`
- `sales_manager`
- `production_manager`
- `social_media_coordinator`
- `rep`

See:
- [`src/lib/auth-helpers.ts`](/workspaces/4e-crm/src/lib/auth-helpers.ts)
- [`src/lib/server-auth.ts`](/workspaces/4e-crm/src/lib/server-auth.ts)

## 4) API Route Inventory (Current)

Methods by route:

- `POST /api/admin/create-user`
- `POST /api/admin/delete-user`
- `PATCH /api/admin/users/[userId]`
- `POST /api/avatars`
- `POST /api/claim-resource-library/categories`
- `PATCH,DELETE /api/claim-resource-library/categories/[categoryId]`
- `GET /api/claim-resource-library`
- `POST /api/claim-resource-library/resources`
- `PATCH,DELETE /api/claim-resource-library/resources/[resourceId]`
- `GET,POST,PATCH,DELETE /api/home-content`
- `GET,DELETE /api/job-documents/[documentId]`
- `GET,DELETE /api/job-files/[documentId]`
- `POST /api/jobs`
- `GET,PATCH,DELETE /api/jobs/[jobId]`
- `POST /api/jobs/[jobId]/notes`
- `GET,POST /api/jobs/[jobId]/payments`
- `DELETE /api/jobs/[jobId]/payments/[paymentId]`
- `POST /api/jobs/[jobId]/signed-documents`
- `POST /api/jobs/[jobId]/uploads`
- `GET,POST /api/material-orders`
- `GET,PATCH,DELETE /api/material-orders/[orderId]`
- `POST /api/material-orders/[orderId]/send-supplier-email`
- `POST /api/material-orders/preset-items`
- `PATCH,DELETE /api/material-orders/preset-items/[presetItemId]`
- `POST /api/material-orders/templates`
- `PATCH,DELETE /api/material-orders/templates/[templateId]`
- `POST /api/material-orders/vendors`
- `PATCH,DELETE /api/material-orders/vendors/[vendorId]`
- `GET,PATCH,POST,DELETE /api/notifications`
- `POST /api/notifications/archive-sync`
- `PATCH /api/profile`
- `POST /api/public/meta-leads` (public)
- `GET,POST /api/tasks`
- `PATCH,DELETE /api/tasks/[taskId]`
- `POST /api/tasks/presets`
- `DELETE /api/tasks/presets/[presetId]`
- `POST /api/templates`
- `GET,DELETE /api/templates/[templateId]`
- `GET,PUT /api/training-resources`

Note:
- There is no `GET /api/jobs` list endpoint right now.
- Jobs list pages currently read with Supabase client queries, not route-based list API.

## 5) Business Rules You Must Preserve

Jobs:
- Install date can auto-drive stage to Install Scheduled.
- Install Scheduled stage requires install date.
- Non-managers blocked from management-locked stages (except install workflow allowances).
- Job assignment and stage changes generate notifications.
- Payments update deposit/remaining balance logic.

References:
- [`src/app/api/jobs/route.ts`](/workspaces/4e-crm/src/app/api/jobs/route.ts)
- [`src/app/api/jobs/[jobId]/route.ts`](/workspaces/4e-crm/src/app/api/jobs/[jobId]/route.ts)

Tasks:
- Task must have title and at least one date (`scheduledFor` or `dueAt`).
- Assignee resolution differs for manager vs non-manager.
- Non-managers cannot arbitrarily assign outside allowed set.
- Task creation/reassignment creates notifications.

References:
- [`src/app/api/tasks/route.ts`](/workspaces/4e-crm/src/app/api/tasks/route.ts)
- [`src/app/api/tasks/[taskId]/route.ts`](/workspaces/4e-crm/src/app/api/tasks/[taskId]/route.ts)
- [`src/lib/tasks-route-utils.ts`](/workspaces/4e-crm/src/lib/tasks-route-utils.ts)

Uploads:
- Signed upload flow exists for job files.
- Finalization writes to `documents` table.

Reference:
- [`src/app/api/jobs/[jobId]/uploads/route.ts`](/workspaces/4e-crm/src/app/api/jobs/[jobId]/uploads/route.ts)

Notifications:
- Includes unread count, mark single/all read, cleanup of expired read rows.
- Realtime consumers subscribe to `public.notifications`.

References:
- [`src/app/api/notifications/route.ts`](/workspaces/4e-crm/src/app/api/notifications/route.ts)
- [`src/components/NotificationBell.tsx`](/workspaces/4e-crm/src/components/NotificationBell.tsx)

## 6) Supabase Tables Observed in Active Use

Core:
- `profiles`
- `jobs`
- `homeowners`
- `job_reps`
- `pipeline_stages`
- `notes`
- `notifications`
- `documents`
- `job_documents`
- `job_payments`

Scheduling/ops:
- `tasks`
- `task_assignments`
- `task_presets`

Materials:
- `material_orders`
- `material_order_items`
- `material_order_item_options`
- `material_templates`
- `material_template_items`
- `material_template_item_options`
- `material_preset_items`
- `material_preset_item_options`
- `vendors`

Content/admin:
- `announcements`
- `home_spotlights`
- `claim_resource_categories`
- `claim_resources`
- `document_templates`
- `rep_types`
- `rep_daily_stats`
- `job_commissions`
- `job_activity_log`

Storage buckets in use:
- `documents`
- `job-files`
- `avatars`
- `claim-resource-library`

## 7) Migrations Present in This Repo

Current migration files:
- `supabase/migrations/20260321_add_claim_resource_library.sql`
- `supabase/migrations/20260321_add_home_spotlights.sql`
- `supabase/migrations/20260321_add_include_in_nightly_numbers.sql`
- `supabase/migrations/20260321_add_task_appointment_address.sql`
- `supabase/migrations/20260321_add_tasks.sql`
- `supabase/migrations/20260321_update_task_reminders_for_appointments.sql`
- `supabase/migrations/20260322_add_material_orders.sql`
- `supabase/migrations/20260324_add_job_payments.sql`
- `supabase/migrations/20260324_add_material_preset_items.sql`
- `supabase/migrations/20260324_allow_half_split_deals_in_rep_daily_stats.sql`
- `supabase/migrations/20260324_expand_manager_roles_access.sql`
- `supabase/migrations/20260324_update_contracted_stage_sequence.sql`
- `supabase/migrations/20260325_rename_pipeline_stage_labels.sql`

Important:
- These are additive/patch migrations.
- If a new Supabase project starts truly from zero, you still need the original baseline schema (not present in this folder).

## 8) SQL Pack: Snapshot Existing Supabase for Other Codex

Run these in Supabase SQL Editor and paste outputs to the other Codex.

### A) Tables and columns

```sql
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

| table_name                | ordinal_position | column_name              | data_type                | is_nullable | column_default                                    |
| ------------------------- | ---------------- | ------------------------ | ------------------------ | ----------- | ------------------------------------------------- |
| announcements             | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| announcements             | 2                | title                    | text                     | NO          | null                                              |
| announcements             | 3                | body                     | text                     | NO          | null                                              |
| announcements             | 4                | audience_role            | text                     | YES         | null                                              |
| announcements             | 5                | audience_manager_id      | uuid                     | YES         | null                                              |
| announcements             | 6                | is_active                | boolean                  | NO          | true                                              |
| announcements             | 7                | created_by               | uuid                     | YES         | null                                              |
| announcements             | 8                | created_at               | timestamp with time zone | NO          | now()                                             |
| announcements             | 9                | updated_at               | timestamp with time zone | NO          | now()                                             |
| claim_resource_categories | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| claim_resource_categories | 2                | name                     | text                     | NO          | null                                              |
| claim_resource_categories | 3                | slug                     | text                     | NO          | null                                              |
| claim_resource_categories | 4                | description              | text                     | YES         | null                                              |
| claim_resource_categories | 5                | parent_id                | uuid                     | YES         | null                                              |
| claim_resource_categories | 6                | sort_order               | integer                  | NO          | 0                                                 |
| claim_resource_categories | 7                | is_active                | boolean                  | NO          | true                                              |
| claim_resource_categories | 8                | created_by               | uuid                     | YES         | null                                              |
| claim_resource_categories | 9                | updated_by               | uuid                     | YES         | null                                              |
| claim_resource_categories | 10               | created_at               | timestamp with time zone | NO          | now()                                             |
| claim_resource_categories | 11               | updated_at               | timestamp with time zone | NO          | now()                                             |
| claim_resources           | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| claim_resources           | 2                | category_id              | uuid                     | NO          | null                                              |
| claim_resources           | 3                | title                    | text                     | NO          | null                                              |
| claim_resources           | 4                | description              | text                     | YES         | null                                              |
| claim_resources           | 5                | resource_type            | text                     | NO          | null                                              |
| claim_resources           | 6                | resource_url             | text                     | NO          | null                                              |
| claim_resources           | 7                | external_url             | text                     | YES         | null                                              |
| claim_resources           | 8                | file_path                | text                     | YES         | null                                              |
| claim_resources           | 9                | thumbnail_url            | text                     | YES         | null                                              |
| claim_resources           | 10               | sort_order               | integer                  | NO          | 0                                                 |
| claim_resources           | 11               | is_active                | boolean                  | NO          | true                                              |
| claim_resources           | 12               | created_by               | uuid                     | YES         | null                                              |
| claim_resources           | 13               | updated_by               | uuid                     | YES         | null                                              |
| claim_resources           | 14               | created_at               | timestamp with time zone | NO          | now()                                             |
| claim_resources           | 15               | updated_at               | timestamp with time zone | NO          | now()                                             |
| document_templates        | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| document_templates        | 2                | name                     | text                     | NO          | null                                              |
| document_templates        | 3                | category                 | text                     | YES         | null                                              |
| document_templates        | 4                | file_url                 | text                     | NO          | null                                              |
| document_templates        | 5                | file_path                | text                     | NO          | null                                              |
| document_templates        | 6                | is_active                | boolean                  | NO          | true                                              |
| document_templates        | 7                | created_by               | uuid                     | YES         | null                                              |
| document_templates        | 8                | created_at               | timestamp with time zone | NO          | now()                                             |
| documents                 | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| documents                 | 2                | job_id                   | uuid                     | NO          | null                                              |
| documents                 | 3                | file_name                | text                     | NO          | null                                              |
| documents                 | 4                | file_path                | text                     | NO          | null                                              |
| documents                 | 5                | file_type                | text                     | YES         | null                                              |
| documents                 | 6                | created_at               | timestamp with time zone | NO          | now()                                             |
| home_spotlights           | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| home_spotlights           | 2                | title                    | text                     | NO          | null                                              |
| home_spotlights           | 3                | body                     | text                     | NO          | null                                              |
| home_spotlights           | 4                | content_type             | text                     | NO          | 'quote'::text                                     |
| home_spotlights           | 5                | media_url                | text                     | YES         | null                                              |
| home_spotlights           | 6                | quote_author             | text                     | YES         | null                                              |
| home_spotlights           | 7                | audience_role            | text                     | YES         | null                                              |
| home_spotlights           | 8                | audience_manager_id      | uuid                     | YES         | null                                              |
| home_spotlights           | 9                | is_active                | boolean                  | NO          | true                                              |
| home_spotlights           | 10               | display_date             | date                     | YES         | null                                              |
| home_spotlights           | 11               | created_by               | uuid                     | YES         | null                                              |
| home_spotlights           | 12               | created_at               | timestamp with time zone | NO          | now()                                             |
| home_spotlights           | 13               | updated_at               | timestamp with time zone | NO          | now()                                             |
| homeowners                | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| homeowners                | 2                | name                     | text                     | NO          | null                                              |
| homeowners                | 3                | phone                    | text                     | YES         | null                                              |
| homeowners                | 4                | address                  | text                     | YES         | null                                              |
| homeowners                | 5                | email                    | text                     | YES         | null                                              |
| homeowners                | 6                | created_at               | timestamp with time zone | NO          | now()                                             |
| homeowners                | 7                | updated_at               | timestamp with time zone | NO          | now()                                             |
| homeowners                | 8                | city                     | text                     | YES         | null                                              |
| homeowners                | 9                | state                    | text                     | YES         | null                                              |
| homeowners                | 10               | zip                      | text                     | YES         | null                                              |
| insurance_carriers        | 1                | id                       | bigint                   | NO          | nextval('insurance_carriers_id_seq'::regclass)    |
| insurance_carriers        | 2                | code                     | text                     | NO          | null                                              |
| insurance_carriers        | 3                | label                    | text                     | NO          | null                                              |
| insurance_carriers        | 4                | sort_order               | integer                  | NO          | 0                                                 |
| insurance_carriers        | 5                | is_active                | boolean                  | NO          | true                                              |
| insurance_carriers        | 6                | created_at               | timestamp with time zone | NO          | now()                                             |
| internal_job_statuses     | 1                | id                       | bigint                   | NO          | nextval('internal_job_statuses_id_seq'::regclass) |
| internal_job_statuses     | 2                | code                     | text                     | NO          | null                                              |
| internal_job_statuses     | 3                | label                    | text                     | NO          | null                                              |
| internal_job_statuses     | 4                | sort_order               | integer                  | NO          | 0                                                 |
| internal_job_statuses     | 5                | is_active                | boolean                  | NO          | true                                              |
| internal_job_statuses     | 6                | created_at               | timestamp with time zone | NO          | now()                                             |
| job_activity_log          | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| job_activity_log          | 2                | job_id                   | uuid                     | NO          | null                                              |
| job_activity_log          | 3                | actor_profile_id         | uuid                     | YES         | null                                              |
| job_activity_log          | 4                | event_type               | text                     | NO          | null                                              |
| job_activity_log          | 5                | event_label              | text                     | NO          | null                                              |
| job_activity_log          | 6                | metadata                 | jsonb                    | NO          | '{}'::jsonb                                       |
| job_activity_log          | 7                | created_at               | timestamp with time zone | NO          | now()                                             |
| job_commissions           | 1                | id                       | uuid                     | NO          | gen_random_uuid()                                 |
| job_commissions           | 2                | job_id                   | uuid                     | NO          | null                                              |
| job_commissions           | 3                | material_cost            | numeric                  | NO          | 0                                                 |
| job_commissions           | 4                | additional_material_cost | numeric                  | NO          | 0                                                 |
| job_commissions           | 5                | material_refund          | numeric                  | NO          | 0                                                 |
| job_commissions           | 6                | labor_cost               | numeric                  | NO          | 0                                                 |
| job_commissions           | 7                | rep_1_profile_id         | uuid                     | YES         | null                                              |
| job_commissions           | 8                | rep_1_commission_type    | text                     | YES         | null                                              |
| job_commissions           | 9                | rep_1_front_end_paid     | boolean                  | NO          | false                                             |

### B) Foreign keys

```sql
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
order by tc.table_name, tc.constraint_name;
```

| table_name                     | column_name         | foreign_table_name        | foreign_column_name | constraint_name                                      |
| ------------------------------ | ------------------- | ------------------------- | ------------------- | ---------------------------------------------------- |
| announcements                  | audience_manager_id | profiles                  | id                  | announcements_audience_manager_id_fkey               |
| announcements                  | created_by          | profiles                  | id                  | announcements_created_by_fkey                        |
| claim_resource_categories      | created_by          | profiles                  | id                  | claim_resource_categories_created_by_fkey            |
| claim_resource_categories      | parent_id           | claim_resource_categories | id                  | claim_resource_categories_parent_id_fkey             |
| claim_resource_categories      | updated_by          | profiles                  | id                  | claim_resource_categories_updated_by_fkey            |
| claim_resources                | category_id         | claim_resource_categories | id                  | claim_resources_category_id_fkey                     |
| claim_resources                | created_by          | profiles                  | id                  | claim_resources_created_by_fkey                      |
| claim_resources                | updated_by          | profiles                  | id                  | claim_resources_updated_by_fkey                      |
| document_templates             | created_by          | profiles                  | id                  | document_templates_created_by_fkey                   |
| documents                      | job_id              | jobs                      | id                  | documents_job_id_fkey                                |
| home_spotlights                | audience_manager_id | profiles                  | id                  | home_spotlights_audience_manager_id_fkey             |
| home_spotlights                | created_by          | profiles                  | id                  | home_spotlights_created_by_fkey                      |
| job_activity_log               | actor_profile_id    | profiles                  | id                  | job_activity_log_actor_profile_id_fkey               |
| job_activity_log               | job_id              | jobs                      | id                  | job_activity_log_job_id_fkey                         |
| job_commissions                | job_id              | jobs                      | id                  | job_commissions_job_id_fkey                          |
| job_commissions                | rep_1_profile_id    | profiles                  | id                  | job_commissions_rep_1_profile_id_fkey                |
| job_commissions                | rep_2_profile_id    | profiles                  | id                  | job_commissions_rep_2_profile_id_fkey                |
| job_documents                  | created_by          | profiles                  | id                  | job_documents_created_by_fkey                        |
| job_documents                  | job_id              | jobs                      | id                  | job_documents_job_id_fkey                            |
| job_documents                  | template_id         | document_templates        | id                  | job_documents_template_id_fkey                       |
| job_flags                      | created_by          | profiles                  | id                  | job_flags_created_by_fkey                            |
| job_flags                      | job_id              | jobs                      | id                  | job_flags_job_id_fkey                                |
| job_payments                   | created_by          | profiles                  | id                  | job_payments_created_by_fkey                         |
| job_payments                   | job_id              | jobs                      | id                  | job_payments_job_id_fkey                             |
| job_reps                       | job_id              | jobs                      | id                  | job_reps_job_id_fkey                                 |
| job_reps                       | profile_id          | profiles                  | id                  | job_reps_profile_id_fkey                             |
| job_saved_views                | user_id             | profiles                  | id                  | job_saved_views_user_id_fkey                         |
| jobs                           | homeowner_id        | homeowners                | id                  | jobs_homeowner_id_fkey                               |
| jobs                           | stage_id            | pipeline_stages           | id                  | jobs_stage_id_fkey                                   |
| material_order_item_options    | order_item_id       | material_order_items      | id                  | material_order_item_options_order_item_id_fkey       |
| material_order_items           | order_id            | material_orders           | id                  | material_order_items_order_id_fkey                   |
| material_orders                | created_by          | profiles                  | id                  | material_orders_created_by_fkey                      |
| material_orders                | job_id              | jobs                      | id                  | material_orders_job_id_fkey                          |
| material_orders                | template_id         | material_templates        | id                  | material_orders_template_id_fkey                     |
| material_orders                | updated_by          | profiles                  | id                  | material_orders_updated_by_fkey                      |
| material_orders                | vendor_id           | vendors                   | id                  | material_orders_vendor_id_fkey                       |
| material_preset_item_options   | preset_item_id      | material_preset_items     | id                  | material_preset_item_options_preset_item_id_fkey     |
| material_preset_items          | created_by          | profiles                  | id                  | material_preset_items_created_by_fkey                |
| material_template_item_options | template_item_id    | material_template_items   | id                  | material_template_item_options_template_item_id_fkey |
| material_template_items        | template_id         | material_templates        | id                  | material_template_items_template_id_fkey             |
| material_templates             | created_by          | profiles                  | id                  | material_templates_created_by_fkey                   |
| notes                          | job_id              | jobs                      | id                  | notes_job_id_fkey                                    |
| notifications                  | actor_user_id       | profiles                  | id                  | notifications_actor_user_id_fkey                     |
| notifications                  | job_id              | jobs                      | id                  | notifications_job_id_fkey                            |
| notifications                  | note_id             | notes                     | id                  | notifications_note_id_fkey                           |
| notifications                  | user_id             | profiles                  | id                  | notifications_user_id_fkey                           |
| profiles                       | manager_id          | profiles                  | id                  | profiles_manager_id_fkey                             |
| profiles                       | rep_type_id         | rep_types                 | id                  | profiles_rep_type_id_fkey                            |
| rep_daily_stats                | rep_id              | profiles                  | id                  | rep_daily_stats_rep_id_fkey                          |
| task_assignments               | profile_id          | profiles                  | id                  | task_assignments_profile_id_fkey                     |
| task_assignments               | task_id             | tasks                     | id                  | task_assignments_task_id_fkey                        |
| task_presets                   | created_by          | profiles                  | id                  | task_presets_created_by_fkey                         |
| tasks                          | completed_by        | profiles                  | id                  | tasks_completed_by_fkey                              |
| tasks                          | created_by          | profiles                  | id                  | tasks_created_by_fkey                                |
| tasks                          | job_id              | jobs                      | id                  | tasks_job_id_fkey                                    |
| tasks                          | preset_id           | task_presets              | id                  | tasks_preset_id_fkey                                 |
| tasks                          | updated_by          | profiles                  | id                  | tasks_updated_by_fkey                                |
| vendors                        | created_by          | profiles                  | id                  | vendors_created_by_fkey                              |


### C) Check constraints

```sql
select
  conrelid::regclass as table_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'c'
  and connamespace = 'public'::regnamespace
order by conrelid::regclass::text, conname;
```

| table_name      | constraint_name                                        | definition                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claim_resources | claim_resources_resource_type_check                    | CHECK ((resource_type = ANY (ARRAY['document'::text, 'video'::text, 'photo'::text])))                                                                                                                                                                                           |
| documents       | documents_file_type_check                              | CHECK ((file_type = ANY (ARRAY['document'::text, 'photo'::text])))                                                                                                                                                                                                              |
| home_spotlights | home_spotlights_content_type_check                     | CHECK ((content_type = ANY (ARRAY['quote'::text, 'video'::text])))                                                                                                                                                                                                              |
| homeowners      | homeowners_state_len_chk                               | CHECK (((state IS NULL) OR (char_length(state) <= 20)))                                                                                                                                                                                                                         |
| homeowners      | homeowners_zip_len_chk                                 | CHECK (((zip IS NULL) OR (char_length(zip) <= 15)))                                                                                                                                                                                                                             |
| job_commissions | job_commissions_rep_1_commission_type_check            | CHECK ((rep_1_commission_type = ANY (ARRAY['junior'::text, 'regular'::text, 'senior'::text, 'legend'::text])))                                                                                                                                                                  |
| job_commissions | job_commissions_rep_2_commission_type_check            | CHECK ((rep_2_commission_type = ANY (ARRAY['junior'::text, 'regular'::text, 'senior'::text, 'legend'::text])))                                                                                                                                                                  |
| job_payments    | job_payments_amount_check                              | CHECK ((amount >= (0)::numeric))                                                                                                                                                                                                                                                |
| jobs            | jobs_internal_job_status_chk                           | CHECK (((internal_job_status IS NULL) OR (internal_job_status = ANY (ARRAY['new'::text, 'waiting_on_insurance'::text, 'scope_received'::text, 'waiting_on_homeowner'::text, 'scheduled'::text, 'in_production'::text, 'complete'::text, 'on_hold'::text, 'cancelled'::text])))) |
| jobs            | jobs_lead_source_chk                                   | CHECK (((lead_source IS NULL) OR (lead_source = ANY (ARRAY['company_lead'::text, 'door_knock'::text, 'referral'::text, 'realtor'::text, 'inspector'::text, 'social'::text, 'other'::text]))))                                                                                   |
| jobs            | jobs_mortgage_company_len_chk                          | CHECK (((mortgage_company IS NULL) OR (char_length(mortgage_company) <= 120)))                                                                                                                                                                                                  |
| jobs            | jobs_priority_flag_chk                                 | CHECK (((priority_flag IS NULL) OR (priority_flag = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))))                                                                                                                                                   |
| jobs            | jobs_referral_source_len_chk                           | CHECK (((referral_source IS NULL) OR (char_length(referral_source) <= 120)))                                                                                                                                                                                                    |
| material_orders | material_orders_status_check                           | CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'ordered'::text, 'received'::text, 'cancelled'::text])))                                                                                                                                                              |
| notifications   | notifications_type_chk                                 | CHECK ((type = ANY (ARRAY['assignment'::text, 'stage_change'::text, 'note_mention'::text])))                                                                                                                                                                                    |
| profiles        | profiles_role_check                                    | CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'rep'::text])))                                                                                                                  |
| rep_daily_stats | rep_daily_stats_contingencies_half_step_check          | CHECK ((mod((contingencies * (2)::numeric), (1)::numeric) = (0)::numeric))                                                                                                                                                                                                      |
| rep_daily_stats | rep_daily_stats_contracts_with_deposit_half_step_check | CHECK ((mod((contracts_with_deposit * (2)::numeric), (1)::numeric) = (0)::numeric))                                                                                                                                                                                             |
| rep_daily_stats | rep_daily_stats_inspections_half_step_check            | CHECK ((mod((inspections * (2)::numeric), (1)::numeric) = (0)::numeric))                                                                                                                                                                                                        |
| task_presets    | task_presets_kind_check                                | CHECK ((kind = ANY (ARRAY['task'::text, 'appointment'::text])))                                                                                                                                                                                                                 |
| tasks           | tasks_kind_check                                       | CHECK ((kind = ANY (ARRAY['task'::text, 'appointment'::text])))                                                                                                                                                                                                                 |
| tasks           | tasks_requires_schedule_or_due                         | CHECK (((scheduled_for IS NOT NULL) OR (due_at IS NOT NULL)))                                                                                                                                                                                                                   |
| tasks           | tasks_status_check                                     | CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text])))                                                                                                                                                                                                                 |


### D) Indexes

```sql
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

| schemaname | tablename                      | indexname                                                       | indexdef                                                                                                                                                                                |
| ---------- | ------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| public     | announcements                  | announcements_pkey                                              | CREATE UNIQUE INDEX announcements_pkey ON public.announcements USING btree (id)                                                                                                         |
| public     | claim_resource_categories      | claim_resource_categories_pkey                                  | CREATE UNIQUE INDEX claim_resource_categories_pkey ON public.claim_resource_categories USING btree (id)                                                                                 |
| public     | claim_resource_categories      | claim_resource_categories_slug_key                              | CREATE UNIQUE INDEX claim_resource_categories_slug_key ON public.claim_resource_categories USING btree (slug)                                                                           |
| public     | claim_resource_categories      | idx_claim_resource_categories_active_sort                       | CREATE INDEX idx_claim_resource_categories_active_sort ON public.claim_resource_categories USING btree (is_active, sort_order, name)                                                    |
| public     | claim_resource_categories      | idx_claim_resource_categories_parent_sort                       | CREATE INDEX idx_claim_resource_categories_parent_sort ON public.claim_resource_categories USING btree (parent_id, sort_order, name)                                                    |
| public     | claim_resources                | claim_resources_pkey                                            | CREATE UNIQUE INDEX claim_resources_pkey ON public.claim_resources USING btree (id)                                                                                                     |
| public     | claim_resources                | idx_claim_resources_active_sort                                 | CREATE INDEX idx_claim_resources_active_sort ON public.claim_resources USING btree (is_active, sort_order, title)                                                                       |
| public     | claim_resources                | idx_claim_resources_category_sort                               | CREATE INDEX idx_claim_resources_category_sort ON public.claim_resources USING btree (category_id, sort_order, title)                                                                   |
| public     | claim_resources                | idx_claim_resources_type_sort                                   | CREATE INDEX idx_claim_resources_type_sort ON public.claim_resources USING btree (resource_type, sort_order, title)                                                                     |
| public     | document_templates             | document_templates_pkey                                         | CREATE UNIQUE INDEX document_templates_pkey ON public.document_templates USING btree (id)                                                                                               |
| public     | document_templates             | idx_document_templates_active                                   | CREATE INDEX idx_document_templates_active ON public.document_templates USING btree (is_active)                                                                                         |
| public     | documents                      | documents_pkey                                                  | CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id)                                                                                                                 |
| public     | documents                      | idx_documents_job_id                                            | CREATE INDEX idx_documents_job_id ON public.documents USING btree (job_id)                                                                                                              |
| public     | home_spotlights                | home_spotlights_pkey                                            | CREATE UNIQUE INDEX home_spotlights_pkey ON public.home_spotlights USING btree (id)                                                                                                     |
| public     | home_spotlights                | idx_home_spotlights_active_display_date                         | CREATE INDEX idx_home_spotlights_active_display_date ON public.home_spotlights USING btree (is_active, display_date DESC, created_at DESC)                                              |
| public     | home_spotlights                | idx_home_spotlights_audience_manager_id                         | CREATE INDEX idx_home_spotlights_audience_manager_id ON public.home_spotlights USING btree (audience_manager_id)                                                                        |
| public     | homeowners                     | homeowners_pkey                                                 | CREATE UNIQUE INDEX homeowners_pkey ON public.homeowners USING btree (id)                                                                                                               |
| public     | homeowners                     | idx_homeowners_address_trgm                                     | CREATE INDEX idx_homeowners_address_trgm ON public.homeowners USING gin (address gin_trgm_ops)                                                                                          |
| public     | homeowners                     | idx_homeowners_city                                             | CREATE INDEX idx_homeowners_city ON public.homeowners USING btree (city)                                                                                                                |
| public     | homeowners                     | idx_homeowners_email                                            | CREATE INDEX idx_homeowners_email ON public.homeowners USING btree (email)                                                                                                              |
| public     | homeowners                     | idx_homeowners_name                                             | CREATE INDEX idx_homeowners_name ON public.homeowners USING btree (name)                                                                                                                |
| public     | homeowners                     | idx_homeowners_name_trgm                                        | CREATE INDEX idx_homeowners_name_trgm ON public.homeowners USING gin (name gin_trgm_ops)                                                                                                |
| public     | homeowners                     | idx_homeowners_phone                                            | CREATE INDEX idx_homeowners_phone ON public.homeowners USING btree (phone)                                                                                                              |
| public     | homeowners                     | idx_homeowners_state                                            | CREATE INDEX idx_homeowners_state ON public.homeowners USING btree (state)                                                                                                              |
| public     | homeowners                     | idx_homeowners_zip                                              | CREATE INDEX idx_homeowners_zip ON public.homeowners USING btree (zip)                                                                                                                  |
| public     | insurance_carriers             | idx_insurance_carriers_active_sort                              | CREATE INDEX idx_insurance_carriers_active_sort ON public.insurance_carriers USING btree (is_active, sort_order)                                                                        |
| public     | insurance_carriers             | insurance_carriers_code_key                                     | CREATE UNIQUE INDEX insurance_carriers_code_key ON public.insurance_carriers USING btree (code)                                                                                         |
| public     | insurance_carriers             | insurance_carriers_pkey                                         | CREATE UNIQUE INDEX insurance_carriers_pkey ON public.insurance_carriers USING btree (id)                                                                                               |
| public     | internal_job_statuses          | idx_internal_job_statuses_active_sort                           | CREATE INDEX idx_internal_job_statuses_active_sort ON public.internal_job_statuses USING btree (is_active, sort_order)                                                                  |
| public     | internal_job_statuses          | internal_job_statuses_code_key                                  | CREATE UNIQUE INDEX internal_job_statuses_code_key ON public.internal_job_statuses USING btree (code)                                                                                   |
| public     | internal_job_statuses          | internal_job_statuses_pkey                                      | CREATE UNIQUE INDEX internal_job_statuses_pkey ON public.internal_job_statuses USING btree (id)                                                                                         |
| public     | job_activity_log               | job_activity_log_pkey                                           | CREATE UNIQUE INDEX job_activity_log_pkey ON public.job_activity_log USING btree (id)                                                                                                   |
| public     | job_commissions                | idx_job_commissions_job_id                                      | CREATE INDEX idx_job_commissions_job_id ON public.job_commissions USING btree (job_id)                                                                                                  |
| public     | job_commissions                | job_commissions_job_id_key                                      | CREATE UNIQUE INDEX job_commissions_job_id_key ON public.job_commissions USING btree (job_id)                                                                                           |
| public     | job_commissions                | job_commissions_pkey                                            | CREATE UNIQUE INDEX job_commissions_pkey ON public.job_commissions USING btree (id)                                                                                                     |
| public     | job_documents                  | idx_job_documents_job_id                                        | CREATE INDEX idx_job_documents_job_id ON public.job_documents USING btree (job_id)                                                                                                      |
| public     | job_documents                  | job_documents_pkey                                              | CREATE UNIQUE INDEX job_documents_pkey ON public.job_documents USING btree (id)                                                                                                         |
| public     | job_flags                      | job_flags_pkey                                                  | CREATE UNIQUE INDEX job_flags_pkey ON public.job_flags USING btree (id)                                                                                                                 |
| public     | job_payments                   | job_payments_job_id_idx                                         | CREATE INDEX job_payments_job_id_idx ON public.job_payments USING btree (job_id)                                                                                                        |
| public     | job_payments                   | job_payments_job_id_payment_date_idx                            | CREATE INDEX job_payments_job_id_payment_date_idx ON public.job_payments USING btree (job_id, payment_date DESC, created_at DESC)                                                       |
| public     | job_payments                   | job_payments_pkey                                               | CREATE UNIQUE INDEX job_payments_pkey ON public.job_payments USING btree (id)                                                                                                           |
| public     | job_reps                       | idx_job_reps_job_id                                             | CREATE INDEX idx_job_reps_job_id ON public.job_reps USING btree (job_id)                                                                                                                |
| public     | job_reps                       | idx_job_reps_profile_id                                         | CREATE INDEX idx_job_reps_profile_id ON public.job_reps USING btree (profile_id)                                                                                                        |
| public     | job_reps                       | job_reps_job_id_profile_id_key                                  | CREATE UNIQUE INDEX job_reps_job_id_profile_id_key ON public.job_reps USING btree (job_id, profile_id)                                                                                  |
| public     | job_reps                       | job_reps_pkey                                                   | CREATE UNIQUE INDEX job_reps_pkey ON public.job_reps USING btree (id)                                                                                                                   |
| public     | job_saved_views                | job_saved_views_pkey                                            | CREATE UNIQUE INDEX job_saved_views_pkey ON public.job_saved_views USING btree (id)                                                                                                     |
| public     | jobs                           | idx_jobs_claim_number                                           | CREATE INDEX idx_jobs_claim_number ON public.jobs USING btree (claim_number)                                                                                                            |
| public     | jobs                           | idx_jobs_claim_number_trgm                                      | CREATE INDEX idx_jobs_claim_number_trgm ON public.jobs USING gin (claim_number gin_trgm_ops)                                                                                            |
| public     | jobs                           | idx_jobs_contract_signed_date                                   | CREATE INDEX idx_jobs_contract_signed_date ON public.jobs USING btree (contract_signed_date)                                                                                            |
| public     | jobs                           | idx_jobs_date_of_loss                                           | CREATE INDEX idx_jobs_date_of_loss ON public.jobs USING btree (date_of_loss)                                                                                                            |
| public     | jobs                           | idx_jobs_homeowner_id                                           | CREATE INDEX idx_jobs_homeowner_id ON public.jobs USING btree (homeowner_id)                                                                                                            |
| public     | jobs                           | idx_jobs_install_date                                           | CREATE INDEX idx_jobs_install_date ON public.jobs USING btree (install_date)                                                                                                            |
| public     | jobs                           | idx_jobs_insurance_carrier                                      | CREATE INDEX idx_jobs_insurance_carrier ON public.jobs USING btree (insurance_carrier)                                                                                                  |
| public     | jobs                           | idx_jobs_insurance_carrier_trgm                                 | CREATE INDEX idx_jobs_insurance_carrier_trgm ON public.jobs USING gin (insurance_carrier gin_trgm_ops)                                                                                  |
| public     | jobs                           | idx_jobs_internal_job_status                                    | CREATE INDEX idx_jobs_internal_job_status ON public.jobs USING btree (internal_job_status)                                                                                              |
| public     | jobs                           | idx_jobs_lead_source                                            | CREATE INDEX idx_jobs_lead_source ON public.jobs USING btree (lead_source)                                                                                                              |
| public     | jobs                           | idx_jobs_priority_flag                                          | CREATE INDEX idx_jobs_priority_flag ON public.jobs USING btree (priority_flag)                                                                                                          |
| public     | jobs                           | idx_jobs_referral_source                                        | CREATE INDEX idx_jobs_referral_source ON public.jobs USING btree (referral_source)                                                                                                      |
| public     | jobs                           | idx_jobs_stage_id                                               | CREATE INDEX idx_jobs_stage_id ON public.jobs USING btree (stage_id)                                                                                                                    |
| public     | jobs                           | jobs_pkey                                                       | CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id)                                                                                                                           |
| public     | lead_sources                   | idx_lead_sources_active_sort                                    | CREATE INDEX idx_lead_sources_active_sort ON public.lead_sources USING btree (is_active, sort_order)                                                                                    |
| public     | lead_sources                   | lead_sources_code_key                                           | CREATE UNIQUE INDEX lead_sources_code_key ON public.lead_sources USING btree (code)                                                                                                     |
| public     | lead_sources                   | lead_sources_pkey                                               | CREATE UNIQUE INDEX lead_sources_pkey ON public.lead_sources USING btree (id)                                                                                                           |
| public     | loss_types                     | idx_loss_types_active_sort                                      | CREATE INDEX idx_loss_types_active_sort ON public.loss_types USING btree (is_active, sort_order)                                                                                        |
| public     | loss_types                     | loss_types_code_key                                             | CREATE UNIQUE INDEX loss_types_code_key ON public.loss_types USING btree (code)                                                                                                         |
| public     | loss_types                     | loss_types_pkey                                                 | CREATE UNIQUE INDEX loss_types_pkey ON public.loss_types USING btree (id)                                                                                                               |
| public     | material_order_item_options    | idx_material_order_item_options_item_group_sort                 | CREATE INDEX idx_material_order_item_options_item_group_sort ON public.material_order_item_options USING btree (order_item_id, option_group, sort_order)                                |
| public     | material_order_item_options    | material_order_item_options_order_item_id_option_group_opti_key | CREATE UNIQUE INDEX material_order_item_options_order_item_id_option_group_opti_key ON public.material_order_item_options USING btree (order_item_id, option_group, option_value)       |
| public     | material_order_item_options    | material_order_item_options_pkey                                | CREATE UNIQUE INDEX material_order_item_options_pkey ON public.material_order_item_options USING btree (id)                                                                             |
| public     | material_order_items           | idx_material_order_items_order_sort                             | CREATE INDEX idx_material_order_items_order_sort ON public.material_order_items USING btree (order_id, sort_order)                                                                      |
| public     | material_order_items           | material_order_items_pkey                                       | CREATE UNIQUE INDEX material_order_items_pkey ON public.material_order_items USING btree (id)                                                                                           |
| public     | material_orders                | idx_material_orders_job_status                                  | CREATE INDEX idx_material_orders_job_status ON public.material_orders USING btree (job_id, status, created_at DESC)                                                                     |
| public     | material_orders                | idx_material_orders_needed_by                                   | CREATE INDEX idx_material_orders_needed_by ON public.material_orders USING btree (needed_by, status)                                                                                    |
| public     | material_orders                | material_orders_order_number_key                                | CREATE UNIQUE INDEX material_orders_order_number_key ON public.material_orders USING btree (order_number)                                                                               |
| public     | material_orders                | material_orders_pkey                                            | CREATE UNIQUE INDEX material_orders_pkey ON public.material_orders USING btree (id)                                                                                                     |
| public     | material_preset_item_options   | idx_material_preset_item_options_item_group_sort                | CREATE INDEX idx_material_preset_item_options_item_group_sort ON public.material_preset_item_options USING btree (preset_item_id, option_group, sort_order)                             |
| public     | material_preset_item_options   | material_preset_item_options_pkey                               | CREATE UNIQUE INDEX material_preset_item_options_pkey ON public.material_preset_item_options USING btree (id)                                                                           |
| public     | material_preset_item_options   | material_preset_item_options_preset_item_id_option_group_op_key | CREATE UNIQUE INDEX material_preset_item_options_preset_item_id_option_group_op_key ON public.material_preset_item_options USING btree (preset_item_id, option_group, option_value)     |
| public     | material_preset_items          | idx_material_preset_items_name                                  | CREATE INDEX idx_material_preset_items_name ON public.material_preset_items USING btree (is_active, name)                                                                               |
| public     | material_preset_items          | material_preset_items_pkey                                      | CREATE UNIQUE INDEX material_preset_items_pkey ON public.material_preset_items USING btree (id)                                                                                         |
| public     | material_template_item_options | idx_material_template_item_options_item_group_sort              | CREATE INDEX idx_material_template_item_options_item_group_sort ON public.material_template_item_options USING btree (template_item_id, option_group, sort_order)                       |
| public     | material_template_item_options | material_template_item_option_template_item_id_option_group_key | CREATE UNIQUE INDEX material_template_item_option_template_item_id_option_group_key ON public.material_template_item_options USING btree (template_item_id, option_group, option_value) |
| public     | material_template_item_options | material_template_item_options_pkey                             | CREATE UNIQUE INDEX material_template_item_options_pkey ON public.material_template_item_options USING btree (id)                                                                       |
| public     | material_template_items        | idx_material_template_items_template_sort                       | CREATE INDEX idx_material_template_items_template_sort ON public.material_template_items USING btree (template_id, sort_order)                                                          |
| public     | material_template_items        | material_template_items_pkey                                    | CREATE UNIQUE INDEX material_template_items_pkey ON public.material_template_items USING btree (id)                                                                                     |
| public     | material_templates             | idx_material_templates_name                                     | CREATE INDEX idx_material_templates_name ON public.material_templates USING btree (is_active, name)                                                                                     |
| public     | material_templates             | material_templates_pkey                                         | CREATE UNIQUE INDEX material_templates_pkey ON public.material_templates USING btree (id)                                                                                               |
| public     | notes                          | idx_notes_job_id                                                | CREATE INDEX idx_notes_job_id ON public.notes USING btree (job_id)                                                                                                                      |
| public     | notes                          | notes_pkey                                                      | CREATE UNIQUE INDEX notes_pkey ON public.notes USING btree (id)                                                                                                                         |
| public     | notifications                  | idx_notifications_actor_user_id                                 | CREATE INDEX idx_notifications_actor_user_id ON public.notifications USING btree (actor_user_id)                                                                                        |
| public     | notifications                  | idx_notifications_created_at                                    | CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at)                                                                                              |
| public     | notifications                  | idx_notifications_is_read                                       | CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read)                                                                                                    |
| public     | notifications                  | idx_notifications_job_id                                        | CREATE INDEX idx_notifications_job_id ON public.notifications USING btree (job_id)                                                                                                      |
| public     | notifications                  | idx_notifications_note_id                                       | CREATE INDEX idx_notifications_note_id ON public.notifications USING btree (note_id)                                                                                                    |
| public     | notifications                  | idx_notifications_type                                          | CREATE INDEX idx_notifications_type ON public.notifications USING btree (type)                                                                                                          |
| public     | notifications                  | idx_notifications_user_id                                       | CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id)                                                                                                    |
| public     | notifications                  | idx_notifications_user_is_read_created_at                       | CREATE INDEX idx_notifications_user_is_read_created_at ON public.notifications USING btree (user_id, is_read, created_at DESC)                                                          |
| public     | notifications                  | notifications_pkey                                              | CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)                                                                                                         |
| public     | pipeline_stages                | pipeline_stages_name_key                                        | CREATE UNIQUE INDEX pipeline_stages_name_key ON public.pipeline_stages USING btree (name)                                                                                               |
| public     | pipeline_stages                | pipeline_stages_pkey                                            | CREATE UNIQUE INDEX pipeline_stages_pkey ON public.pipeline_stages USING btree (id)                                                                                                     |


### E) RLS policies (public + storage)

```sql
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

| schemaname | tablename                      | policyname                                     | cmd    | roles           | qual                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | with_check                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------ | ---------------------------------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| public     | announcements                  | announcements delete managers                  | DELETE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | announcements                  | announcements insert managers                  | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | announcements                  | announcements select authenticated             | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | announcements                  | announcements update managers                  | UPDATE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | claim_resource_categories      | claim_resource_categories delete managers      | DELETE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | claim_resource_categories      | claim_resource_categories insert managers      | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | claim_resource_categories      | claim_resource_categories select authenticated | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | claim_resource_categories      | claim_resource_categories update managers      | UPDATE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | claim_resources                | claim_resources delete managers                | DELETE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | claim_resources                | claim_resources insert managers                | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | claim_resources                | claim_resources select authenticated           | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | claim_resources                | claim_resources update managers                | UPDATE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | home_spotlights                | home_spotlights delete managers                | DELETE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | home_spotlights                | home_spotlights insert managers                | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | home_spotlights                | home_spotlights select authenticated           | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | home_spotlights                | home_spotlights update managers                | UPDATE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | insurance_carriers             | authenticated can read insurance_carriers      | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | internal_job_statuses          | authenticated can read internal_job_statuses   | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | job_activity_log               | job_activity_log insert authenticated          | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | job_activity_log               | job_activity_log select authenticated          | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | lead_sources                   | authenticated can read lead_sources            | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | loss_types                     | authenticated can read loss_types              | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_order_item_options    | material_order_item_options mutate managers    | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_order_item_options    | material_order_item_options select managers    | SELECT | {authenticated} | ((EXISTS ( SELECT 1
   FROM material_order_items
  WHERE (material_order_items.id = material_order_item_options.order_item_id))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                          | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_order_items           | material_order_items mutate managers           | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_order_items           | material_order_items select managers           | SELECT | {authenticated} | ((EXISTS ( SELECT 1
   FROM material_orders
  WHERE (material_orders.id = material_order_items.order_id))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_orders                | material_orders mutate managers                | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_orders                | material_orders select managers                | SELECT | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_preset_item_options   | material_preset_item_options mutate managers   | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_preset_item_options   | material_preset_item_options select managers   | SELECT | {authenticated} | ((EXISTS ( SELECT 1
   FROM material_preset_items
  WHERE (material_preset_items.id = material_preset_item_options.preset_item_id))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                      | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_preset_items          | material_preset_items mutate managers          | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_preset_items          | material_preset_items select managers          | SELECT | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_template_item_options | material_template_item_options mutate managers | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_template_item_options | material_template_item_options select managers | SELECT | {authenticated} | ((EXISTS ( SELECT 1
   FROM material_template_items
  WHERE (material_template_items.id = material_template_item_options.template_item_id))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                              | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_template_items        | material_template_items mutate managers        | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_template_items        | material_template_items select managers        | SELECT | {authenticated} | ((EXISTS ( SELECT 1
   FROM material_templates
  WHERE (material_templates.id = material_template_items.template_id))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                    | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | material_templates             | material_templates mutate managers             | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | material_templates             | material_templates select managers             | SELECT | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | notifications                  | notifications_insert_authenticated             | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (auth.uid() IS NOT NULL)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| public     | notifications                  | notifications_select_own                       | SELECT | {authenticated} | (auth.uid() = user_id)                                                                                                                                                                                                                                                                                                                                                                                                                                                         | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | notifications                  | notifications_update_own                       | UPDATE | {authenticated} | (auth.uid() = user_id)                                                                                                                                                                                                                                                                                                                                                                                                                                                         | (auth.uid() = user_id)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| public     | priority_flags                 | authenticated can read priority_flags          | SELECT | {authenticated} | true                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | task_assignments               | task_assignments mutate creator or managers    | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_assignments.task_id) AND ((tasks.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))))))                                    | (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_assignments.task_id) AND ((tasks.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))))))                                    |
| public     | task_assignments               | task_assignments select visible                | SELECT | {authenticated} | ((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_assignments.task_id) AND ((tasks.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))))))     | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | task_presets                   | task_presets delete managers                   | DELETE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | task_presets                   | task_presets insert managers                   | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | task_presets                   | task_presets select authenticated              | SELECT | {authenticated} | (is_active = true)                                                                                                                                                                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | task_presets                   | task_presets update managers                   | UPDATE | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | tasks                          | tasks delete creator or managers               | DELETE | {authenticated} | ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                                                                                                                 | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | tasks                          | tasks insert creator or managers               | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                                                                                                                 |
| public     | tasks                          | tasks select visible                           | SELECT | {authenticated} | ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM task_assignments
  WHERE ((task_assignments.task_id = tasks.id) AND (task_assignments.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))) | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| public     | tasks                          | tasks update creator assignee or managers      | UPDATE | {authenticated} | ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM task_assignments
  WHERE ((task_assignments.task_id = tasks.id) AND (task_assignments.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))) | ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM task_assignments
  WHERE ((task_assignments.task_id = tasks.id) AND (task_assignments.profile_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))) |
| public     | vendors                        | vendors mutate managers                        | ALL    | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                |
| public     | vendors                        | vendors select managers                        | SELECT | {authenticated} | (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text])))))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| storage    | objects                        | allow deleting job-files                       | DELETE | {public}        | (bucket_id = 'job-files'::text)                                                                                                                                                                                                                                                                                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| storage    | objects                        | allow uploads to job-files                     | INSERT | {public}        | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (bucket_id = 'job-files'::text)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| storage    | objects                        | allow viewing job-files                        | SELECT | {public}        | (bucket_id = 'job-files'::text)                                                                                                                                                                                                                                                                                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| storage    | objects                        | claim_resource_library_delete_managers         | DELETE | {authenticated} | ((bucket_id = 'claim-resource-library'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                                                                                             | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| storage    | objects                        | claim_resource_library_insert_managers         | INSERT | {authenticated} | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ((bucket_id = 'claim-resource-library'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                                                                                             |
| storage    | objects                        | claim_resource_library_update_managers         | UPDATE | {authenticated} | ((bucket_id = 'claim-resource-library'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                                                                                             | ((bucket_id = 'claim-resource-library'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'sales_manager'::text, 'production_manager'::text, 'social_media_coordinator'::text, 'production_manager'::text, 'social_media_coordinator'::text]))))))                                                                                                                             |
| storage    | objects                        | claim_resource_library_view_authenticated      | SELECT | {authenticated} | (bucket_id = 'claim-resource-library'::text)                                                                                                                                                                                                                                                                                                                                                                                                                                   | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |


### F) Storage buckets

```sql
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
order by id;
```

| id                     | name                   | public | file_size_limit | allowed_mime_types |
| ---------------------- | ---------------------- | ------ | --------------- | ------------------ |
| avatars                | avatars                | true   | null            | null               |
| claim-resource-library | claim-resource-library | true   | null            | null               |
| documents              | documents              | true   | null            | null               |
| job-files              | job-files              | true   | null            | null               |


### G) Realtime publication tables

```sql
select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;
```

| pubname           | schemaname | tablename          |
| ----------------- | ---------- | ------------------ |
| supabase_realtime | public     | document_templates |
| supabase_realtime | public     | documents          |
| supabase_realtime | public     | homeowners         |
| supabase_realtime | public     | job_commissions    |
| supabase_realtime | public     | job_documents      |
| supabase_realtime | public     | job_reps           |
| supabase_realtime | public     | jobs               |
| supabase_realtime | public     | notes              |
| supabase_realtime | public     | notifications      |
| supabase_realtime | public     | pipeline_stages    |
| supabase_realtime | public     | profiles           |
| supabase_realtime | public     | rep_daily_stats    |
| supabase_realtime | public     | rep_types          |


## 9) SQL Pack: Ensure Realtime for Notifications

Use this if realtime notifications are expected in field app:

```sql
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
```

Optional (if field app also subscribes live to jobs/tasks):

```sql
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    execute 'alter publication supabase_realtime add table public.jobs';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.tasks';
  end if;
end $$;
```

## 10) Cross-Origin Note (If Field App Is Web + Different Domain)

This CRM API is Next.js route handlers; cross-origin web calls need CORS handling on this repo.

If field app is native mobile, CORS is not required.

## 11) Copy/Paste Prompt for the Other Codex

Use this as your first message in the new repo:

```text
You are building a new field app that must be fully backend-compatible with our existing CRM backend at CRM_API_BASE_URL.

Rules:
1) Use the same Supabase project/auth users.
2) For writes to core workflow data (jobs/tasks/notes/payments/uploads), call CRM API routes with Bearer Supabase access token.
3) Do not use service role key in client.
4) Preserve existing role/permission behavior and stage/install business rules.
5) If a required read endpoint does not exist, propose either:
   a) direct Supabase read with current RLS, or
   b) a new CRM read route (preferred if business logic coupling is needed).

I will provide:
- FIELD_APP_BACKEND_HANDOFF.md
- schema/policy/introspection SQL outputs
- product requirements for field workflows

First, generate:
- API client layer for existing CRM routes
- shared typed models from the provided schema outputs
- auth/session flow with Supabase token injection
- a compatibility checklist that verifies every field app write path maps to an existing CRM API route
```

