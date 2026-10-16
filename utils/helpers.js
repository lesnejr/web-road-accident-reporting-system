import pool from '../config/db.js';

export async function generateReportReference() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    'SELECT COUNT(*) as cnt FROM reports WHERE YEAR(created_at) = ?',
    [year]
  );
  const next = (rows[0].cnt || 0) + 1;
  return `RA-${year}-${String(next).padStart(6, '0')}`;
}

export function buildReportQuery(user) {
  let query = `
    SELECT r.*, u.name as reporter_name, u.email as reporter_email,
           ac.name as category_name
    FROM reports r
    JOIN users u ON r.reporter_id = u.id
    LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
  `;
  const params = [];
  if (user.role === 'reporter') {
    query += ' WHERE r.reporter_id = ?';
    params.push(user.id);
  } else if (user.role === 'traffic_officer') {
    query += ' WHERE r.assigned_to = ? OR r.status IN (?, ?)';
    params.push(user.id, 'submitted', 'under_review');
  }
  query += ' ORDER BY r.created_at DESC';
  return { query, params };
}

export function logAudit(userId, action, entityType, entityId, req, details = null) {
  return pool.query(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId, req?.ip || null, req?.get?.('user-agent') || null, details ? JSON.stringify(details) : null]
  );
}

export function recordStatusHistory(reportId, changedBy, oldStatus, newStatus, reason = null) {
  return pool.query(
    'INSERT INTO report_status_history (report_id, changed_by, old_status, new_status, reason) VALUES (?, ?, ?, ?, ?)',
    [reportId, changedBy, oldStatus, newStatus, reason]
  );
}

// The status transition matrix from the plan, enforced in one place on the server.
// 'officer' means the officer assigned to that specific report, not any officer.
const TRANSITIONS = {
  submitted:           { under_review:        ['admin'] },
  under_review:        { needs_clarification: ['admin'], verified: ['admin'], rejected: ['admin'] },
  needs_clarification: { under_review:        ['admin', 'reporter'] },
  verified:            { assigned:            ['admin'] },
  assigned:            { in_progress:         ['officer'] },
  in_progress:         { needs_clarification: ['officer'], resolved: ['officer', 'admin'] },
  resolved:            {},
  rejected:            {}
};

// Returns null when the transition is allowed, otherwise a human-readable reason.
export function transitionError(report, toStatus, user, reason = null) {
  const from = report.status;
  const allowedRoles = (TRANSITIONS[from] || {})[toStatus];
  if (!allowedRoles) return `A report cannot go from ${from} to ${toStatus}`;
  let roleOk = false;
  if (user.role === 'admin') {
    roleOk = allowedRoles.includes('admin');
  } else if (user.role === 'traffic_officer') {
    roleOk = allowedRoles.includes('officer') && report.assigned_to === user.id;
  } else if (user.role === 'reporter') {
    roleOk = allowedRoles.includes('reporter') && report.reporter_id === user.id;
  }
  if (!roleOk) return `Your role may not change a report from ${from} to ${toStatus}`;
  if (toStatus === 'rejected' && !String(reason || '').trim()) {
    return 'A reason is required when rejecting a report';
  }
  if (toStatus === 'needs_clarification' && !String(reason || '').trim()) {
    return 'A message is required when requesting additional information';
  }
  return null;
}
