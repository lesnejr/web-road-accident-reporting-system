import pool from '../config/db.js';

export const Notification = {
  async create({ userId, reportId, event, message }) {
    const [result] = await pool.query(
      'INSERT INTO notifications (user_id, report_id, event, message) VALUES (?, ?, ?, ?)',
      [userId, reportId, event, message]
    );
    return this.findById(result.insertId);
  },
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    return rows[0];
  },
  async listByUser(userId, { unreadOnly = false, page = 1, limit = 20 } = {}) {
    let query = 'SELECT n.*, r.report_reference, r.title as report_title FROM notifications n LEFT JOIN reports r ON n.report_id = r.id WHERE n.user_id = ?';
    const params = [userId];
    if (unreadOnly) { query += ' AND n.is_read = 0'; }
    query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    const [rows] = await pool.query(query, params);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM notifications WHERE user_id = ?' + (unreadOnly ? ' AND is_read = 0' : ''), [userId]);
    return { rows, total, page: Number(page), limit: Number(limit) };
  },
  async markRead(id, userId) {
    // Ownership check first so marking someone else's notification returns "not found",
    // and marking an already-read notification stays idempotent.
    const [rows] = await pool.query('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
    if (rows.length === 0) return null;
    await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?', [id, userId]);
    return this.findById(id);
  },
  async markAllRead(userId) {
    await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0', [userId]);
    return { success: true };
  },
  async unreadCount(userId) {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
    return count;
  }
};
