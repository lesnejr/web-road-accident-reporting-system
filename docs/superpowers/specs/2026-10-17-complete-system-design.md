# Complete & Harden the Road Accident Reporting System — Consolidated Specification

- **Date:** 2026-10-17
- **Status:** Draft for review (no implementation before approval)
- **Branch plan:** `feature/complete-system` (from `feature/my-test` @ `0794b19`)
- **Sources of truth:** `IT 305 - PROJECT 3.pdf` (official), team master prompt + amendments (2026-10-17), this repository.

---

## 1. Verified current state (baseline)

A prior working session (documented in `docs/implementation-report.md`) produced a large set of **uncommitted** changes on top of `0794b19`. This session verified those claims against the actual code (not the report):

**Verified as implemented (uncommitted, preserved as-is):**

| Area | Evidence read this session |
|---|---|
| CORS allowlist | `server.js` default `http://localhost:3000,http://127.0.0.1:3000` — matches `client/vite.config.js` port 3000; `CORS_ORIGINS` env documented in `.env.example` |
| Rate limiting + headers | `middleware/security.js` (fixed-window, per-IP, `Retry-After`; `ponytail:` note about single process); applied to login/register in `server.js` |
| Upload content validation | `utils/fileType.js` (magic-byte allowlist JPEG/PNG/GIF/WebP/PDF), `routes/reports.js` sniff-on-upload + unlink on reject, `sanitizeFileName` |
| Evidence serving hardening | `routes/reports.js`: images inline, others attachment + `nosniff` + `Content-Security-Policy: default-src 'none'; sandbox`; path-traversal guard |
| Authz gap closed | `GET /:id/status-history` now scopes officers to assigned reports |
| Notification dedupe bug | fixed in `routes/trafficOfficer.js` (third duplicate block removed) |
| Report filters | `GET /api/reports` validates `status`, `category_id`, `date_from/to`, `q`; parameterized SQL in `models/Report.js` |
| CSV injection | `utils/csv.js` `buildCsv`; used by `routes/summaries.js` export; unit-tested |
| Report-reference race | retry loop on `ER_DUP_ENTRY` (5 attempts) in `models/Report.js` |
| Last-admin guards | `routes/admin.js` demote/deactivate guards using `User.countActiveAdmins()` |
| FR-04/11/12/13/15 UI | GPS + map picker + manual fallback (`ReportForm.jsx`); filter bar + URL persistence (`ReportsList.jsx`); `AdminSummaries.jsx`; user create/role/activate (`AdminUsers.jsx`); export honors active filters |
| Tests (unit) | `tests/*.test.js` (transitions, fileType, csv, validation) + fixed client test script; both wired to `npm test` |
| Hygiene | `.gitignore` covers `uploads/`; `login.json` deleted (unstaged); seed users removed (placeholder hashes gone); `scripts/create-admin.js` bootstrap |

**Verified NOT yet done (the deltas this spec covers):**

1. No `db:setup` / migration tracking; `database/seed.sql` categories are not idempotent; no documented dev accounts; `schema.sql` is not repeatable (`CREATE TABLE` without `IF NOT EXISTS`).
2. Uploads still resolve under htdocs (`UPLOAD_DIR=uploads`); `uploads/` files still tracked; `login.json` deletion not staged.
3. Last-admin guard is check-then-update — **not concurrency-safe**.
4. `window.confirm` still used in `AdminUsers.jsx` (lines 61, 78) — amendment requires a shared accessible modal.
5. No pagination/sorting on `GET /api/reports`.
6. No duplicate detection (no migration, endpoints, rule, or UI).
7. No PDF export; CSV/PDF exports do not yet state the applied filters/period.
8. No dedicated test database, no integration suite; DB-backed flows still unverified end to end.
9. README/matrix not updated to final verified state.

**Environment facts (checked):** XAMPP MariaDB 10.4.32 running on 3306; `accident_reporting` has schema + `notifications` (migration 002 applied this session) + 1 self-registered user; zero evidence rows. No real secrets were ever tracked (`.env` was never committed; `login.json` held dev-only test credentials). Mobile: no Flutter/Dart/Android tooling installed; **excluded by team decision** — to be recorded as "Not Implemented — excluded by team decision", not a tooling failure.

## 2. Goals and non-goals

**Goals:** close deltas 1–9 with tests and verification; preserve every existing workflow, status, API contract, and the prior session's code; end with a fully verified, documented, demonstrable system.

**Non-goals:** mobile app; email/push/SMS; git history rewrite (dev-only credentials; separately approvable); unrelated refactoring; removing legacy unused endpoints.

## 3. Decisions

| # | Decision | Rationale / alternative rejected |
|---|---|---|
| D1 | Baseline snapshot commit: commit the prior session's uncommitted work **unmodified** as the first commit on `feature/complete-system`, then deltas as checkpoints | Preserves the work, makes deltas reviewable as separate diffs. Alternative (one giant uncommitted blob) loses reviewability. |
| D2 | `db:setup` seeds dev accounts with **generated passwords printed once**; `--reset-dev-passwords` rotates them; nothing committed in plaintext | Satisfies "documented dev accounts without committing plaintext passwords". Rejected: fixed documented passwords in README (= committed plaintext); rejected: keeping only `create-admin` (amendment wants documented dev accounts, not just a procedure). |
| D3 | Migration tracking via `schema_migrations` table (filename + applied_at); migrations must be idempotent; schema.sql gains `IF NOT EXISTS` | Repeatable safe setup (amendment W1). Existing 002 is already idempotent; db:setup re-run records it without harm. |
| D4 | Pagination is **dual-mode**: no `page` param → current array response (all existing consumers unchanged); `page`+`limit` → `{ data, total, page, limit }`. Sorting via whitelisted `sort`/`order` params | Backward compatibility (amendment W3) with zero risk to MapPage/Dashboard; list page opts into pagination. |
| D5 | Duplicate rule (documented in code + README): candidate must have **accident date+time within ±24 h** AND at least one of: same category; both coordinates present and ≤ 300 m apart; location text match (case-insensitive LIKE). Missing coordinates disable the distance rule only — never a false match. No auto-merge; admin decides; one level only (a duplicate cannot itself be marked as a duplicate's parent) | Amendment W3: time window required, no false matches on missing coords, human review mandatory. |
| D6 | PDF via `pdfkit` (server-side, streams) | Lightweight, no browser. Puppeteer rejected (heavy). |
| D7 | Shared accessible `Modal`/`ConfirmDialog` component (role=dialog, aria-modal, focus trap, Esc, focus restore) replacing remaining `window.confirm`; keep the prior session's inline action panels | Amendment W4. |
| D8 | Integration tests use dedicated `accident_reporting_test` DB; setup asserts the DB name ends with `_test` before any DDL/DML; app spawned on an ephemeral port with `DB_NAME` override | Amendment W5. Dev DB is never touched. |
| D9 | No git-history rewrite; `login.json` deletion + `uploads/` untracking committed at baseline; history note in README | Only dev credentials were involved (verified). History rewrite would affect clones — separate approval if ever wanted. |
| D10 | Upload storage moves to an absolute path outside htdocs (`.env`: `UPLOAD_DIR=C:\xampp\accident_uploads`); code keeps `path.resolve` so relative and absolute both work; `uploads/.htaccess` (deny all) kept as defense-in-depth for legacy installs | Amendment W2. New uploads verified via authorized API route after the move. |

## 4. Work items (deltas), acceptance criteria, evidence

### W1 — Database setup (delta)

- **W1.1** `scripts/db-setup.js` + `npm run db:setup`:
  - applies `schema.sql` (amended with `IF NOT EXISTS` per table), then unapplied `database/migrations/*.sql` in filename order, recording each in `schema_migrations`;
  - seeds categories idempotently (`INSERT ... ON DUPLICATE KEY UPDATE` in `seed.sql` — users stay out of the file);
  - creates `admin@local.test`, `officer@local.test`, `reporter@local.test` with generated passwords, printed once; existing accounts are never overwritten; `--reset-dev-passwords` rotates and reprints;
  - ends by verifying each created account against its stored bcrypt hash; exits non-zero with a clear message if MySQL is unreachable;
  - never drops, truncates, or deletes.
  - **Acceptance:** run twice consecutively — second run is a no-op for existing data; `npm run db:setup` output lists applied/skipped migrations; login via API succeeds for a created account (integration test).
- **W1.2** README section for db:setup; `.env.example` unchanged keys.

### W2 — Security (delta)

- **W2.1** Move uploads: set local `.env` `UPLOAD_DIR` to an absolute path outside htdocs; copy the 3 legacy files; add `uploads/.htaccess` deny-all; verify a new upload is servable only via the authorized endpoint (integration test) and not via a direct file URL.
- **W2.2** Untrack uploads: `git rm --cached uploads/<3 files>`; confirm the `login.json` deletion (already in the working tree) lands in the baseline snapshot commit and `.gitignore` coverage holds. No history rewrite (D9).
- **W2.3** Concurrency-safe last-admin guard: wrap the check + update in a transaction with `SELECT ... FOR UPDATE` (both demote and deactivate routes); integration test fires concurrent requests (two simultaneous demotions/deactivations of the last admin) and asserts at least one active admin always remains.
- **W2.4** Replace the two `window.confirm` uses with the shared accessible modal (D7); no other native dialogs remain (grep gate).
- **W2.5** Verify the fixed client test script (`node --test "src/services/*.test.js"`) runs on Windows; fix the pattern if not.

### W3 — Functional completion (delta)

- **W3.1** Pagination + sorting on `GET /api/reports` per D4: params `page`, `limit` (1–100, default 20), `sort` ∈ {created_at, accident_date, status, report_reference}, `order` ∈ {asc, desc}; invalid values → 422 consistent error shape; role scoping and filters compose with pagination; `ReportsList.jsx` gets pager + sort control; every other consumer keeps the array mode. Tests: page boundaries, filter+pagination combos, invalid params, officer/reporter scoping preserved.
- **W3.2** Duplicate detection per D5: migration `003_duplicate_reports.sql` (`duplicate_of_report_id INT UNSIGNED NULL`, FK → `reports(id)` `ON DELETE SET NULL`, index); `GET /api/reports/:id/duplicates` (admin) returns scored candidates with reasons; `PATCH /api/reports/:id/duplicate` (admin) sets/clears with validation (target exists; no self-reference; no chains — target must not itself be marked); audit entries `DUPLICATE_FLAGGED` / `DUPLICATE_CLEARED`; `ReportDetail.jsx` panel: candidates with reasons, mark/clear, link to original, clear flag display. Tests: window edges (±24 h), missing coordinates produce no distance match, distance edge (300 m), category-only match, chain rejected, self rejected, non-admin rejected, audit written.
- **W3.3** PDF export per D6: `format=pdf` on the detailed export and on the summaries endpoint; same admin-only authorization and identical filters/scope as CSV; PDF header states scope, selected period, and every applied filter. CSV gains the same filter/period statement line. Tests: permission parity, header content, filter parity with CSV, content-type/filename.
- **W3.4** Summary date-boundary tests against fixtures: reports with explicit `created_at` on week/month/year edges; daily/weekly/monthly/annual buckets and inclusive `to` date verified against expected counts.

### W4 — UI refresh (delta)

- **W4.1** Shared `Modal` + `ConfirmDialog` (accessible per D7); used by AdminUsers confirmations; exported for reuse.
- **W4.2** Responsive pass: tables degrade to stacked cards below ~640 px, filter bars wrap, nav usable on small screens, no horizontal overflow on the main pages (Reports list, detail, admin dashboard, summaries, users).
- **W4.3** States: verify every fetch has loading / empty / error rendering; errors surface the API message (no silent empty state).
- **W4.4** Accessibility basics: labels on all inputs, visible focus states, modal focus trap/Esc, contrast unchanged from theme.

### W5 — Testing and verification (delta)

- **W5.1** Test DB bootstrap (`tests/helpers/testDb.js`): assert name ends with `_test`, create/apply schema+migrations fresh, seed fixtures; teardown clears only that DB.
- **W5.2** Integration suite (`node:test` + `fetch`, app on ephemeral port): auth (register/login/logout/inactive/rate-limit smoke), roles & ownership, report validation + submission, allowed **and disallowed** transitions, evidence upload security (valid accepted; HTML-renamed rejected; unauthorized fetch denied), duplicates (all W3.2 cases), notification counts (exactly one per event), pagination/filters, summaries boundaries, dashboard totals, user management incl. concurrent last-admin, audit records, CSV/PDF exports. Fail-fast message when MySQL is unreachable.
- **W5.3** Run with MySQL up: `npm test` (root: unit + integration), `cd client && npm test`, `npm run build`. Fix regressions caused by deltas. Document anything unrun.
- **W5.4** Manual smoke on the live app (synthetic data only): register → submit with map picker → upload → verify → assign → officer update → notifications → export.

### W6 — Documentation (delta)

- **W6.1** README: db:setup, upload dir change, PDF export, test DB + commands, demo-account procedure, API routes/roles table refresh, limitations (single-process limiter/blocklist, localStorage tokens, summaries 50-period cap, no mobile), troubleshooting.
- **W6.2** `docs/requirements-matrix.md`: update every status with evidence from actual runs; mobile recorded as "Not Implemented — excluded by team decision"; no "Tested" without an executed test.
- **W6.3** Final report per master prompt §14 (changes, files, migrations, endpoints, tests+results, setup, matrix, limitations).

## 5. Amendment compliance map

| Amendment | Where satisfied |
|---|---|
| W1 safe/repeatable setup, migration tracking, dev accounts, auth verification | W1.1, W1.2 (delta) |
| W2 real CORS origin, absolute upload path + verified access, content validation, untracking + history note, single-process documentation, notification fix preserved, concurrent last-admin test | Existing (verified) for CORS/content validation/notification fix; deltas W2.1–W2.4 |
| W3 backward-compatible pagination + all consumers updated, time-window duplicate rule + no false matches + audit, FK + chain/self validation, consistent export authz + filters in exports, date-boundary tests | D4, D5, W3.1–W3.4 |
| W4 shared accessible modal, responsive, workflows preserved, honest states | D7, W4.1–W4.4 |
| W5 tests alongside changes, dedicated verified test DB, Windows test command, build, honest blockers | D8, W5.1–W5.4 |
| W6 README, matrix with evidence, mobile = team decision, no false claims | W6.1–W6.3 |

## 6. Execution order and checkpoints

1. Commit: baseline snapshot of prior work (D1) + this spec.
2. W1 → commit. 3. W2 → commit(s). 4. W3 → commit per item (W3.1–W3.4). 5. W4 → commit. 6. W5 → commit. 7. W6 → commit. No push.

## 7. Risks

- **Time:** ~13 days to Oct 30. Order (web+security first) is user-set; W3.2/3.3 are the largest new items.
- **Concurrency test determinism:** transactions + `FOR UPDATE` on MariaDB; test asserts an invariant, not timing.
- **Moving uploads** invalidates legacy relative paths — safe here because the dev DB has zero evidence rows; verified in tests.
- **pdfkit** is the only new dependency; justified by the explicit PDF amendment.
- Prior session's work is unverified end-to-end until W5.2 runs; every status in the final matrix will cite a real run.

## 8. Definition of done

All deltas implemented with tests; `npm test` (root + client) and `vite build` pass on this machine; manual smoke executed; README + matrix + final report updated; every claim backed by this session's output; mobile recorded as excluded by team decision; nothing pushed.
