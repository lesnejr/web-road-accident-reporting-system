import pool from '../config/db.js';

export const StatusHistory = {
  async findByReport(reportId) {
    const [rows] = await pool.query(
      'SELECT sh.*, u.name as changed_by_name FROM report_status_history sh JOIN users u ON sh.changed_by = u.id WHERE sh.report_id = ? ORDER BY sh.changed_at DESC',
      [reportId]
    );
    return rows;
  }
};
