# Requirements Traceability Matrix — FR-01 to FR-15

Project: Web and Mobile-Based Road Accident Reporting System (web application only).
Last updated: 2026-10-17 (completion pass, second session). Evidence is from files in this repository and from commands actually run in this session.

Status vocabulary:

- **Tested** — executed end to end with observed results.
- **Partial** — some of the requirement is implemented; the remaining gaps are listed.
- **Not Implemented** — absent, with the reason.

Basis of evidence (all on 2026-10-17, Node v24.18.0, MariaDB 10.4.32 via XAMPP):

- `npm test` → **46/46 pass** (pure-logic unit tests plus integration tests against dedicated `*_test` databases).
- `cd client && npm test` → **8/8 pass**; `cd client && npm run build` → success.
- Two live smoke runs against the development server and database with the development accounts, covering registration, login, the full report lifecycle, notifications, duplicate review, exports, the dashboard, summaries and the audit log. Full results: `docs/final-report.md`.

| FR | Requirement | Status | Evidence (repo) | Tests / live runs | Gaps / notes |
|---|---|---|---|---|---|
| FR-01 | User registration | **Tested** | `routes/auth.js` (`POST /register`, role forced to `reporter`, field validation), `client/src/pages/Register.jsx`, duplicate email → 409 via `middleware/errorHandler.js` | Live: fresh registration → 201 with role `reporter`; backend suite covers validation and duplicates | — |
| FR-02 | Authentication and session security | **Tested** | `routes/auth.js` (bcryptjs, JWT with `jti`, inactive-account rejection), `middleware/auth.js` (signature/expiry/status per request), login rate limit + security headers in `server.js`/`middleware/security.js` | Live: logins for all three dev roles → 200; `/api/reports` without token → 401; prior live probes of CORS allowlist and headers; suite includes auth cases | Tokens live in `localStorage` (documented). Logout blocklist is in-memory (single process). |
| FR-03 | Accident reporting | **Tested** | `routes/reports.js` (`POST /`), `models/Report.js` (`validateReport`, reference retry on duplicate), `client/src/pages/ReportForm.jsx` | Live: report created → 201, reference `RA-2026-000001`, coordinates stored, creation audited (`CREATE_REPORT`); `tests/validation.test.js` 6 cases | — |
| FR-04 | Location and GPS | **Partial** | `client/src/pages/ReportForm.jsx` — "Use my current location" with permission-denied/unsupported/failed messages, "Pick on map" via `ReportMap` `onMapPick`, manual latitude/longitude inputs with min/max; wording states coordinates are not verified | Live: coordinates persisted through create and read back; client unit tests pass | Browser GPS permission flows and map tapping are not machine-verified (manual pass listed in the final report). No address search/reverse geocoding. |
| FR-05 | Evidence upload and retrieval | **Tested** | `utils/fileType.js` (content signature allowlist), `routes/reports.js` upload (sniff + unlink on reject, `sanitizeFileName`, 413 on oversize), serving (images inline; others attachment + `nosniff` + `Content-Security-Policy: default-src 'none'; sandbox`), `UPLOAD_DIR` outside htdocs + deny-all `.htaccess`, path-traversal guard, per-role authorization | Live: upload → 201; authorized download → 200 with exact bytes and `nosniff`; `tests/evidence.test.js` (upload/authorization cases) | Historical rows keep their old MIME values; new uploads store sniffed types. |
| FR-06 | Report tracking | **Tested** | Ownership scoping in `models/Report.js` (`buildReportQuery`), `GET /api/reports/:id/status-history` + UI in `ReportDetail.jsx`, loading/empty/error states across list and detail pages | Live: status history returned 5 transitions, newest first, with actor names; cross-role access checks in the suite | Evidence downloads are not audited (reads only). |
| FR-07 | Report management | **Tested** | Transition matrix `utils/helpers.js`; verify/assign route `routes/admin.js`; officer routes `routes/trafficOfficer.js`; UI actions in `ReportDetail.jsx` | Live: full chain verify → assign → findings → in_progress → resolved (all 200); illegal `resolved → submitted` refused with 409; `tests/transitions.test.js` 9 cases | — |
| FR-08 | Verification | **Tested** | Admin verify route (`rejected` requires a reason, `needs_clarification` a message), `verified_by`/`verified_at` persisted; duplicate detection added in `database/migrations/003_duplicate_reports.sql` + `utils/duplicates.js` + `routes/reports.js` (candidates, flag/clear, audit) | Live: `under_review → verified → assigned` all 200; duplicate candidates `{ report, reasons }` with `time_window + distance + location_text`; flag 200, chain 422, self-reference 422, clear 200; `tests/duplicates.test.js` 10 cases | Duplicate detection is a review aid: ±24 h plus at least one matching reason, never auto-merged; chains are refused. |
| FR-09 | Notifications | **Tested** | `models/Notification.js`, `routes/notifications.js`, bell + page UI; one notification per status/findings event | Live: reporter received exactly one notification per event (7 events incl. creation and findings, no duplicates); assigned officer received exactly the one assignment notification; unread count matched; `tests/smoke.test.js` covers the API path | Channel is in-app only (no email/SMS/push). |
| FR-10 | Dashboard | **Tested** | `GET /api/summaries/dashboard/stats` consumed by `client/src/pages/AdminDashboard.jsx`; mock mode only behind `VITE_USE_MOCK_DASHBOARD` (unset) | Live: dashboard stats → 200 with `kpis`, `monthlySeries`, `pipeline`, `byStatus`, `byInjury` | Legacy endpoints (`/api/admin/dashboard`, `/api/summaries/dashboard/summary`, `/dashboard/map`) remain but are unused by the UI. |
| FR-11 | Search and filtering | **Tested** | `GET /api/reports` validates `status`, `category_id`, `date_from`, `date_to`, `q`, adds a sort whitelist (`created_at\|accident_date\|status\|report_reference`) and opt-in pagination; `client/src/pages/ReportsList.jsx` keeps filters, sort and page in the URL | Live: paged envelope `{ data, total, page, limit }` and legacy array without `page`; `accident_date` ascending verified; filter parity between list and CSV export; `tests/pagination.test.js` | No location-radius filter. Text search covers reference, title and location. |
| FR-12 | Report generation (summaries) | **Tested** | `GET /api/summaries/reports/summaries` (daily/weekly/monthly/annual, date validation, inclusive end date, JSON or PDF) surfaced by `client/src/pages/AdminSummaries.jsx` | Live: monthly bucket `2026-10` counted both new reports (1 submitted, 1 resolved); PDF export starts `%PDF-` and ends `%%EOF`; `tests/summaries.test.js` pins week/month/year boundaries and `to`-date inclusivity | Returns at most the 50 most recent periods per range. |
| FR-13 | User management | **Tested** | Admin UI `client/src/pages/AdminUsers.jsx` (create, role change, activate/deactivate); `routes/admin.js` guards self-demotion, self-deactivation and last-active-admin demotion; transactional guard added in `models/User.js`; bootstrap via `scripts/create-admin.js` | `tests/admin.test.js` exercises the last-active-admin race against a real test database; live: role-scoped user list used for assignment | Admin password reset is CLI-only (`--set-password`), by design. |
| FR-14 | Audit trail | **Tested** | `models/AuditLog.js` (filter-aware total), admin-only route, entries for create/update report, evidence upload, verify/assign, status updates, findings, duplicate decisions, user management | Live: audit rows showed `VERIFY_REPORT` ×3, `ADD_FINDINGS`, `UPDATE_STATUS` ×2, `CREATE_REPORT`, `UPLOAD_EVIDENCE` and `DUPLICATE_FLAGGED`/`DUPLICATE_CLEARED`; pagination total verified in the suite | Evidence downloads are not audited (reads only). |
| FR-15 | Data export | **Tested** | `GET /api/summaries/reports/export?format=csv\|pdf` (admin-only) honours status/category/date/text filters plus `verified` scope; shared header lines from `utils/exportHeader.js`; CSV escaping in `utils/csv.js`; PDF rendering with pdfkit | Live: CSV first line states the scope, a filter line reads `Filter - status: submitted`, and the file contains the fresh reference; both PDFs valid (`%PDF-` magic, `%%EOF`, >1 kb); `tests/exports.test.js` 4 cases | PDF has no dedicated UI button yet; the admin UI ships the CSV button and the same endpoint serves `format=pdf`. |

## Mobile application

**Not Implemented — excluded by team decision.** The team scoped this project to the web application; no mobile code exists in this repository.

## Environment notes

1. XAMPP MariaDB 10.4.32 (port 3306) must be running for the app and the integration tests.
2. The integration tests create and drop their own databases, which must end in `_test`; the harness refuses any other database name.
3. The development database currently holds smoke artifacts from the verification runs (two reports, one evidence file, one extra registered user). Safe to leave for a demonstration; there is no cleanup script.

## How to close the remaining gaps

1. Manual browser pass with the development accounts: modal Esc/focus-trap behaviour, the duplicate-review panel buttons, the responsive card layout at 375 px, GPS permission flows, and opening the downloaded CSV/PDF in a viewer.
2. Optional: add a PDF download button to the admin UI (the endpoint already supports it).
