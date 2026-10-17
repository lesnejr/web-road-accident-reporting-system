// Single source for the role-aware navigation rail. Pure data and helpers so the
// client test setup (node --test, no DOM) can pin the role rules, matching the
// routing helper tests next to this file.
const ALL_ROLES = ['reporter', 'traffic_officer', 'admin'];

// The shared report list is one route with role-specific scopes, so each role
// gets its own label for it. Only one of these items is ever visible at a time.
const reportListMatch = /^\/reports(\/\d+)?(\/edit)?$/;

export const navSections = (role) => [
  {
    key: 'overview',
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', match: /^\/dashboard$/, roles: ALL_ROLES }
    ]
  },
  {
    key: 'reporting',
    title: 'Reporting',
    items: [
      { to: '/reports', label: 'My Reports', icon: 'reports', match: reportListMatch, roles: ['reporter'] },
      { to: '/reports/new', label: 'Submit Report', icon: 'plus', match: /^\/reports\/new$/, roles: ['reporter'] },
      { to: '/reports', label: 'Accident Reports', icon: 'reports', match: reportListMatch, roles: ['traffic_officer'] },
      { to: '/officer', label: 'My Assigned Reports', icon: 'officer', match: /^\/officer/, roles: ['traffic_officer'] },
      { to: '/reports', label: 'All Accident Reports', icon: 'reports', match: reportListMatch, roles: ['admin'] },
      { to: '/admin/summaries', label: 'Summaries', icon: 'chart', match: /^\/admin\/summaries$/, roles: ['admin'] }
    ]
  },
  {
    key: 'administration',
    title: 'Administration',
    items: [
      { to: '/admin/users', label: 'User Management', icon: 'users', match: /^\/admin\/users$/, roles: ['admin'] },
      { to: '/admin/audit-logs', label: 'Audit Logs', icon: 'audit', match: /^\/admin\/audit-logs$/, roles: ['admin'] }
    ]
  },
  {
    key: 'general',
    title: 'General',
    items: [
      { to: '/map', label: 'Accident Map', icon: 'map', match: /^\/map$/, roles: ALL_ROLES },
      { to: '/notifications', label: 'Notifications', icon: 'bell', match: /^\/notifications$/, roles: ALL_ROLES }
    ]
  }
]
  .map(section => ({ ...section, items: section.items.filter(item => item.roles.includes(role)) }))
  .filter(section => section.items.length > 0);

export const isItemActive = (item, pathname) => item.match.test(pathname);

// What the compact header shows on small screens, where the rail is hidden.
export function currentSectionLabel(role, pathname) {
  for (const section of navSections(role)) {
    for (const item of section.items) {
      if (isItemActive(item, pathname)) return item.label;
    }
  }
  return '';
}
