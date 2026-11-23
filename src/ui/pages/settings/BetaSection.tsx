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
import { t } from '@core/i18n';

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
        <FlaskConical size={18} /> {t('Beta version')}
        {CHANNEL === 'beta' && (
          <span className="badge badge-beta">{t('You are using the beta')}</span>
        )}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {t(
          'The beta version contains new features as soon as the automated tests pass – before people have tried them. It may contain bugs. Your data is the same (same account, same sync); without an account the beta has its own, empty storage on this device.',
        )}
      </p>
      {features.length > 0 ? (
        <div className="col" style={{ gap: 6 }}>
          <strong>{t('Currently in beta:')}</strong>
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
          {t('There are no beta-only features right now.')}
        </p>
      )}
      <Switch
        checked={Boolean(settings.betaTester)}
        onChange={(v) => app.settings.update({ betaTester: v })}
        label={t('I test beta features (link to the beta in the sidebar)')}
      />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <a className="btn btn-primary" href={otherChannelUrl()}>
          {CHANNEL === 'beta' ? t('Switch to the stable version') : t('Open beta')}
        </a>
        {CHANNEL === 'beta' && (
          <a className="btn" href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            {t('Report a bug')}
          </a>
        )}
      </div>
    </div>
  );
}
