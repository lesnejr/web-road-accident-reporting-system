import { useEffect, useState } from 'react';
import api from '../services/api';
import { TrendLineChart } from '../components/Charts';

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'annual', label: 'Annual' }
];

const COLUMNS = ['submitted', 'under_review', 'needs_clarification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'];

export default function AdminSummaries() {
  const [period, setPeriod] = useState('monthly');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = { period };
    if (from) params.from = from;
    if (to) params.to = to;
    api.get('/summaries/reports/summaries', { params })
      .then(res => { if (active) setRows(res.data.data || []); })
      .catch(err => { if (active) setError(err.response?.data?.error?.message || 'The summary could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, from, to]);

  const totals = rows.reduce((acc, row) => {
    acc.count += Number(row.count) || 0;
    COLUMNS.forEach(column => { acc[column] += Number(row[column]) || 0; });
    return acc;
  }, { count: 0, ...Object.fromEntries(COLUMNS.map(column => [column, 0])) });

  const periodLabel = PERIODS.find(option => option.key === period)?.label.toLowerCase() || period;

  return (
    <div className="container">
      <div className="page-title">
        <h1>Report Summaries</h1>
        <p className="muted">
          Counts group public submissions and official records by the date they were submitted.
          Weekly periods use the database's YEARWEEK numbering.
        </p>
      </div>

      <div className="card">
        <div className="status-filter">
          <label htmlFor="summary-period">Period</label>
          <select id="summary-period" value={period} onChange={e => setPeriod(e.target.value)}>
            {PERIODS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <label htmlFor="summary-from">From</label>
          <input id="summary-from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <label htmlFor="summary-to">To</label>
          <input id="summary-to" type="date" value={to} onChange={e => setTo(e.target.value)} />
          {(from || to) && (
            <button type="button" className="btn btn-secondary" onClick={() => { setFrom(''); setTo(''); }}>
              Clear dates
            </button>
          )}
        </div>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        {loading ? (
          <div>Loading...</div>
        ) : rows.length === 0 ? (
          <p style={{ color: 'hsl(var(--text-3))' }}>No reports were submitted in this range.</p>
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <TrendLineChart data={rows} period={period} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Total</th>
                    {COLUMNS.map(column => <th key={column}>{column.replace(/_/g, ' ')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={String(row.period)}>
                      <td>{String(row.period)}</td>
                      <td>{row.count}</td>
                      {COLUMNS.map(column => <td key={column}>{row[column]}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total ({rows.length} {periodLabel} periods)</strong></td>
                    <td><strong>{totals.count}</strong></td>
                    {COLUMNS.map(column => <td key={column}><strong>{totals[column]}</strong></td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
