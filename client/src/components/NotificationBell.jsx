import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function NotificationBell() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCount = async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setCount(res.data.count);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications', { params: { limit: 10 } });
      setNotifications(res.data.rows);
    } catch (err) {
      console.error(err);
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

  const handleRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(n => n.map(notif => notif.id === id ? { ...notif, is_read: 1 } : notif));
      fetchCount();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(n => n.map(notif => ({ ...notif, is_read: 1 })));
      fetchCount();
    } catch (err) {
      console.error(err);
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
          <div className="modal" style={{ maxWidth: '400px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Notifications</h3>
              {count > 0 && <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} onClick={handleReadAll}>Mark all read</button>}
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'hsl(var(--text-3))' }}>No notifications</div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.map(n => (
                  <div key={n.id} style={{ padding: '0.75rem', borderBottom: '1px solid hsl(var(--line) / var(--line-alpha))', background: n.is_read ? 'transparent' : 'hsl(var(--accent) / 0.12)', cursor: 'pointer' }} onClick={() => !n.is_read && handleRead(n.id)}>
                    <div style={{ fontWeight: n.is_read ? 'normal' : 'bold' }}>{n.message}</div>
                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-3))', marginTop: '0.25rem' }}>
                      {new Date(n.created_at).toLocaleString()}
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
