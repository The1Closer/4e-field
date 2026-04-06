# 4E Field App (v1 Foundation)

Next.js + Supabase field app scaffold that is backend-compatible with the 4E CRM API contract.

## What this scaffold includes

- Supabase auth/session bootstrapping (rep-first)
- CRM API client with Bearer token injection
- V1 routes and shells:
  - `/login`
  - `/jobs`
  - `/jobs/[jobId]`
  - `/tasks`
  - `/notifications`
- Read strategy:
  - Direct Supabase reads for list/detail screens
- Write strategy:
  - CRM API routes for notes, tasks status, uploads, notifications read state

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and set values.

3. Run:

```bash
npm run dev
```

## Deployment Ready Checklist

1. Set production env vars:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_CRM_API_BASE_URL=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_EXTERNAL_INSTALL_MAP_URL=
NEXT_PUBLIC_CRM_FETCH_TIMEOUT_MS=12000
CRM_PROXY_TIMEOUT_MS=15000
NEXT_PUBLIC_SHOW_DEBUG_BANNER=false
```

2. Validate build locally:

```bash
npm run check
```

3. Verify health endpoint after deploy:

```bash
GET /api/health
```

4. Confirm auth + CRM proxy:
- Sign in
- Open `/tasks` and `/notifications`
- Confirm requests to `/api/crm/*` succeed

## Performance Defaults

- Debug auth probe banner is disabled by default (`NEXT_PUBLIC_SHOW_DEBUG_BANNER=false`).
- CRM client requests use timeout fail-fast (`NEXT_PUBLIC_CRM_FETCH_TIMEOUT_MS`).
- CRM proxy route uses server timeout guard (`CRM_PROXY_TIMEOUT_MS`).
- Management live page polling is split:
  - live map session data: every 10s
  - weekly analytics/totals: every 60s
- Doors map geocoding is concurrency-limited to reduce UI stalls and API spikes.

## Compatibility Matrix (Field -> CRM)

| Field app action | CRM route | Method | Payload sent |
| --- | --- | --- | --- |
| Create job note | `/api/jobs/[jobId]/notes` | `POST` | `{ "body": "<note text>" }` |
| Start signed upload | `/api/jobs/[jobId]/uploads` | `POST` | `{ "action": "create_signed_upload", "fileName": "...", "mimeType": "..." }` |
| Finalize signed upload | `/api/jobs/[jobId]/uploads` | `POST` | `{ "action": "finalize_signed_upload", "fileName": "...", "filePath": "...", "fileType": "..." }` |
| Set task complete/open | `/api/tasks/[taskId]` | `PATCH` | Full task patch body (`title`, `kind`, `status`, `scheduledFor`/`dueAt`, `jobId`, `presetId`, `assigneeIds`, etc.) |
| Mark single notification read | `/api/notifications` | `PATCH` | `{ "notificationId": "<id>", "isRead": true }` |
| Mark all notifications read | `/api/notifications` | `PATCH` | `{ "markAll": true }` |

## Contract notes

- Core writes continue through CRM API routes.
- Task status updates intentionally send the full patch body because CRM task PATCH requires title and at least one date.
- Signed upload flow uses CRM-provided `filePath` + `token`, then uploads via Supabase `uploadToSignedUrl`.
- If hosted on a different web domain than CRM, CORS support must be added in CRM API repo.
