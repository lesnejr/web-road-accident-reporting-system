import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/Modal';
import api from '../services/api';

const ROLES = [
  { value: 'reporter', label: 'Reporter' },
  { value: 'traffic_officer', label: 'Traffic Officer' },
  { value: 'admin', label: 'Admin' }
];

const emptyAccount = { name: '', email: '', password: '', role: 'reporter', phone: '' };

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [account, setAccount] = useState(emptyAccount);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [busyConfirm, setBusyConfirm] = useState(false);

  const load = async () => {
    const params = {};
    if (roleFilter) params.role = roleFilter;
    if (activeFilter !== '') params.is_active = activeFilter;
    try {
      const res = await api.get('/users', { params });
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Users could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [roleFilter, activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const createAccount = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    setNotice('');
    try {
      await api.post('/users', account);
      setNotice(`Account created for ${account.email}. Share the password with them through a private channel.`);
      setAccount(emptyAccount);
      await load();
    } catch (err) {
      const fields = err.response?.data?.error?.fields;
      setError(fields ? `${err.response.data.error.message}: ${Object.values(fields).join('; ')}` : err.response?.data?.error?.message || 'The account could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const changeRole = (target, role) => {
    if (role === target.role) return;
    setConfirmState({
      title: 'Change role',
      message: `Change ${target.name}'s role from ${target.role.replace(/_/g, ' ')} to ${role.replace(/_/g, ' ')}?`,
      confirmLabel: 'Change role',
      run: async () => {
        setBusyId(target.id);
        setError('');
        setNotice('');
        try {
          await api.patch(`/users/${target.id}/role`, { role });
          setUsers(users.map(u => (u.id === target.id ? { ...u, role } : u)));
          setNotice(`Role updated for ${target.email}.`);
        } catch (err) {
          setError(err.response?.data?.error?.message || 'The role could not be changed.');
        } finally {
          setBusyId(null);
        }
      }
    });
  };

  const toggleActive = (target) => {
    const deactivating = Boolean(target.is_active);
    const run = async () => {
      setBusyId(target.id);
      setError('');
      setNotice('');
      try {
        await api.patch(`/users/${target.id}`, { is_active: deactivating ? 0 : 1 });
        setUsers(users.map(u => (u.id === target.id ? { ...u, is_active: deactivating ? 0 : 1 } : u)));
        setNotice(`${target.name} is now ${deactivating ? 'inactive' : 'active'}.`);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'The account could not be updated.');
      } finally {
        setBusyId(null);
      }
    };
    if (!deactivating) { run(); return; }
    setConfirmState({
      title: 'Deactivate account',
      message: `Deactivate ${target.name}? They will not be able to sign in until an admin reactivates the account.`,
      confirmLabel: 'Deactivate',
      run
    });
  };

  const runConfirmed = async () => {
    if (!confirmState) return;
    setBusyConfirm(true);
    try { await confirmState.run(); } finally { setBusyConfirm(false); setConfirmState(null); }
  };

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="container">
      <div className="page-title"><h1>User Management</h1></div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Create account</h3>
        <p className="muted">Staff accounts are created here. Public visitors register themselves from the registration page and can only be reporters.</p>
        <form onSubmit={createAccount}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="new-name">Full name *</label>
              <input id="new-name" type="text" value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })} required minLength={2} />
            </div>
            <div className="form-group">
              <label htmlFor="new-email">Email *</label>
              <input id="new-email" type="email" value={account.email} onChange={e => setAccount({ ...account, email: e.target.value })} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="new-password">Temporary password *</label>
              <input id="new-password" type="password" value={account.password} onChange={e => setAccount({ ...account, password: e.target.value })} required minLength={8} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label htmlFor="new-role">Role *</label>
              <select id="new-role" value={account.role} onChange={e => setAccount({ ...account, role: e.target.value })}>
                {ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="new-phone">Phone</label>
              <input id="new-phone" type="tel" value={account.phone} onChange={e => setAccount({ ...account, phone: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create account'}</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="status-filter">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="">All Roles</option>
            {ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
          <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} aria-label="Filter by account status">
            <option value="">All Status</option>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
      </div>

      <div className="card">
        {users.length === 0 ? <p style={{ color: 'hsl(var(--text-3))' }}>No users found.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td data-label="Name">{u.name}{u.id === currentUser.id ? ' (you)' : ''}</td>
                  <td data-label="Email">{u.email}</td>
                  <td data-label="Role">
                    <select value={u.role} onChange={e => changeRole(u, e.target.value)} disabled={busyId === u.id || u.id === currentUser.id} aria-label={`Role of ${u.name}`}>
                      {ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                    </select>
                  </td>
                  <td data-label="Phone">{u.phone || '-'}</td>
                  <td data-label="Status"><span className={`badge badge-${u.is_active ? 'resolved' : 'rejected'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td data-label="Created">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td data-label="Actions">
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      onClick={() => toggleActive(u)} disabled={busyId === u.id || u.id === currentUser.id}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        busy={busyConfirm}
        onConfirm={runConfirmed}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
