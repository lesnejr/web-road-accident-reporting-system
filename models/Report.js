import pool from '../config/db.js';
import { generateReportReference } from '../utils/helpers.js';

const STATUS_ORDER = ['submitted','under_review','needs_clarification','verified','assigned','in_progress','resolved','rejected'];

const INJURY_STATUSES = ['none', 'injuries', 'fatalities', 'unknown'];

// Server-side validation for new reports. Returns a map of field -> message, or null when valid.
// Exported so the rules can be tested without a database.
export function validateReport(data) {
  const fields = {};
  if (!data.title || String(data.title).trim().length < 3) fields.title = 'Title is required';
  if (!data.description || !String(data.description).trim()) fields.description = 'Description is required';
  // Compare as YYYY-MM-DD strings, which orders correctly and avoids timezone drift.
  const today = new Date().toISOString().slice(0, 10);
  if (!data.accident_date) {
    fields.accident_date = 'Accident date is required';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.accident_date))) {
    fields.accident_date = 'Accident date must be written as YYYY-MM-DD';
  } else if (String(data.accident_date) > today) {
    fields.accident_date = 'Accident date cannot be in the future';
  }
  if (!data.accident_time) fields.accident_time = 'Accident time is required';
  if (!data.location || !String(data.location).trim()) fields.location = 'Location is required';
  if (!data.accident_category_id) fields.accident_category_id = 'Accident type is required';
  if (!INJURY_STATUSES.includes(data.injury_status)) fields.injury_status = 'Injury status must be none, injuries, fatalities or unknown';
  if (data.latitude !== undefined && data.latitude !== null && data.latitude !== '') {
    const lat = Number(data.latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) fields.latitude = 'Latitude must be between -90 and 90';
  }
  if (data.longitude !== undefined && data.longitude !== null && data.longitude !== '') {
    const lng = Number(data.longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) fields.longitude = 'Longitude must be between -180 and 180';
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

export const Report = {
  async create(data, reporterId) {
    const problems = validateReport(data);
    if (problems) {
      const err = new Error(Object.values(problems).join('; '));
      err.name = 'ValidationError';
      err.details = problems;
      throw err;
    }
    const values = (reportReference) => [
      reportReference, reporterId, data.accident_category_id, data.title, data.description,
      data.accident_date, data.accident_time, data.location, data.latitude, data.longitude,
      data.vehicle_type, data.injury_status, data.severity, data.vehicles_involved, data.injuries, data.fatalities
    ];
    // The reference is derived from a row count, so two simultaneous submissions
    // can compute the same value. A duplicate key is retried with a fresh count.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [result] = await pool.query(
          `INSERT INTO reports (report_reference, reporter_id, accident_category_id, title, description, accident_date, accident_time, location, latitude, longitude, vehicle_type, injury_status, severity, vehicles_involved, injuries, fatalities, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
          values(await generateReportReference())
        );
        return this.findById(result.insertId);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' && attempt < 4) continue;
        throw err;
      }
    }
    throw new Error('Could not allocate a report reference');
  },
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT r.*, u.name as reporter_name, u.email as reporter_email, ac.name as category_name,
              o.name as assigned_officer_name
       FROM reports r
       JOIN users u ON r.reporter_id = u.id
       LEFT JOIN users o ON r.assigned_to = o.id
       LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
       WHERE r.id = ?`,
      [id]
    );
    return rows[0];
  },
  async findByReference(ref) {
    const [rows] = await pool.query(
      `SELECT r.*, u.name as reporter_name, u.email as reporter_email, ac.name as category_name
       FROM reports r
       JOIN users u ON r.reporter_id = u.id
       LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
       WHERE r.report_reference = ?`,
      [ref]
    );
    return rows[0];
  },
  async list(user, filters = {}) {
    const { query, params } = buildReportQuery(user, filters);
    const [rows] = await pool.query(query, params);
    return rows;
  },
  async listPage(user, filters) {
    const { query, params, countQuery, countParams } = buildReportQuery(user, filters);
    const [[{ total }]] = await pool.query(countQuery, countParams);
    const [rows] = await pool.query(query, params);
    return { data: rows, total, page: filters.page, limit: filters.limit };
  },
  // Reports within ±2 days of the target's accident date — enough to cover the
  // 24 h window; the exact window is decided by utils/duplicates.js.
  async findNearby(report) {
    const [rows] = await pool.query(
      `SELECT r.*, u.name as reporter_name, ac.name as category_name
       FROM reports r
       JOIN users u ON r.reporter_id = u.id
       LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
       WHERE r.id <> ? AND r.accident_date BETWEEN DATE_SUB(?, INTERVAL 2 DAY) AND DATE_ADD(?, INTERVAL 2 DAY)`,
      [report.id, report.accident_date, report.accident_date]
    );
    return rows;
  },
  async setDuplicate(id, duplicateOfReportId) {
    await pool.query('UPDATE reports SET duplicate_of_report_id = ? WHERE id = ?', [duplicateOfReportId, id]);
    return this.findById(id);
  },
  async update(id, data, user) {
    const fields = [];
    const params = [];
    const allowed = ['title','description','accident_date','accident_time','location','latitude','longitude','vehicle_type','injury_status','severity','vehicles_involved','injuries','fatalities','accident_category_id'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    await pool.query(`UPDATE reports SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  },
  async updateStatus(id, newStatus, changedBy, reason = null) {
    const current = await this.findById(id);
    if (!current) return null;
    const oldStatus = current.status;
    if (oldStatus === newStatus) return current;
    await pool.query('UPDATE reports SET status = ? WHERE id = ?', [newStatus, id]);
    if (newStatus === 'assigned' && reason) {
      await pool.query('UPDATE reports SET assigned_to = ? WHERE id = ?', [reason.assignedTo || null, id]);
    }
    if (newStatus === 'verified') {
      await pool.query('UPDATE reports SET verified_by = ?, verified_at = NOW(), verification_notes = ? WHERE id = ?', [changedBy, reason?.notes || null, id]);
    } else if (newStatus === 'rejected') {
      // A rejected report was never verified, so verified_at stays NULL.
      await pool.query('UPDATE reports SET verification_notes = ? WHERE id = ?', [reason?.notes || null, id]);
    }
    if (newStatus === 'in_progress' || newStatus === 'resolved') {
      await pool.query('UPDATE reports SET findings = ? WHERE id = ?', [reason?.findings || null, id]);
    }
    const { recordStatusHistory } = await import('../utils/helpers.js');
    await recordStatusHistory(id, changedBy, oldStatus, newStatus, reason?.notes || null);
    return this.findById(id);
  },
  async assign(id, officerId, changedBy) {
    const current = await this.findById(id);
    if (!current) return null;
    await pool.query('UPDATE reports SET status = ?, assigned_to = ? WHERE id = ?', ['assigned', officerId, id]);
    const { recordStatusHistory } = await import('../utils/helpers.js');
    await recordStatusHistory(id, changedBy, current.status, 'assigned', 'Assigned to traffic officer');
    return this.findById(id);
  },
  async addFindings(id, findings, changedBy) {
    await pool.query('UPDATE reports SET findings = ? WHERE id = ?', [findings, id]);
    return this.findById(id);
  }
};

// Sorting is mapped through this whitelist; request values never reach the SQL string.
const SORT_COLUMNS = {
  created_at: 'r.created_at',
  accident_date: 'r.accident_date',
  status: 'r.status',
  report_reference: 'r.report_reference'
};

function buildReportQuery(user, filters = {}) {
  const {
    status = null, categoryId = null, dateFrom = null, dateTo = null, search = null,
    sort = 'created_at', direction = 'desc', page = null, limit = null
  } = filters;
  // Every condition goes into WHERE. Officers see only reports assigned to them.
  const conditions = [];
  const params = [];
  if (user.role === 'reporter') {
    conditions.push('r.reporter_id = ?');
    params.push(user.id);
  } else if (user.role === 'traffic_officer') {
    conditions.push('r.assigned_to = ?');
    params.push(user.id);
  }
  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  if (categoryId) {
    conditions.push('r.accident_category_id = ?');
    params.push(categoryId);
  }
  if (dateFrom) {
    conditions.push('r.accident_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('r.accident_date <= ?');
    params.push(dateTo);
  }
  if (search) {
    const like = `%${search}%`;
    conditions.push('(r.title LIKE ? OR r.location LIKE ? OR r.report_reference LIKE ?)');
    params.push(like, like, like);
  }
  const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  const orderColumn = SORT_COLUMNS[sort] || SORT_COLUMNS.created_at;
  const orderDirection = String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  let query = `
    SELECT r.*, u.name as reporter_name, u.email as reporter_email,
           ac.name as category_name, o.name as assigned_officer_name
    FROM reports r
    JOIN users u ON r.reporter_id = u.id
    LEFT JOIN users o ON r.assigned_to = o.id
    LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
  ${where} ORDER BY ${orderColumn} ${orderDirection}`;
  const queryParams = [...params];
  if (page && limit) {
    query += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, (page - 1) * limit);
  }
  const countQuery = `SELECT COUNT(*) AS total FROM reports r${where}`;
  return { query, params: queryParams, countQuery, countParams: params };
}
