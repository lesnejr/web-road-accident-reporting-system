# Road Accident Reporting System (Web)

IT 305 Project 3 — a web-based road accident reporting system for reporters, administrators and traffic officers.

A public visitor registers and files an accident report with location, description and optional photo evidence. An administrator reviews and verifies it, assigns it to a traffic officer, and the officer works it to resolution. Every important step is recorded in a status history and an audit log, and notifications keep reporters and officers informed.

> Scope: the web application only. A mobile client is not part of this repository.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, axios, react-router, react-leaflet (Leaflet maps), recharts |
| Backend | Node.js + Express 4 REST API, JWT (jsonwebtoken), bcryptjs |
| Database | MySQL / MariaDB (XAMPP), accessed with mysql2/promise |
| Uploads | multer to `uploads/` on disk, streamed back only after an authorization check |
| Tests | Node's built-in test runner (`node --test`) on both sides |

```
server.js              Express entry point, security headers, CORS, rate limits
config/db.js           MySQL connection pool
routes/                auth, reports, admin, trafficOfficer, categories, notifications, summaries
models/                SQL queries per entity (User, Report, Evidence, Notification, AuditLog, ...)
middleware/            auth (JWT), error handler, security (headers + rate limit)
utils/                 helpers (status transition matrix, report reference), fileType (content sniffing), csv (escaping)
database/schema.sql    full schema for a fresh install
database/migrations/   additive migrations after the base schema
client/src/            React application (pages, components, services)
tests/                 backend unit tests (node --test)
```

## Prerequisites

- Node.js 20 or newer. Verified on Node v24.18.0, npm 12.2.0.
- XAMPP with MySQL/MariaDB (or any MySQL-compatible server).
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
   Then edit `.env` and set a long random `JWT_SECRET`. Never commit `.env` (it is gitignored).
3. Start MySQL in the XAMPP Control Panel (Start MySQL button) and confirm port 3306 listens.
4. Create the database and load the schema **once, in this order**:
   ```
   mysql -u root < database/schema.sql
   mysql -u root accident_reporting < database/migrations/002_notifications.sql
   ```
   The migration creates the `notifications` table, which the base schema file does not include. Do not re-run these files against a database that already has data.
5. (Optional) import `database/seed.sql` for accident categories. It does not create accounts: earlier versions shipped placeholder password hashes that could never authenticate, and a seed file must not publish a default admin password.
6. Create the first administrator:
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

XAMPP's Apache is not required; the app runs on Node's own server plus MySQL.

## Tests and build

```
npm test                    # backend unit tests (25 tests: transitions, file types, CSV, validation)
cd client && npm test       # frontend unit tests (8 tests: routing helpers)
cd client && npm run build  # production build; succeeds, one chunk-size warning (not an error)
```

The backend tests are pure-logic tests and run without a database. Integration flows (login, submit, verify, assign, resolve, export) still need MySQL running; see "Verification status" below.

## Roles and the report lifecycle

- **reporter** — registers publicly, submits reports, tracks them, answers clarification requests.
- **admin** — reviews, verifies or rejects reports (rejection requires a reason), assigns officers, manages users and audit logs, exports CSV.
- **traffic_officer** — sees only reports assigned to them, moves them `assigned → in_progress → resolved`, records findings.

Statuses: `submitted → under_review → verified → assigned → in_progress → resolved`, plus `needs_clarification` and `rejected`. All transitions are validated on the server in `utils/helpers.js`; the UI only shows the actions that fit.

## API overview

| Route | Who | Purpose |
|---|---|---|
| `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` | public / any | Account and session endpoints (login is rate limited) |
| `GET/POST /api/reports`, `GET/PATCH /api/reports/:id` | all roles (scoped) / reporter | List (filters: `status`, `category_id`, `date_from`, `date_to`, `q`), submit, view, edit own report |
| `POST /api/reports/:id/evidence`, `GET /api/reports/:id/evidence/:evidenceId` | owner / assigned / admin | Evidence upload and authorized download |
| `PATCH /api/reports/:id/verify` | admin | Verification, rejection, clarification requests, and assignment (`status: "assigned"` with `assignedTo`) |
| `PATCH /api/traffic-officer/reports/:id/status`, `POST .../findings` | assigned officer | Field work |
| `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` | owner | In-app notifications |
| `GET /api/summaries/dashboard/stats`, `GET /api/summaries/reports/summaries` | admin | Dashboard and daily/weekly/monthly/annual summaries |
| `GET /api/summaries/reports/export?format=csv` | admin | CSV export honoring the same filters as the list, with a scope line |
| `GET/POST/PATCH /api/users`, `PATCH /api/users/:id/role` | admin | User management (last active admin cannot be demoted or deactivated) |
| `GET /api/audit-logs` | admin | Audit trail with filters and accurate pagination |

## Evidence rules

- Accepted content: JPEG, PNG, GIF, WebP, PDF — decided by file signature, never by filename or browser-declared type.
- Size limit: 10 MB per file.
- Files are stored under random names; display names are stripped of path separators and control characters.
- Images are served inline; everything else is served as an attachment with `X-Content-Type-Options: nosniff` and a `Content-Security-Policy: default-src 'none'; sandbox` header, so a stored file can never run as a page in the app's origin.
- `uploads/` is gitignored. If files were committed earlier, untrack them with `git rm --cached <file>` after confirming no database row depends on the working copy.

## Security notes

- Passwords hashed with bcrypt; JTWs signed with `JWT_SECRET` and validated (signature, expiry, active account) on every protected route.
- Login rate limited to 20 attempts per 15 minutes per IP; registration to 10 per hour. Limits are per-process and reset when the server restarts.
- CORS restricted to `CORS_ORIGINS` (default `http://localhost:3000,http://127.0.0.1:3000`).
- Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`) on all responses.
- Logout keeps an in-memory token blocklist; a server restart clears it, and tokens still expire normally.
- CSV exports neutralize spreadsheet formula injection and always state their verification scope in the first row.

## Known limitations

- The web client only; no mobile app in this repository.
- CSV export only; PDF export is not implemented (CSV is acceptable for the assignment unless a stricter requirement is set).
- Reports list has no pagination; combined filters and export respect each other, and filters are kept in the URL.
- Summaries return at most the 50 most recent periods for a chosen range.
- Rate limiting and the logout blocklist are in-memory (single-process deployments only).
- `database/migrations/002_notifications.sql` uses MariaDB's `CREATE INDEX IF NOT EXISTS` syntax; on stock Oracle MySQL, adjust that line.

## Troubleshooting

| Symptom | Check |
|---|---|
| `ECONNREFUSED` on any data request | MySQL is not running — start it in the XAMPP Control Panel, then confirm port 3306. |
| Login fails for seeded users | There are no seeded users; create the admin with `npm run create-admin`. |
| `Unknown table 'notifications'` | Run `database/migrations/002_notifications.sql`. |
| Upload rejected although the extension looks fine | The file is checked by content; rename-and-upload tricks and HTML/SVG/EXE files are refused by design. |
| `429 Too many attempts` on login | Wait out the 15-minute window, or restart the backend to clear the in-memory limit. |
| Frontend cannot reach the API | The Vite dev server proxies `/api` to `http://localhost:5000`; make sure the backend is running. |

## Verification status

Verified in this repository: backend unit tests (25/25), client unit tests (8/8), production build, live API probes for health, auth rejection, CORS allowlist, security headers and generic error handling.

Not yet verified (blocked while MySQL was not running): registration, login, report submission, evidence upload end-to-end, verification, assignment, officer status changes, notifications, dashboard counts, summaries and filtered exports against real data. Start MySQL and run the flows with synthetic accounts before the demonstration.
