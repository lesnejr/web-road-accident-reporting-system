import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AdminDashboard from './AdminDashboard';

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const notice = location.state?.notice;
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Admins see the full dashboard below, so they need no report list here.
    if (user.role === 'admin') return;
    api.get('/reports')
      .then(res => setRecent(res.data.slice(0, 5)))
      .catch(err => {
        console.error(err);
        setError('Your recent reports could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (user.role === 'admin') return <AdminDashboard />;

  return (
    <div className="container">
      <div className="page-title">
        <h1>Dashboard</h1>
        <p>Welcome back, {user?.name} · {user?.role?.replace(/_/g, ' ')}</p>
      </div>

      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="card card-actions">
        {user.role === 'reporter' && (
          <Link to="/reports/new" className="btn btn-primary">Report an accident</Link>
        )}
        {user.role === 'traffic_officer' && (
          <Link to="/officer" className="btn btn-primary">My assigned reports</Link>
        )}
        <Link to="/reports" className="btn btn-secondary">View all reports</Link>
        <Link to="/map" className="btn btn-secondary">Accident map</Link>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Recent reports</h3>
          <Link to="/reports" className="btn btn-secondary">View all</Link>
        </div>
        {loading ? (
          <p className="loading-state" role="status">Loading your reports…</p>
        ) : error ? (
          <div className="alert alert-error" role="alert">{error}</div>
        ) : recent.length === 0 ? (
          <div className="empty-state">
            <strong>No reports yet</strong>
            <span>Reports you file will appear here with their latest status.</span>
            {user.role === 'reporter' && (
              <Link to="/reports/new" className="btn btn-primary">Report an accident</Link>
            )}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>Location</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id}>
                  <td data-label="Reference">{r.report_reference}</td>
                  <td data-label="Title"><Link to={`/reports/${r.id}`}>{r.title}</Link></td>
                  <td data-label="Location">{r.location}</td>
                  <td data-label="Status"><span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                  <td data-label="Submitted">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
