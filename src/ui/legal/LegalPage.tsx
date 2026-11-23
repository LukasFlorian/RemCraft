/**
 * Legal page: Impressum, privacy policy (Datenschutzerklärung), notice that
 * RemCraft is not affiliated with RemNote, and the license.
 *
 * Operator details come from build-time variables (see `legalInfo.ts`). The
 * page is reachable without an account at `#/legal`.
 */
import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { isLegalInfoComplete, legalInfo, PRIVACY_VERSION } from './legalInfo';
import { t } from '@core/i18n';

/** Repository URL (source code, license). */
const REPO_URL = 'https://github.com/LukasFlorian/RemCraft';

/** Short notice that RemCraft is an independent project. */
export function RemNoteNotice(): ReactNode {
  return (
    <>
      {t(
        'RemCraft is an independent, non-commercial project. It is not affiliated with, endorsed or reviewed by RemNote or RemNote Inc. “RemNote” is a trademark of its owner; the name is only used to describe compatibility (e.g. importing RemNote files).',
      )}
    </>
  );
}

/** The legal page. */
export function LegalPage(): ReactNode {
  const info = legalInfo();
  const complete = isLegalInfoComplete(info);
  // Operator block reused in the Impressum and in the privacy policy.
  const operator = complete ? (
    <p>
      {info.name}
      {info.address.map((line) => (
        <span key={line}>
          <br />
          {line}
        </span>
      ))}
      <br />
      {t('Email:')} <a href={`mailto:${info.email}`}>{info.email}</a>
    </p>
  ) : (
    <p className="badge badge-danger legal-missing" data-testid="legal-missing">
      {t('The operator details have not been entered for this installation yet.')}
    </p>
  );
  const region = info.dataRegion || t('the region chosen when the project was set up');

  return (
    <div className="main-scroll">
      <div className="page legal-page">
        <div className="page-header">
          <h1>{t('Legal notice & privacy')}</h1>
        </div>

        <nav className="legal-toc">
          <a href="#impressum" onClick={(e) => jump(e, 'impressum')}>
            {t('Legal notice')}
          </a>
          <a href="#datenschutz" onClick={(e) => jump(e, 'datenschutz')}>
            {t('Privacy policy')}
          </a>
          <a href="#hinweise" onClick={(e) => jump(e, 'hinweise')}>
            {t('Notices & license')}
          </a>
        </nav>

        <section id="impressum" className="card legal-section">
          <h2>{t('Legal notice')}</h2>
          <p className="muted">{t('Information according to § 5 Digitale-Dienste-Gesetz (DDG)')}</p>
          {operator}
          <p>
            {t(
              'RemCraft is a private, non-commercial project. There are no ads, no payments and no tracking.',
            )}
          </p>
        </section>

        <section id="datenschutz" className="card legal-section">
          <h2>{t('Privacy policy')}</h2>
          <p className="muted">
            {t('Last updated:')} {PRIVACY_VERSION}
          </p>

          <h3>{t('1. Controller')}</h3>
          <p>
            {t(
              'The controller responsible for data processing under the General Data Protection Regulation (GDPR) is:',
            )}
          </p>
          {operator}

          <h3>{t('2. In short')}</h3>
          <ul>
            <li>{t('Without an account, all content stays in your browser only.')}</li>
            <li>
              {t(
                'With an account, your content is stored at Supabase for synchronisation and can only be accessed by you (and people you share it with).',
              )}
            </li>
            <li>{t('There are no analytics, tracking or advertising services and no cookies.')}</li>
            <li>
              {t(
                'You can export everything at any time and delete your account with all data yourself (Settings → Account & Sync).',
              )}
            </li>
          </ul>

          <h3>{t('3. Hosting of the web app')}</h3>
          <p>
            {t(
              'The app is served via GitHub Pages (GitHub B.V., Netherlands / GitHub Inc., USA). When you open it, GitHub processes technically necessary data such as IP address, time and browser identifier to deliver the page and protect it against abuse. The legal basis is our legitimate interest in secure delivery (Art. 6(1)(f) GDPR). GitHub is certified under the EU-US Data Privacy Framework. Details:',
            )}{' '}
            <a
              href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement"
              target="_blank"
              rel="noreferrer"
            >
              {t('GitHub privacy statement')}
            </a>
            .
          </p>

          <h3>{t('4. Storage on your device')}</h3>
          <p>
            {t(
              'Notes, flashcards, learning progress and settings are stored in your browser (IndexedDB, localStorage) so the app works offline; a service worker keeps the app files. This storage is strictly necessary for the service you requested (§ 25(2) no. 2 TDDDG). You can remove it at any time via the browser settings or “Sign out & clear local data”.',
            )}
          </p>

          <h3>{t('5. Account and synchronisation (optional)')}</h3>
          <p>
            {t(
              'When you create an account, we process your email address, a password (stored only as a hash) or, when signing in with GitHub, the account ID and email address provided by GitHub, as well as the content you create in RemCraft (notes, files such as PDFs and images, flashcards, learning history, settings). The purpose is synchronisation between your devices and backing up your content; the legal basis is the performance of the user agreement (Art. 6(1)(b) GDPR).',
            )}
          </p>
          <p>
            {t('The data is stored by Supabase Inc. (USA) as a processor in')} {region}{' '}
            {t(
              ". Supabase encrypts the data in transit and at rest; access is restricted to your account by access rules. Any transfers to the USA are covered by the European Commission's standard contractual clauses. Details:",
            )}{' '}
            <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">
              {t('Supabase privacy policy')}
            </a>
            .
          </p>

          <h3>{t('6. Sharing')}</h3>
          <p>
            {t(
              'When you create a read-only link, the selected content can be accessed by anyone who knows the link (even without an account) until you delete the link. With “Collaborate live”, invited members see the shared content and your email address. Learning progress is never shared.',
            )}
          </p>

          <h3>{t('7. AI features (optional)')}</h3>
          <p>
            {t(
              "The AI features use an API key that you enter yourself. It is only stored in your browser. When you use an AI feature, your browser sends the relevant content directly to the provider you chose (e.g. Anthropic or OpenAI); RemCraft does not receive this data. The provider's privacy policy applies.",
            )}
          </p>

          <h3>{t('8. Todoist (optional)')}</h3>
          <p>
            {t(
              'If you set up the Todoist integration, your Todoist token is stored in the database (not readable by clients). A server function uses it to create daily study tasks (course name, number of cards, estimated duration) in your Todoist account (Doist Inc.). You can remove the integration at any time.',
            )}
          </p>

          <h3>{t('9. Embedded videos')}</h3>
          <p>
            {t(
              'If you embed a video from YouTube (in privacy-enhanced mode) or Vimeo, your browser loads content from these providers when it is shown; among other things, your IP address and the page you are viewing are transmitted to them.',
            )}
          </p>

          <h3>{t('10. Retention')}</h3>
          <p>
            {t(
              'Content is stored until you delete it or your account. When the account is deleted, your synchronised content, files, read-only links and integrations are removed from the server; copies that others cloned from your links or received in shared spaces belong to those people.',
            )}
          </p>

          <h3>{t('11. Your rights')}</h3>
          <p>
            {t(
              'You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20, e.g. via the export) and to object to processing based on legitimate interests (Art. 21). Please contact the address above. You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR).',
            )}
          </p>
        </section>

        <section id="hinweise" className="card legal-section">
          <h2>{t('Notices & license')}</h2>
          <p data-testid="remnote-notice">
            <RemNoteNotice />
          </p>
          <p>
            {t(
              'The app is provided without warranty. Please export important content regularly (Settings → Import, Export & Data).',
            )}
          </p>
          <p>
            {t('The source code is available under the')}{' '}
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              {t('MIT license')}
            </a>{' '}
            {t('on')}{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              {t('GitHub')}
            </a>
            {t('. Open-source libraries used are under their own licenses.')}
          </p>
          <p>
            <Link to="/">{t('Back to the app')}</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

/**
 * Scrolls to a section without touching the hash (the router uses it).
 *
 * Args:
 *   e: Click event of the link.
 *   id: Element id of the section.
 */
function jump(e: MouseEvent, id: string): void {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
