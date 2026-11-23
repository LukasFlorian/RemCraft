/**
 * Settings: account & sync, appearance, flashcards, schedulers, import &
 * export, data, AI and keyboard shortcuts.
 */
import type { ReactNode } from 'react';
import { NavLink, useParams } from 'react-router';
import { AccountSection } from './AccountSection';
import { AiSection } from './AiSection';
import { BetaSection } from './BetaSection';
import { DataSection } from './DataSection';
import { FlashcardSection } from './FlashcardSection';
import { GeneralSection } from './GeneralSection';
import { IntegrationsSection } from './IntegrationsSection';
import { LectureSection } from './LectureSection';
import { SchedulerSection } from './SchedulerSection';
import { ShortcutsSection } from './ShortcutsSection';
import { t } from '@core/i18n';

const SECTIONS = [
  { id: 'account', label: t('Account & Sync'), render: () => <AccountSection /> },
  { id: 'general', label: t('Appearance'), render: () => <GeneralSection /> },
  { id: 'flashcards', label: t('Flashcards'), render: () => <FlashcardSection /> },
  { id: 'schedulers', label: t('Schedulers'), render: () => <SchedulerSection /> },
  { id: 'lectures', label: t('Lectures'), render: () => <LectureSection /> },
  { id: 'integrations', label: t('Integrations (Todoist)'), render: () => <IntegrationsSection /> },
  { id: 'data', label: t('Import, Export & Data'), render: () => <DataSection /> },
  { id: 'ai', label: t('AI (experimental)'), render: () => <AiSection /> },
  { id: 'shortcuts', label: t('Keyboard shortcuts'), render: () => <ShortcutsSection /> },
  { id: 'beta', label: t('Beta version'), render: () => <BetaSection /> },
] as const;

/** The settings page. */
export function SettingsPage(): ReactNode {
  const { section = 'account' } = useParams();
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <div className="main-scroll">
      <div className="page page-wide">
        <div className="page-header">
          <h1>{t('Settings')}</h1>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav">
            {SECTIONS.map((s) => (
              <NavLink
                key={s.id}
                to={`/settings/${s.id}`}
                className={() => `nav-item${current.id === s.id ? ' active' : ''}`}
              >
                {s.label}
              </NavLink>
            ))}
          </nav>
          <div className="settings-content">{current.render()}</div>
        </div>
      </div>
    </div>
  );
}
