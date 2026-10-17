// Repeatable database setup. Creates the database if missing, applies the
// schema and every unapplied migration (tracked in schema_migrations), and
// re-seeds accident categories idempotently. Never drops or overwrites data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'database', 'migrations');

// Local development accounts. Passwords are generated (or taken from
// DEV_SEED_PASSWORD) at setup time and never stored in the repository.
const DEV_ACCOUNTS = [
  { email: 'admin@local.test', name: 'Development Admin', role: 'admin' },
  { email: 'officer@local.test', name: 'Development Officer', role: 'traffic_officer' },
  { email: 'reporter@local.test', name: 'Development Reporter', role: 'reporter' }
];

function connectionOptions(dbName) {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    ...(dbName ? { database: dbName } : {})
  };
}

export async function applyDatabase({ dbName, seedPassword, resetPasswords = false, log = console.log } = {}) {
  if (!dbName) throw new Error('applyDatabase requires dbName');

  const admin = await mysql.createConnection(connectionOptions());
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await admin.end();
  }

  const db = await mysql.createConnection(connectionOptions(dbName));
  const applied = [];
  const skipped = [];
  try {
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const [rows] = await db.query('SELECT filename FROM schema_migrations');
    const done = new Set(rows.map((row) => row.filename));

    // Schema and seed are written to be idempotent, so they run on every call.
    await db.query(fs.readFileSync(path.join(ROOT, 'database', 'schema.sql'), 'utf8'));

    // Migrations are applied once, in filename order, and recorded.
    const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
    for (const file of migrations) {
      if (done.has(file)) {
        skipped.push(file);
        continue;
      }
      await db.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await db.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      applied.push(file);
    }

    await db.query(fs.readFileSync(path.join(ROOT, 'database', 'seed.sql'), 'utf8'));

    // Dev accounts: created once, never overwritten unless --reset-dev-passwords.
    const accounts = [];
    for (const account of DEV_ACCOUNTS) {
      const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [account.email]);
      if (existing.length > 0 && !resetPasswords) {
        accounts.push({ email: account.email, role: account.role, password: null });
        continue;
      }
      const password = seedPassword || crypto.randomBytes(9).toString('base64url');
      const hash = await bcrypt.hash(password, 10);
      if (existing.length === 0) {
        await db.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [account.name, account.email, hash, account.role]);
      } else {
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, existing[0].id]);
      }
      const [stored] = await db.query('SELECT password_hash FROM users WHERE email = ?', [account.email]);
      if (!await bcrypt.compare(password, stored[0].password_hash)) {
        throw new Error(`account ${account.email} did not verify after seeding`);
      }
      accounts.push({ email: account.email, role: account.role, password });
    }

    log(`db:setup ${dbName}: applied ${applied.length} migration(s), skipped ${skipped.length}, categories seeded`);
    for (const file of applied) log(`  applied ${file}`);
    for (const account of accounts) {
      log(account.password
        ? `  account ${account.email} (${account.role}) password: ${account.password}`
        : `  account ${account.email} (${account.role}) exists — password unchanged`);
    }

    return { applied, skipped, accounts };
  } finally {
    await db.end();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const dbName = process.env.DB_NAME || 'accident_reporting';
  applyDatabase({
    dbName,
    seedPassword: process.env.DEV_SEED_PASSWORD,
    resetPasswords: process.argv.includes('--reset-dev-passwords')
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`db:setup failed for "${dbName}": ${err.message}`);
      process.exit(1);
    });
}
