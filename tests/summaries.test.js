// Summary date boundaries: weekly buckets start on Sunday (YEARWEEK mode 0),
// month and year buckets break on the calendar, the `to` day is inclusive, and
// invalid dates are refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, TEST_PASSWORD } from './helpers/testDb.js';
import { startTestServer, request, loginAs } from './helpers/api.js';

const FIXTURES = [
  { ref: 'SUM-01', at: '2026-06-06 10:00:00' }, // Saturday — last day of its week
  { ref: 'SUM-02', at: '2026-06-07 10:00:00' }, // Sunday — first day of the next
  { ref: 'SUM-03', at: '2026-06-08 09:00:00' }, // Monday
  { ref: 'SUM-04', at: '2026-06-10 00:01:00' },
  { ref: 'SUM-05', at: '2026-06-10 23:59:00' }, // end of the `to` day
  { ref: 'SUM-06', at: '2026-06-30 12:00:00' },
  { ref: 'SUM-07', at: '2026-07-01 08:00:00' },
  { ref: 'SUM-08', at: '2026-12-31 09:00:00' },
  { ref: 'SUM-09', at: '2027-01-01 09:00:00' }
];

const localDay = (period) => {
  const date = new Date(period);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

test('summary buckets respect calendar boundaries and the inclusive to-date', async () => {
  const { pool } = await setupTestDb();
  const server = await startTestServer();
  try {
    const [reporter] = await pool.query("INSERT INTO users (name, email, password_hash) VALUES ('Summary Reporter', 'summary.reporter@test.local', 'not-a-login')");
    for (const fixture of FIXTURES) {
      await pool.query(
        `INSERT INTO reports (report_reference, reporter_id, title, description, accident_date, location, injury_status, created_at)
         VALUES (?, ?, ?, 'Seeded for summary boundaries', DATE(?), 'Test Road', 'none', ?)`,
        [fixture.ref, reporter.insertId, `Seeded ${fixture.ref}`, fixture.at, fixture.at]
      );
    }
    const token = await loginAs('admin@local.test', TEST_PASSWORD);
    const summaries = (query) => request(`/api/summaries/reports/summaries?${query}`, { token });

    // Daily: every calendar day is its own bucket; both reports on the 10th count.
    const daily = await summaries('period=daily&from=2026-06-01&to=2026-06-30');
    assert.equal(daily.status, 200);
    const byDay = Object.fromEntries(daily.data.data.map((row) => [localDay(row.period), row.count]));
    assert.equal(byDay['2026-06-06'], 1);
    assert.equal(byDay['2026-06-07'], 1);
    assert.equal(byDay['2026-06-08'], 1);
    assert.equal(byDay['2026-06-10'], 2, 'the 00:01 and the 23:59 report on the to-day are both inside the range');
    assert.equal(byDay['2026-06-30'], 1);

    // Weekly: weeks start on Sunday, so the Saturday stands alone while the
    // Sunday, Monday and both Wednesday reports share one bucket; June 30 opens
    // the next week.
    const weekly = await summaries('period=weekly&from=2026-06-01&to=2026-06-30');
    const weekCounts = weekly.data.data.map((row) => row.count).sort((a, b) => a - b);
    assert.deepEqual(weekCounts, [1, 1, 4], 'Saturday must end its week and Sunday start the next');
    assert.equal(weekly.data.data.reduce((sum, row) => sum + row.count, 0), 6);

    // Monthly: June and July break at the month boundary, June 30 included in June.
    const monthly = await summaries('period=monthly&from=2026-06-01&to=2026-07-31');
    const byMonth = Object.fromEntries(monthly.data.data.map((row) => [row.period, row.count]));
    assert.equal(byMonth['2026-06'], 6);
    assert.equal(byMonth['2026-07'], 1);

    // Annual: December 31 and January 1 sit in different years.
    const annual = await summaries('period=annual&from=2026-01-01&to=2027-12-31');
    const byYear = Object.fromEntries(annual.data.data.map((row) => [String(row.period), row.count]));
    assert.equal(byYear['2026'], 8);
    assert.equal(byYear['2027'], 1);

    // A single-day range includes the whole day at both ends.
    const singleDay = await summaries('period=daily&from=2026-06-10&to=2026-06-10');
    assert.equal(singleDay.data.data.length, 1);
    assert.equal(localDay(singleDay.data.data[0].period), '2026-06-10');
    assert.equal(singleDay.data.data[0].count, 2);

    // Invalid dates are refused.
    assert.equal((await summaries('period=daily&from=2026-6-1')).status, 422);
    assert.equal((await summaries('period=daily&to=tomorrow')).status, 422);
  } finally {
    await server.stop();
    await pool.end();
  }
});
