// Duplicate detection: the ±24 h window is mandatory, a content signal must
// also match, missing coordinates can never create a distance match, and the
// API layer only records a human decision (no auto-merge, no chains).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateCandidates } from '../utils/duplicates.js';
import { setupTestDb, TEST_PASSWORD } from './helpers/testDb.js';
import { startTestServer, request, loginAs } from './helpers/api.js';

const base = {
  id: 1,
  accident_date: '2026-10-01',
  accident_time: '10:00:00',
  accident_category_id: 2,
  latitude: null,
  longitude: null,
  location: 'Rizal Park'
};

const make = (overrides = {}) => ({ ...base, ...overrides });

const reasonsFor = (target, other) => {
  const found = findDuplicateCandidates(target, [other]).find((candidate) => candidate.report.id === other.id);
  return found ? found.reasons : null;
};

test('exactly 24 h apart is included, 24 h 1 min is not', () => {
  assert.ok(reasonsFor(make(), make({ id: 2, accident_date: '2026-10-02', accident_time: '10:00:00' }))?.includes('time_window'));
  assert.equal(reasonsFor(make(), make({ id: 2, accident_date: '2026-10-02', accident_time: '10:01:00' })), null);
});

test('nothing matches outside the window even with every other signal', () => {
  const other = make({ id: 2, accident_date: '2026-10-02', accident_time: '16:00:00', latitude: 14.5996, longitude: 120.9842, location: 'Rizal Park' });
  assert.equal(reasonsFor(make({ latitude: 14.5995, longitude: 120.9842 }), other), null);
});

test('missing coordinates never produce a distance match', () => {
  const sameCategory = make({ id: 2, location: 'Another place' });
  assert.deepEqual(reasonsFor(make(), sameCategory), ['time_window', 'same_category']);

  const oneSided = make({ id: 2, location: 'Another place' });
  const reasons = reasonsFor(make({ latitude: 14.5996, longitude: 120.9842 }), oneSided);
  assert.deepEqual(reasons, ['time_window', 'same_category']);
});

test('distance matches only within 300 metres', () => {
  // 0.0022483 degrees of latitude is about 250 m; 0.0031476 is about 350 m.
  const near = make({ id: 2, latitude: 14.6017483, longitude: 120.9842 });
  assert.ok(reasonsFor(make({ latitude: 14.5995, longitude: 120.9842 }), near)?.includes('distance'));

  const far = make({ id: 2, latitude: 14.6026476, longitude: 120.9842, accident_category_id: 9, location: 'Another place' });
  assert.equal(reasonsFor(make({ latitude: 14.5995, longitude: 120.9842 }), far), null);
});

test('the same category alone qualifies inside the window', () => {
  const other = make({ id: 2, location: 'Different road' });
  assert.deepEqual(reasonsFor(make(), other), ['time_window', 'same_category']);
});

test('a matching location text alone qualifies inside the window', () => {
  const other = make({ id: 2, accident_category_id: 9, location: 'rizal park' });
  assert.deepEqual(reasonsFor(make({ accident_category_id: 5, location: 'Rizal Park' }), other), ['time_window', 'location_text']);
});

test('a different category with no shared signals is not a candidate', () => {
  const other = make({ id: 2, accident_category_id: 9, location: 'Different road' });
  assert.equal(reasonsFor(make(), other), null);
});

test('the report itself is never its own candidate', () => {
  const report = make();
  assert.deepEqual(findDuplicateCandidates(report, [report]), []);
});

test('accident dates arriving as Date objects behave like date strings', () => {
  const target = make({ accident_date: new Date('2026-10-01T00:00:00') });
  const inside = make({ id: 2, accident_date: new Date('2026-10-02T00:00:00'), accident_time: '09:59:00' });
  assert.ok(reasonsFor(target, inside)?.includes('time_window'));
  const outside = make({ id: 3, accident_date: new Date('2026-10-02T00:00:00'), accident_time: '10:01:00' });
  assert.equal(reasonsFor(target, outside), null);
});

test('admin review flags and clears duplicates with an audit trail and no chains', async () => {
  const { pool } = await setupTestDb();
  const server = await startTestServer();
  try {
    const [reporter] = await pool.query("INSERT INTO users (name, email, password_hash) VALUES ('Dup Reporter', 'dup.reporter@test.local', 'not-a-login')");
    const [category] = await pool.query("INSERT INTO accident_categories (name, description) VALUES ('Duplicate Test Category', 'for tests')");
    const seed = (row) => pool.query(
      `INSERT INTO reports (report_reference, reporter_id, title, description, accident_date, accident_time, location, latitude, longitude, injury_status, accident_category_id)
       VALUES (?, ?, ?, 'Seeded for the duplicate test', ?, ?, ?, ?, ?, 'none', ?)`,
      [row.ref, reporter.insertId, `Seeded ${row.ref}`, row.date, row.time, row.location, row.latitude ?? null, row.longitude ?? null, category.insertId]
    );
    await seed({ ref: 'DUP-A', date: '2026-10-01', time: '10:00:00', location: 'Ayala Avenue', latitude: 14.5995, longitude: 120.9842 });
    await seed({ ref: 'DUP-B', date: '2026-10-01', time: '12:00:00', location: 'Ayala Avenue', latitude: 14.6003, longitude: 120.9842 });
    await seed({ ref: 'DUP-C', date: '2026-10-02', time: '09:00:00', location: 'Quezon Circle', latitude: 14.7, longitude: 121.0 });
    await seed({ ref: 'DUP-D', date: '2026-10-05', time: '10:00:00', location: 'Ayala Avenue', latitude: 14.5995, longitude: 120.9842 });
    const [rows] = await pool.query("SELECT id, report_reference FROM reports WHERE report_reference LIKE 'DUP-%'");
    const ids = Object.fromEntries(rows.map((row) => [row.report_reference, row.id]));

    const token = await loginAs('admin@local.test', TEST_PASSWORD);

    const candidates = await request(`/api/reports/${ids['DUP-A']}/duplicates`, { token });
    assert.equal(candidates.status, 200);
    assert.ok(Array.isArray(candidates.data), 'candidates are a list');
    const refs = candidates.data.map((candidate) => candidate.report.report_reference);
    assert.ok(refs.includes('DUP-B'), `DUP-B must be a candidate, got ${refs}`);
    assert.ok(!refs.includes('DUP-D'), 'DUP-D is outside the window and must not appear');
    const candidateB = candidates.data.find((candidate) => candidate.report.report_reference === 'DUP-B');
    assert.ok(candidateB.reasons.includes('time_window'));
    assert.ok(candidateB.reasons.includes('same_category'));
    assert.ok(candidateB.reasons.includes('distance'));

    // Flag B as a duplicate of A: allowed, audited.
    const flagged = await request(`/api/reports/${ids['DUP-B']}/duplicate`, {
      method: 'PATCH', token, body: { duplicate_of_report_id: ids['DUP-A'] }
    });
    assert.equal(flagged.status, 200);
    assert.equal(flagged.data.duplicate_of_report_id, ids['DUP-A']);
    const [[flagAudit]] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'DUPLICATE_FLAGGED' AND entity_id = ?", [ids['DUP-B']]);
    assert.equal(flagAudit.n, 1);

    // Chains are refused: B is already a duplicate.
    const chain = await request(`/api/reports/${ids['DUP-C']}/duplicate`, {
      method: 'PATCH', token, body: { duplicate_of_report_id: ids['DUP-B'] }
    });
    assert.equal(chain.status, 422);

    const self = await request(`/api/reports/${ids['DUP-A']}/duplicate`, {
      method: 'PATCH', token, body: { duplicate_of_report_id: ids['DUP-A'] }
    });
    assert.equal(self.status, 422);

    const missing = await request(`/api/reports/${ids['DUP-A']}/duplicate`, {
      method: 'PATCH', token, body: { duplicate_of_report_id: 999999 }
    });
    assert.equal(missing.status, 422);

    // Clearing the flag is also a human decision and is audited.
    const cleared = await request(`/api/reports/${ids['DUP-B']}/duplicate`, {
      method: 'PATCH', token, body: { duplicate_of_report_id: null }
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.duplicate_of_report_id, null);
    const [[clearAudit]] = await pool.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'DUPLICATE_CLEARED' AND entity_id = ?", [ids['DUP-B']]);
    assert.equal(clearAudit.n, 1);

    // Only admins may review duplicates.
    await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Dup Plain', email: 'dup.plain@test.local', password: 'password123' }
    });
    const reporterToken = await loginAs('dup.plain@test.local', 'password123');
    const forbiddenRead = await request(`/api/reports/${ids['DUP-A']}/duplicates`, { token: reporterToken });
    assert.equal(forbiddenRead.status, 403);
    const forbiddenWrite = await request(`/api/reports/${ids['DUP-A']}/duplicate`, {
      method: 'PATCH', token: reporterToken, body: { duplicate_of_report_id: ids['DUP-B'] }
    });
    assert.equal(forbiddenWrite.status, 403);
  } finally {
    await server.stop();
    await pool.end();
  }
});
