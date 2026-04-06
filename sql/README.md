# Field App SQL Migrations

Run these in order in Supabase SQL editor.

1. `001_knocking_core.sql`
2. `002_knocking_updates.sql`

Notes:
- These files are idempotent-safe where practical (`IF NOT EXISTS`, policy existence guards).
- If your project already has equivalent tables/policies, review before running.
