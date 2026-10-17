import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function OfficerReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/traffic-officer/reports')
      .then(res => { setReports(res.data); setLoading(false); })
      .catch((err) => {
        setError(err.response?.data?.error?.message || 'Your assigned reports could not be loaded.');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="container"><p className="loading-state" role="status">Loading your assigned reports…</p></div>;

  return (
    <div className="container">
      <div className="page-title">
        <h1>My Assigned Reports</h1>
        <p>Accident reports the administrator has assigned to you.</p>
      </div>

      <div className="card">
        {error ? <div className="alert alert-error" role="alert">{error}</div> : reports.length === 0 ? (
          <div className="empty-state">
            <strong>No assigned reports</strong>
            <span>Reports assigned to you will appear here.</span>
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>Reference</th><th>Title</th><th>Location</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td data-label="Reference">{r.report_reference}</td>
                  <td data-label="Title"><Link to={`/reports/${r.id}`}>{r.title}</Link></td>
                  <td data-label="Location">{r.location}</td>
                  <td data-label="Status"><span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                  <td data-label="Submitted">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td data-label="Actions"><Link to={`/reports/${r.id}`} className="btn btn-secondary btn-sm">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
