import pool from '../config/db.js';

export const AuditLog = {
  async list({ page = 1, limit = 50, userId = null, action = null, entityType = null } = {}) {
    let query = 'SELECT al.*, u.name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1';
    const params = [];
    if (userId) { query += ' AND al.user_id = ?'; params.push(userId); }
    if (action) { query += ' AND al.action = ?'; params.push(action); }
    if (entityType) { query += ' AND al.entity_type = ?'; params.push(entityType); }
    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    const [rows] = await pool.query(query, params);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM audit_logs', []);
    return { rows, total, page: Number(page), limit: Number(limit) };
  }
};
