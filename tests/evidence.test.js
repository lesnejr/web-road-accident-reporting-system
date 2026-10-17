// Evidence storage and access: files live outside the web root, only authorized
// users can fetch them, and content sniffing rejects disguised files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { setupTestDb } from './helpers/testDb.js';
import { startTestServer, request, loginAs } from './helpers/api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTDOCS = path.resolve(ROOT, '..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const HTML = Buffer.from('<html><body><script>alert(1)</script></body></html>', 'utf8');

test('the dev environment stores uploads outside the web root and denies direct access', () => {
  const resolved = path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads');
  assert.ok(!resolved.startsWith(HTDOCS), `UPLOAD_DIR must resolve outside htdocs, got ${resolved}`);
  const htaccess = fs.readFileSync(path.join(ROOT, 'uploads', '.htaccess'), 'utf8');
  assert.match(htaccess, /Require all denied/);
});

test('evidence is served only to authorized users and disguised files are rejected', async () => {
  const { pool } = await setupTestDb();
  const server = await startTestServer();
  try {
    assert.ok(!path.resolve(server.uploadDir).startsWith(HTDOCS), 'test upload dir must be outside htdocs');
    const [category] = await pool.query("INSERT INTO accident_categories (name, description) VALUES ('Evidence Test Category', 'for tests')");

    for (const [name, email] of [['Evidence Owner', 'evidence.owner@test.local'], ['Evidence Other', 'evidence.other@test.local']]) {
      const reg = await request('/api/auth/register', { method: 'POST', body: { name, email, password: 'password123' } });
      assert.equal(reg.status, 201);
    }
    const ownerToken = await loginAs('evidence.owner@test.local', 'password123');
    const otherToken = await loginAs('evidence.other@test.local', 'password123');

    const created = await request('/api/reports', {
      method: 'POST',
      token: ownerToken,
      body: {
        title: 'Evidence storage test',
        description: 'Report created by the evidence test',
        accident_date: '2026-10-01',
        accident_time: '08:30',
        location: 'Test Road, Manila',
        accident_category_id: category.insertId,
        injury_status: 'none'
      }
    });
    assert.equal(created.status, 201);
    const reportId = created.data.id;

    const before = fs.readdirSync(server.uploadDir);
    const form = new FormData();
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'photo.png');
    const upload = await request(`/api/reports/${reportId}/evidence`, { method: 'POST', token: ownerToken, form });
    assert.equal(upload.status, 201);
    assert.equal(upload.data.mime_type, 'image/png');
    const added = fs.readdirSync(server.uploadDir).filter((file) => !before.includes(file));
    assert.equal(added.length, 1, 'the accepted file is stored in the configured directory');

    const served = await request(`/api/reports/${reportId}/evidence/${upload.data.id}`, { token: ownerToken, binary: true });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

    const forbidden = await request(`/api/reports/${reportId}/evidence/${upload.data.id}`, { token: otherToken });
    assert.equal(forbidden.status, 403);

    const anonymous = await request(`/api/reports/${reportId}/evidence/${upload.data.id}`);
    assert.equal(anonymous.status, 401);

    const disguised = new FormData();
    disguised.append('file', new Blob([HTML], { type: 'image/png' }), 'photo.png');
    const rejected = await request(`/api/reports/${reportId}/evidence`, { method: 'POST', token: ownerToken, form: disguised });
    assert.equal(rejected.status, 422);
    assert.equal(rejected.data.error.code, 'UNSUPPORTED_FILE');
    assert.equal(fs.readdirSync(server.uploadDir).length, before.length + 1, 'rejected upload is unlinked');
  } finally {
    await server.stop();
    await pool.end();
  }
});
