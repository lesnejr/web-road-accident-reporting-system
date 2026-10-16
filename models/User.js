import pool from '../config/db.js';
import bcrypt from 'bcryptjs';

export const User = {
  async findByEmail(email) {
    // Case-insensitive so an address registered in any case still logs in.
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    return rows[0];
  },
  async findById(id) {
    const [rows] = await pool.query('SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE id = ?', [id]);
    return rows[0];
  },
  async create({ name, email, password, role = 'reporter', phone = null }) {
    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name, email, password_hash, role, phone]
    );
    return this.findById(result.insertId);
  },
  async list(filters = {}) {
    let query = 'SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE 1=1';
    const params = [];
    if (filters.role) {
      query += ' AND role = ?';
      params.push(filters.role);
    }
    if (filters.is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.is_active);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    return rows;
  },
  async update(id, data) {
    const fields = [];
    const params = [];
    if (data.name) { fields.push('name = ?'); params.push(data.name); }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); params.push(data.is_active); }
    if (data.role) { fields.push('role = ?'); params.push(data.role); }
    if (data.password) {
      const password_hash = await bcrypt.hash(data.password, 10);
      fields.push('password_hash = ?');
      params.push(password_hash);
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  },
  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  }
};
