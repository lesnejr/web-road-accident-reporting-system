import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useThemeColors } from '../theme';

const NoData = () => (
  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-3))' }}>
    No data
  </div>
);

// Recharts defaults to a white tooltip box, which is unreadable on the dark theme.
const TOOLTIP = {
  contentStyle: {
    backgroundColor: 'hsl(var(--surface-2))',
    border: '1px solid hsl(var(--line) / var(--line-strong-alpha))',
    borderRadius: '0.5rem',
    color: 'hsl(var(--text-1))',
    fontSize: '0.8125rem'
  },
  labelStyle: { color: 'hsl(var(--text-1))' }
};

export function StatusBarChart({ data }) {
  const c = useThemeColors();
  if (!data || Object.keys(data).length === 0) return <NoData />;

  // Colour each bar with its own status token so the chart matches the badges.
  const chartData = Object.entries(data).map(([status, count]) => ({
    status: status.replace('_', ' '),
    count,
    color: c.status[status] || c.series[0]
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: c.muted, fontSize: 11 }} stroke={c.grid} allowDecimals={false} />
        <YAxis dataKey="status" type="category" width={140} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.grid} />
        <Tooltip {...TOOLTIP} cursor={{ fill: c.grid }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({ data }) {
  const c = useThemeColors();
  if (!data || Object.keys(data).length === 0) return <NoData />;

  const chartData = Object.entries(data).map(([name, value], i) => ({
    name, value, color: c.series[i % c.series.length]
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%" cy="50%"
          innerRadius={60} outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
          stroke="none"
        >
          {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
        </Pie>
        <Tooltip {...TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: '0.75rem', color: c.muted }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function InjuryStatusChart({ data }) {
  const c = useThemeColors();
  if (!data || Object.keys(data).length === 0) return <NoData />;

  const chartData = Object.entries(data).map(([status, count], i) => ({
    status: status.charAt(0).toUpperCase() + status.slice(1),
    count,
    color: c.series[i % c.series.length]
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%" cy="50%"
          innerRadius={60} outerRadius={100}
          paddingAngle={2}
          dataKey="count"
          nameKey="status"
          label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
          stroke="none"
        >
          {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
        </Pie>
        <Tooltip {...TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: '0.75rem', color: c.muted }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ data, period }) {
  const c = useThemeColors();
  if (!data || data.length === 0) return <NoData />;

  const chartData = [...data].reverse().map(d => ({
    period: d.period,
    total: d.count,
    submitted: d.submitted,
    verified: d.verified,
    resolved: d.resolved,
    rejected: d.rejected
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis dataKey="period" tick={{ fill: c.muted, fontSize: 10 }} stroke={c.grid} />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} stroke={c.grid} allowDecimals={false} />
        <Tooltip {...TOOLTIP} cursor={{ stroke: c.grid }} />
        <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
        <Line type="monotone" dataKey="total" stroke={c.accent} strokeWidth={2} dot={false} name="Total" />
        <Line type="monotone" dataKey="verified" stroke={c.green} strokeWidth={2} dot={false} name="Verified" />
        <Line type="monotone" dataKey="resolved" stroke={c.violet} strokeWidth={2} dot={false} name="Resolved" />
        <Line type="monotone" dataKey="rejected" stroke={c.red} strokeWidth={2} dot={false} name="Rejected" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SummaryCards({ total, pending, verified, closed }) {
  const cards = [
    { label: 'Total Reports', value: total, color: 'hsl(var(--accent))' },
    { label: 'Pending', value: pending, color: 'hsl(var(--level-moderate))' },
    { label: 'Verified', value: verified, color: 'hsl(var(--level-none))' },
    { label: 'Closed', value: closed, color: 'hsl(var(--level-violet))' }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
      {cards.map(card => (
        <div key={card.label} className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div className="numeric" style={{ fontSize: '2.25rem', fontWeight: 600, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
          <div className="muted" style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: '0.35rem' }}>{card.label}</div>
        </div>
      ))}
    </div>
  );
}
