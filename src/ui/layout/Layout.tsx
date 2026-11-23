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
import { useHabitReminders } from '../habits/useHabitReminders';
import { useLocalState } from '../hooks/useLocalState';
import { CaretPopup } from '../editor/CaretPopup';
import { EditToolbar } from '../editor/EditToolbar';
import { WhatsNew } from '../whatsnew/WhatsNew';
import { GlobalModals } from '../pages/GlobalModals';
import { Sidebar } from './Sidebar';
import { FileDropLayer } from '../import/fileDrop';
import { feature } from '../app/channel';
import { t } from '@core/i18n';
import { LanguageSync } from '../app/LanguageSync';

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

  useHabitReminders();
  useHotkeys(
    {
      'mod+k': (e) => {
        e.preventDefault();
        modals.open({ kind: 'search' });
      },
      'mod+shift+h': (e) => {
        e.preventDefault();
        // Find & replace in the open document (or everywhere).
        const id = /^\/rem\/([^/?#]+)/.exec(location.pathname)?.[1] ?? null;
        modals.open({ kind: 'replace', rootId: id });
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
  // Global undo/redo - unless a page or the outliner (selected blocks, the
  // practice screen) handles the key itself. Their listeners may run after
  // this one, so the decision waits until the key event has been dispatched.
  useHotkeys({
    'mod+z': (e) => {
      setTimeout(() => !e.defaultPrevented && app.store.undo(), 0);
    },
    'mod+shift+z': (e) => {
      setTimeout(() => !e.defaultPrevented && app.store.redo(), 0);
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
      {feature('fileDrop') && <FileDropLayer />}
      <LanguageSync />
      <main className="main">
        {
          <button
            className={`icon-btn floating-menu-btn${collapsed ? '' : ' mobile-only'}`}
            onClick={() => (window.innerWidth <= 860 ? setMobileOpen(true) : setCollapsed(false))}
            aria-label={t('Show sidebar')}
          >
            <MenuIcon size={18} />
          </button>
        }
        <Outlet />
      </main>
      <CaretPopup />
      <EditToolbar />
      <GlobalModals />
      <WhatsNew />
    </div>
  );
}
