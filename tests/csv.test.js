// Tests for CSV escaping, including spreadsheet formula injection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, buildCsv } from '../utils/csv.js';

test('every cell is quoted and inner quotes are doubled', () => {
  assert.equal(csvCell('plain'), '"plain"');
  assert.equal(csvCell('say "hello"'), '"say ""hello"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell(42), '"42"');
});

test('formula characters at the start of a cell are neutralised', () => {
  assert.equal(csvCell('=SUM(A1:A9)'), '"\'=SUM(A1:A9)"');
  assert.equal(csvCell('+1-1'), '"\'+1-1"');
  assert.equal(csvCell('-cmd'), '"\'-cmd"');
  assert.equal(csvCell('@import'), '"\'@import"');
  // Tab and carriage return are neutralised the same way; the original character stays inside quotes.
  assert.ok(csvCell('\tformula').startsWith('"\''), 'tab-prefixed cell is neutralised');
  assert.ok(csvCell('\rformula').startsWith('"\''), 'CR-prefixed cell is neutralised');
});

test('formula characters are only neutralised at the start', () => {
  assert.equal(csvCell('total = 5'), '"total = 5"');
  assert.equal(csvCell('a+b'), '"a+b"');
});

test('buildCsv joins rows with newlines inside quoted cells intact', () => {
  const csv = buildCsv([['# scope line'], ['a', 'b'], ['x\ny', 'z"z']]);
  assert.equal(csv, '"# scope line"\n"a","b"\n"x\ny","z""z"');
});
