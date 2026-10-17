import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navSections, isItemActive, currentSectionLabel } from './navigation.js';

const itemsFor = role => navSections(role).flatMap(section => section.items);

test('every role sees only its own destinations', () => {
  const reporter = itemsFor('reporter').map(item => item.to);
  assert.ok(reporter.includes('/dashboard') && reporter.includes('/reports') && reporter.includes('/reports/new'));
  assert.ok(!reporter.some(path => path.startsWith('/admin')));
  assert.ok(!reporter.includes('/officer'));

  const officer = itemsFor('traffic_officer').map(item => item.to);
  assert.ok(officer.includes('/officer'));
  assert.ok(!officer.some(path => path.startsWith('/admin')));
  assert.ok(!officer.includes('/reports/new'));

  const admin = itemsFor('admin').map(item => item.to);
  assert.ok(admin.includes('/admin/users') && admin.includes('/admin/audit-logs') && admin.includes('/admin/summaries'));
  assert.ok(!admin.includes('/officer'));
  assert.ok(!admin.includes('/reports/new'));
});

test('one visible item per destination per role, labels unique', () => {
  for (const role of ['reporter', 'traffic_officer', 'admin']) {
    const items = itemsFor(role);
    assert.equal(new Set(items.map(item => item.to)).size, items.length, `${role} destination duplicated`);
    assert.equal(new Set(items.map(item => item.label)).size, items.length, `${role} label duplicated`);
  }
});

test('active matching separates the report list from the submission form', () => {
  const myReports = itemsFor('reporter').find(item => item.label === 'My Reports');
  assert.ok(isItemActive(myReports, '/reports'));
  assert.ok(isItemActive(myReports, '/reports/12'));
  assert.ok(isItemActive(myReports, '/reports/12/edit'));
  assert.ok(!isItemActive(myReports, '/reports/new'));

  const submit = itemsFor('reporter').find(item => item.label === 'Submit Report');
  assert.ok(isItemActive(submit, '/reports/new'));
  assert.ok(!isItemActive(submit, '/reports/12'));

  const assigned = itemsFor('traffic_officer').find(item => item.label === 'My Assigned Reports');
  assert.ok(isItemActive(assigned, '/officer'));
  assert.ok(!isItemActive(assigned, '/reports'));
});

test('header label follows the active item and stays empty elsewhere', () => {
  assert.equal(currentSectionLabel('admin', '/admin/users'), 'User Management');
  assert.equal(currentSectionLabel('traffic_officer', '/officer'), 'My Assigned Reports');
  assert.equal(currentSectionLabel('reporter', '/reports/7'), 'My Reports');
  assert.equal(currentSectionLabel('reporter', '/reports/new'), 'Submit Report');
  assert.equal(currentSectionLabel('reporter', '/nothing-here'), '');
});
