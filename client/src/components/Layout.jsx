import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { currentSectionLabel, isItemActive, navSections } from '../services/navigation';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

// Inline icons keep the rail dependency-free. Same stroke style as the rest of
// the app (24px grid, 1.7 stroke).
const ICONS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  reports: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h6',
  plus: 'M12 5v14M5 12h14',
  officer: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM22 21v-2a4 4 0 00-3-3.87M15.5 3.13a4 4 0 010 7.75',
  audit: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 12h6M9 16h6',
  map: 'M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zM12 11a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  menu: 'M3 6h18M3 12h18M3 18h18',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6'
};

function NavIcon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Persisted the same way as the theme and basemap choices.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1');
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // The drawer never stays open across a navigation.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // Escape closes the drawer; Tab cycles inside it while it is open, so the
  // page behind a modal drawer is not reachable by keyboard.
  useEffect(() => {
    if (!navOpen) return;
    const sidebar = document.getElementById('app-nav');
    const focusables = () => Array.from(sidebar?.querySelectorAll('a[href], button:not([disabled])') || []);
    (focusables()[0] || sidebar)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const closeNav = () => {
    setNavOpen(false);
    menuButtonRef.current?.focus();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sections = navSections(user?.role);
  const headerTitle = currentSectionLabel(user?.role, location.pathname);

  return (
    <div className={`app-shell${collapsed ? ' is-nav-collapsed' : ''}`}>
      <aside id="app-nav" className={`sidebar${navOpen ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="nav-brand">
          <span className="nav-brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.officer} />
            </svg>
          </span>
          <span className="nav-brand-text">
            <strong>Road Accident Reporting</strong>
            <small>Traffic management</small>
          </span>
        </div>

        <nav className="nav-groups">
          {sections.map(section => (
            <div key={section.key} className="nav-group">
              <span className="nav-group-title">{section.title}</span>
              {section.items.map(item => {
                const active = isItemActive(item, location.pathname);
                return (
                  <Link
                    key={`${section.key}-${item.label}`}
                    to={item.to}
                    title={item.label}
                    className={`nav-link${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="nav-foot">
          <button
            type="button"
            className="nav-toggle nav-foot-toggle--collapse"
            onClick={() => setCollapsed(c => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <NavIcon name={collapsed ? 'chevronRight' : 'chevronLeft'} />
            <span className="nav-foot-label">Collapse</span>
          </button>
          <button
            type="button"
            className="nav-toggle nav-foot-toggle--drawer"
            onClick={closeNav}
          >
            <NavIcon name="chevronLeft" />
            <span className="nav-foot-label">Close</span>
          </button>
        </div>
      </aside>

      <button
        type="button"
        className={`nav-backdrop${navOpen ? ' is-open' : ''}`}
        onClick={closeNav}
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
      />

      <div className="app-main">
        <header className="app-header">
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-btn nav-menu-btn"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="app-nav"
            onClick={() => setNavOpen(true)}
          >
            <NavIcon name="menu" />
          </button>
          <span className="app-header-title">{headerTitle}</span>
          <span className="app-header-spacer" />
          <NotificationBell />
          <ThemeToggle />
          <span className="user-chip">
            <strong>{user?.name}</strong>
            <small>{user?.role?.replace(/_/g, ' ')}</small>
          </span>
          <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </header>
        <main className="container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
