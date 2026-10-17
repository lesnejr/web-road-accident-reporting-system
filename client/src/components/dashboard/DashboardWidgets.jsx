import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '../../theme';

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const label = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Shows a skeleton, an error, or an empty message; otherwise renders the children.
export function WidgetState({ loading, error, empty, children, emptyText = 'No data for these filters' }) {
  if (loading) return <div className="ad-skel" role="status" aria-label="Loading" />;
  if (error) return <div className="ad-state ad-err" role="alert">Could not load this widget</div>;
  if (empty) return <div className="ad-state">{emptyText}</div>;
  return children;
}

export function Card({ area, title, children }) {
  return (
    <section className={`ad-card ad-${area}`} aria-label={title}>
      {title && <h2 className="ad-t">{title}</h2>}
      {children}
    </section>
  );
}

export function DashboardFilters({ filters, years, categories, onChange }) {
  const set = (k) => (e) => onChange({ ...filters, [k]: e.target.value });
  return (
    <div className="ad-filters">
      <label>Year
        <select value={filters.year} onChange={set('year')}>{years.map((y) => <option key={y}>{y}</option>)}</select>
      </label>
      <label>Compare Year
        <select value={filters.compareYear} onChange={set('compareYear')}>{years.map((y) => <option key={y}>{y}</option>)}</select>
      </label>
      <label>Charts &amp; map scope
        <select value={filters.scope} onChange={set('scope')}>
          <option value="verified">Verified only</option>
          <option value="all">All submitted</option>
        </select>
      </label>
      <label>Accident Type
        <select value={filters.typeId} onChange={set('typeId')}>
          <option value="">All types</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Location
        <input type="search" value={filters.location} onChange={set('location')} placeholder="Barangay / municipality" />
      </label>
    </div>
  );
}

function Sparkline({ current, previous }) {
  const W = 120, H = 54, all = [...current, ...previous];
  const lo = Math.min(...all) * 0.9, hi = Math.max(...all, 1);
  const pts = (a) => a.map((v, i) => `${(i * W / 11).toFixed(1)},${(H - 4 - ((v - lo) / ((hi - lo) || 1)) * (H - 10)).toFixed(1)}`).join(' L');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`M0,${H} L${pts(previous)} L${W},${H}Z`} fill="#4a78b5" opacity=".45" />
      <path d={`M${pts(current)}`} fill="none" stroke="#f59e0b" strokeWidth="2" />
    </svg>
  );
}

export function YoyBadge({ value }) {
  if (value === null || value === undefined) return <span className="ad-yoy ad-na">— no comparison</span>;
  const down = value < 0;
  return <span className={`ad-yoy ${down ? 'ad-dn' : 'ad-up'}`}>{down ? '▼' : '▲'} {Math.abs(value).toFixed(1)}% YoY</span>;
}

export function KpiCard({ title, kpi, series, loading, error }) {
  return (
    <div className="ad-card ad-kpi" role="group" aria-label={title}>
      <WidgetState loading={loading} error={error} empty={!kpi}>
        {kpi && (
          <>
            <div>
              <div className="ad-kl">{title}</div>
              <div className="ad-kv">{fmt(kpi.value)}</div>
              <YoyBadge value={kpi.yoy} />
            </div>
            {series && <Sparkline current={series.current} previous={series.previous} />}
          </>
        )}
      </WidgetState>
    </div>
  );
}

const PIPE = ['submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'resolved'];

export function StatusPipeline({ counts }) {
  const c = useThemeColors();
  return (
    <>
      <div className="ad-pipe">
        {PIPE.map((s) => (
          <div key={s} className="ad-step">
            <i style={{ background: c.status[s] }} />
            <b>{fmt(counts[s])}</b><small>{label(s)}</small>
          </div>
        ))}
      </div>
      <div className="ad-side">
        <span>Needs clarification: <b>{fmt(counts.needs_clarification)}</b></span>
        <span>Rejected: <b>{fmt(counts.rejected)}</b></span>
      </div>
    </>
  );
}

export function DonutCard({ data, colors, name }) {
  const items = Object.entries(data).map(([k, v], i) => ({ key: k, name: label(k), value: v, color: colors[k] || colors.__fallback[i % colors.__fallback.length] }));
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="ad-donut">
      <div className="ring" role="img" aria-label={`${name}: ${items.map((i) => `${i.name} ${i.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
              {items.map((i) => <Cell key={i.key} fill={i.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="ctr">{fmt(total)}</div>
      </div>
      <ul className="ad-lg">
        {items.map((i) => (
          <li key={i.key}><i style={{ background: i.color }} />{i.name} <b>{total ? ((i.value / total) * 100).toFixed(1) : 0}%</b></li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBarCard({ data }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div role="img" aria-label={`Bar chart: ${rows.map(([k, v]) => `${k} ${v}`).join(', ')}`}>
      {rows.map(([k, v]) => (
        <div className="ad-bar" key={k}>
          <span className="l" title={k}>{k}</span>
          <div className="tr"><div className="f" style={{ width: `${Math.max((v / max) * 85, 1)}%` }} /><b>{fmt(v)}</b></div>
        </div>
      ))}
    </div>
  );
}

const VEHICLE_ICONS = { Motorcycle: '🏍️', Tricycle: '🛺', Car: '🚗', Truck: '🚚', 'Bus/Jeepney': '🚌', Bicycle: '🚲', Other: '🚘', Unspecified: '❔' };

export function VehicleStrip({ data }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="ad-veh">
      {rows.map(([k, v]) => (
        <div key={k}><div className="ic" aria-hidden="true">{VEHICLE_ICONS[k] || '🚘'}</div><b>{fmt(v)}</b><small>{k}</small></div>
      ))}
    </div>
  );
}

// Serves both the waiting queue and the recent-submissions list; the waiting
// column only makes sense for the former.
export function NeedsAttentionTable({ rows, recent = false }) {
  const days = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
  return (
    <div className="ad-scroll">
      <table className="ad-tbl">
        <thead><tr><th>Reference</th><th>Type</th><th>Location</th><th>Status</th><th>Submitted</th>{!recent && <th>Waiting</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link to={`/reports/${r.id}`}>{r.report_reference}</Link></td>
              <td>{r.category_name || 'Uncategorized'}</td>
              <td>{r.location}</td>
              <td><span className={`badge badge-${r.status}`}>{label(r.status)}</span></td>
              <td>{new Date(r.created_at).toLocaleDateString()}</td>
              {!recent && <td>{days(r.created_at)}d</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
