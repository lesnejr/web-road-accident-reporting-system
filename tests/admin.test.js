// The last-active-admin guard must hold under concurrent requests: two admins
// demoting or deactivating each other at the same time must never leave the
// system with zero active administrators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, TEST_PASSWORD } from './helpers/testDb.js';
import { startTestServer, request, loginAs } from './helpers/api.js';

const activeAdmins = (pool) =>
  pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1").then(([[row]]) => row.n);

test('concurrent cross-demotions and cross-deactivations always leave an active admin', async () => {
  const { pool } = await setupTestDb();
  const server = await startTestServer();
  try {
    const adminAToken = await loginAs('admin@local.test', TEST_PASSWORD);
    const me = await request('/api/auth/me', { token: adminAToken });
    const adminAId = me.data.user.id;

    const createdB = await request('/api/users', {
      method: 'POST',
      token: adminAToken,
      body: { name: 'Admin B', email: 'admin.b@test.local', password: 'password123', role: 'admin' }
    });
    assert.equal(createdB.status, 201);
    const adminBId = createdB.data.id;
    const adminBToken = await loginAs('admin.b@test.local', 'password123');

    const resetBothAdmins = () =>
      pool.query("UPDATE users SET is_active = 1, role = 'admin' WHERE id IN (?, ?)", [adminAId, adminBId]);

    // Cross-demotions: each admin demotes the other at the same time.
    for (let round = 1; round <= 5; round += 1) {
      await resetBothAdmins();
      const [first, second] = await Promise.all([
        request(`/api/users/${adminBId}/role`, { method: 'PATCH', token: adminAToken, body: { role: 'reporter' } }),
        request(`/api/users/${adminAId}/role`, { method: 'PATCH', token: adminBToken, body: { role: 'reporter' } })
      ]);
      const wins = [first, second].filter((res) => res.status === 200).length;
      assert.ok(wins <= 1, `demotion round ${round}: both demotions succeeded (${first.status}/${second.status})`);
      assert.ok(await activeAdmins(pool) >= 1, `demotion round ${round}: no active administrator left`);
    }

    // Cross-deactivations: each admin deactivates the other at the same time.
    for (let round = 1; round <= 5; round += 1) {
      await resetBothAdmins();
      const [first, second] = await Promise.all([
        request(`/api/users/${adminBId}`, { method: 'PATCH', token: adminAToken, body: { is_active: 0 } }),
        request(`/api/users/${adminAId}`, { method: 'PATCH', token: adminBToken, body: { is_active: 0 } })
      ]);
      const wins = [first, second].filter((res) => res.status === 200).length;
      assert.ok(wins <= 1, `deactivation round ${round}: both deactivations succeeded (${first.status}/${second.status})`);
      assert.ok(await activeAdmins(pool) >= 1, `deactivation round ${round}: no active administrator left`);
    }

    // Non-admins cannot use either route at all.
    await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Plain Reporter', email: 'plain.reporter@test.local', password: 'password123' }
    });
    const reporterToken = await loginAs('plain.reporter@test.local', 'password123');
    const forbiddenDeactivate = await request(`/api/users/${adminAId}`, { method: 'PATCH', token: reporterToken, body: { is_active: 0 } });
    const forbiddenRole = await request(`/api/users/${adminBId}/role`, { method: 'PATCH', token: reporterToken, body: { role: 'reporter' } });
    assert.equal(forbiddenDeactivate.status, 403);
    assert.equal(forbiddenRole.status, 403);
  } finally {
    await server.stop();
    await pool.end();
  }
});
