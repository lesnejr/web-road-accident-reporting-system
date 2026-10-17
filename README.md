# Road Accident Reporting System (Web)

IT 305 Project 3 — a web-based road accident reporting system for reporters, administrators and traffic officers.

A public visitor registers and files an accident report with location, description and optional photo evidence. An administrator reviews and verifies it, assigns it to a traffic officer, and the officer works it to resolution. Every important step is recorded in a status history and an audit log, and notifications keep reporters and officers informed. Admins can review possible duplicate reports side by side and flag or clear a pair — every duplicate decision is audited.

> Scope: the web application only. The mobile client is excluded by team decision and is not part of this repository.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, axios, react-router, react-leaflet (Leaflet maps), recharts |
| Backend | Node.js + Express 4 REST API, JWT (jsonwebtoken), bcryptjs |
| Database | MySQL / MariaDB (XAMPP), accessed with mysql2/promise |
| Uploads | multer to `UPLOAD_DIR` (default `uploads/`; the development `.env` points it outside the web root), streamed back only after an authorization check |
| Exports | CSV (hand-escaped) and PDF (pdfkit), both carrying scope and filter headers |
| Tests | Node's built-in test runner (`node --test`) on both sides; integration tests use dedicated `*_test` databases |

```
server.js              Express entry point, security headers, CORS, rate limits
config/db.js           MySQL connection pool
routes/                auth, reports, admin, trafficOfficer, categories, notifications, summaries
models/                SQL queries per entity (User, Report, Evidence, Notification, AuditLog, ...)
middleware/            auth (JWT), error handler, security (headers + rate limit)
utils/                 helpers (status transition matrix, report reference), fileType (content sniffing),
                       csv (escaping), duplicates (candidate rule), exportHeader (shared CSV/PDF headers)
database/schema.sql    full schema for a fresh install
database/migrations/   tracked additive migrations (002_notifications, 003_duplicate_reports)
scripts/               db-setup (schema + migrations + dev accounts), create-admin
client/src/            React application (pages, components, services)
tests/                 backend tests: pure logic + integration on a dedicated test database
```

## Prerequisites

- Node.js 20 or newer. Verified on Node v24.18.0.
- XAMPP with MySQL/MariaDB (or any MySQL-compatible server). Verified on MariaDB 10.4.32.
- A modern browser for the client.

## Setup

1. Install dependencies (both projects):
   ```
   npm install
   cd client && npm install
   ```
2. Create the environment files:
   ```
   copy .env.example .env
   copy client\.env.example client\.env
   ```
   Then edit `.env`: set a long random `JWT_SECRET`, and set `UPLOAD_DIR` to an absolute path **outside any web root** (for example `C:\xampp\accident_uploads` or `/var/lib/accident-uploads`). Never commit `.env` (it is gitignored).
3. Start MySQL in the XAMPP Control Panel (Start MySQL button) and confirm port 3306 listens.
4. Create the database, apply the schema and the tracked migrations, and seed accident categories in one repeatable step:
   ```
   npm run db:setup
   ```
   Safe to re-run: applied migrations are recorded in `schema_migrations`, the schema and seed are idempotent, and nothing is ever dropped or overwritten. It also creates three **local development accounts** — `admin@local.test`, `officer@local.test`, `reporter@local.test` — and prints each generated password once. Save those passwords; they are not stored in the repository. Rotate them any time with `npm run db:setup -- --reset-dev-passwords`, or force a known password for local testing by setting `DEV_SEED_PASSWORD` (never commit it). Existing accounts are never overwritten.
5. Create a real administrator for anything beyond local development:
   ```
   npm run create-admin -- --name "System Admin" --email admin@example.org
   ```
   The password is prompted for, or read from the `ADMIN_PASSWORD` environment variable. Use `--set-password` with an existing email to reset its password. Nothing sensitive is printed. After signing in, create officer and reporter accounts from User Management.

## Running

```
npm start          # backend API on http://localhost:5000
npm run dev        # backend with nodemon
cd client && npm run dev   # frontend on http://localhost:3000 (proxies /api to :5000)
```

If port 3000 is already taken, Vite prints the port it picked instead; the `/api` proxy keeps working on any port.

XAMPP's Apache is not required; the app runs on Node's own server plus MySQL.

## Tests and build

```
npm test                    # backend: 46 tests (pure logic + integration against *_test databases)
cd client && npm test       # frontend: 8 tests (routing helpers)
cd client && npm run build  # production build; succeeds, one chunk-size warning (not an error)
```

MySQL must be running for the integration tests. Each integration file creates, migrates and drops its own dedicated database whose name ends in `_test`; the harness refuses to touch any other database name. The root script runs test files serially so they never contend for the same test database. Run a single file with `node --test tests/duplicates.test.js`.

## Roles and the report lifecycle

- **reporter** — registers publicly, submits reports, tracks them, answers clarification requests.
- **admin** — reviews, verifies or rejects reports (rejection requires a reason), assigns officers, reviews possible duplicates, manages users and audit logs, exports summaries as CSV or PDF.
- **traffic_officer** — sees only reports assigned to them, moves them `assigned → in_progress → resolved`, records findings.

Statuses: `submitted → under_review → verified → assigned → in_progress → resolved`, plus `needs_clarification` and `rejected`. All transitions are validated on the server in `utils/helpers.js`; the UI only shows the actions that fit.

### Duplicate review

The admin report page lists possible duplicates for the report being viewed. A candidate must fall within ±24 hours of the accident time and additionally match on at least one of: the same accident category, coordinates within 300 m (both reports must carry coordinates), or a matching location text. Nothing is merged automatically. An admin flags the pair as duplicate or clears the decision, and both actions are recorded in the audit log (`DUPLICATE_FLAGGED` / `DUPLICATE_CLEARED`). Chains are refused: a report that is already marked as a duplicate of another cannot be used as the original.

## API overview

| Route | Who | Purpose |
|---|---|---|
| `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` | public / any | Account and session endpoints (login is rate limited; registration forces the `reporter` role) |
| `GET /api/reports` | all roles (scoped) | Filters: `status`, `category_id`, `date_from`, `date_to`, `q`; sorting with `sort=created_at\|accident_date\|status\|report_reference` + `direction=asc\|desc`; with `page`/`limit` returns `{ data, total, page, limit }`, without `page` returns a plain array (legacy shape kept) |
| `POST /api/reports`, `GET /api/reports/:id`, `PATCH /api/reports/:id` | reporter (owner) / scoped by role | Submit, view, edit own report |
| `GET /api/reports/:id/status-history` | owner / assigned officer / admin | Every transition with actor, reason and timestamp (newest first) |
| `POST /api/reports/:id/evidence`, `GET /api/reports/:id/evidence/:evidenceId` | owner / assigned / admin | Evidence upload and authorized download |
| `GET /api/reports/:id/duplicates`, `PATCH /api/reports/:id/duplicate` | admin | Duplicate candidates (`{ report, reasons }`) and flag/clear the decision |
| `PATCH /api/reports/:id/verify` | admin | Verification, rejection, clarification requests, and assignment (`status: "assigned"` with `assignedTo`) |
| `PATCH /api/traffic-officer/reports/:id/status`, `POST .../findings` | assigned officer | Field work |
| `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` | owner | In-app notifications (exactly one per event) |
| `GET /api/summaries/dashboard/stats`, `GET /api/summaries/reports/summaries?period=...&format=json\|pdf` | admin | Dashboard and daily/weekly/monthly/annual summaries, JSON by default or PDF |
| `GET /api/summaries/reports/export?format=csv\|pdf` | admin | Export honouring the same filters and `verified` scope as the list; both formats carry the scope and per-filter header lines |
| `GET/POST/PATCH /api/users`, `PATCH /api/users/:id/role` | admin | User management (last active admin cannot be demoted or deactivated) |
| `GET /api/audit-logs` | admin | Audit trail with filters and accurate pagination |

## Evidence rules

- Accepted content: JPEG, PNG, GIF, WebP, PDF — decided by file signature, never by filename or browser-declared type.
- Size limit: 10 MB per file.
- Files land in `UPLOAD_DIR`. Keep that directory outside the served web root (`C:\xampp\accident_uploads` in the development `.env`); the folder also ships a deny-all `.htaccess` as defence in depth for Apache.
- Files are stored under random names; display names are stripped of path separators and control characters.
- Images are served inline; everything else is served as an attachment with `X-Content-Type-Options: nosniff` and a `Content-Security-Policy: default-src 'none'; sandbox` header, so a stored file can never run as a page in the app's origin.
- `uploads/` is gitignored and no longer tracked.

## Security notes

- Passwords hashed with bcrypt; JWTs signed with `JWT_SECRET` and validated (signature, expiry, active account) on every protected route.
- Login rate limited to 20 attempts per 15 minutes per IP; registration to 10 per hour. Limits are per-process and reset when the server restarts.
- CORS restricted to the origins in `CORS_ORIGINS` (default `http://localhost:3000,http://127.0.0.1:3000`).
- Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`) on all responses.
- Logout keeps an in-memory token blocklist; a server restart clears it, and tokens still expire normally.
- CSV exports neutralize spreadsheet formula injection, and both export formats always state their verification scope in the header lines.

## Known limitations

- The web client only; the mobile app is excluded by team decision.
- The admin UI ships the CSV download button; PDF uses the same endpoint with `format=pdf` and has no dedicated button yet.
- Summaries return at most the 50 most recent periods for a chosen range.
- `GET /api/reports` pagination is opt-in: the reports list page always sends `page`; the dashboard and map pages intentionally use the legacy array shape.
- Rate limiting and the logout blocklist are in-memory (single-process deployments only).
- Tokens are stored in `localStorage` (documented XSS trade-off, mitigated by the evidence-serving CSP and by never rendering user-supplied HTML).
- `database/migrations/002_notifications.sql` uses MariaDB's `CREATE INDEX IF NOT EXISTS` syntax; on stock Oracle MySQL, adjust that line.

## Troubleshooting

| Symptom | Check |
|---|---|
| `ECONNREFUSED` on any data request | MySQL is not running — start it in the XAMPP Control Panel, then confirm port 3306. |
| Login fails for `admin@local.test` and friends | Run `npm run db:setup`; it creates the three local development accounts and prints their passwords once. |
| Integration tests fail with connection errors | MySQL must be running; the tests create their own `*_test` databases and use the same credentials as the app. |
| `Unknown table 'notifications'` or another missing table | Run `npm run db:setup` — it applies all tracked migrations. |
| Upload rejected although the extension looks fine | The file is checked by content; rename-and-upload tricks and HTML/SVG/EXE files are refused by design. |
| `429 Too many attempts` on login | Wait out the 15-minute window, or restart the backend to clear the in-memory limit. |
| Frontend cannot reach the API | The Vite dev server proxies `/api` to `http://localhost:5000`; make sure the backend is running. |

## Verification status

All commands below were run in this repository on 2026-10-17 (Node v24.18.0, MariaDB 10.4.32 via XAMPP):

- Backend: `npm test` → **46/46 pass** (about 4 min 48 s), including integration tests for pagination and sorting, duplicate candidates and flag/clear, filtered CSV and PDF exports, summary date boundaries, evidence authorization and the database setup script.
- Frontend: `cd client && npm test` → **8/8 pass**; `cd client && npm run build` → succeeds (one informational chunk-size warning).
- Live smoke against a running server and the development database, using the development accounts: registration (201, reporter role forced); login for all three roles; report creation (reference `RA-2026-000001`) with coordinates; evidence upload (201) and authorized download (200, exact bytes, `nosniff`); the full lifecycle `submitted → under_review → verified → assigned → in_progress → resolved` with findings, one notification per event (7 events, no duplicates) and an illegal transition refused with 409; duplicate candidates returned with `time_window + distance + location_text` reasons, flag → 200, chain and self-reference → 422, clear → 200; dashboard stats 200; the monthly summaries bucket counting the new reports; CSV export carrying the scope statement, the filter line and the fresh reference; both PDF exports starting `%PDF-` and ending `%%EOF`; audit log carrying `VERIFY_REPORT` ×3, `ADD_FINDINGS`, `UPDATE_STATUS` ×2, `CREATE_REPORT`, `UPLOAD_EVIDENCE` and both duplicate decisions.

Not machine-verified (needs a human in a browser before the demonstration): modal keyboard behaviour (Esc, focus trap), the duplicate-review panel clicks, the responsive card layout at 375 px, GPS permission flows, and opening the downloaded CSV/PDF in a viewer. The development database currently holds the smoke artifacts (two reports, one evidence file, one extra registered user).
