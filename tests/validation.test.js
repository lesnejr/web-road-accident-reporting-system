// Tests for the server-side report validation rules in models/Report.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport } from '../models/Report.js';

const valid = () => ({
  title: 'Two-car collision',
  description: 'Rear-end collision at the junction.',
  accident_date: '2020-01-01',
  accident_time: '08:30',
  location: 'Sample Road, Malolos',
  accident_category_id: 1,
  injury_status: 'unknown'
});

test('a complete report passes', () => {
  assert.equal(validateReport(valid()), null);
});

test('each required field is reported when missing', () => {
  for (const field of ['title', 'description', 'accident_date', 'accident_time', 'location', 'accident_category_id']) {
    const payload = valid();
    delete payload[field];
    const problems = validateReport(payload);
    assert.ok(problems && problems[field], `${field} should be required`);
  }
});

test('dates must be YYYY-MM-DD and cannot be in the future', () => {
  assert.ok(validateReport({ ...valid(), accident_date: '01/01/2020' }).accident_date);
  assert.ok(validateReport({ ...valid(), accident_date: '2999-01-01' }).accident_date);
  assert.ok(validateReport({ ...valid(), accident_date: '2020-1-1' }).accident_date);
});

test('injury status must be one of the four allowed values', () => {
  assert.ok(validateReport({ ...valid(), injury_status: 'dead' }).injury_status);
  assert.equal(validateReport({ ...valid(), injury_status: 'fatalities' }), null);
  assert.equal(validateReport({ ...valid(), injury_status: 'none' }), null);
});

test('coordinates must be plausible numbers when supplied', () => {
  assert.ok(validateReport({ ...valid(), latitude: 120 }).latitude);
  assert.ok(validateReport({ ...valid(), longitude: -200 }).longitude);
  assert.ok(validateReport({ ...valid(), latitude: 'north' }).latitude);
  assert.equal(validateReport({ ...valid(), latitude: '14.7943', longitude: '120.9822' }), null);
  assert.equal(validateReport({ ...valid(), latitude: '', longitude: '' }), null, 'blank coordinates are allowed');
});

test('a two-character title is too short', () => {
  assert.ok(validateReport({ ...valid(), title: 'ab' }).title);
});
