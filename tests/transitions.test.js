// Tests for the status transition matrix in utils/helpers.js.
// This is the single place the workflow is enforced on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transitionError } from '../utils/helpers.js';

const admin = { role: 'admin', id: 1 };
const officer = { role: 'traffic_officer', id: 2 };
const reporter = { role: 'reporter', id: 3 };
const otherReporter = { role: 'reporter', id: 4 };
const report = (status, extra = {}) => ({ status, reporter_id: 3, assigned_to: 2, ...extra });

test('submitted moves to under_review, and only an admin may do it', () => {
  assert.equal(transitionError(report('submitted'), 'under_review', admin), null);
  assert.ok(transitionError(report('submitted'), 'under_review', officer));
  assert.ok(transitionError(report('submitted'), 'under_review', reporter));
});

test('a public submission cannot jump straight to verified or assigned', () => {
  assert.ok(transitionError(report('submitted'), 'verified', admin));
  assert.ok(transitionError(report('submitted'), 'assigned', admin));
  assert.ok(transitionError(report('submitted'), 'resolved', admin));
});

test('rejecting requires a reason and is admin-only', () => {
  assert.ok(transitionError(report('under_review'), 'rejected', admin));
  assert.equal(transitionError(report('under_review'), 'rejected', admin, 'Duplicate of another report'), null);
  assert.ok(transitionError(report('under_review'), 'rejected', officer, 'no'));
});

test('requesting additional information requires a message', () => {
  assert.ok(transitionError(report('under_review'), 'needs_clarification', admin));
  assert.equal(transitionError(report('under_review'), 'needs_clarification', admin, 'Please add the exact time'), null);
});

test('the reporter can answer a clarification request on their own report only', () => {
  assert.equal(transitionError(report('needs_clarification'), 'under_review', reporter), null);
  assert.ok(transitionError(report('needs_clarification'), 'under_review', otherReporter));
});

test('only the assigned officer can start and resolve work', () => {
  assert.equal(transitionError(report('assigned'), 'in_progress', officer), null);
  assert.ok(transitionError(report('assigned', { assigned_to: 99 }), 'in_progress', officer));
  assert.equal(transitionError(report('in_progress'), 'resolved', officer, 'Road cleared'), null);
  assert.ok(transitionError(report('assigned'), 'in_progress', admin), 'admins follow the same matrix');
});

test('verified reports are assigned, never edited by a reporter', () => {
  assert.equal(transitionError(report('verified'), 'assigned', admin), null);
  assert.ok(transitionError(report('verified'), 'under_review', admin));
  assert.ok(transitionError(report('verified'), 'under_review', reporter));
});

test('resolved and rejected are terminal', () => {
  for (const from of ['resolved', 'rejected']) {
    assert.ok(transitionError(report(from), 'under_review', admin), `${from} -> under_review`);
    assert.ok(transitionError(report(from), 'in_progress', officer), `${from} -> in_progress`);
  }
});

test('unknown statuses are refused', () => {
  assert.ok(transitionError(report('submitted'), 'deleted', admin));
  assert.ok(transitionError(report('not_a_status'), 'under_review', admin));
});
