# Requirements Traceability Matrix — FR-01 to FR-15

Project: Web and Mobile-Based Road Accident Reporting System (web application only).
Last updated: 2026-10-17 (completion pass, then a requirements audit against the master-prompt sections 5–8; audit additions carry their commit hash). Evidence is from files in this repository and from commands actually run in this session.

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
| FR-10 | Dashboard | **Tested** | `GET /api/summaries/dashboard/stats` consumed by `client/src/pages/AdminDashboard.jsx`; mock mode only behind `VITE_USE_MOCK_DASHBOARD` (unset) | Live: dashboard stats → 200 with `kpis`, `monthlySeries`, `pipeline`, `byStatus`, `byInjury`; audit pass (`6309982`) added the **Recent submissions** list (requirement 5.A.3) — live check returned 3 rows newest first, the accident-type filter matched (2 rows, 0 mismatches), year 2025 returned none | Legacy endpoints (`/api/admin/dashboard`, `/api/summaries/dashboard/summary`, `/dashboard/map`) remain but are unused by the UI. |
| FR-11 | Search and filtering | **Tested** | `GET /api/reports` validates `status`, `category_id`, `date_from`, `date_to`, `q`, adds a sort whitelist (`created_at\|accident_date\|status\|report_reference`) and opt-in pagination; `client/src/pages/ReportsList.jsx` keeps filters, sort and page in the URL | Live: paged envelope `{ data, total, page, limit }` and legacy array without `page`; `accident_date` ascending verified; filter parity between list and CSV export; `tests/pagination.test.js` | No location-radius filter. Text search covers reference, title and location. |
| FR-12 | Report generation (summaries) | **Tested** | `GET /api/summaries/reports/summaries` (daily/weekly/monthly/annual, date validation, inclusive end date, JSON or PDF) surfaced by `client/src/pages/AdminSummaries.jsx` | Live: monthly bucket `2026-10` counted both new reports (1 submitted, 1 resolved); PDF export starts `%PDF-` and ends `%%EOF`; `tests/summaries.test.js` pins week/month/year boundaries and `to`-date inclusivity | Returns at most the 50 most recent periods per range. |
| FR-13 | User management | **Tested** | Admin UI `client/src/pages/AdminUsers.jsx` (create, role change, activate/deactivate); `routes/admin.js` guards self-demotion, self-deactivation and last-active-admin demotion; transactional guard added in `models/User.js`; bootstrap via `scripts/create-admin.js` | `tests/admin.test.js` exercises the last-active-admin race against a real test database; live: role-scoped user list used for assignment | Admin password reset is CLI-only (`--set-password`), by design. |
| FR-14 | Audit trail | **Tested** | `models/AuditLog.js` (filter-aware total), admin-only route, entries for create/update report, evidence upload, verify/assign, status updates, findings, duplicate decisions, user management | Live: audit rows showed `VERIFY_REPORT` ×3, `ADD_FINDINGS`, `UPDATE_STATUS` ×2, `CREATE_REPORT`, `UPLOAD_EVIDENCE` and `DUPLICATE_FLAGGED`/`DUPLICATE_CLEARED`; pagination total verified in the suite | Evidence downloads are not audited (reads only). |
| FR-15 | Data export | **Tested** | `GET /api/summaries/reports/export?format=csv\|pdf` (admin-only) honours status/category/date/text filters plus `verified` scope; shared header lines from `utils/exportHeader.js`; CSV escaping in `utils/csv.js`; PDF rendering with pdfkit | Live: CSV first line states the scope, a filter line reads `Filter - status: submitted`, and the file contains the fresh reference; both PDFs valid (`%PDF-` magic, `%%EOF`, >1 kb); `tests/exports.test.js` 4 cases | PDF has no dedicated UI button yet; the admin UI ships the CSV button and the same endpoint serves `format=pdf`. |

## Master-prompt audit (sections 5–8)

Audited 2026-10-17. The reference image was not available to the assistant, so the comparison used the written requirements only.

- **Section 5.A (dashboard):** summary cards (Total Submitted / Pending / Verified / Resolved-Closed, plus Fatalities), real-data charts and monthly trends, the Leaflet map (verified/unverified legend, marker → report details, empty state), navigation and both export formats. The one missing required component — a recent submissions list (5.A.3) — was added in `6309982`.
- **Section 5.B (report management):** search by reference/title/location; date, type and status filters that combine; duplicate review; assignment; permitted transitions only; rejection reason required; validation feedback; role-scoped access. All present (FR-07, FR-08, FR-11 rows).
- **Section 5.C (report details):** every listed field is on the page — reference, reporter contact (API access-scoped), accident date/time, location, coordinates + map, category, vehicle type and counts, injury status incl. `unknown`, severity, description, evidence, submission date, status, assigned officer, verification notes, findings and status history. Evidence serving is authenticated and non-executable (images inline; everything else `attachment` with `nosniff` and a sandbox CSP).
- **Section 7 (visual/responsive):** card tables ≤640 px and nav/pager tweaks were delivered in Task 13 (`cddabd1`); the 375 px browser check remains part of the manual pass.

### Section 6 — suggested statuses vs implemented

No rename and no migration were needed; every suggested state already exists under an equivalent name.

| Suggested status | Implemented | Notes |
|---|---|---|
| Submitted | `submitted` | initial state |
| Under Review | `under_review` | |
| Additional Information Required | `needs_clarification` | a message is required; the reporter can edit the report while clarification is pending |
| Verified | `verified` | |
| Assigned | `assigned` | assignment is separate from verification |
| In Progress | `in_progress` | assigned officer only |
| Resolved / Closed | `resolved` | |
| Rejected | `rejected` | a reason is required and recorded |

### Section 8 — acceptance checks

"Verified how" distinguishes automated tests, live smoke runs against the dev database, and manual browser checks. Items marked manual-pending are **not** claimed as verified.

| # | Check | Result | Verified how |
|---|---|---|---|
| 1 | Dashboard summary cards match the authorized records | Pass | Live smoke run 2 (stats cross-checked against the known record counts) |
| 2 | Charts and trends use real data | Data path pass; rendering manual-pending | Code inspection (mock only behind `VITE_USE_MOCK_DASHBOARD`, unset) + live payload check |
| 3 | Map shows reports with coordinates, handles missing ones | Data path pass; visual manual-pending | Live payload (null coordinates filtered) + code (empty-state message + marker → details button) |
| 4 | Search by ID and location | Pass | `tests/pagination.test.js` + live smoke run 1 (search parity with the CSV export) |
| 5 | Date, type and status filters combine | Pass | `tests/exports.test.js` (filter parity) + live smoke run 1 (status filter) |
| 6 | Opening a report shows details and evidence | Pass | `tests/evidence.test.js` + live smoke (detail payload incl. evidence) |
| 7 | Roles see only permitted actions and information | Server pass; UI manual-pending | Suite authorization cases (evidence, transitions, admin guard); UI action filtering added in `0c05ae0`; browser check pending |
| 8 | Every supported transition, including refusals | Pass | `tests/transitions.test.js` 9 cases + live (`resolved → submitted` refused 409) |
| 9 | Rejection requires and records a reason | Pass | Transition validation (reason required) + rejected status persists a reason; no live rejection was run |
| 10 | Status changes generate audit records and notifications | Pass | Live smoke run 2 (audit rows per step; exactly one notification per event, 7 events) + `tests/smoke.test.js` |
| 11 | CSV and both PDF formats reflect the authorized filtered dataset | Pass | `tests/exports.test.js` 4 cases + live (scope line, filter line, valid PDFs) |
| 12 | Usable at approximately 375 px | Manual-pending | CSS delivered (`cddabd1`); browser check is part of the user's manual pass |

## Mobile application

**Not Implemented — excluded by team decision.** The team scoped this project to the web application; no mobile code exists in this repository.

## Environment notes

1. XAMPP MariaDB 10.4.32 (port 3306) must be running for the app and the integration tests.
2. The integration tests create and drop their own databases, which must end in `_test`; the harness refuses any other database name.
3. The development database currently holds artifacts from the verification runs and the manual browser pass (three reports in a mix of statuses, two evidence files, one extra registered user). Safe to leave for a demonstration; there is no cleanup script.

## How to close the remaining gaps

1. Manual browser pass with the development accounts: modal Esc/focus-trap behaviour, the duplicate-review panel buttons, the responsive card layout at 375 px, GPS permission flows, and opening the downloaded CSV/PDF in a viewer.
2. Optional: add a PDF download button to the admin UI (the endpoint already supports it).
