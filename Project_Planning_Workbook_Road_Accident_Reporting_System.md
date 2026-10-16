# Project Planning Workbook — IT 305 Road Accident Reporting System

> **Project title:** Development of a Web and Mobile-Based Road Accident Reporting System
> **Course:** IT 305 — Advance Web Development (BSIT 3I G1 / G2)
> **Source of truth:** `IT_305_-_PROJECT_3.pdf` (official assignment). Anything here that disagrees with the PDF is wrong until the team decides otherwise.
> **Planning status:** Draft v2 — validate against the existing repository before treating any item as final.

## 0. Hard constraints (read first)

| Item | Value |
|---|---|
| Work period | **Oct 12 – Oct 30, 2026** |
| Submission | **Mon, Nov 2, 2026** |
| Team size | 4–5 members (record actual names in [[08 - Team Tasks]]) |
| Days left from Oct 15 | ~15 calendar days to Oct 30, ~18 to submission |

**Consequence:** the eight-phase roadmap in the first draft is too large for this window. Section 10 now uses a compressed, dated plan with an explicit **MVP** and a **stretch list**. Anything not in the MVP is cut first when time runs short.

## 1. Project overview

### Purpose

Let the public submit road accident reports (details, GPS/manual location, photos) and track status; let administrators and traffic officers review, verify, assign, investigate, and report on them.

### Key principle

A **public-submitted report** is not an **officially verified accident record**. The PDF says the system "should clearly distinguish" them. Preserve the distinction in the data model, workflow, permissions, dashboards, exports, and UI labels (see §5 and §6).

### Proposed architecture

```text
React Web Client ─────┐
                      ├── Express REST API (/api/v1) ─── MySQL
Flutter Mobile App ───┘           │
                                  ├── Private evidence storage (server-side or object storage)
                                  ├── Map tiles / geolocation (client-side)
                                  └── In-app notifications (+ email, optional push)
```

Both clients use the same API and database. Business rules (status transitions, permissions, validation) live **only** on the server.

## 2. Technology stack and open decisions

The PDF lists these as *examples* and says the final stack depends on team skills and budget. It also names React/Bootstrap + Flutter + Laravel + MySQL as a "practical student-project option". Express is acceptable, but choose the backend the team can actually deliver in ~2 weeks.

| Area | Starting point | Validate before committing |
|---|---|---|
| Web | React + JS + CSS (Bootstrap optional) | Existing code, build/deploy |
| Mobile | Flutter + Dart (existing app) | Existing structure, OS versions, permissions |
| Backend | Node.js + Express (alt: Laravel) | Team skill, existing backend, time |
| Database | MySQL | Hosting, migrations, backups |
| Mapping | OpenStreetMap; Leaflet (web), `flutter_map` (mobile) | Tile provider usage policy (the public OSM tile server is not for heavy use), attribution |
| GPS | Platform geolocation package | Permission denied/inaccurate → manual pin fallback |
| Evidence | Server-side private storage (simplest) or object storage | Access control, size limits, signed URLs |
| Notifications | **MVP: in-app notification list** (+ email); push (FCM) = stretch | Provider setup time, cost |
| SMS | Out of scope unless required | Cost, sender registration |
| Auth | Express-issued auth, role-based authorization | See §8 |
| Hosting | Free/low-cost cloud or school server | Persistent MySQL, HTTPS, backups, current pricing (verify; don't quote from memory) |
| VCS | Git + GitHub | `.gitignore`, no secrets |

### Decision record template

- **Decision / Date / Status (proposed or approved)**
- **Options considered · Criteria** (cost, time, skills, security, maintainability)
- **Evidence** (links, tests, pricing pages) · **Reason · Trade-offs**
- **Approved by · Revisit trigger**

### Open questions to resolve with the instructor/team (batch these into one message)

1. **Anonymous reporting?** PDF: reporter name/contact are "depends on reporting policy" and registration is "if required". Decide: login required, guest allowed, or both.
2. **Who verifies?** PDF gives *Administrator*: "review and validate", and *Traffic Officer*: "verify accident information". Proposed split in §5; confirm.
3. **Is Flutter the required mobile client, and does the team already have a working backend?**
4. **Export formats:** PDF and CSV both, or CSV first?
5. **Deployment expectation:** live URL required, or local demo acceptable?

## 3. Roles and main workflows

### Public user / reporter
Register/log in (per policy) · submit report · provide details and location · upload photos/evidence · view own report history · track status · receive notifications.

### Administrator
Manage user accounts and permissions · review/validate reports · assign to officers · **manage accident categories and system settings** · monitor system activity (audit trail) · generate and export reports.

### Traffic officer / authorized personnel
View assigned reports · verify accident information · update investigation and response status · add official remarks/findings · **record actions taken**.

## 4. Requirements and traceability

Use the PDF's IDs (FR-01 … FR-15). Priority: **M** = MVP, **S** = stretch.

| ID | Requirement (PDF) | Draft acceptance criterion | Pri | Status |
|---|---|---|---|---|
| FR-01 | User registration | Valid account created; duplicate email rejected; password stored hashed | M | Needs confirmation (guest policy) |
| FR-02 | User login / logout | Valid login works; invalid fails safely; logout invalidates session/refresh token | M | Proposed |
| FR-03 | Accident reporting | All required fields (§6) validated; unique Report ID returned | M | Proposed |
| FR-04 | Location capture | GPS when permitted; otherwise manual map pin; text location always required | M | Proposed |
| FR-05 | Evidence upload | Images validated (type, size, content); stored privately; unauthorized fetch denied | M | Proposed |
| FR-06 | Report tracking | Reporter sees status of **own** reports only | M | Proposed |
| FR-07 | Report management | Authorized staff can view, review, edit, manage reports within role limits | M | Proposed |
| FR-08 | Report verification | Staff can verify, request info, **flag incomplete or duplicate** submissions, reject with reason | M | Proposed |
| FR-09 | Notifications | Submission confirmation + status-change notifications; failures logged | M (in-app) / S (email, push) | Proposed |
| FR-10 | Dashboard | Totals for total / pending / verified / closed from defined status rules; charts; map of locations | M | Proposed |
| FR-11 | Search and filtering | By date, location, status, accident type; no leakage across roles | M | Proposed |
| FR-12 | Report generation | Daily, weekly, monthly, annual summaries | M (queries) | Proposed |
| FR-13 | User management | Admin manages accounts and roles | M | Proposed |
| FR-14 | Audit trail | Admin actions and **every** status change record actor, change, time | M | Proposed |
| FR-15 | Data export | Permitted reports to **PDF or CSV** (PDF acceptable if CSV only is approved) | M (CSV) / S (PDF) | Needs confirmation |

Objective 10 (secure authentication and access controls) and the "reporter information with access restrictions" screen map to the security checklist in §8.

## 5. Report lifecycle (aligned with the PDF)

Use the PDF's statuses so the grader sees a match. The first draft's `Draft` and `Findings Submitted` states are removed (a draft can live client-side; findings are an investigation update, not a status).

```text
Submitted
  ↓
Under Review ──→ Additional Information Required ──→ Under Review
  │
  ├──→ Rejected (reason required)
  └──→ Verified
          ↓
       Assigned
          ↓
       In Progress
          ↓
       Resolved / Closed
```

### Transition matrix (proposal — confirm)

| From → To | Allowed role | Required input | Notification |
|---|---|---|---|
| (new) → Submitted | Reporter | Required fields | Reporter: confirmation |
| Submitted → Under Review | Admin | — | Reporter |
| Under Review → Additional Information Required | Admin | Message to reporter | Reporter |
| Additional Information Required → Under Review | Reporter (after updating) or Admin | — | Admin |
| Under Review → Rejected | Admin | **Reason** | Reporter |
| Under Review → Verified | Admin | Optional remarks | Reporter |
| Verified → Assigned | Admin | Officer | Officer + Reporter |
| Assigned → In Progress | Assigned officer | — | Reporter |
| In Progress → Resolved/Closed | Assigned officer (admin may close) | Findings / actions taken | Reporter |

Decide: is reopening allowed? Can an officer mark a duplicate? Mark duplicates with a `duplicate_of_report_id` field rather than a new status.

### Distinguishing public vs. official records

- Store `verified_at` and `verified_by` on the report; they are NULL until a staff member verifies.
- Reporter-facing and public views label unverified reports **"Public report — not yet verified"**.
- Dashboard definitions: *Total submitted* = all; *Pending* = Submitted, Under Review, Additional Information Required; *Verified/official* = `verified_at IS NOT NULL` and not Rejected; *Closed* = Resolved/Closed. Write these definitions on the dashboard itself.
- Accident-prone-area statistics and official exports use **verified records only** by default; any export that includes unverified reports must say so in its header.

## 6. Data model — entities to evaluate

Planning list, not a final schema.

- **users** — id, name, email, password hash, role (`reporter|officer|admin`), active flag, timestamps
- **accident_reports** — see field table below
- **accident_categories** — admin-managed accident types (collision, hit-and-run, rollover, pedestrian, other…)
- **report_evidence** — report id, storage key, safe display name, verified content type, size, uploader, timestamp
- **report_assignments** — report, officer, assigned_by, assigned_at, state
- **investigation_updates** — report, officer, remarks/findings, actions taken, timestamp
- **report_status_history** — previous/new status, actor, reason, timestamp
- **notifications** — recipient, event, channel, delivery state, read flag
- **audit_logs** — actor, action, target, timestamp, minimal change metadata
- **system_settings** — key/value for admin-managed settings (keep minimal)

### Report fields (from the PDF's §5 — make sure none are missing)

| Field | Required | Notes |
|---|---|---|
| Report ID | Yes | System-generated, human-friendly (e.g. `RA-2026-000123`) plus internal id |
| Reporter name | Per policy | Nullable if guests are allowed |
| Contact (phone/email) | Per policy | Restrict visibility (see §8) |
| Accident date, time | Yes | Approximate allowed; reject future dates |
| Accident location text | Yes | Road/street/barangay/municipality/landmark |
| GPS lat/lng | Optional | Validate ranges; store accuracy/source (`gps` or `manual`) |
| Accident type | Yes | FK to categories |
| Vehicles involved | Yes, where applicable | Type and count (child table if multiple types) |
| Injury information | Yes | Enum: none / injuries / fatalities / **unknown** |
| Description | Yes | Length limits |
| Photo evidence | Optional | Via `report_evidence` |
| Status | Yes | Enum per §5 |
| Date submitted | Yes | Server time |
| Assigned officer | If assigned | Via assignments |
| Official remarks | Optional | Staff-only |
| *(added)* verified_at / verified_by | — | Public-vs-official distinction |
| *(added)* duplicate_of_report_id | — | Duplicate flagging (FR-08) |

### Data-model checks
Primary/foreign keys · indexes from real queries (status, date, category, officer, reporter) · migrations, no manual prod edits · retention/backup rules · no image binaries in rows · synthetic sample data only.

## 7. API planning checklist

Version under `/api/v1`. For each endpoint document method, path, auth, allowed roles, request/response schema, errors, tests. Use one consistent error shape.

| Group | Examples |
|---|---|
| Auth | register, login, refresh, logout, me |
| Reports (reporter) | create, list own, get own, add info when requested |
| Evidence | upload (multipart), authorized download/signed URL |
| Admin review | list/filter, set status, verify, reject, assign, flag duplicate |
| Officer | assigned list, update status, add findings/actions |
| Dashboard & reports | stats, daily/weekly/monthly/annual summaries |
| Export | CSV (PDF stretch), permission-scoped |
| Notifications | list, mark read |
| Admin | users/roles, categories, settings, audit log |

Add pagination (`page`, `limit`) to every list endpoint. Add CORS configuration for the web origin only.

## 8. Security and privacy checklist

- [ ] Secrets in environment variables; `.env` ignored; `.env.example` placeholders only.
- [ ] Passwords hashed (bcrypt/argon2); login rate-limited; account lockout or throttling considered.
- [ ] Every protected endpoint checks authentication, role, **and record ownership/assignment** server-side.
- [ ] Reporter contact details visible only to roles that need them; officers see only assigned reports.
- [ ] Parameterized queries or reputable ORM; server-side validation on every input.
- [ ] Web tokens: prefer HTTP-only, Secure, SameSite cookies (with CSRF protection) over `localStorage`. Mobile: short-lived access token + refresh token in secure storage.
- [ ] Evidence private by default; size, extension, real content type validated; random storage keys; no original filenames in paths.
- [ ] Error responses leak no stack traces or private data.
- [ ] HTTPS in any deployed environment.
- [ ] Important actions audit-logged.
- [ ] Backups, retention, and deletion rules written down.
- [ ] No real resident data in samples, tests, or screenshots.
- [ ] GPS denial/failure falls back to manual pin.
- [ ] Philippine Data Privacy Act (RA 10173) considerations noted: collect only needed personal data, state purpose, restrict access. Ask the instructor how far this should go for a class project.

## 9. Testing plan

| Area | Examples | Evidence to keep |
|---|---|---|
| Authentication | Valid login, wrong password, expired token, logout | Result table |
| Authorization | Reporter opens another's report; officer opens unassigned report; reporter calls admin endpoint | Denied response + regression test |
| Validation | Missing fields, future date, bad coordinates, oversized/fake image | Validation results |
| Workflow | Every allowed transition **and** key disallowed ones (e.g. Submitted → Closed) | Transition tests |
| Maps/GPS | Permission denied, GPS off, manual pin | Device/browser notes |
| Evidence | Invalid file, failed upload, unauthorized fetch | Access tests |
| Notifications | Event created per transition; failure logged | Log output |
| Dashboard | Counts match §5 definitions using a known test dataset | Expected vs actual |
| Search/export | Filters, pagination, permission scoping, exported columns | Sample export (synthetic) |
| Integration | Web and Flutter against the same API | Run notes |
| Reliability | API down, timeout, 500 | Error-state screenshots |
| Release | Build, migrations, seed data, fresh-install demo | Checklist |

## 10. Compressed schedule (proposal)

Dates assume today is **Thu Oct 15, 2026**; adjust to team capacity.

| Dates | Goal | Exit condition |
|---|---|---|
| Oct 15–16 | Audit repo + PDF; resolve §2 open questions; freeze MVP, statuses, roles | Audit note done; decisions recorded |
| Oct 16–18 | Schema + migrations, API contract, auth/roles, seed users/categories | Auth and role tests pass |
| Oct 18–21 | Report submission, location, evidence upload, status workflow + history/audit | Core workflow tests pass |
| Oct 21–25 | Web admin/officer screens and Flutter reporter screens on shared API (parallel tracks) | Both clients complete submit → review → verify → assign → close |
| Oct 25–28 | Dashboard, filters, summaries, CSV export, in-app notifications | FR-10/11/12/15 verified |
| Oct 28–30 | Testing, bug fixes, deploy/demo setup, docs, screenshots (synthetic data) | Final checklist (§15) filled with real results |
| Oct 31–Nov 1 | Buffer, demo rehearsal, README | Nothing new; fixes only |
| **Nov 2** | Submit | |

### MVP (must ship)
FR-01 to FR-08, FR-10, FR-11, FR-12 (as queries/endpoints), FR-13, FR-14, FR-15 as CSV, in-app notifications, role-based access.

### Stretch (cut first)
PDF export, email/push notifications, SMS, annual-summary charts, advanced admin settings, offline support, duplicate auto-detection.

## 11. Task tracker template

Assign real owners once the team is known. Split work so web, mobile, and backend can proceed in parallel after the API contract (T-005).

| ID | Task | Owner | Priority | Depends on | Acceptance criteria | Status | Notes |
|---|---|---|---|---|---|---|---|
| T-001 | Audit existing Flutter app and repo | Unassigned | High | — | Screens, API use, tests, issues documented | Not started | |
| T-002 | Resolve open questions; confirm roles/statuses | Unassigned | High | T-001 | Decisions recorded | Not started | |
| T-003 | Approve stack and providers | Unassigned | High | T-001, T-002 | Decision notes written | Not started | |
| T-004 | Schema + migrations + seed data | Unassigned | High | T-003 | Reviewed, reversible, synthetic seed | Not started | |
| T-005 | API contract (OpenAPI or table) | Unassigned | High | T-003, T-004 | Endpoints, roles, errors documented | Not started | |
| T-006 | Auth + role/ownership enforcement | Unassigned | High | T-004, T-005 | Role tests pass | Not started | |
| T-007 | Report workflow + status history + audit | Unassigned | High | T-006 | Transition tests pass | Not started | |
| T-008 | Private evidence upload/access | Unassigned | High | T-005 | Validation + access tests pass | Not started | |
| T-009 | React web: admin/officer screens | Unassigned | Medium | T-005, T-007 | Uses shared API | Not started | |
| T-010 | Flutter: reporter flow, tracking, notifications | Unassigned | Medium | T-005, T-007 | Uses shared API | Not started | |
| T-011 | Dashboard, filters, summaries, CSV export | Unassigned | Medium | T-007 | Counts match §5 definitions | Not started | |
| T-012 | Notifications (in-app first) | Unassigned | Medium | T-007 | Events created, failures logged | Not started | |
| T-013 | Deployment/demo environment + README | Unassigned | High | Core tasks | Fresh setup works from README | Not started | |
| T-014 | Release verification | Unassigned | High | All MVP | §15 filled with real results | Not started | |

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|
| **Only ~2 weeks available; scope too large** | **High** | **High** | MVP/stretch split (§10), daily check-in, cut stretch first | Unassigned | Open |
| Existing Flutter app incomplete or differently structured | Unknown | High | Audit before proposing a rewrite | Unassigned | Open |
| Web and mobile implement different rules | Medium | High | Shared API, contract, integration tests | Unassigned | Open |
| Public reports counted as verified | Medium | High | `verified_at` + dashboard definitions (§5) | Unassigned | Open |
| Evidence photos publicly accessible | Unknown | High | Private storage, authorization | Unassigned | Open |
| Team members blocked waiting on backend | Medium | High | Agree API contract first; mock responses | Unassigned | Open |
| Map tile terms/limits overlooked | Medium | Medium | Review policy; keep demo traffic low | Unassigned | Open |
| Hosting/database cost or free-tier limits | Unknown | Medium | Check current pricing; local demo fallback | Unassigned | Open |
| Notifications fail silently | Medium | Medium | Delivery state + logging | Unassigned | Open |
| Secrets/personal data in Git | Low/Unknown | High | `.gitignore`, secret scan, synthetic data | Unassigned | Open |
| Merge conflicts across 4–5 people | Medium | Medium | Branch per task, small PRs, one owner per area | Unassigned | Open |

## 13. Definition of done

- [ ] Requirement and acceptance criteria satisfied (FR-ID referenced).
- [ ] Follows existing project conventions.
- [ ] Server-side validation and authorization implemented.
- [ ] Tests added/updated and actually run.
- [ ] Formatter, analyzer, and build run where available.
- [ ] Loading, error, and empty states handled.
- [ ] No secrets or real personal data.
- [ ] Diff reviewed for unrelated or destructive changes.
- [ ] Docs and Obsidian notes updated.
- [ ] Limitations recorded honestly.

## 14. Obsidian dashboard template

### Current status
- **Current phase:** Audit and requirements freeze
- **Project status:** Planning
- **Approved architecture:** Pending
- **Current blocker:** Repo structure and Obsidian vault path unconfirmed
- **Next action:** Audit existing Flutter app against the PDF
- **Deadline:** work period ends Oct 30; submit Nov 2, 2026

### Navigation
[[01 - Requirements and Acceptance Criteria]] · [[02 - Existing Project Audit]] · [[03 - Architecture and Technology Decisions]] · [[04 - Database and Data Dictionary]] · [[05 - API Contract]] · [[06 - User Flows and Screens]] · [[07 - Roadmap and Timeline]] · [[08 - Team Tasks]] · [[09 - Test Plan and Results]] · [[10 - Risks and Known Issues]] · [[11 - Development Log]] · [[12 - Final Verification Checklist]]

### Recent updates

| Date | Update | Link |
|---|---|---|
| 2026-10-15 | Workbook v2: aligned with PDF, compressed schedule | |

### Open decisions
- [ ] Guest vs. login-required reporting
- [ ] Who verifies: admin, officer, or both (§5)
- [ ] Export formats (CSV only vs. PDF too)
- [ ] Backend choice (Express vs. Laravel) based on team skill
- [ ] Map provider and tile policy
- [ ] Evidence storage
- [ ] Hosting/demo approach
- [ ] Obsidian vault path; team members and owners

## 15. Final verification checklist

- [ ] Every FR-01…FR-15 mapped to an implemented feature and a test (or explicitly marked cut).
- [ ] Public submission visibly distinct from verified record (UI, dashboard, export).
- [ ] Role permissions tested on the server.
- [ ] React and Flutter use the same API and database.
- [ ] MySQL migrations and setup instructions documented; fresh install works.
- [ ] GPS and manual location tested.
- [ ] Evidence upload/retrieval private and authorized.
- [ ] Notification behavior and failure handling documented.
- [ ] Dashboard totals, search, filters, summaries, export, audit history verified.
- [ ] No secrets or real resident data in the repository.
- [ ] Tests, analysis, and builds have recorded real results.
- [ ] Setup, deployment, and demo instructions complete.
- [ ] Screenshots and presentation use synthetic data.
- [ ] Known limitations disclosed.
- [ ] Submitted by Nov 2, 2026.
