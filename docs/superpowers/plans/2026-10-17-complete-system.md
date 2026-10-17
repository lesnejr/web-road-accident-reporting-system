# Complete & Harden the Road Accident Reporting System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 9 verified deltas between the current (uncommitted) system and the approved spec, with tests and verification at every stage.

**Architecture:** Express + MariaDB REST API, React/Vite client. Deltas: repeatable DB setup, upload storage outside htdocs, concurrency-safe last-admin guard, shared modal, backward-compatible pagination/sorting, duplicate detection (migration 003), PDF export, dedicated test DB + integration suite, docs.

**Tech Stack:** Node 24 (node:test, fetch), Express 4, mysql2, MariaDB 10.4.32 (XAMPP), React 18 + Vite 5, bcryptjs, JWT, pdfkit (only new dependency).

**Spec:** `docs/superpowers/specs/2026-10-17-complete-system-design.md`

## Global Constraints

- Windows/PowerShell environment; commands run from repo root `C:\xampp\htdocs\roadaccident\web-road-accident-reporting-system` unless stated.
- Branch `feature/complete-system`; commit at each task's end; **never push**; never reset/clean.
- The prior session's uncommitted work is preserved; deltas only, no unrelated refactoring.
- Only new dependency allowed: `pdfkit` (Task 11).
- Test databases: `accident_reporting_test` (integration), `accident_reporting_setup_test` (setup script). Any DB touched by tests must end with `_test` — assert before DDL/DML.
- The dev database `accident_reporting` is never dropped, truncated, or overwritten by any script or test.
- No plaintext passwords or placeholder hashes committed, ever.
- API error shape: `{ error: { code, message, details? } }`; 422 for invalid input/filters, 409 invalid transitions, 403 authz, 404 missing.

## Review Focus (inputs most likely to bite; each has a test in the owning task)

1. Two concurrent **cross**-demotions/deactivations (admin A demotes/deactivates B while B does the same to A) → at least one active admin must always remain (Task 6).
2. An HTML file renamed `photo.png` is uploaded → rejected 422 and the temp file is unlinked (Task 5).
3. Two reports in the same ±24 h window, one or both without coordinates, at different places → must NOT be suggested as duplicates (Task 9).
4. `GET /api/reports?page=999` and `limit=1000` and `sort=evil` → empty page with correct `total`, 422 for bad `limit`/`sort` (Task 8).
5. Exports with filters and scope: header lines state scope/period/filters; unverified records never appear unless the scope says so; PDF is a valid `%PDF` file (Tasks 11–12).

---

### Task 1: Baseline snapshot commit (spec D1)

**Files:** none (repo state only).

- [ ] **Step 1: Verify tree matches the audit** — `git status --short` shows the same file set as the spec §1 (23 modified, new `docs/`, `scripts/`, `tests/`, `utils/`, `middleware/security.js`, `README.md`; `login.json` deleted). If anything differs, stop and ask.
- [ ] **Step 2: Commit prior work unmodified**

```bash
git add -A
git commit -m "chore: snapshot prior session implementation (baseline, unmodified)"
```

- [ ] **Step 3: Verify** — `git status --short` empty except nothing; `git log --oneline -2` shows the snapshot above the spec commit. `uploads/` files still tracked (untracking is Task 2).

### Task 2: Untrack uploaded evidence (spec W2.2)

**Files:** `.gitignore` (already covers `uploads/`), git index only.

- [ ] **Step 1: Untrack the three files** — list with `git ls-files uploads`, then untrack each: `git ls-files uploads | ForEach-Object { git rm --cached $_ }`
- [ ] **Step 2: Commit** — `git commit -m "chore: stop tracking uploaded evidence files"`
- [ ] **Step 3: Verify** — `git ls-files uploads` prints nothing; files still exist on disk (`Get-ChildItem uploads`).

### Task 3: Test harness + client test script check (spec W5.1, W2.5)

**Files:**
- Create: `scripts/db-setup.js` — full setup engine **except account seeding** (which lands in Task 4): `applyDatabase({ dbName, seedPassword, resetPasswords, log })` + CLI main-guard.
- Create: `tests/helpers/testDb.js`, `tests/helpers/api.js`
- Create: `tests/smoke.test.js`

**Interfaces (produced, used by all later test tasks):**
- `testDb.js`: `export const TEST_DB = 'accident_reporting_test'`; `export async function setupTestDb()` — asserts `TEST_DB.endsWith('_test')`, calls `applyDatabase({ dbName: TEST_DB, seedPassword: process.env.DEV_SEED_PASSWORD || 'testpassword123', resetPasswords: true, log: () => {} })`, returns `{ pool }` (mysql2/promise pool on TEST_DB).
- `api.js`: `export async function startTestServer()` → `{ baseUrl, stop() }` — spawns `node server.js` with env `{ DB_NAME: TEST_DB, PORT: '5199', DEV_SEED_PASSWORD: ... }`, polls `/api/health` until 200 (10 s timeout, kill+throw otherwise); `export async function request(path, { method = 'GET', token, body } = {})` → `{ status, data, headers }`; `export async function loginAs(email, password)` → token.

- [ ] **Step 1: Write the failing smoke test** `tests/smoke.test.js`:

```js
test('health responds and registration + login round-trip works on the test DB', async () => {
  const { baseUrl, stop } = await startTestServer();
  try {
    const health = await request('/api/health');
    assert.equal(health.status, 200);
    const reg = await request('/api/auth/register', { method: 'POST', body: { name: 'Smoke Reporter', email: 'smoke.reporter@test.local', password: 'password123' } });
    assert.equal(reg.status, 201);
    const login = await request('/api/auth/login', { method: 'POST', body: { email: 'smoke.reporter@test.local', password: 'password123' } });
    assert.equal(login.status, 200);
    assert.ok(login.data.token);
  } finally { await stop(); }
});
```

- [ ] **Step 2: Run it** — `node --test tests/smoke.test.js` — expected FAIL (helpers missing).
- [ ] **Step 3: Implement** the three helper/skeleton files per Interfaces. `db-setup.js`: parses `--reset-dev-passwords`, calls `applyDatabase` with `process.env.DB_NAME`; main-guard via `import.meta.url === pathToFileURL(process.argv[1]).href`. `applyDatabase` in this task: create the DB if missing (utf8mb4, via a mysql2 connection without a database), apply `database/schema.sql` then unrecorded `database/migrations/*.sql` in filename order with `schema_migrations` tracking, seed categories idempotently. Dev-account seeding lands in Task 4.
- [ ] **Step 4: Run it** — `node --test tests/smoke.test.js` — expected PASS (MySQL is running).
- [ ] **Step 5: Client test script check (W2.5)** — `cd client && npm test` — expected: 8 pass. If the quoted glob fails on Windows, change the script to `node --test src/services` (Node 24 resolves directories) and re-run until green.
- [ ] **Step 6: Commit** — `git add scripts/db-setup.js tests/ client/package.json` → `git commit -m "test: add test-database harness and smoke test; verify client test script"`

### Task 4: Repeatable database setup (spec W1.1)

**Files:**
- Modify: `scripts/db-setup.js` (add dev-account seeding to `applyDatabase`)
- Modify: `database/schema.sql` (every `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`)
- Modify: `database/seed.sql` (categories → `INSERT INTO ... ON DUPLICATE KEY UPDATE description = VALUES(description)`)
- Modify: `package.json` (`"db:setup": "node scripts/db-setup.js"`)
- Create: `tests/dbSetup.test.js`
- Modify: `README.md` (short db:setup section; full pass is Task 15)

**Interfaces:** `applyDatabase({ dbName, seedPassword, resetPasswords, log })` → `{ applied: string[], skipped: string[], accounts: { email, password }[] }`. Rules: creates the DB if missing; applies `database/schema.sql` then each `database/migrations/*.sql` in filename order, recording filenames in `schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`; skips recorded files; seeds categories; creates `admin@local.test`, `officer@local.test`, `reporter@local.test` with `seedPassword` when provided else `crypto.randomBytes(9).toString('base64url')`; never touches existing accounts unless `resetPasswords`; verifies each seeded account with `bcrypt.compare` and returns them (passwords only in memory/console, never written to disk).

- [ ] **Step 1: Write the failing test** `tests/dbSetup.test.js`: run `applyDatabase({ dbName: 'accident_reporting_setup_test', seedPassword: 'setup-test-pass', log: () => {} })` twice via child process `node scripts/db-setup.js` with env `DB_NAME=accident_reporting_setup_test DEV_SEED_PASSWORD=setup-test-pass`; assert both runs exit 0; assert second run reports zero newly applied migrations; assert the three dev accounts exist exactly once after both runs (idempotent); assert `bcrypt.compare('setup-test-pass', stored hash)` is true for each seeded account; assert a pre-existing extra row (inserted between runs) still exists.
- [ ] **Step 2: Run it** — `node --test tests/dbSetup.test.js` — expected FAIL.
- [ ] **Step 3: Implement** `applyDatabase` + schema/seed/package changes per Interfaces.
- [ ] **Step 4: Run it** — expected PASS. Then run `npm run db:setup` against the dev DB (no flags) — expect: migrations 002 recorded as already present (idempotent re-run), categories seeded, three dev accounts created with printed passwords; verify login for one account via `node -e` fetch against the running dev server.
- [ ] **Step 5: Commit** — `git add scripts/db-setup.js database/ package.json tests/dbSetup.test.js README.md` → `git commit -m "feat: repeatable db:setup with migration tracking and generated dev accounts"`

### Task 5: Upload storage outside htdocs (spec W2.1)

**Files:**
- Modify: `.env` (local, untracked): `UPLOAD_DIR=C:\xampp\accident_uploads`
- Modify: `.env.example` (comment: absolute path recommended; must be outside any web root)
- Create: `uploads/.htaccess` (`Require all denied`)
- Create: `tests/evidence.test.js`
- Copy: the three legacy files from `uploads/` to `C:\xampp\accident_uploads\`

**Interfaces:** none new; `routes/reports.js` already resolves `UPLOAD_ROOT` from `UPLOAD_DIR` and multer stores there.

- [ ] **Step 1: Write the failing test** `tests/evidence.test.js`: with the harness running, (a) register+login reporter, create a category via test-DB pool, submit a report, upload a real 1×1 PNG (`Buffer.from(base64)`) → 201; fetch evidence with reporter token → 200, `content-type: image/png`; fetch with a second reporter's token → 403; fetch with no token → 401; (b) upload `Buffer.from('<html>...')` named `photo.png` with `content-type: image/png` → 422 `UNSUPPORTED_FILE`; assert the temp file was unlinked (upload dir contains exactly the one accepted file).
- [ ] **Step 2: Run it** — expected FAIL or partial (storage still under project root; assert configured `UPLOAD_ROOT` starts with `C:\xampp\accident_uploads`).
- [ ] **Step 3: Implement** — update `.env`/`.env.example`, copy legacy files, add `.htaccess`, restart nothing (test server reads env at spawn; pass `UPLOAD_DIR` through `api.js` spawn env).
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Commit** — `git add .env.example uploads/.htaccess tests/evidence.test.js tests/helpers/api.js` → `git commit -m "feat: store evidence outside htdocs with defense-in-depth deny"`

### Task 6: Concurrency-safe last-admin guard (spec W2.3)

**Files:**
- Modify: `routes/admin.js` (`PATCH /users/:id` deactivation path, `PATCH /users/:id/role` demotion path)
- Modify: `models/User.js` (`countActiveAdmins(conn = pool)`)
- Create: `tests/admin.test.js`

**Interfaces:** guard runs inside a transaction on one connection: `BEGIN` → `SELECT id, role, is_active FROM users WHERE id = ? FOR UPDATE` (re-read target) → `SELECT COUNT(*) ... WHERE role='admin' AND is_active=1 FOR UPDATE` → reject 422 if it would drop to 0 → `UPDATE` → `COMMIT` (rollback on error, release in `finally`).

- [ ] **Step 1: Write the failing test** `tests/admin.test.js`: seed two active admins A and B on the test DB and log both in; fire `Promise.all` of two concurrent **cross-deactivations** (A deactivates B while B deactivates A) — assert **at most one returns 200**, the other is rejected (422, or 401/403 if its actor was already deactivated), and `countActiveAdmins() >= 1` afterward (this is the race the current check-then-update guard loses: each request alone leaves one admin, together they leave none); repeat with concurrent cross-demotions (A demotes B while B demotes A); assert a non-admin token gets 403 on both routes.
- [ ] **Step 2: Run it** — expected FAIL (check-then-update allows both through under concurrency).
- [ ] **Step 3: Implement** the transactional guard per Interfaces (both routes).
- [ ] **Step 4: Run it** — expected PASS; re-run 3× to shake out timing.
- [ ] **Step 5: Commit** — `git commit -am "fix: make last-active-admin guard transaction-safe"`

### Task 7: Shared accessible modal; remove native dialogs (spec W2.4)

**Files:**
- Create: `client/src/components/Modal.jsx` — `export default function Modal({ open, title, onClose, children })`; `export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel })` (uses Modal).
- Modify: `client/src/pages/AdminUsers.jsx` (replace the two `window.confirm` calls)
- Modify: `client/src/index.css` (modal styles)

**Interfaces:** Modal: `role="dialog"`, `aria-modal="true"`, labelled by title id, Esc closes, click-outside closes, focus moves to first button on open and returns to the trigger on close, Tab cycles within.

- [ ] **Step 1: Verification gate first** — `git grep -n "window.confirm\|window.prompt\|window.alert" client/src` — expect exactly the two AdminUsers lines (failing gate).
- [ ] **Step 2: Implement** Modal + ConfirmDialog; wire both AdminUsers confirmations; focus trap via `onKeyDown` Tab cycling (no new deps).
- [ ] **Step 3: Verify** — gate command prints nothing; `cd client && npm run build` passes; manual checklist in the commit message body: open both dialogs, Esc and click-outside close, focus returns.
- [ ] **Step 4: Commit** — `git add client/src` → `git commit -m "feat(ui): accessible modal replaces native confirm dialogs"`

### Task 8: Backward-compatible pagination + sorting (spec W3.1)

**Files:**
- Modify: `models/Report.js` — add `listPage(user, filters, { page, limit, sort, order })` → `{ rows, total }` (same WHERE builder; `LIMIT ? OFFSET ?`; whitelist `created_at|accident_date|status|report_reference` + `asc|desc`)
- Modify: `routes/reports.js` — `GET /` parses `page`, `limit` (1–100), `sort`, `order`; **no pagination params → existing array response unchanged**; with params → `{ data, total, page, limit }`; invalid values → 422 `INVALID_FILTER`
- Modify: `client/src/pages/ReportsList.jsx` (pager + sort control, keep filters/URL persistence)
- Create: `tests/reports.test.js`

**Interfaces:** envelope exactly `{ data: Report[], total: number, page: number, limit: number }`. Consumers not updated (MapPage, Dashboard, OfficerReports, trafficOfficer routes) keep calling without `page` and receive arrays — verified by tests.

- [ ] **Step 1: Write the failing tests** `tests/reports.test.js`: seed 25 reports for one reporter; (a) `GET /api/reports` (no params) → array of 25; (b) `?page=1&limit=10` → envelope, 10 rows, `total=25`; (c) `?page=3&limit=10` → 5 rows; (d) `?page=999` → 0 rows, `total=25`; (e) `?limit=1000` → 422; `?sort=evil` → 422; (f) `?status=submitted&page=1&limit=5` composes; (g) officer token sees only assigned reports with pagination; (h) sort by `accident_date&order=asc` returns ascending order.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** backend, then client pager (`page`/`limit` state, prev/next, total display, resets to page 1 on filter change).
- [ ] **Step 4: Run** — `node --test tests/reports.test.js` PASS; `cd client && npm run build` PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: backward-compatible pagination and sorting for reports"`

### Task 9: Duplicate detection backend (spec W3.2, D5)

**Files:**
- Create: `database/migrations/003_duplicate_reports.sql` (`ALTER TABLE reports ADD COLUMN duplicate_of_report_id INT UNSIGNED NULL`, FK → `reports(id)` `ON DELETE SET NULL`, index)
- Create: `utils/duplicates.js` — `export const DUPLICATE_WINDOW_HOURS = 24; export const DUPLICATE_RADIUS_METRES = 300;` `export function findDuplicateCandidates(report, others)` → `[{ report, reasons: string[] }]` (reasons ∈ `time_window` always present + at least one of `same_category`, `distance`, `location_text`; distance rule only when both have coordinates; location text = case-insensitive substring either way)
- Modify: `routes/reports.js` — `GET /:id/duplicates` (admin) → candidates; `PATCH /:id/duplicate` (admin) body `{ duplicate_of_report_id }` or `null` → set/clear; validate: target exists, not self, target not itself a duplicate (no chains); audit `DUPLICATE_FLAGGED`/`DUPLICATE_CLEARED`
- Create: `tests/duplicates.test.js`

- [ ] **Step 1: Write the failing unit tests** (`findDuplicateCandidates`): window edge exactly 24 h 00 m → included; 24 h + 1 m → excluded; missing coordinates on either side → no `distance` reason; 299 m → distance reason, 301 m → none; same category alone qualifies; location text match alone qualifies; self excluded.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** rule module; **Step 4** run unit tests → PASS.
- [ ] **Step 5: Write failing integration tests** `tests/duplicates.test.js` (same file, DB suite): after `db:setup`-style migration application on the test DB, admin flags B as duplicate of A → 200 + audit row; flag C as duplicate of B (B already flagged) → 422 no chains; self → 422; clear → 200 + audit; non-admin → 403; candidates endpoint returns the ±24 h same-category report.
- [ ] **Step 6: Run** — expected FAIL; **Step 7: Implement** migration + endpoints; **Step 8: Run** → PASS.
- [ ] **Step 9: Commit** — `git add utils/duplicates.js database/migrations/003_duplicate_reports.sql routes/reports.js tests/duplicates.test.js` → `git commit -m "feat: duplicate detection with human review and audit trail"`

### Task 10: Duplicate UI (spec W3.2 UI)

**Files:** Modify `client/src/pages/ReportDetail.jsx` (admin-only panel: candidate list with reasons + distance/time, Mark-duplicate button, current flag display with link to the original, Clear button); `client/src/index.css` if needed.

- [ ] **Step 1: Implement** the panel (fetch candidates when admin + report has no flag; inline states; no native dialogs).
- [ ] **Step 2: Verify** — `cd client && npm run build` PASS; `git grep -n "window.confirm\|window.prompt\|window.alert" client/src` → nothing.
- [ ] **Step 3: Commit** — `git commit -am "feat(ui): duplicate review panel on report detail"`

### Task 11: PDF export + export headers (spec W3.3, D6)

**Files:**
- Install: `pdfkit`
- Create: `utils/exportHeader.js` — `export function exportHeaderLines({ scope, filters, period })` → `string[]` (scope sentence + `period: ...` + one line per applied filter: status/category/date range/search), used by CSV and PDF
- Modify: `routes/summaries.js` — export route accepts `format=csv|pdf`; summaries route accepts `format=pdf`; PDF header block from `exportHeaderLines`; same admin-only rule, identical filters/scope; CSV gains the same filter lines
- Create: `tests/exports.test.js`

- [ ] **Step 1: Write failing unit tests** for `exportHeaderLines` (scope sentences, each filter line, empty filters → scope + period only) and integration tests: `format=pdf` on export → 200, `content-type: application/pdf`, body starts `%PDF-`; same for summaries; reporter token → 403 on both; `format=xml` → 400; CSV first lines contain the scope + filter statements.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** (`pdfkit` doc → `res` stream; table of reports; header block).
- [ ] **Step 4: Run** — expected PASS. Manual: download one PDF and one filtered CSV, open both, confirm headers match the applied filters.
- [ ] **Step 5: Commit** — `git add utils/exportHeader.js routes/summaries.js tests/exports.test.js package.json package-lock.json` → `git commit -m "feat: PDF exports with scope/filter headers; CSV parity"`

### Task 12: Summary date-boundary tests (spec W3.4)

**Files:** Create `tests/summaries.test.js`.

- [ ] **Step 1: Write the tests** — insert fixtures with explicit `created_at`: Sunday/Monday pair (weekly boundary), last-day/first-day of month, Dec 31/Jan 1 (annual), and `to`-date inclusivity (a report at 23:59 of the `to` day is included). Assert bucket counts for `daily`, `weekly`, `monthly`, `annual`, and a custom `from`/`to` range; assert invalid dates → 422.
- [ ] **Step 2: Run** — expected: these pass against the existing endpoint (fix any real boundary bug found; that fix is the deliverable if it fails).
- [ ] **Step 3: Commit** — `git add tests/summaries.test.js` → `git commit -m "test: pin summary date boundaries with fixtures"`

### Task 13: Responsive + states pass (spec W4.2–W4.4)

**Files:** Modify `client/src/index.css`, `client/src/components/Layout.jsx`, and the pages with tables (ReportsList, OfficerReports, AdminUsers, AdminAuditLogs, AdminSummaries) as needed.

- [ ] **Step 1: Implement** — table→card degradation below 640 px, wrapping filter bars, small-screen nav; audit every `catch` in `client/src` renders an error state (grep `catch` and confirm each sets an error message, not a silent empty list); labels/focus states on new controls.
- [ ] **Step 2: Verify** — `cd client && npm run build` PASS; grep audit results pasted in the commit message; manual: resize to 375 px on the five main pages, no horizontal scroll.
- [ ] **Step 3: Commit** — `git commit -am "feat(ui): responsive tables, nav, and honest error states"`

### Task 14: Final verification run (spec W5.3, W5.4)

**Files:** none new (fixes if needed).

- [ ] **Step 1: Full suite** — root `npm test` (unit + integration), `cd client && npm test`, `cd client && npm run build`. Every failure is fixed or explicitly recorded as a limitation; results copied verbatim into the report.
- [ ] **Step 2: Live smoke (synthetic data only)** — with the dev DB and dev accounts from Task 4: register a reporter → submit with map picker → upload → verify → assign → officer update → check notifications (exactly one per event) → dashboard totals → summaries → export CSV + PDF → audit log. Record observed results per step.
- [ ] **Step 3: Commit** any fixes — `git commit -am "fix: issues found in final verification"` (only if fixes exist).

### Task 15: README, matrix, final report (spec W6)

**Files:** Modify `README.md`, `docs/requirements-matrix.md`; create `docs/final-report.md`.

- [ ] **Step 1: README** — verified commands only (db:setup, run, tests, demo accounts procedure, upload dir, PDF, API routes/roles table, troubleshooting, limitations: single-process limiter/blocklist, localStorage tokens, summaries 50-period cap, mobile excluded).
- [ ] **Step 2: Matrix** — every FR status cites this session's evidence; mobile = "Not Implemented — excluded by team decision"; nothing "Tested" without a run.
- [ ] **Step 3: Final report** — master prompt §14 structure (changes, files, migrations, endpoints, tests+actual results, setup, compliance matrix, limitations, next steps).
- [ ] **Step 4: Commit** — `git add README.md docs/` → `git commit -m "docs: verified README, requirements matrix, and final report"`
