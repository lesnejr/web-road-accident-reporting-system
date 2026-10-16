import pool from '../config/db.js';

export const Evidence = {
  async create({ reportId, uploaderId, fileName, filePath, mimeType, description }) {
    const [result] = await pool.query(
      'INSERT INTO report_evidence (report_id, uploader_id, file_name, file_path, mime_type, description) VALUES (?, ?, ?, ?, ?, ?)',
      [reportId, uploaderId, fileName, filePath, mimeType, description]
    );
    return this.findById(result.insertId);
  },
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM report_evidence WHERE id = ?', [id]);
    return rows[0];
  },
  async findByReport(reportId) {
    const [rows] = await pool.query(
      'SELECT e.*, u.name as uploader_name FROM report_evidence e JOIN users u ON e.uploader_id = u.id WHERE e.report_id = ? ORDER BY e.uploaded_at DESC',
      [reportId]
    );
    return rows;
  }
};
