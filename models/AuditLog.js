import pool from '../config/db.js';

export const AuditLog = {
  async list({ page = 1, limit = 50, userId = null, action = null, entityType = null } = {}) {
    const conditions = [];
    const filterParams = [];
    if (userId) { conditions.push('al.user_id = ?'); filterParams.push(userId); }
    if (action) { conditions.push('al.action = ?'); filterParams.push(action); }
    if (entityType) { conditions.push('al.entity_type = ?'); filterParams.push(entityType); }
    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    let query = 'SELECT al.*, u.name as user_name, u.email as user_email FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id' + where;
    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    const params = [...filterParams, Number(limit), (Number(page) - 1) * Number(limit)];
    const [rows] = await pool.query(query, params);
    // The total uses the same filters as the page query, so pagination is accurate.
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM audit_logs al' + where, filterParams);
    return { rows, total, page: Number(page), limit: Number(limit) };
  }
};
