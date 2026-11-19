/**
 * Root component: boots the data layer and renders the router.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { RemCraftApp } from '@data/app';
import { DialogProvider } from '../components/Confirm';
import { ToastProvider } from '../components/Toast';
import { ControllerContext, EditorController } from '../editor/controller';
import { useTheme } from '../hooks/useTheme';
import { Layout } from '../layout/Layout';
import { DocumentPage } from '../pages/DocumentPage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { EditLaterPage } from '../pages/EditLaterPage';
import { FlashcardsPage } from '../pages/flashcards/FlashcardsPage';
import { PracticePage } from '../pages/practice/PracticePage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { LegalPage } from '../legal/LegalPage';
import { HabitsPage } from '../habits/HabitsPage';
import { HabitDetailPage } from '../habits/HabitDetailPage';
import { HabitStatsPage } from '../habits/HabitStatsPage';
import { feature } from './channel';
import { HandoutPage } from '../lecture/HandoutPage';
import { LecturePage } from '../lecture/LecturePage';
import { LecturesPage } from '../lecture/LecturesPage';
import { ReviewPage } from '../lecture/ReviewPage';
import { JoinSpacePage, SharedSnapshotPage } from '../sharing/SharedPages';
import { AppContext, useApp } from './context';
import { ModalProvider } from './modals';

/** Route table (hash routing works on any static host, e.g. GitHub Pages). */
const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DocumentsPage /> },
      { path: 'rem/:id', element: <DocumentPage /> },
      { path: 'today', element: <TodayRedirect /> },
      { path: 'edit-later', element: <EditLaterPage /> },
      { path: 'flashcards', element: <FlashcardsPage /> },
      { path: 'flashcards/:tab', element: <FlashcardsPage /> },
      { path: 'flashcards/:tab/:examId', element: <FlashcardsPage /> },
      { path: 'practice', element: <PracticePage /> },
      { path: 'lecture/:deckId', element: <LecturePage /> },
      { path: 'lectures', element: <LecturesPage /> },
      { path: 'lectures/:lectureId', element: <LecturesPage /> },
      { path: 'review/:deckId', element: <ReviewPage /> },
      { path: 'handout/:deckId', element: <HandoutPage /> },
      { path: 's/:token', element: <SharedSnapshotPage /> },
      { path: 'join/:token', element: <JoinSpacePage /> },
      { path: 'legal', element: <LegalPage /> },
      // Beta feature: only registered where it is enabled.
      ...(feature('habits')
        ? [
            { path: 'habits', element: <HabitsPage /> },
            { path: 'habits/stats', element: <HabitStatsPage /> },
            { path: 'habits/:habitId', element: <HabitDetailPage /> },
          ]
        : []),
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

/** Redirects to today's daily document. */
function TodayRedirect(): ReactNode {
  const app = useApp();
  return <Navigate to={`/rem/${app.rems.ensureDaily()}`} replace />;
}

/** Applies the theme (needs the app context). */
function ThemeSync(): null {
  useTheme();
  return null;
}

/** The application root. */
export function App(): ReactNode {
  const [app, setApp] = useState<RemCraftApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let created: RemCraftApp | null = null;
    RemCraftApp.create()
      .then((a) => {
        created = a;
        // Daily tasks (Todoist) link back to the practice screen of their course.
        a.integrations.practiceUrl = (id) =>
          `${window.location.origin}${window.location.pathname}#/practice?scope=${id}&mode=srs`;
        // Expose the app for debugging and end-to-end tests in development builds.
        if (import.meta.env.DEV) (window as unknown as { remcraft: RemCraftApp }).remcraft = a;
        setApp(a);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    return () => created?.dispose();
  }, []);

  // Make sure pending writes reach IndexedDB before the page goes away.
  useEffect(() => {
    if (!app) return;
    const flush = (): void => void app.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [app]);

  const controller = useMemo(() => (app ? new EditorController(app.store) : null), [app]);

  if (error) return <div className="loading-screen">Failed to start: {error}</div>;
  if (!app || !controller) return <div className="loading-screen">Loading RemCraft…</div>;
  return (
    <AppContext.Provider value={app}>
      <ControllerContext.Provider value={controller}>
        <ToastProvider>
          <DialogProvider>
            <ModalProvider>
              <ThemeSync />
              <RouterProvider router={router} />
            </ModalProvider>
          </DialogProvider>
        </ToastProvider>
      </ControllerContext.Provider>
    </AppContext.Provider>
  );
}
