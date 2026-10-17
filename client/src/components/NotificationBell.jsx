import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchCount = async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setCount(res.data.count);
      setError('');
    } catch (err) {
      console.error(err);
      setError('The unread count could not be refreshed.');
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications', { params: { limit: 10 } });
      setNotifications(res.data.rows);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Notifications could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  // Escape closes the bell panel, like every other dialog in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(n => n.map(notif => notif.id === id ? { ...notif, is_read: 1 } : notif));
      setError('');
      fetchCount();
    } catch (err) {
      console.error(err);
      setError('The notification could not be marked as read.');
    }
  };

  const handleReadAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(n => n.map(notif => ({ ...notif, is_read: 1 })));
      setError('');
      fetchCount();
    } catch (err) {
      console.error(err);
      setError('The notifications could not be marked as read.');
    }
  };

  if (!user) return null;

  return (
    <div className="notification-bell" style={{ position: 'relative' }}>
      <button
        className="btn btn-secondary"
        onClick={() => setOpen(!open)}
        style={{ position: 'relative', padding: '0.5rem' }}
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'hsl(var(--level-severe))', color: 'hsl(var(--accent-ink))', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-label="Notifications" style={{ maxWidth: '400px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Notifications</h3>
              {count > 0 && <button className="btn btn-secondary btn-sm" onClick={handleReadAll}>Mark all read</button>}
            </div>
            {error && (
              <p role="alert" style={{ color: 'hsl(var(--level-severe))', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</p>
            )}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
            ) : notifications.length === 0 ? (
              error ? null : <div style={{ textAlign: 'center', padding: '2rem', color: 'hsl(var(--text-3))' }}>No notifications</div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.map(n => (
                  <div key={n.id} style={{ padding: '0.75rem', borderBottom: '1px solid hsl(var(--line) / var(--line-alpha))', background: n.is_read ? 'transparent' : 'hsl(var(--accent) / 0.12)', cursor: 'pointer' }} onClick={() => {
                    if (!n.is_read) handleRead(n.id);
                    if (n.report_id) { setOpen(false); navigate(`/reports/${n.report_id}`); }
                  }}>
                    <div style={{ fontWeight: n.is_read ? 'normal' : 'bold' }}>{n.message}</div>
                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-3))', marginTop: '0.25rem' }}>
                      {new Date(n.created_at).toLocaleString()}
                      {n.report_id && (
                        <>
                          {' · '}
                          <Link
                            to={`/reports/${n.report_id}`}
                            onClick={(e) => { e.stopPropagation(); setOpen(false); if (!n.is_read) handleRead(n.id); }}
                          >
                            Open report
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
