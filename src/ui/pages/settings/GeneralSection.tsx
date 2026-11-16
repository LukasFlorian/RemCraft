/**
 * Appearance settings.
 */
import type { ReactNode } from 'react';
import type { Settings } from '@core/model/types';
import { selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { Field } from '../../components/Controls';

/** Theme and appearance. */
export function GeneralSection(): ReactNode {
  const app = useApp();
  const settings = useSelector(selectSettings);
  return (
    <div className="card col" style={{ gap: 16 }}>
      <h2 className="card-title">Appearance</h2>
      <Field group label="Theme">
        <div className="segmented" style={{ maxWidth: 360 }}>
          {(['dark', 'light', 'system'] as Settings['theme'][]).map((t) => (
            <button
              key={t}
              className={settings.theme === t ? 'active' : ''}
              onClick={() => app.settings.update({ theme: t })}
            >
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}
