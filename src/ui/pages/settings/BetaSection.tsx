/**
 * Beta programme: explains the beta app, lists the features only it has and
 * switches between the stable and the beta app.
 */
import type { ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';
import { betaFeatures } from '@core/release/features';
import { selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { CHANNEL, otherChannelUrl } from '../../app/channel';
import { Switch } from '../../components/Controls';

/** Where beta testers report problems. */
export const FEEDBACK_URL =
  'https://github.com/LukasFlorian/RemCraft/issues/new?labels=beta&title=%5BBeta%5D%20';

/** Beta settings. */
export function BetaSection(): ReactNode {
  const app = useApp();
  const settings = useSelector(selectSettings);
  const features = betaFeatures();
  return (
    <div className="card col" style={{ gap: 14 }}>
      <h2 className="card-title row" style={{ gap: 8 }}>
        <FlaskConical size={18} /> Beta-Version
        {CHANNEL === 'beta' && <span className="badge badge-beta">Du nutzt die Beta</span>}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        Die Beta-Version enthält neue Funktionen, sobald die automatischen Tests bestanden sind –
        noch bevor Menschen sie ausprobiert haben. Sie kann Fehler enthalten. Deine Daten sind
        dieselben (gleiches Konto, gleiche Synchronisierung); ohne Konto hat die Beta einen eigenen,
        leeren Speicher auf diesem Gerät.
      </p>
      {features.length > 0 ? (
        <div className="col" style={{ gap: 6 }}>
          <strong>Gerade in der Beta:</strong>
          <ul className="beta-features">
            {features.map((f) => (
              <li key={f.name}>
                <strong>{f.title}</strong> – {f.description}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="faint" style={{ margin: 0 }}>
          Gerade gibt es keine Funktionen, die nur in der Beta sind.
        </p>
      )}
      <Switch
        checked={Boolean(settings.betaTester)}
        onChange={(v) => app.settings.update({ betaTester: v })}
        label="Ich teste Beta-Funktionen (Link zur Beta in der Seitenleiste)"
      />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <a className="btn btn-primary" href={otherChannelUrl()}>
          {CHANNEL === 'beta' ? 'Zur stabilen Version' : 'Beta öffnen'}
        </a>
        {CHANNEL === 'beta' && (
          <a className="btn" href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            Fehler melden
          </a>
        )}
      </div>
    </div>
  );
}
