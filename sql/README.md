# Field App SQL Migrations

Run these in order in Supabase SQL editor.

1. `001_knocking_core.sql`
2. `002_knocking_updates.sql`
3. `003_knock_event_edit_window.sql`
4. `004_potential_leads.sql`

Notes:
- These files are idempotent-safe where practical (`IF NOT EXISTS`, policy existence guards).
- If your project already has equivalent tables/policies, review before running.
