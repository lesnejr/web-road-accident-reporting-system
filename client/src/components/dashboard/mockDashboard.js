// Synthetic data in the exact shape of GET /api/summaries/dashboard/stats.
// Enable with VITE_USE_MOCK_DASHBOARD=true in client/.env. No real residents here.
const rnd = (seed) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const SHAPE = [.82, .78, .9, .93, 1, .98, 1, .99, 1.02, 1.05, 1, .85];

function series(base, year, seed) {
  const r = rnd(seed + year);
  const raw = SHAPE.map((v) => v * (0.95 + r() * 0.1));
  const sum = raw.reduce((a, b) => a + b, 0);
  const total = base * (1 + (2026 - year) * 0.1);
  return raw.map((v) => Math.round((v / sum) * total));
}

export function mockDashboard({ year, compareYear, scope }) {
  const defs = { submitted: [240, 1], pending: [38, 2], verified: [150, 3], closed: [70, 4], fatal: [14, 5] };
  const kpis = {}, monthlySeries = {};
  for (const [k, [base, seed]] of Object.entries(defs)) {
    const current = series(base, year, seed), previous = series(base, compareYear, seed);
    const cs = current.reduce((a, b) => a + b, 0), ps = previous.reduce((a, b) => a + b, 0);
    kpis[k] = { value: cs, previous: ps, yoy: ps ? ((cs - ps) / ps) * 100 : null };
    monthlySeries[k] = { current, previous };
  }
  const k = scope === 'all' ? 1 : 0.62;
  const r = rnd(year);
  const locations = Array.from({ length: Math.round(120 * k) }, (_, i) => ({
    id: i + 1, report_reference: `RA-${year}-${String(i + 1).padStart(6, '0')}`,
    latitude: 14.84 + (r() - 0.5) * 0.12, longitude: 120.78 + (r() - 0.5) * 0.12,
    status: 'verified', accident_date: `${year}-05-10`, accident_time: '08:30:00', location: 'Sample Road', _type: 'verified'
  }));
  const needsAttention = ['submitted', 'under_review', 'needs_clarification', 'submitted'].map((status, i) => ({
    id: i + 1, report_reference: `RA-${year}-00${i + 10}`, title: 'Sample report', status,
    category_name: ['Vehicle Collision', 'Hit and Run', 'Motorcycle Accident', 'Pedestrian Accident'][i],
    location: ['Brgy. Sample 1', 'Brgy. Sample 2', 'Brgy. Sample 3', 'Brgy. Sample 4'][i],
    created_at: new Date(Date.now() - (9 - i * 2) * 86400000).toISOString()
  }));
  const pct = (o) => Object.fromEntries(Object.entries(o).map(([a, b]) => [a, Math.round(b * k)]));
  return {
    meta: { year, compareYear, scope, years: [2026, 2025, 2024], scopedTotal: locations.length },
    kpis, monthlySeries,
    pipeline: { submitted: 22, under_review: 14, needs_clarification: 5, verified: 40, assigned: 18, in_progress: 26, resolved: 70, rejected: 9 },
    byStatus: { submitted: 22, under_review: 14, needs_clarification: 5, verified: 40, assigned: 18, in_progress: 26, resolved: 70, rejected: 9 },
    byInjury: pct({ none: 80, injuries: 70, fatalities: 14, unknown: 10 }),
    byType: pct({ 'Vehicle Collision': 90, 'Motorcycle Accident': 60, 'Hit and Run': 25, 'Pedestrian Accident': 18, Other: 8 }),
    byVehicle: pct({ Motorcycle: 70, Car: 55, Tricycle: 30, Truck: 18, 'Bus/Jeepney': 12, Bicycle: 6 }),
    locations, needsAttention
  };
}
