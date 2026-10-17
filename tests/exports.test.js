// Exports: one shared header block for CSV and PDF (scope, period, applied
// filters), PDF streaming, format validation and admin-only access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportHeaderLines } from '../utils/exportHeader.js';
import { setupTestDb, TEST_PASSWORD } from './helpers/testDb.js';
import { startTestServer, request, loginAs } from './helpers/api.js';

test('each scope states itself explicitly in the first header line', () => {
  assert.deepEqual(exportHeaderLines({ scope: 'verified' }), ['# Verified official records only']);
  assert.deepEqual(exportHeaderLines({ scope: 'unverified' }), ['# Unverified public-submitted reports only, not official records']);
  assert.equal(exportHeaderLines({ scope: 'all' })[0], '# INCLUDES UNVERIFIED public-submitted reports, which are not official records');
});

test('period and every applied filter get their own header line', () => {
  const lines = exportHeaderLines({
    scope: 'verified',
    period: 'weekly',
    filters: { status: 'verified', category: 'Flood', date_from: '2026-01-01', date_to: '2026-03-31', search: 'ayala' }
  });
  assert.equal(lines.length, 6);
  assert.match(lines[1], /^# Period: weekly/);
  assert.match(lines[2], /^# Filter - status: verified/);
  assert.match(lines[3], /^# Filter - accident type: Flood/);
  assert.match(lines[4], /^# Filter - accident date: 2026-01-01 to 2026-03-31/);
  assert.match(lines[5], /^# Filter - search: ayala/);
});

test('no filters means scope and period only, and open ranges read in words', () => {
  assert.equal(exportHeaderLines({ scope: 'verified', period: 'monthly' }).length, 2);
  assert.match(exportHeaderLines({ scope: 'verified', filters: { date_from: '2026-01-01' } })[1], /2026-01-01 to latest/);
  assert.match(exportHeaderLines({ scope: 'verified', filters: { date_to: '2026-03-31' } })[1], /earliest to 2026-03-31/);
});

test('CSV and PDF exports carry the same headers and stay admin-only', async () => {
  const { pool } = await setupTestDb();
  const server = await startTestServer();
  try {
    const [reporter] = await pool.query("INSERT INTO users (name, email, password_hash) VALUES ('Export Reporter', 'export.reporter@test.local', 'not-a-login')");
    const [category] = await pool.query("INSERT INTO accident_categories (name, description) VALUES ('Export Test Type', 'for tests')");
    await pool.query(
      `INSERT INTO reports (report_reference, reporter_id, title, description, accident_date, location, injury_status, status, accident_category_id, verified_at)
       VALUES ('EXP-0001', ?, 'Export verified record', 'Seeded', '2026-02-10', 'Test Road', 'none', 'verified', ?, NOW())`,
      [reporter.insertId, category.insertId]
    );
    await pool.query(
      `INSERT INTO reports (report_reference, reporter_id, title, description, accident_date, location, injury_status, status, accident_category_id)
       VALUES ('EXP-0002', ?, 'Export public submission', 'Seeded', '2026-02-11', 'Test Road', 'none', 'submitted', ?)`,
      [reporter.insertId, category.insertId]
    );

    const token = await loginAs('admin@local.test', TEST_PASSWORD);

    const csv = await request(`/api/summaries/reports/export?format=csv&status=verified&category_id=${category.insertId}&date_from=2026-01-01&q=Export`, { token });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const lines = String(csv.data).split('\n');
    assert.equal(lines[0], '"# Verified official records only"');
    assert.ok(lines.some((line) => line.includes('status: verified')), 'CSV must state the status filter');
    assert.ok(lines.some((line) => line.includes('accident type: Export Test Type')), 'CSV must state the resolved category name');
    assert.ok(lines.some((line) => line.includes('accident date: 2026-01-01 to latest')));
    assert.ok(lines.some((line) => line.includes('search: Export')));
    assert.ok(lines.some((line) => line.includes('EXP-0001')), 'CSV must contain the matching record');

    const pdf = await request('/api/summaries/reports/export?format=pdf&status=verified', { token, binary: true });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    assert.equal(pdf.data.subarray(0, 5).toString('latin1'), '%PDF-');

    const summariesJson = await request('/api/summaries/reports/summaries?period=weekly', { token });
    assert.equal(summariesJson.status, 200);
    assert.equal(summariesJson.data.period, 'weekly');
    assert.ok(Array.isArray(summariesJson.data.data));

    const summariesPdf = await request('/api/summaries/reports/summaries?period=weekly&format=pdf', { token, binary: true });
    assert.equal(summariesPdf.status, 200);
    assert.match(summariesPdf.headers.get('content-type'), /application\/pdf/);
    assert.equal(summariesPdf.data.subarray(0, 5).toString('latin1'), '%PDF-');

    const badExport = await request('/api/summaries/reports/export?format=xml', { token });
    assert.equal(badExport.status, 400);
    const badSummaries = await request('/api/summaries/reports/summaries?format=xml', { token });
    assert.equal(badSummaries.status, 400);

    await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Export Plain', email: 'export.plain@test.local', password: 'password123' }
    });
    const reporterToken = await loginAs('export.plain@test.local', 'password123');
    const forbiddenCsv = await request('/api/summaries/reports/export?format=csv', { token: reporterToken });
    assert.equal(forbiddenCsv.status, 403);
    const forbiddenSummariesPdf = await request('/api/summaries/reports/summaries?format=pdf', { token: reporterToken });
    assert.equal(forbiddenSummariesPdf.status, 403);
    const anonymous = await request('/api/summaries/reports/export?format=csv');
    assert.equal(anonymous.status, 401);
  } finally {
    await server.stop();
    await pool.end();
  }
});
