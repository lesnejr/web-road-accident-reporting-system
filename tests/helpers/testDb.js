// Integration tests run against a dedicated database whose name ends in _test.
// setupTestDb drops and recreates ONLY that database; the dev database is never touched.
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { applyDatabase } from '../../scripts/db-setup.js';

export const TEST_DB = 'accident_reporting_test';
export const TEST_PASSWORD = process.env.DEV_SEED_PASSWORD || 'testpassword123';

function assertTestName(name) {
  if (!name.endsWith('_test')) throw new Error(`refusing to touch non-test database "${name}"`);
}

export async function setupTestDb() {
  assertTestName(TEST_DB);
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  } finally {
    await admin.end();
  }
  await applyDatabase({ dbName: TEST_DB, seedPassword: TEST_PASSWORD, resetPasswords: true, log: () => {} });
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: TEST_DB,
    waitForConnections: true,
    connectionLimit: 5
  });
  return { pool };
}
