// Smoke test for the integration harness: dedicated test database + a real
// server process on port 5199. Proves the wiring all later DB-backed tests use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './helpers/testDb.js';
import { startTestServer, request } from './helpers/api.js';

await setupTestDb();

test('health responds and registration + login round-trip works on the test DB', async () => {
  const { stop } = await startTestServer();
  try {
    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');

    const reg = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Smoke Reporter', email: 'smoke.reporter@test.local', password: 'password123' }
    });
    assert.equal(reg.status, 201);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'smoke.reporter@test.local', password: 'password123' }
    });
    assert.equal(login.status, 200);
    assert.ok(login.data.token);
  } finally {
    await stop();
  }
});
