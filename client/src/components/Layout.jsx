import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', roles: ['reporter','admin','traffic_officer'] },
    { to: '/reports', label: 'Reports', roles: ['reporter','admin','traffic_officer'] },
    { to: '/map', label: 'Map', roles: ['reporter','admin','traffic_officer'] },
    { to: '/notifications', label: 'Notifications', roles: ['reporter','admin','traffic_officer'] },
    { to: '/officer', label: 'Officer', roles: ['traffic_officer','admin'] },
    { to: '/admin', label: 'Admin', roles: ['admin'] },
  ];

  const visibleNav = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="app-shell">
      <nav className="navbar">
        <div><strong>Road Accident Reporting</strong></div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {visibleNav.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}>
              {item.label}
            </NavLink>
          ))}
          <NotificationBell />
          <ThemeToggle />
          <span style={{ color: 'hsl(var(--text-3))', fontSize: '0.875rem' }}>{user?.name} ({user?.role})</span>
          <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
