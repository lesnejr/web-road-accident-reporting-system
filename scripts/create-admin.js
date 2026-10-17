// Creates an administrator account without shipping a default password in the
// repository.
//
// Usage:
//   node scripts/create-admin.js --name "System Admin" --email admin@example.org
//   ADMIN_PASSWORD=... node scripts/create-admin.js --email admin@example.org
//   node scripts/create-admin.js --email admin@example.org --set-password
//
// The password is read from the ADMIN_PASSWORD environment variable when set,
// otherwise prompted for. Nothing sensitive is ever printed.
import readline from 'readline';
import dotenv from 'dotenv';
import { User } from '../models/User.js';
import pool from '../config/db.js';

dotenv.config();

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function promptPassword() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question('Admin password (min 8 characters): ', (answer) => {
    rl.close();
    resolve(answer);
  }));
}

const name = arg('name') || 'System Admin';
const email = String(arg('email') || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || await promptPassword();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('A valid --email is required.');
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

try {
  const existing = await User.findByEmail(email);
  if (existing && arg('set-password')) {
    await User.update(existing.id, { password });
    console.log(`Password updated for ${existing.email} (role: ${existing.role}).`);
  } else if (existing) {
    console.error(`An account with ${existing.email} already exists (role: ${existing.role}). Use --set-password to reset its password.`);
    process.exitCode = 1;
  } else {
    const user = await User.create({ name: String(name).trim(), email, password, role: 'admin' });
    console.log(`Created administrator ${user.email} (id ${user.id}).`);
  }
} catch (err) {
  console.error('Could not create the administrator:', err.code === 'ECONNREFUSED'
    ? 'the database is not reachable - start MySQL in XAMPP first.'
    : err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
