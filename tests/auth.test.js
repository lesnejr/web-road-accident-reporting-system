// FR-01 user registration: required-field validation, length caps, role
// injection, duplicate handling, password hashing and the generic error path.
// Runs real HTTP against the real server on a dedicated *_test database; the
// only records asserted on are the ones this file creates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { setupTestDb } from './helpers/testDb.js';
import { startTestServer, request, loginAs } from './helpers/api.js';
import { errorHandler } from '../middleware/errorHandler.js';

const { pool } = await setupTestDb();

test('unexpected database errors return a generic 500 without internal details', () => {
  const res = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    errorHandler(
      Object.assign(new Error('ER_DATA_TOO_LONG: Data too long for column name'), { code: 'ER_DATA_TOO_LONG' }),
      {}, res, () => {}
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

test('registration reports required fields, formats and length caps as field messages', async () => {
  const server = await startTestServer();
  try {
    const missing = await request('/api/auth/register', { method: 'POST', body: {} });
    assert.equal(missing.status, 400);
    assert.deepEqual(Object.keys(missing.data.error.fields).sort(), ['email', 'name', 'password']);

    const badEmailAndPassword = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Valid Name', email: 'not-an-email', password: 'short' }
    });
    assert.equal(badEmailAndPassword.status, 400);
    assert.ok(badEmailAndPassword.data.error.fields.email);
    assert.ok(badEmailAndPassword.data.error.fields.password);

    const tooLong = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'N'.repeat(151),
        email: `${'e'.repeat(150)}@test.local`,
        password: 'p'.repeat(73),
        phone: '9'.repeat(31)
      }
    });
    assert.equal(tooLong.status, 400);
    assert.ok(tooLong.data.error.fields.name);
    assert.ok(tooLong.data.error.fields.email);
    assert.ok(tooLong.data.error.fields.password);
    assert.ok(tooLong.data.error.fields.phone);
  } finally {
    await server.stop();
  }
});

test('self-registration always creates a reporter, hashes the password, and refuses duplicates', async () => {
  const server = await startTestServer();
  try {
    // A modified role in the body must not raise the new account's privileges.
    const injected = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'FR01 Reporter', email: 'fr01.reporter@test.local', password: 'password123', phone: ' 0917 000 0000 ', role: 'admin' }
    });
    assert.equal(injected.status, 201);
    assert.equal(injected.data.role, 'reporter');
    assert.equal(injected.data.phone, '0917 000 0000');
    assert.equal(injected.data.password_hash, undefined);
    assert.equal(JSON.stringify(injected.data).includes('password'), false);

    const [[row]] = await pool.query('SELECT role, password_hash FROM users WHERE email = ?', ['fr01.reporter@test.local']);
    assert.equal(row.role, 'reporter');
    assert.notEqual(row.password_hash, 'password123');
    assert.match(row.password_hash, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare('password123', row.password_hash), true);

    // Re-submitting the same registration is refused by the unique email.
    const repeated = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'FR01 Reporter', email: 'fr01.reporter@test.local', password: 'password123' }
    });
    assert.equal(repeated.status, 409);
    assert.ok(repeated.data.error.fields.email);
    const [[count]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE LOWER(email) = 'fr01.reporter@test.local'");
    assert.equal(count.n, 1);

    // A differently-cased address is the same account.
    const cased = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'FR01 Reporter', email: 'FR01.Reporter@TEST.local', password: 'password123' }
    });
    assert.equal(cased.status, 409);

    // The account is usable: it signs in and its token is a reporter token.
    const token = await loginAs('fr01.reporter@test.local', 'password123');
    const me = await request('/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.role, 'reporter');
  } finally {
    await server.stop();
    await pool.end();
  }
});
