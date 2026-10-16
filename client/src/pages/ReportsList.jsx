import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function ReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || '';

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = status ? { status } : {};
        const res = await api.get('/reports', { params });
        setReports(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [status]);

  const handleStatusChange = (newStatus) => {
    setSearchParams({ status: newStatus || '' });
  };

  // CSV is fetched with the auth header and saved as a blob so the token never appears in a URL.
  const downloadCsv = async () => {
    try {
      const res = await api.get('/summaries/reports/export?format=csv', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accident-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    }
  };

  const statusOptions = ['submitted','under_review','needs_clarification','verified','assigned','in_progress','resolved','rejected'];

  return (
    <div className="container">
      <div className="page-title">
        <h1>Reports</h1>
        {user.role === 'reporter' && <Link to="/reports/new" className="btn btn-primary">New Report</Link>}
      </div>

      <div className="card">
        <div className="status-filter">
          <select value={status} onChange={e => handleStatusChange(e.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          {user.role === 'admin' && (
            <button type="button" onClick={downloadCsv} className="btn btn-secondary">Export CSV</button>
          )}
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : reports.length === 0 ? (
          <p style={{ color: 'hsl(var(--text-3))' }}>No reports found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>Location</th>
                <th>Category</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td>{r.report_reference}</td>
                  <td><Link to={`/reports/${r.id}`}>{r.title}</Link></td>
                  <td>{r.location}</td>
                  <td>{r.category_name || '-'}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/reports/${r.id}`} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
