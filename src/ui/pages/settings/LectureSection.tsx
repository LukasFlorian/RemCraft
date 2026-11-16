/**
 * Lecture-mode settings (Fokus ⚙ and `config.toml`).
 */
import type { ReactNode } from 'react';
import type { LectureSettings } from '@core/model/types';
import { selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { Field, Switch } from '../../components/Controls';
import { useLectureSettings } from '../../lecture/useLecture';

/** Lecture settings. */
export function LectureSection(): ReactNode {
  const app = useApp();
  const cfg = useLectureSettings();
  const settings = useSelector(selectSettings);
  const set = (patch: Partial<LectureSettings>): void => app.settings.update({ lecture: { ...settings.lecture, ...patch } });
  const num = (label: string, key: keyof LectureSettings, hint: string, step = 1): ReactNode => (
    <Field label={label} hint={hint}>
      <input className="input" type="number" step={step} value={cfg[key] as number} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<LectureSettings>)} />
    </Field>
  );
  return (
    <div className="card col" style={{ gap: 16 }}>
      <h2 className="card-title">Vorlesungen</h2>
      <Switch checked={cfg.trackAway} onChange={(v) => set({ trackAway: v })} label="Zeit außerhalb der App messen (anderer Tab, anderes Programm, Laptop zu)" />
      <div className="grid-3">
        {num('Kurz-Check alle … Minuten', 'checkinMinutes', '0 = aus; Abruf aus dem Gedächtnis hält die Aufmerksamkeit (Szpunar et al. 2013).')}
        {num('Wechsel ignorieren unter … s', 'awayMinSeconds', 'Kürzere Wechsel zählen nicht.')}
        {num('„Willkommen zurück“ ab … s', 'welcomeBackSeconds', 'Banner nach längerer Abwesenheit.')}
        {num('Folie „übersprungen“ unter … s', 'minDwellSeconds', 'Kürzere Besuche zählen nicht als besprochen.')}
        {num('Verpasst ab … s außerhalb', 'missedMinSeconds', '→ Nacharbeiten')}
        {num('… oder Anteil außerhalb', 'missedRatio', '0.3 = 30 % der Folienzeit', 0.05)}
        {num('Lange erklärt ab … s ohne Notiz', 'longDwellSeconds', '(und ≥ 1,5 × Median) → Nacharbeiten')}
      </div>
    </div>
  );
}
