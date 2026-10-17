import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState('');

  const fetch = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/notifications', { params: { page, limit: 20, unread: unreadOnly } });
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError('Notifications could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [page, unreadOnly]);

  const handleRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setData(d => ({ ...d, rows: d.rows.map(n => n.id === id ? { ...n, is_read: 1 } : n) }));
      setError('');
    } catch (err) {
      console.error(err);
      setError('The notification could not be marked as read.');
    }
  };

  const handleReadAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setData(d => ({ ...d, rows: d.rows.map(n => ({ ...n, is_read: 1 })) }));
      setError('');
    } catch (err) {
      console.error(err);
      setError('The notifications could not be marked as read.');
    }
  };

  const openReport = async (n) => {
    if (!n.is_read) await handleRead(n.id);
    navigate(`/reports/${n.report_id}`);
  };

  return (
    <div className="container">
      <div className="page-title card-head">
        <h1>Notifications</h1>
        <div className="card-actions">
          <label className="notif-filter">
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          {data.rows.some(n => !n.is_read) && <button className="btn btn-secondary" onClick={handleReadAll}>Mark all read</button>}
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="loading-state" role="status">Loading notifications…</p>
        ) : data.rows.length === 0 ? (
          <div className="empty-state">
            <strong>Nothing to read</strong>
            <span>Updates about your reports will appear here.</span>
          </div>
        ) : (
          <>
            <div className="notif-list">
              {data.rows.map(n => (
                <div
                  key={n.id}
                  className={`notif-row${n.is_read ? '' : ' is-unread'}${n.report_id ? ' is-clickable' : ''}`}
                  onClick={n.report_id ? () => openReport(n) : undefined}
                >
                  <div style={{ flex: 1 }}>
                    <div className="notif-msg">
                      {n.report_id ? (
                        <Link to={`/reports/${n.report_id}`} onClick={(e) => { e.stopPropagation(); if (!n.is_read) handleRead(n.id); }}>{n.message}</Link>
                      ) : n.message}
                    </div>
                    <div className="notif-meta">
                      {!n.is_read && <span className="notif-unread">Unread</span>}
                      {new Date(n.created_at).toLocaleString()}
                      {n.report_reference && <span style={{ marginLeft: '0.5rem' }}>• {n.report_reference}</span>}
                    </div>
                  </div>
                  {!n.is_read && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); handleRead(n.id); }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              ))}
            </div>
            {data.total > data.limit && (
              <div className="pager">
                <button className="btn btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading}>Previous</button>
                <span>Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
                <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={data.page * data.limit >= data.total || loading}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
