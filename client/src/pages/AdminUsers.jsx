import { useEffect, useState } from 'react';
import api from '../services/api';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  useEffect(() => {
    const params = {};
    if (roleFilter) params.role = roleFilter;
    if (activeFilter !== '') params.is_active = activeFilter;
    api.get('/users', { params }).then(res => { setUsers(res.data); setLoading(false); }).catch(() => setLoading(false));
  }, [roleFilter, activeFilter]);

  const toggleActive = async (user) => {
    try {
      await api.patch(`/users/${user.id}`, { is_active: user.is_active ? 0 : 1 });
      setUsers(users.map(u => u.id === user.id ? { ...u, is_active: u.is_active ? 0 : 1 } : u));
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed');
    }
  };

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="container">
      <div className="page-title"><h1>User Management</h1></div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="status-filter">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="reporter">Reporter</option>
            <option value="admin">Admin</option>
            <option value="traffic_officer">Traffic Officer</option>
          </select>
          <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
      </div>

      <div className="card">
        {users.length === 0 ? <p style={{ color: 'hsl(var(--text-3))' }}>No users found.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                  <td>{u.phone || '-'}</td>
                  <td><span className={`badge badge-${u.is_active ? 'resolved' : 'rejected'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} onClick={() => toggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
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
