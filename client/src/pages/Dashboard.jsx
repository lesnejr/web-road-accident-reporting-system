import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AdminDashboard from './AdminDashboard';

export default function Dashboard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Admins see the full dashboard below, so they need no report list here.
    if (user.role === 'admin') return;
    api.get('/reports')
      .then(res => setRecent(res.data.slice(0, 5)))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [user]);

  if (user.role === 'admin') return <AdminDashboard />;
  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="container">
      <div className="page-title">
        <h1>Dashboard</h1>
        <p>Welcome, {user?.name} ({user?.role})</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Recent Reports</h3>
          <Link to="/reports" className="btn btn-secondary">View All</Link>
        </div>
        {recent.length === 0 ? (
          <p style={{ color: 'hsl(var(--text-3))' }}>No reports yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>Location</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id}>
                  <td>{r.report_reference}</td>
                  <td><Link to={`/reports/${r.id}`}>{r.title}</Link></td>
                  <td>{r.location}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {user.role === 'reporter' && (
        <div className="card">
          <Link to="/reports/new" className="btn btn-primary">Report New Accident</Link>
        </div>
      )}
    </div>
  );
}
