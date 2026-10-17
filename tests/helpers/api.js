// Spawns the real server against the test database and talks to it over HTTP.
// One server per test process on a fixed port, so test files run serially
// (see --test-concurrency=1 in the npm test script).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_DB } from './testDb.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_UPLOAD_DIR = process.env.TEST_UPLOAD_DIR || path.join(os.tmpdir(), 'accident-reporting-test-uploads');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startTestServer() {
  if (!TEST_DB.endsWith('_test')) throw new Error(`refusing to run the server against "${TEST_DB}"`);
  fs.mkdirSync(TEST_UPLOAD_DIR, { recursive: true });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DB_NAME: TEST_DB, PORT: String(PORT), UPLOAD_DIR: TEST_UPLOAD_DIR },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`test server exited early (code ${child.exitCode}):\n${output}`);
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`test server did not become healthy in 15s:\n${output}`);
    }
    await delay(150);
  }

  return {
    baseUrl: BASE_URL,
    uploadDir: TEST_UPLOAD_DIR,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      await Promise.race([once(child, 'exit'), delay(3000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  };
}

export async function request(pathname, { method = 'GET', token, body, form, binary = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${pathname}`, { method, headers, body: payload });
  let data;
  if (binary) {
    data = Buffer.from(await res.arrayBuffer());
  } else {
    const type = res.headers.get('content-type') || '';
    data = type.includes('application/json') ? await res.json() : await res.text();
  }
  return { status: res.status, data, headers: res.headers };
}

const tokenCache = new Map();

export async function loginAs(email, password) {
  if (tokenCache.has(email)) return tokenCache.get(email);
  const res = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  tokenCache.set(email, res.data.token);
  return res.data.token;
}
