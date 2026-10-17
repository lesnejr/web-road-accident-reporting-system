import { useEffect, useState } from 'react';
import api from '../services/api';

export default function AdminAuditLogs() {
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ userId: '', action: '', entityType: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 50, ...filters };
      Object.keys(params).forEach(k => params[k] === '' && delete params[k]);
      const res = await api.get('/audit-logs', { params });
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error?.message || 'Audit logs could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filters.userId, filters.action, filters.entityType]);

  return (
    <div className="container">
      <div className="page-title"><h1>Audit Logs</h1></div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="status-filter">
          <input type="text" placeholder="User ID" value={filters.userId} onChange={e => setFilters({...filters, userId: e.target.value})} style={{ width: 'auto', minWidth: '150px' }} />
          <input type="text" placeholder="Action" value={filters.action} onChange={e => setFilters({...filters, action: e.target.value})} style={{ width: 'auto', minWidth: '150px' }} />
          <input type="text" placeholder="Entity Type" value={filters.entityType} onChange={e => setFilters({...filters, entityType: e.target.value})} style={{ width: 'auto', minWidth: '150px' }} />
          <button className="btn btn-secondary" onClick={() => setFilters({userId:'',action:'',entityType:''})}>Clear</button>
        </div>
      </div>

      <div className="card">
        {loading ? <div>Loading...</div> : error ? <div className="alert alert-error" role="alert">{error}</div> : data.rows.length === 0 ? <p style={{ color: 'hsl(var(--text-3))' }}>No audit logs.</p> : (
          <>
            <table className="table">
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>IP</th><th>Details</th></tr></thead>
              <tbody>
                {data.rows.map(log => (
                  <tr key={log.id}>
                    <td data-label="Time">{new Date(log.created_at).toLocaleString()}</td>
                    <td data-label="User">{log.user_name || log.user_email || 'System'}</td>
                    <td data-label="Action"><span className="badge badge-verified">{log.action}</span></td>
                    <td data-label="Entity">{log.entity_type}</td>
                    <td data-label="Entity ID">{log.entity_id || '-'}</td>
                    <td data-label="IP">{log.ip_address || '-'}</td>
                    <td data-label="Details"><pre style={{ fontSize: '0.75rem', maxHeight: '100px', overflow: 'auto' }}>{log.details ? JSON.stringify(log.details, null, 2) : ''}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading}>Previous</button>
              <span style={{ alignSelf: 'center' }}>Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
              <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={data.page * data.limit >= data.total || loading}>Next</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
