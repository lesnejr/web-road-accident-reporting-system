import express from 'express';
import PDFDocument from 'pdfkit';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildCsv } from '../utils/csv.js';
import { exportHeaderLines } from '../utils/exportHeader.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Export helpers -------------------------------------------------------------------
// Simple monospace tables: fixed character columns in Courier keep rows aligned
// without a table library. Long cells are truncated to their column width.
function writePdfTable(doc, widths, header, rows) {
  const line = (cells) => cells.map((cell, i) => String(cell ?? '').slice(0, widths[i]).padEnd(widths[i])).join(' ');
  doc.font('Courier').fontSize(7.5).fillColor('#000000');
  doc.text(line(header));
  for (const row of rows) doc.text(line(row));
}

function renderPdf(res, filename, headerLines, renderBody) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  // An aborted download or a pdfkit failure must not surface as an unhandled
  // stream error after the headers are already sent.
  doc.on('error', (err) => res.destroy(err));
  res.on('close', () => { if (!doc.destroyed) doc.destroy(); });
  doc.pipe(res);
  for (const headerLine of headerLines) {
    doc.font('Helvetica').fontSize(9).fillColor('#444444').text(headerLine.replace(/^#\s*/, ''));
  }
  doc.moveDown();
  renderBody(doc);
  doc.end();
}

// Dates from mysql2 arrive as Date objects; exports show them as written in the UI.
const dayText = (value) => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : String(value ?? '');
const stampText = (value) => value instanceof Date
  ? `${dayText(value)} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  : String(value ?? '');

// Mount at /api/summaries

router.get('/dashboard/summary', async (req, res, next) => {
  try {
    const [reports] = await pool.query(`
      SELECT r.*, u.name as reporter_name, ac.name as category_name
      FROM reports r
      JOIN users u ON r.reporter_id = u.id
      LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
      ORDER BY r.created_at DESC
    `);
    const total = reports.length;
    const statusCounts = reports.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const pending = (statusCounts.submitted || 0) + (statusCounts.under_review || 0) + (statusCounts.needs_clarification || 0);
    const verified = reports.filter(r => r.verified_at && r.status !== 'rejected').length;
    const closed = statusCounts.resolved || 0;

    const categoryCounts = reports.reduce((acc, r) => {
      const cat = r.category_name || 'Uncategorized';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const injuryCounts = reports.reduce((acc, r) => {
      acc[r.injury_status] = (acc[r.injury_status] || 0) + 1;
      return acc;
    }, {});

    res.json({ total, statusCounts, pending, verified, closed, categoryCounts, injuryCounts, recent: reports.slice(0, 10) });
  } catch (err) { next(err); }
});

// ---- Analytics dashboard (FR-10/FR-11) -------------------------------------------------
// One aggregated, admin-only endpoint. Every KPI is bucketed by the month the report was
// SUBMITTED (created_at), so "Verified" means "of the reports submitted that month, how many
// are now verified". `scope` (verified|all) only affects the analysis widgets (injury, type,
// vehicle, map). KPIs, pipeline and status always count every report, so pending work is
// never hidden. Reporter name and contact are intentionally never returned here.
const PENDING = ['submitted', 'under_review', 'needs_clarification'];
const isOfficial = (r) => r.verified_at && r.status !== 'rejected';
const KPI_DEFS = {
  submitted: () => true,
  pending: (r) => PENDING.includes(r.status),
  verified: isOfficial,
  closed: (r) => r.status === 'resolved',
  fatal: (r) => r.injury_status === 'fatalities' || Number(r.fatalities) > 0
};
const VEHICLE_RULES = [
  ['Motorcycle', /motor|scooter|habal/i], ['Tricycle', /tricycle|trike|rickshaw/i],
  ['Bicycle', /bicycle|bike/i], ['Truck', /truck|lorry|trailer|dump/i],
  ['Bus/Jeepney', /\bbus\b|jeepney|coaster/i], ['Car', /car|sedan|suv|van|taxi|pickup|jeep|vehicle/i]
];
const vehicleBucket = (v) => {
  const s = String(v || '').trim();
  if (!s) return 'Unspecified';
  return (VEHICLE_RULES.find(([, re]) => re.test(s)) || ['Other'])[0];
};
const tally = (rows, keyFn) => {
  const out = {};
  rows.forEach((r) => { const k = keyFn(r); out[k] = (out[k] || 0) + 1; });
  return out;
};
const monthly = (rows, year, pred) => {
  const a = Array(12).fill(0);
  rows.forEach((r) => { const d = new Date(r.created_at); if (d.getFullYear() === year && pred(r)) a[d.getMonth()]++; });
  return a;
};
const yoy = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

router.get('/dashboard/stats', async (req, res, next) => {
  try {
    const thisYear = new Date().getFullYear();
    const year = parseInt(req.query.year, 10) || thisYear;
    const compareYear = parseInt(req.query.compareYear, 10) || year - 1;
    const scope = req.query.scope === 'all' ? 'all' : 'verified';
    const typeId = parseInt(req.query.typeId, 10) || null;
    const location = String(req.query.location || '').trim().slice(0, 100);
    if ([year, compareYear].some((y) => y < 2000 || y > 2100)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid year' } });
    }

    let filter = '';
    const filterParams = [];
    if (typeId) { filter += ' AND r.accident_category_id = ?'; filterParams.push(typeId); }
    if (location) { filter += ' AND r.location LIKE ?'; filterParams.push(`%${location}%`); }

    const from = `${Math.min(year, compareYear)}-01-01`;
    const to = `${Math.max(year, compareYear) + 1}-01-01`;
    const [rows] = await pool.query(`
      SELECT r.id, r.report_reference, r.status, r.injury_status, r.fatalities, r.vehicle_type,
             r.latitude, r.longitude, r.location, r.accident_date, r.accident_time,
             r.verified_at, r.created_at, ac.name AS category_name
      FROM reports r
      LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
      WHERE r.created_at >= ? AND r.created_at < ? ${filter}
    `, [from, to, ...filterParams]);

    const cur = rows.filter((r) => new Date(r.created_at).getFullYear() === year);
    const scoped = scope === 'all' ? cur : cur.filter(isOfficial);

    const kpis = {};
    const monthlySeries = {};
    for (const [key, pred] of Object.entries(KPI_DEFS)) {
      const c = monthly(rows, year, pred);
      const p = monthly(rows, compareYear, pred);
      const cs = c.reduce((a, b) => a + b, 0);
      const ps = p.reduce((a, b) => a + b, 0);
      kpis[key] = { value: cs, previous: ps, yoy: yoy(cs, ps) };
      monthlySeries[key] = { current: c, previous: p };
    }

    const [attention] = await pool.query(`
      SELECT r.id, r.report_reference, r.title, r.status, r.location, r.created_at, ac.name AS category_name
      FROM reports r
      LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
      WHERE r.status IN ('submitted','under_review','needs_clarification') ${filter}
      ORDER BY r.created_at ASC
      LIMIT 8
    `, filterParams);
    // Latest submissions of the selected year, honouring the type/location filters.
    const [recent] = await pool.query(`
      SELECT r.id, r.report_reference, r.title, r.status, r.location, r.created_at, ac.name AS category_name
      FROM reports r
      LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
      WHERE r.created_at >= ? AND r.created_at < ? ${filter}
      ORDER BY r.created_at DESC
      LIMIT 8
    `, [`${year}-01-01`, `${year + 1}-01-01`, ...filterParams]);
    const [yearRows] = await pool.query('SELECT DISTINCT YEAR(created_at) AS y FROM reports ORDER BY y DESC');

    res.json({
      meta: { year, compareYear, scope, years: yearRows.map((r) => r.y), scopedTotal: scoped.length },
      kpis,
      monthlySeries,
      pipeline: tally(cur, (r) => r.status),
      byStatus: tally(cur, (r) => r.status),
      byInjury: tally(scoped, (r) => r.injury_status),
      byType: tally(scoped, (r) => r.category_name || 'Uncategorized'),
      byVehicle: tally(scoped, (r) => vehicleBucket(r.vehicle_type)),
      locations: scoped
        .filter((r) => r.latitude !== null && r.longitude !== null)
        .map((r) => ({
          id: r.id, report_reference: r.report_reference, latitude: r.latitude, longitude: r.longitude,
          status: r.status, accident_date: r.accident_date, accident_time: r.accident_time,
          location: r.location, _type: isOfficial(r) ? 'verified' : 'unverified'
        })),
      needsAttention: attention,
      recent
    });
  } catch (err) { next(err); }
});

router.get('/dashboard/map', async (req, res, next) => {
  try {
    const [reports] = await pool.query(`
      SELECT id, report_reference, latitude, longitude, status, accident_date, accident_time, location
      FROM reports
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    `);
    const verified = reports.filter(r => r.status !== 'submitted' && r.status !== 'under_review' && r.status !== 'needs_clarification' && r.status !== 'rejected');
    const unverified = reports.filter(r => r.status === 'submitted' || r.status === 'under_review' || r.status === 'needs_clarification');
    res.json({ verified, unverified });
  } catch (err) { next(err); }
});

router.get('/reports/summaries', async (req, res, next) => {
  try {
    const { period = 'monthly', from, to, format } = req.query;
    if (format && format !== 'json' && format !== 'pdf') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'format=json or format=pdf required' } });
    }
    if ((from && !DATE_RE.test(String(from))) || (to && !DATE_RE.test(String(to)))) {
      return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'Dates must be written as YYYY-MM-DD' } });
    }
    let dateFilter = '';
    const params = [];
    if (from) { dateFilter += ' AND r.created_at >= ?'; params.push(from); }
    // `to` is inclusive of the whole end day, so a range ending "today" includes today.
    if (to) { dateFilter += ' AND r.created_at < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(to); }

    let groupBy = '';
    switch (period) {
      case 'daily': groupBy = 'DATE(r.created_at)'; break;
      case 'weekly': groupBy = 'YEARWEEK(r.created_at)'; break;
      case 'annual': groupBy = 'YEAR(r.created_at)'; break;
      default: groupBy = 'DATE_FORMAT(r.created_at, "%Y-%m")';
    }

    const [rows] = await pool.query(`
      SELECT ${groupBy} as period, COUNT(*) as count,
        SUM(CASE WHEN r.status = 'submitted' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN r.status = 'under_review' THEN 1 ELSE 0 END) as under_review,
        SUM(CASE WHEN r.status = 'needs_clarification' THEN 1 ELSE 0 END) as needs_clarification,
        SUM(CASE WHEN r.status = 'verified' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN r.status = 'assigned' THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN r.status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM reports r
      WHERE 1=1 ${dateFilter}
      GROUP BY ${groupBy}
      ORDER BY period DESC
      LIMIT 50
    `, params);

    if (format === 'pdf') {
      const rangeText = from || to ? ` (${from || 'earliest'} to ${to || 'latest'}, submission date)` : '';
      const headerLines = exportHeaderLines({ scope: 'all', period: `${period}${rangeText}` });
      return renderPdf(res, `accident-summaries-${period}-${new Date().toISOString().slice(0, 10)}.pdf`, headerLines, (doc) => {
        writePdfTable(doc, [12, 6, 8, 9, 8, 8, 8, 8, 8, 8],
          ['period', 'total', 'submittd', 'underrev', 'clarif', 'verified', 'assigned', 'inprog', 'resolved', 'rejected'],
          rows.map(r => [r.period, r.count, r.submitted, r.under_review, r.needs_clarification, r.verified, r.assigned, r.in_progress, r.resolved, r.rejected]));
      });
    }
    res.json({ period, data: rows });
  } catch (err) { next(err); }
});

router.get('/reports/export', async (req, res, next) => {
  try {
    const format = req.query.format;
    if (format !== 'csv' && format !== 'pdf') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'format=csv or format=pdf required' } });
    }

    const { status, category_id, date_from, date_to, verified, q } = req.query;
    if ((date_from && !DATE_RE.test(String(date_from))) || (date_to && !DATE_RE.test(String(date_to)))) {
      return res.status(422).json({ error: { code: 'INVALID_FILTER', message: 'Dates must be written as YYYY-MM-DD' } });
    }
    // Verified official records only by default. verified=all adds public-submitted reports.
    const scope = verified === 'false' ? 'unverified' : verified === 'all' ? 'all' : 'verified';
    let query = `
      SELECT r.report_reference, r.title, r.description, r.accident_date, r.accident_time, r.location,
        r.vehicle_type, r.injury_status, r.severity, r.vehicles_involved, r.injuries, r.fatalities,
        r.status, u.name as reporter_name, u.email as reporter_email,
        ac.name as category_name, r.created_at
      FROM reports r
      JOIN users u ON r.reporter_id = u.id
      LEFT JOIN accident_categories ac ON r.accident_category_id = ac.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    if (category_id) { query += ' AND r.accident_category_id = ?'; params.push(category_id); }
    if (date_from) { query += ' AND r.accident_date >= ?'; params.push(date_from); }
    if (date_to) { query += ' AND r.accident_date <= ?'; params.push(date_to); }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim().slice(0, 100)}%`;
      query += ' AND (r.title LIKE ? OR r.location LIKE ? OR r.report_reference LIKE ?)';
      params.push(like, like, like);
    }
    if (scope === 'verified') { query += ' AND r.verified_at IS NOT NULL AND r.status != "rejected"'; }
    if (scope === 'unverified') { query += ' AND (r.verified_at IS NULL OR r.status = "rejected")'; }
    query += ' ORDER BY r.created_at DESC';

    const [reports] = await pool.query(query, params);

    // CSV and PDF share one header block, so both files state the same scope and filters.
    let categoryName = null;
    if (category_id) {
      const [categories] = await pool.query('SELECT name FROM accident_categories WHERE id = ?', [category_id]);
      categoryName = categories[0]?.name || String(category_id);
    }
    const headerLines = exportHeaderLines({
      scope,
      filters: { status, category: categoryName, date_from, date_to, search: q && String(q).trim() }
    });
    const fileStem = `accident-reports-${scope}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'pdf') {
      return renderPdf(res, `${fileStem}.pdf`, headerLines, (doc) => {
        writePdfTable(doc, [14, 30, 10, 12, 26, 14],
          ['reference', 'title', 'accident', 'status', 'location', 'category'],
          reports.map(r => [r.report_reference, r.title, dayText(r.accident_date), r.status, r.location, r.category_name]));
      });
    }

    const headers = ['report_reference','title','description','accident_date','accident_time','location','vehicle_type','injury_status','severity','vehicles_involved','injuries','fatalities','status','reporter_name','reporter_email','category_name','created_at'];
    const rows = reports.map(r => headers.map(h => {
      if (h === 'accident_date') return dayText(r[h]);
      if (h === 'created_at') return stampText(r[h]);
      return r[h] ?? '';
    }));
    const csv = buildCsv([...headerLines.map((line) => [line]), headers, ...rows]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
