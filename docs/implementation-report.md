# Implementation Report

Date: 2026-10-17
Scope: web application only (mobile development explicitly out of scope).
Baseline commit: `0794b19` (working tree had no uncommitted user changes when work started; nothing has been committed since).

This report follows the required progress-report structure. All commands listed under "Tests executed" were run in this session; results are copied from their actual output.

---

## 1. Phases completed

- **Phase 1 — Stabilization and environment**: broken client test command fixed; backend test suite created and wired to `npm test`; admin bootstrap script added; seed file cleaned of unusable placeholder accounts; README written; `.env.example` files completed.
- **Phase 2 — Critical security**: evidence upload validation by content signature and safe serving; officer authorization gap on the status-history endpoint closed; `login.json` removed; `uploads/` gitignored; login/registration rate limiting and security headers added; CORS restricted; duplicate notifications fixed; audit-log pagination total fixed; report-reference race handled.
- **Phase 3 — Core workflow (code)**: GPS + map location picker and manual fallback in the report form; assignment UI now uses a real officer list instead of an ID prompt; verification/rejection/clarification flows carry required reasons in UI and server.
- **Phase 4 — Requirements completion**: reports-list search/filtering wired to the backend with URL persistence and Clear filters; export respects active filters and scope; admin Summaries page for daily/weekly/monthly/annual periods; user management UI with account creation, role change and activation; last-admin lockout protection.
- **Phase 5 — UX (targeted)**: all `alert()`/`prompt()` interactions in the client replaced with inline panels, inline errors and success notices; confirmation dialogs for role changes and deactivations; consistent status labels via `replace(/_/g, ' ')`.
- **Phase 6 — Verification (partial)**: automated tests, production build, and live API probes executed; database-backed integration tests are **blocked** because MySQL was not running (see §6).

## 2. Problems confirmed (re-verified against the code, not assumed)

| # | Problem | Where it was | Status |
|---|---|---|---|
| 1 | Evidence accepted with no file-type validation; client-declared MIME stored and served | `routes/reports.js` | Fixed: sniff allowlist, safe names, safe serving headers |
| 2 | `login.json` tracked with test credentials (malformed JSON, unused by code) | repo root | Removed from working tree (history note in §8) |
| 3 | `uploads/` not ignored; test PNGs tracked | `.gitignore`, `uploads/` | `.gitignore` fixed; untracking command documented (not staged — see §8) |
| 4 | No brute-force protection on login/register | `server.js` | Fixed: per-IP fixed-window limits |
| 5 | No security headers; CORS wide open | `server.js` | Fixed: header middleware + origin allowlist via `CORS_ORIGINS` |
| 6 | Officers could read status history of reports not assigned to them | `routes/reports.js` `GET /:id/status-history` | Fixed: same scoping as report detail |
| 7 | Duplicate reporter notification on some status changes | `routes/trafficOfficer.js` | Fixed: removed duplicate block |
| 8 | Audit-log pagination total ignored active filters | `models/AuditLog.js` | Fixed: count uses the same WHERE conditions |
| 9 | Report reference generated from a row count (race could collide) | `models/Report.js` | Fixed: insert retried up to 5× on `ER_DUP_ENTRY` |
| 10 | Seed file shipped unusable placeholder password hashes | `database/seed.sql` | Fixed: users removed from seed; bootstrap is now `scripts/create-admin.js` (no default password anywhere) |
| 11 | No way to create the first administrator on a fresh install | — | Fixed: `npm run create-admin` (+ `--set-password` for recovery) |
| 12 | Reports list offered only a status filter; export ignored filters | `client/src/pages/ReportsList.jsx`, `routes/summaries.js` | Fixed: status/category/date/text filters, clear action, URL persistence, export parity incl. text search |
| 13 | CSV export built strings without formula-injection protection | `routes/summaries.js` | Fixed: `utils/csv.js`, unit-tested |
| 14 | `alert()`/`prompt()` for every decision; assignment by raw officer ID | `client/src/pages/ReportDetail.jsx`, `AdminUsers.jsx` | Fixed: inline action panels, officer dropdown, inline feedback |
| 15 | Summaries (daily/weekly/…) had no UI | — | Fixed: `client/src/pages/AdminSummaries.jsx` (reuses the existing endpoint and the previously dead `TrendLineChart`) |
| 16 | Last-admin lockout possible by demoting/deactivating the only admin | `routes/admin.js` | Fixed: guards in both routes |
| 17 | Summaries end date excluded the whole end day | `routes/summaries.js` | Fixed: `created_at < DATE_ADD(?, INTERVAL 1 DAY)` |

Not changed, deliberately (with reason): legacy unused endpoints (`/api/admin/dashboard`, `/api/summaries/dashboard/summary`, `/dashboard/map`) were left in place because removing routes could break unknown consumers; they are documented as unused in the matrix. No schema changes were made.

## 3. Files changed and why

New:

| File | Why |
|---|---|
| `utils/fileType.js` | Content-signature detection + upload name sanitizing |
| `utils/csv.js` | Central CSV cell escaping incl. formula injection |
| `middleware/security.js` | Security headers + fixed-window rate limiter |
| `scripts/create-admin.js` | Safe first-admin bootstrap, no default password |
| `tests/transitions.test.js`, `tests/fileType.test.js`, `tests/csv.test.js`, `tests/validation.test.js` | Backend unit tests for the business rules |
| `client/src/pages/AdminSummaries.jsx` | FR-12 interface |
| `client/.env.example` | Documents `VITE_CARTO_API_KEY` without values |
| `README.md` | Setup, XAMPP steps, bootstrap, tests, roles, limitations, troubleshooting |
| `docs/requirements-matrix.md`, `docs/implementation-report.md` | This report and the matrix |

Modified: `server.js` (headers, rate limits, CORS), `middleware/auth.js` (comment only), `middleware/errorHandler.js` (Multer errors → 413/400, no stack leaks), `routes/reports.js` (upload + serving + history authz + list filters), `routes/summaries.js` (date validation, inclusive end date, text filter, CSV util), `routes/admin.js` (last-admin guards), `routes/trafficOfficer.js` (duplicate notification), `models/Report.js` (exported validation, filters, reference retry), `models/AuditLog.js` (filtered total), `models/User.js` (`countActiveAdmins`), `database/seed.sql` (users removed; categories kept — but never run automatically), `.gitignore` (`uploads/`, `coverage/`), `.env.example` (CORS + comments), root `package.json` (test + create-admin scripts), `client/package.json` (test script fixed), `client/src/pages/ReportForm.jsx` (GPS/map/manual), `client/src/pages/ReportsList.jsx` (filters + export), `client/src/pages/ReportDetail.jsx` (inline dialogs, officer dropdown, notices), `client/src/pages/AdminUsers.jsx` (create/role/activate + confirmations), `client/src/App.jsx` + `client/src/components/Layout.jsx` (Summaries route + nav), `client/src/index.css` (filter bar + action panel styles).

Deleted: `login.json` (working-tree deletion, not staged).

## 4. Tests executed and actual results

| Command | Result |
|---|---|
| `npm test` (root, new) | **PASS** — 25 tests, 25 pass, 0 fail (transitions 9, file types 6, CSV 4, validation 6; the earlier transient CSV expectation failure was fixed and re-run) |
| `cd client && npm test` (fixed script) | **PASS** — 8 tests, 8 pass, 0 fail |
| `cd client && npm run build` | **PASS** — 745 modules transformed; one chunk-size warning (873 kB JS) is informational, not an error |
| Live server probe (scripted against a running `node server.js`) | `/api/health` 200; `/api/reports` and export without/bad token → 401 with clean JSON; login with MySQL down → 500 `Internal server error` (no stack trace, no secrets); CORS preflight: `http://localhost:3000` allowed, `http://evil.example` gets no allow-origin header; all four security headers present |
| DB connectivity probe | **FAIL (environment)** — `ECONNREFUSED`, MySQL not running; classified as BLOCKED, not as an application failure |

Not executed (blocked by MySQL): registration, login/logout, report submission, GPS permission flows in a real browser, evidence upload/download, verification/assignment/status flows, notifications, dashboard counts, summaries, filtered exports, audit pagination against data. The requirements matrix marks these honestly.

## 5. Requirements completed or improved

FR-04, FR-05, FR-09, FR-11, FR-12, FR-13, FR-14, FR-15 received their missing implementation or their fix; FR-02, FR-03, FR-07, FR-08 gained server-side hardening and unit tests. Full per-FR status: `docs/requirements-matrix.md`. No FR is claimed as "Tested" until the blocked verification runs.

## 6. Requirements still incomplete or blocked

- **Blocked (environment)**: every database-backed flow, until XAMPP MySQL is running and the first admin exists.
- **Not implemented by decision**: duplicate-submission detection (no agreed policy — implementing one silently would change behavior without approval); PDF export (CSV accepted unless a stricter requirement is set); reports-list pagination; location-radius filtering.
- **Known limits**: in-memory rate limiter and logout blocklist (single process only); summaries return at most the 50 most recent periods; tokens in `localStorage` (mitigated by the evidence-serving CSP and no user-supplied HTML rendering, but not eliminated).
- Real files previously uploaded and legacy evidence MIME values were left untouched.

## 7. Database changes

None. No schema was imported, no migration applied, no rows written, no tables dropped, no accounts created. `database/seed.sql` was edited (users section removed) but was **not executed** against any database.

## 8. Remaining security concerns (with next actions)

1. `login.json` content still exists in git history. Removing it from the current tree does not erase history. Rewriting history needs explicit approval and would affect any clone — recommended action: rotate/discard those test credentials (they were for `admin@local.test`, which no longer exists in seed data) and leave history as is for a student repository, or rewrite with `git filter-repo` on approval.
2. Three test PNGs remain tracked under `uploads/`. They were kept on disk because database rows may reference them. Untrack when convenient with `git rm --cached uploads/<file>` (stages a change — not done here to respect "no automatic staging").
3. Rate limiting and logout invalidation are per-process; fine for the current single-process deployment.
4. Admin password reset exists only through the CLI; there is no self-service reset (email delivery is not implemented).

## 9. Next recommended step

With approval (this writes synthetic data only, to be cleaned up afterward):

1. Start MySQL in the XAMPP Control Panel; confirm `mysql -u root -e "select 1"` works.
2. `npm run create-admin -- --name "Audit Admin" --email auditadmin@example.test` (password from the prompt or `ADMIN_PASSWORD`).
3. Log in and run the integration checklist: register a reporter → submit a report with manual location and no coordinates (fallback path) → upload one valid PNG and one HTML-renamed-to-PNG (expect 422) → verify → create a traffic officer → assign → officer sees only that report → status history includes every transition → reporter sees notifications without duplicates → dashboard totals match → summaries for each period → export CSV with filters and open it in a spreadsheet (no formula execution) → audit log shows each action with correct pagination totals.
4. Report the observed results, then update `docs/requirements-matrix.md` statuses from "Implemented but untested" to "Tested" where evidence exists.

Until steps 1–3 are performed, the project is **not yet fully ready for demonstration**: the code side of Phases 1–5 is complete and locally verified, but the end-to-end lifecycle has not been executed in this session.
