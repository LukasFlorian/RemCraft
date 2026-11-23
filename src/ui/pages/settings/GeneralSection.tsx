/**
 * Appearance settings: language and theme.
 */
import type { ReactNode } from 'react';
import type { Settings } from '@core/model/types';
import { lang, t as tr } from '@core/i18n';
import type { Lang } from '@core/i18n';
import { selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { Field } from '../../components/Controls';
import { switchLanguage } from '../../app/LanguageSync';

/** Theme labels (translated at render time). */
const THEMES: { id: Settings['theme']; label: () => string }[] = [
  { id: 'dark', label: () => tr('Dark') },
  { id: 'light', label: () => tr('Light') },
  { id: 'system', label: () => tr('System') },
];

/** Languages, each named in itself. */
const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];

/** Language and theme. */
export function GeneralSection(): ReactNode {
  const app = useApp();
  const settings = useSelector(selectSettings);
  return (
    <div className="card col" style={{ gap: 16 }}>
      <h2 className="card-title">{tr('Appearance')}</h2>
      <Field group label={tr('Language')}>
        <div
          className="segmented"
          style={{ maxWidth: 360 }}
          role="radiogroup"
          aria-label="Language / Sprache"
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={lang() === l.id}
              className={lang() === l.id ? 'active' : ''}
              onClick={() => switchLanguage(app, l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="faint" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
          {tr('Applies to all your devices; the app reloads once.')}
        </p>
      </Field>
      <Field group label={tr('Theme')}>
        <div className="segmented" style={{ maxWidth: 360 }}>
          {THEMES.map((th) => (
            <button
              key={th.id}
              className={settings.theme === th.id ? 'active' : ''}
              onClick={() => app.settings.update({ theme: th.id })}
            >
              {th.label()}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}
