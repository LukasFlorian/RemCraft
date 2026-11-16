/**
 * App shell: sidebar, main content area, global shortcuts and modals.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Menu as MenuIcon } from 'lucide-react';
import { useModals } from '../app/modals';
import { useApp } from '../app/context';
import { useHotkeys } from '../hooks/useHotkeys';
import { useLocalState } from '../hooks/useLocalState';
import { CaretPopup } from '../editor/CaretPopup';
import { EditToolbar } from '../editor/EditToolbar';
import { GlobalModals } from '../pages/GlobalModals';
import { Sidebar } from './Sidebar';

/** The application layout. */
export function Layout(): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const modals = useModals();
  const [collapsed, setCollapsed] = useLocalState('sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = useLocalState('sidebar.mobileOpen', false);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [location.pathname, setMobileOpen]);

  useHotkeys(
    {
      'mod+k': (e) => {
        e.preventDefault();
        modals.open({ kind: 'search' });
      },
      'mod+p': (e) => {
        e.preventDefault();
        modals.open({ kind: 'search' });
      },
      'mod+\\': (e) => {
        e.preventDefault();
        setCollapsed((c) => !c);
      },
      'alt+n': (e) => {
        e.preventDefault();
        const doc = app.rems.createDocument(null, '');
        navigate(`/rem/${doc.id}`);
      },
      'alt+f': (e) => {
        e.preventDefault();
        navigate('/practice?scope=global');
      },
    },
    { allowInInputs: true },
  );
  useHotkeys({
    'mod+z': (e) => {
      e.preventDefault();
      app.store.undo();
    },
    'mod+shift+z': (e) => {
      e.preventDefault();
      app.store.redo();
    },
  });

  return (
    <div
      className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' sidebar-open' : ''}`}
    >
      <Sidebar
        onCollapse={() => (window.innerWidth <= 860 ? setMobileOpen(false) : setCollapsed(true))}
        onNavigate={() => setMobileOpen(false)}
      />
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <main className="main">
        {
          <button
            className={`icon-btn floating-menu-btn${collapsed ? '' : ' mobile-only'}`}
            onClick={() => (window.innerWidth <= 860 ? setMobileOpen(true) : setCollapsed(false))}
            aria-label="Show sidebar"
          >
            <MenuIcon size={18} />
          </button>
        }
        <Outlet />
      </main>
      <CaretPopup />
      <EditToolbar />
      <GlobalModals />
    </div>
  );
}
