/**
 * Lecture-mode settings (Fokus ⚙ and `config.toml`).
 */
import type { ReactNode } from 'react';
import type { LectureSettings } from '@core/model/types';
import { selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { Field, Switch } from '../../components/Controls';
import { useLectureSettings } from '../../lecture/useLecture';
import { t } from '@core/i18n';

/** Lecture settings. */
export function LectureSection(): ReactNode {
  const app = useApp();
  const cfg = useLectureSettings();
  const settings = useSelector(selectSettings);
  const set = (patch: Partial<LectureSettings>): void =>
    app.settings.update({ lecture: { ...settings.lecture, ...patch } });
  const num = (label: string, key: keyof LectureSettings, hint: string, step = 1): ReactNode => (
    <Field label={label} hint={hint}>
      <input
        className="input"
        type="number"
        step={step}
        value={cfg[key] as number}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<LectureSettings>)}
      />
    </Field>
  );
  return (
    <div className="card col" style={{ gap: 16 }}>
      <h2 className="card-title">{t('Lectures')}</h2>
      <Switch
        checked={cfg.trackAway}
        onChange={(v) => set({ trackAway: v })}
        label={t('Measure time outside the app (other tab, other program, laptop closed)')}
      />
      <div className="grid-3">
        {num(
          t('Quick check every … minutes'),
          'checkinMinutes',
          t('0 = off; retrieval from memory keeps attention up (Szpunar et al. 2013).'),
        )}
        {num(t('Ignore switches under … s'), 'awayMinSeconds', t('Shorter switches do not count.'))}
        {num(
          t('“Welcome back” after … s'),
          'welcomeBackSeconds',
          t('Banner after a longer absence.'),
        )}
        {num(
          t('Slide “skipped” under … s'),
          'minDwellSeconds',
          t('Shorter visits do not count as covered.'),
        )}
        {num(t('Missed after … s outside'), 'missedMinSeconds', '→ Nacharbeiten')}
        {num(t('… or share outside'), 'missedRatio', t('0.3 = 30 % of the slide time'), 0.05)}
        {num(
          t('Explained long after … s without a note'),
          'longDwellSeconds',
          '(und ≥ 1,5 × Median) → Nacharbeiten',
        )}
      </div>
    </div>
  );
}
