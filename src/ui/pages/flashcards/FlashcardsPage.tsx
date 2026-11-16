/**
 * Flashcards area with the tabs Home, Cards, Stats and Exams.
 */
import type { ReactNode } from 'react';
import { NavLink, useParams } from 'react-router';
import { CardsTab } from './CardsTab';
import { ExamsTab } from './ExamsTab';
import { HomeTab } from './HomeTab';
import { StatsTab } from './StatsTab';

/** The flashcards page. */
export function FlashcardsPage(): ReactNode {
  const { tab = 'home', examId } = useParams();
  const tabs = [
    { id: 'home', label: 'Home', to: '/flashcards' },
    { id: 'cards', label: 'Cards', to: '/flashcards/cards' },
    { id: 'stats', label: 'Stats', to: '/flashcards/stats' },
    { id: 'exams', label: 'Exams', to: '/flashcards/exams' },
  ];
  return (
    <div className="main-scroll">
      <div className="page page-wide">
        <div className="page-header">
          <h1>Flashcards</h1>
        </div>
        <nav className="tabs" style={{ marginBottom: 22 }}>
          {tabs.map((t) => (
            <NavLink
              key={t.id}
              to={t.to}
              end
              className={() => `tab${tab === t.id ? ' active' : ''}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        {tab === 'home' && <HomeTab />}
        {tab === 'cards' && <CardsTab />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'exams' && <ExamsTab examId={examId} />}
      </div>
    </div>
  );
}
