import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Notifications() {
  const { user } = useAuth();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications', { params: { page, limit: 20, unread: unreadOnly } });
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [page, unreadOnly]);

  const handleRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setData(d => ({ ...d, rows: d.rows.map(n => n.id === id ? { ...n, is_read: 1 } : n) }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setData(d => ({ ...d, rows: d.rows.map(n => ({ ...n, is_read: 1 })) }));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container">
      <div className="page-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Notifications</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          {data.rows.some(n => !n.is_read) && <button className="btn btn-secondary" onClick={handleReadAll}>Mark all read</button>}
        </div>
      </div>

      <div className="card">
        {loading ? <div>Loading...</div> : data.rows.length === 0 ? (
          <p style={{ color: 'hsl(var(--text-3))', textAlign: 'center', padding: '2rem' }}>No notifications</p>
        ) : (
          <>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {data.rows.map(n => (
                <div key={n.id} style={{ padding: '1rem', borderBottom: '1px solid hsl(var(--line) / var(--line-alpha))', background: n.is_read ? 'transparent' : 'hsl(var(--accent) / 0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: n.is_read ? 'normal' : 'bold', marginBottom: '0.25rem' }}>{n.message}</div>
                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-3))' }}>
                      {new Date(n.created_at).toLocaleString()}
                      {n.report_reference && <span style={{ marginLeft: '0.5rem' }}>• {n.report_reference}</span>}
                    </div>
                  </div>
                  {!n.is_read && <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleRead(n.id)}>Mark read</button>}
                </div>
              ))}
            </div>
            {data.total > data.limit && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading}>Previous</button>
                <span style={{ alignSelf: 'center' }}>Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
                <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={data.page * data.limit >= data.total || loading}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
