// Proves scripts/db-setup.js is safe to run repeatedly: migrations apply once,
// existing users are never overwritten or rotated, and the seeded dev accounts
// actually authenticate against their stored hashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETUP_DB = 'accident_reporting_setup_test';
const PASSWORD = 'setup-test-pass';
const MIGRATIONS = fs.readdirSync(path.join(ROOT, 'database', 'migrations')).filter((file) => file.endsWith('.sql')).length;
if (!SETUP_DB.endsWith('_test')) throw new Error('setup test database must end with _test');

const connect = (dbName) => mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  ...(dbName ? { database: dbName } : {})
});

function runSetup() {
  return execFileAsync(process.execPath, ['scripts/db-setup.js'], {
    cwd: ROOT,
    env: { ...process.env, DB_NAME: SETUP_DB, DEV_SEED_PASSWORD: PASSWORD }
  });
}

test('db:setup is repeatable, keeps existing data, and seeds working dev accounts', async () => {
  const admin = await connect();
  let db;
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${SETUP_DB}\``);

    const first = await runSetup();
    assert.match(first.stdout, new RegExp(`applied ${MIGRATIONS} migration`));

    const second = await runSetup();
    assert.match(second.stdout, /applied 0 migration/);
    assert.match(second.stdout, new RegExp(`skipped ${MIGRATIONS}`));

    db = await connect(SETUP_DB);
    const [users] = await db.query('SELECT email, role, password_hash FROM users ORDER BY email');
    assert.deepEqual(users.map((u) => u.email), ['admin@local.test', 'officer@local.test', 'reporter@local.test']);
    assert.deepEqual(users.map((u) => u.role), ['admin', 'traffic_officer', 'reporter']);
    for (const user of users) {
      assert.equal(await bcrypt.compare(PASSWORD, user.password_hash), true, `${user.email} must authenticate`);
    }

    const [[{ categories }]] = await db.query('SELECT COUNT(*) AS categories FROM accident_categories');
    assert.equal(categories, 5);
    const [[{ migrations }]] = await db.query('SELECT COUNT(*) AS migrations FROM schema_migrations');
    assert.equal(migrations, MIGRATIONS);

    // A user's own row and password hashes must survive another setup run untouched.
    await db.query("INSERT INTO users (name, email, password_hash) VALUES ('Existing User', 'existing@test.local', 'existing-hash')");
    const hashesBefore = users.map((u) => u.password_hash).join();
    await runSetup();
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM users');
    assert.equal(total, 4);
    const [after] = await db.query("SELECT password_hash FROM users WHERE email IN ('admin@local.test','officer@local.test','reporter@local.test') ORDER BY email");
    assert.equal(after.map((u) => u.password_hash).join(), hashesBefore);
  } finally {
    await admin.end().catch(() => {});
    if (db) await db.end().catch(() => {});
  }
});
