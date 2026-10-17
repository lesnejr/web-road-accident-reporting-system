// Tests for evidence file identification. Files are identified by their bytes,
// so nothing here depends on the filename or a browser-declared MIME type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectFileType, sanitizeFileName } from '../utils/fileType.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-type-'));
const write = (name, bytes) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
};

test('detects the allowed formats from their signatures', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const jpeg = Buffer.from('ffd8ffe000104a464946', 'hex');
  const gif = Buffer.from('GIF89a01020304', 'latin1');
  const webp = Buffer.from('RIFFxxxxWEBPVP8 ', 'latin1');
  const pdf = Buffer.from('%PDF-1.7\n...', 'latin1');

  assert.equal(await detectFileType(write('a.png', png)), 'image/png');
  assert.equal(await detectFileType(write('a.jpg', jpeg)), 'image/jpeg');
  assert.equal(await detectFileType(write('a.gif', gif)), 'image/gif');
  assert.equal(await detectFileType(write('a.webp', webp)), 'image/webp');
  assert.equal(await detectFileType(write('a.pdf', pdf)), 'application/pdf');
});

test('an image extension on HTML content is rejected', async () => {
  const html = Buffer.from('<!doctype html><script>alert(1)</script>', 'latin1');
  assert.equal(await detectFileType(write('evil.png', html)), null);
});

test('HTML, scripts, executables and plain text are rejected', async () => {
  assert.equal(await detectFileType(write('evil.html', Buffer.from('<html>', 'latin1'))), null);
  assert.equal(await detectFileType(write('evil.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">', 'latin1'))), null);
  assert.equal(await detectFileType(write('evil.exe', Buffer.from('MZ\x90\x00', 'latin1'))), null);
  assert.equal(await detectFileType(write('evil.txt', Buffer.from('just text', 'latin1'))), null);
});

test('truncated or empty files are rejected', async () => {
  assert.equal(await detectFileType(write('empty.png', Buffer.alloc(0))), null);
  assert.equal(await detectFileType(write('cut.png', Buffer.from('89504e', 'hex'))), null);
  assert.equal(await detectFileType(write('almost.webp', Buffer.from('RIFFxxxxWEB', 'latin1'))), null);
});

test('a missing file is rejected rather than throwing', async () => {
  assert.equal(await detectFileType(path.join(dir, 'does-not-exist')), null);
});

test('display names lose path separators and control characters', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('C:\\Users\\x\\crash scene.png'), 'crash scene.png');
  assert.equal(sanitizeFileName('line\r\nbreak.png'), 'linebreak.png');
  assert.equal(sanitizeFileName('bad"name<>.png'), 'badname.png');
  assert.equal(sanitizeFileName(''), 'evidence');
  assert.equal(sanitizeFileName(undefined), 'evidence');
  assert.equal(sanitizeFileName('x'.repeat(300) + '.png').length, 120);
});
