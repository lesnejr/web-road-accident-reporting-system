import express from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

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
      needsAttention: attention
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
    const { period = 'monthly', from, to } = req.query;
    let dateFilter = '';
    const params = [];
    if (from) { dateFilter += ' AND r.created_at >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND r.created_at <= ?'; params.push(to); }

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

    res.json({ period, data: rows });
  } catch (err) { next(err); }
});

router.get('/reports/export', async (req, res, next) => {
  try {
    if (req.query.format !== 'csv') return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'format=csv required' } });
    if (req.user.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin only' } });

    const { status, category_id, date_from, date_to, verified } = req.query;
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
    if (scope === 'verified') { query += ' AND r.verified_at IS NOT NULL AND r.status != "rejected"'; }
    if (scope === 'unverified') { query += ' AND (r.verified_at IS NULL OR r.status = "rejected")'; }
    query += ' ORDER BY r.created_at DESC';

    const [reports] = await pool.query(query, params);
    const headers = ['report_reference','title','description','accident_date','accident_time','location','vehicle_type','injury_status','severity','vehicles_involved','injuries','fatalities','status','reporter_name','reporter_email','category_name','created_at'];
    const rows = reports.map(r => headers.map(h => r[h] ?? ''));
    // Every export states its scope in the first row, so an unverified export can never be mistaken for official data.
    const scopeLine = scope === 'all'
      ? '# INCLUDES UNVERIFIED public-submitted reports, which are not official records'
      : scope === 'unverified'
        ? '# Unverified public-submitted reports only, not official records'
        : '# Verified official records only';
    const csv = [scopeLine, headers.join(','), ...rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="accident-reports-${scope}-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
