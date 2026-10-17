# Requirements Traceability Matrix — FR-01 to FR-15

Project: Web and Mobile-Based Road Accident Reporting System (web application only).
Last updated: 2026-10-17. Evidence is from files in this repository and from commands actually run in this session.

Status vocabulary used in this matrix:

- **Tested** — executed end to end with observed results.
- **Implemented but untested** — code exists and is wired; end-to-end execution is not yet verified.
- **Partial** — some of the requirement is implemented; gaps are listed.
- **Missing** — not implemented.
- **Blocked** — verification was attempted or is required but cannot run in the current environment (MySQL was not running during this session).

> Important: no database-backed flow could be executed because MySQL was unavailable (`ECONNREFUSED` on the DB probe). Unit-level logic is covered by 25 passing backend tests. No FR is marked **Tested** yet.

| FR | Requirement | Status | Evidence (repo) | Tests run this session | Gaps / notes |
|---|---|---|---|---|---|
| FR-01 | User registration | Implemented but untested | `routes/auth.js` (`POST /register`, role forced to `reporter`, field validation), `client/src/pages/Register.jsx`, duplicate email → 409 via `middleware/errorHandler.js` | None (DB required) | Register a real account once MySQL runs. |
| FR-02 | Authentication and session security | Partial | `routes/auth.js` (`bcryptjs`, JWT with `jti`, inactive-account rejection), `middleware/auth.js` (signature/expiry/status check per request), login rate limit + security headers in `server.js`/`middleware/security.js` | Live probes: `/api/health` 200; `/api/reports` no/bad token → 401; CORS allowlist works; headers present; login with DB down → generic 500. Rate limiting code-path exercised only logically. | Tokens live in `localStorage` (XSS trade-off, documented). Logout blocklist is in-memory. Full login/logout needs MySQL. |
| FR-03 | Accident reporting | Implemented but untested | `routes/reports.js` (`POST /`), `models/Report.js` (`validateReport`, reference retry on duplicate), `client/src/pages/ReportForm.jsx` | `tests/validation.test.js` — 6 tests pass (required fields, date format/future, injury enum, coordinates, title length) | End-to-end submission needs MySQL. Reference generation based on `COUNT` is now retried on `ER_DUP_ENTRY`. |
| FR-04 | Location and GPS | Partial | `client/src/pages/ReportForm.jsx` — "Use my current location" with permission-denied/unsupported/failed messages, "Pick on map" using `ReportMap` `onMapPick`, manual latitude/longitude inputs with min/max, device-vs-manual wording clarifies coordinates are not verified | Frontend build only (`npm run build` succeeds) | Browser behavior (granted/denied GPS) not exercised. No address search/reverse geocoding. |
| FR-05 | Evidence upload and retrieval | Implemented but untested | `utils/fileType.js` (content signature allowlist: JPEG/PNG/GIF/WebP/PDF), `routes/reports.js` upload (sniff + unlink on reject, `sanitizeFileName`, 413 on oversize via `middleware/errorHandler.js`), serving (images inline; others `application/octet-stream` + attachment + `nosniff` + `Content-Security-Policy: default-src 'none'; sandbox`), path-traversal guard, auth per role | `tests/fileType.test.js` — 6 tests pass (detections, HTML/SVG/EXE/text rejections, truncation, missing file, name sanitizing) | Real upload/download needs MySQL. Existing rows keep historical MIME values; new uploads store sniffed types. |
| FR-06 | Report tracking | Implemented but untested | Ownership scoping in `models/Report.js` `buildReportQuery`, status history endpoint and UI (`GET /api/reports/:id/status-history`, `ReportDetail.jsx`), loading/empty/error states in list and detail | None (DB required) | — |
| FR-07 | Report management | Implemented but untested | Transition matrix `utils/helpers.js`; verify/assign route `routes/admin.js`; officer status route `routes/trafficOfficer.js`; UI actions in `ReportDetail.jsx` (inline panels, officer dropdown) | `tests/transitions.test.js` — 9 tests pass (who may transition, matrix edges, assignment restriction, terminal states) | — |
| FR-08 | Verification | Implemented but untested | Admin verify route requires reason for `rejected` and message for `needs_clarification` (server side in `utils/helpers.js`), `verified_by`/`verified_at` persisted, rejected reports are kept (status only) | Covered by `tests/transitions.test.js` cases | Duplicate-submission detection is not implemented (no policy agreed). |
| FR-09 | Notifications | Implemented but untested | `models/Notification.js`, routes in `routes/notifications.js`, bell + page UI; duplicate-notification bug removed in `routes/trafficOfficer.js` | None (DB required) | Channel is in-app only (no email/SMS/push). Ownership on list/read enforced in routes. |
| FR-10 | Dashboard | Implemented but untested | `GET /api/summaries/dashboard/stats` used by `client/src/pages/AdminDashboard.jsx`; mock mode only behind `VITE_USE_MOCK_DASHBOARD` (verified unset) | None (DB required) | Legacy endpoints (`/api/admin/dashboard`, `/api/summaries/dashboard/summary`, `/dashboard/map`) remain but are unused by the UI; definitions differ and were left untouched. |
| FR-11 | Search and filtering | Implemented but untested | `GET /api/reports` validates `status`, `category_id`, `date_from`, `date_to`, `q` and builds parameterized SQL (`routes/reports.js`, `models/Report.js`); `client/src/pages/ReportsList.jsx` wires all controls, keeps filters in the URL, has Clear filters | None (DB required) | No location-radius filter; text search covers reference/title/location. No pagination (documented limitation). |
| FR-12 | Report generation (summaries) | Implemented but untested | `GET /api/summaries/reports/summaries` (daily/weekly/monthly/annual, date validation, inclusive end date) surfaced by new `client/src/pages/AdminSummaries.jsx` with period selector, date range, table and totals | None (DB required) | Endpoint returns at most 50 periods per range; large ranges silently truncate the oldest buckets. |
| FR-13 | User management | Implemented but untested | Admin UI `client/src/pages/AdminUsers.jsx` (create account, role change, activate/deactivate); server routes `routes/admin.js` guard self-demotion, self-deactivation and last-active-admin demotion/deactivation; bootstrap via `scripts/create-admin.js`; broken seed users removed from `database/seed.sql` | Script syntax loads under Node; logic requires MySQL | Admin password reset is CLI-only (`--set-password`), by design. |
| FR-14 | Audit trail | Implemented but untested | `models/AuditLog.js` (filter-aware total fixed), admin-only route, entries for create/update report, evidence upload, verify/assign, status updates, findings, user create/update/role change | None (DB required) | Evidence *downloads* are not audited (reads only). |
| FR-15 | Data export | Implemented but untested | `GET /api/summaries/reports/export` (admin-only) honors status/category/date/text filters plus scope, uses `utils/csv.js` escaping, states scope in first row; UI export button sends the active filters and chosen scope | `tests/csv.test.js` — 4 tests pass (quoting, formula-injection neutralization, layout) | CSV only; PDF export not implemented (CSV is acceptable unless a stricter requirement is set). |

## Environment blockers

1. XAMPP MySQL was not running during this session (port 3306 closed, `ECONNREFUSED` from the pool). Every DB-backed flow above is therefore **Blocked** for verification.
2. Fresh installs have no accounts: `database/seed.sql` no longer ships users; run `npm run create-admin` first, then create staff accounts in User Management.

## How to close the gaps

1. Start MySQL in the XAMPP Control Panel.
2. Run `npm run create-admin` for the first admin (or use an existing account).
3. Execute the integration checklist in `docs/implementation-report.md` §"Next recommended step" with synthetic accounts, and update this matrix with observed results.
