// Report list pagination and sorting: adding ?page/?limit switches the response
// to an envelope without breaking the plain-array contract existing pages rely
// on, sorting is whitelisted, and filters combine with paging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, TEST_PASSWORD } from './helpers/testDb.js';
import { startTestServer, request, loginAs } from './helpers/api.js';

const SEED = [
  { ref: 'RPT-2026-1001', date: '2026-09-01', status: 'submitted', created: '2026-10-01 10:00:00' },
  { ref: 'RPT-2026-1002', date: '2026-08-01', status: 'verified', created: '2026-10-02 10:00:00' },
  { ref: 'RPT-2026-1003', date: '2026-07-01', status: 'resolved', created: '2026-10-03 10:00:00' },
  { ref: 'RPT-2026-1004', date: '2026-06-01', status: 'verified', created: '2026-10-04 10:00:00' },
  { ref: 'RPT-2026-1005', date: '2026-05-01', status: 'submitted', created: '2026-10-05 10:00:00' }
];

test('pagination and sorting keep the array contract and page correctly', async () => {
  const { pool } = await setupTestDb();
  const server = await startTestServer();
  try {
    const [reporter] = await pool.query("INSERT INTO users (name, email, password_hash) VALUES ('Pager Reporter', 'pager.reporter@test.local', 'not-a-login')");
    for (const row of SEED) {
      await pool.query(
        `INSERT INTO reports (report_reference, reporter_id, title, description, accident_date, location, injury_status, status, created_at)
         VALUES (?, ?, ?, 'Seeded for the pagination test', ?, 'Test Road', 'none', ?, ?)`,
        [row.ref, reporter.insertId, `Seeded report ${row.ref}`, row.date, row.status, row.created]
      );
    }
    const token = await loginAs('admin@local.test', TEST_PASSWORD);

    // Without page/limit the response stays a plain array for existing callers.
    const plain = await request('/api/reports', { token });
    assert.equal(plain.status, 200);
    assert.ok(Array.isArray(plain.data), 'no page param must keep the array contract');
    assert.equal(plain.data.length, 5);

    // With page/limit the response is an envelope with the total.
    const firstPage = await request('/api/reports?page=1&limit=2', { token });
    assert.equal(firstPage.status, 200);
    assert.deepEqual(Object.keys(firstPage.data).sort(), ['data', 'limit', 'page', 'total']);
    assert.equal(firstPage.data.total, 5);
    assert.equal(firstPage.data.page, 1);
    assert.equal(firstPage.data.limit, 2);
    assert.equal(firstPage.data.data.length, 2);
    assert.deepEqual(firstPage.data.data.map(r => r.report_reference), ['RPT-2026-1005', 'RPT-2026-1004']);

    const secondPage = await request('/api/reports?page=2&limit=2', { token });
    assert.deepEqual(secondPage.data.data.map(r => r.report_reference), ['RPT-2026-1003', 'RPT-2026-1002']);

    const lastPage = await request('/api/reports?page=3&limit=2', { token });
    assert.deepEqual(lastPage.data.data.map(r => r.report_reference), ['RPT-2026-1001']);

    const pastEnd = await request('/api/reports?page=99&limit=2', { token });
    assert.equal(pastEnd.data.total, 5);
    assert.deepEqual(pastEnd.data.data, []);

    // Whitelisted sorting.
    const byDateAsc = await request('/api/reports?sort=accident_date&direction=asc&page=1&limit=10', { token });
    assert.deepEqual(byDateAsc.data.data.map(r => r.report_reference), ['RPT-2026-1005', 'RPT-2026-1004', 'RPT-2026-1003', 'RPT-2026-1002', 'RPT-2026-1001']);

    const byReferenceAsc = await request('/api/reports?sort=report_reference&direction=asc&page=1&limit=10', { token });
    assert.deepEqual(byReferenceAsc.data.data.map(r => r.report_reference), ['RPT-2026-1001', 'RPT-2026-1002', 'RPT-2026-1003', 'RPT-2026-1004', 'RPT-2026-1005']);

    const byStatusDesc = await request('/api/reports?sort=status&direction=desc&page=1&limit=10', { token });
    assert.equal(byStatusDesc.data.data.length, 5);

    // Rejected values.
    const badSort = await request('/api/reports?sort=password&page=1&limit=2', { token });
    assert.equal(badSort.status, 422);
    assert.equal(badSort.data.error.code, 'INVALID_FILTER');
    const badDirection = await request('/api/reports?direction=sideways&page=1&limit=2', { token });
    assert.equal(badDirection.status, 422);
    const badPage = await request('/api/reports?page=0&limit=2', { token });
    assert.equal(badPage.status, 422);
    const badLimit = await request('/api/reports?page=1&limit=1000', { token });
    assert.equal(badLimit.status, 422);

    // Filters combine with paging.
    const verified = await request('/api/reports?status=verified&page=1&limit=1', { token });
    assert.equal(verified.data.total, 2);
    assert.equal(verified.data.data.length, 1);
    assert.equal(verified.data.data[0].status, 'verified');

    const ranged = await request('/api/reports?date_from=2026-07-01&date_to=2026-09-01&page=1&limit=10', { token });
    assert.equal(ranged.data.total, 3);
  } finally {
    await server.stop();
    await pool.end();
  }
});
