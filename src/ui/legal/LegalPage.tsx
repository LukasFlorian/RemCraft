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

/** Repository URL (source code, license). */
const REPO_URL = 'https://github.com/LukasFlorian/RemCraft';

/** Short notice that RemCraft is an independent project. */
export function RemNoteNotice(): ReactNode {
  return (
    <>
      RemCraft ist ein unabhängiges, nicht-kommerzielles Projekt und steht in keiner Verbindung zu
      RemNote oder der RemNote Inc. und wird von diesen weder unterstützt noch geprüft. „RemNote“
      ist eine Marke ihrer jeweiligen Inhaberin; der Name wird nur verwendet, um die Kompatibilität
      (z. B. Import von RemNote-Dateien) zu beschreiben.
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
      E-Mail: <a href={`mailto:${info.email}`}>{info.email}</a>
    </p>
  ) : (
    <p className="badge badge-danger legal-missing" data-testid="legal-missing">
      Die Angaben zum Betreiber wurden in dieser Installation noch nicht hinterlegt.
    </p>
  );
  const region = info.dataRegion || 'der beim Einrichten des Projekts gewählten Region';

  return (
    <div className="main-scroll">
      <div className="page legal-page">
        <div className="page-header">
          <h1>Impressum &amp; Datenschutz</h1>
        </div>

        <nav className="legal-toc">
          <a href="#impressum" onClick={(e) => jump(e, 'impressum')}>
            Impressum
          </a>
          <a href="#datenschutz" onClick={(e) => jump(e, 'datenschutz')}>
            Datenschutzerklärung
          </a>
          <a href="#hinweise" onClick={(e) => jump(e, 'hinweise')}>
            Hinweise &amp; Lizenz
          </a>
        </nav>

        <section id="impressum" className="card legal-section">
          <h2>Impressum</h2>
          <p className="muted">Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</p>
          {operator}
          <p>
            RemCraft ist ein privates, nicht-kommerzielles Projekt. Es gibt keine Werbung, keine
            Bezahlfunktionen und kein Tracking.
          </p>
        </section>

        <section id="datenschutz" className="card legal-section">
          <h2>Datenschutzerklärung</h2>
          <p className="muted">Stand: {PRIVACY_VERSION}</p>

          <h3>1. Verantwortlicher</h3>
          <p>
            Verantwortlich für die Datenverarbeitung im Sinne der Datenschutz-Grundverordnung
            (DSGVO) ist:
          </p>
          {operator}

          <h3>2. Kurz zusammengefasst</h3>
          <ul>
            <li>Ohne Konto bleiben alle Inhalte ausschließlich in deinem Browser.</li>
            <li>
              Mit Konto werden deine Inhalte zur Synchronisierung bei Supabase gespeichert und sind
              nur für dich (und Personen, mit denen du sie teilst) abrufbar.
            </li>
            <li>Es gibt keine Analyse-, Tracking- oder Werbedienste und keine Cookies.</li>
            <li>
              Du kannst alles jederzeit exportieren und dein Konto mit allen Daten selbst löschen
              (Einstellungen → Account &amp; Sync).
            </li>
          </ul>

          <h3>3. Bereitstellung der Web-App (Hosting)</h3>
          <p>
            Die App wird über GitHub Pages (GitHub B.V., Niederlande / GitHub Inc., USA)
            ausgeliefert. Beim Aufruf verarbeitet GitHub technisch notwendige Daten wie IP-Adresse,
            Zeitpunkt und Browserkennung, um die Seite auszuliefern und vor Missbrauch zu schützen.
            Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren Bereitstellung (Art.
            6 Abs. 1 lit. f DSGVO). GitHub ist unter dem EU-US Data Privacy Framework zertifiziert.
            Details:{' '}
            <a
              href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement"
              target="_blank"
              rel="noreferrer"
            >
              Datenschutzerklärung von GitHub
            </a>
            .
          </p>

          <h3>4. Speicherung auf deinem Gerät</h3>
          <p>
            Notizen, Karteikarten, Lernstand und Einstellungen werden in deinem Browser (IndexedDB,
            localStorage) gespeichert, damit die App offline funktioniert; ein Service Worker hält
            die App-Dateien vor. Diese Speicherung ist für den von dir gewünschten Dienst unbedingt
            erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst sie jederzeit über die
            Browser-Einstellungen oder „Abmelden &amp; lokale Daten löschen“ entfernen.
          </p>

          <h3>5. Konto und Synchronisierung (optional)</h3>
          <p>
            Wenn du ein Konto anlegst, verarbeiten wir deine E-Mail-Adresse, ein Passwort (nur als
            Hash gespeichert) bzw. bei Anmeldung mit GitHub die von GitHub übermittelte Kontokennung
            und E-Mail-Adresse, sowie die Inhalte, die du in RemCraft anlegst (Notizen, Dateien wie
            PDFs und Bilder, Karteikarten, Lernverlauf, Einstellungen). Zweck ist die
            Synchronisierung zwischen deinen Geräten und die Sicherung deiner Inhalte;
            Rechtsgrundlage ist die Erfüllung des Nutzungsverhältnisses (Art. 6 Abs. 1 lit. b
            DSGVO).
          </p>
          <p>
            Die Daten werden bei Supabase Inc. (USA) als Auftragsverarbeiter in {region}{' '}
            gespeichert. Supabase verschlüsselt die Daten bei der Übertragung und auf den
            Datenträgern; der Zugriff ist durch Zugriffsregeln auf dein Konto beschränkt. Für
            etwaige Übermittlungen in die USA gelten die Standardvertragsklauseln der EU-Kommission.
            Details:{' '}
            <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">
              Datenschutzerklärung von Supabase
            </a>
            .
          </p>

          <h3>6. Teilen</h3>
          <p>
            Wenn du einen Leselink erstellst, sind die gewählten Inhalte für jede Person abrufbar,
            die den Link kennt (auch ohne Konto), bis du den Link löschst. Bei „Live
            zusammenarbeiten“ sehen die eingeladenen Mitglieder die geteilten Inhalte und deine
            E-Mail-Adresse. Lernfortschritt wird nie geteilt.
          </p>

          <h3>7. KI-Funktionen (optional)</h3>
          <p>
            Die KI-Funktionen nutzen einen API-Schlüssel, den du selbst einträgst. Er wird nur in
            deinem Browser gespeichert. Wenn du eine KI-Funktion verwendest, sendet dein Browser die
            betroffenen Inhalte direkt an den von dir gewählten Anbieter (z. B. Anthropic oder
            OpenAI); RemCraft erhält diese Daten nicht. Es gilt die Datenschutzerklärung des
            jeweiligen Anbieters.
          </p>

          <h3>8. Todoist (optional)</h3>
          <p>
            Wenn du die Todoist-Integration einrichtest, wird dein Todoist-Token in der Datenbank
            gespeichert (für Clients nicht auslesbar). Eine Server-Funktion legt damit täglich
            Lernaufgaben (Kursname, Anzahl Karten, geschätzte Dauer) in deinem Todoist-Konto an
            (Doist Inc.). Du kannst die Integration jederzeit entfernen.
          </p>

          <h3>9. Eingebettete Videos</h3>
          <p>
            Bettest du ein Video von YouTube (im erweiterten Datenschutzmodus) oder Vimeo ein, lädt
            dein Browser beim Anzeigen Inhalte von diesen Anbietern; dabei werden ihnen u. a. deine
            IP-Adresse und die aufgerufene Seite übermittelt.
          </p>

          <h3>10. Speicherdauer</h3>
          <p>
            Inhalte werden gespeichert, bis du sie bzw. dein Konto löschst. Beim Löschen des Kontos
            werden deine synchronisierten Inhalte, Dateien, Leselinks und Integrationen vom Server
            entfernt; Kopien, die andere über deine Links geklont oder in gemeinsamen Bereichen
            erhalten haben, gehören diesen Personen.
          </p>

          <h3>11. Deine Rechte</h3>
          <p>
            Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art.
            17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20, z. B. über
            den Export) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen
            (Art. 21). Wende dich dazu an die oben genannte Adresse. Außerdem kannst du dich bei
            einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).
          </p>
        </section>

        <section id="hinweise" className="card legal-section">
          <h2>Hinweise &amp; Lizenz</h2>
          <p data-testid="remnote-notice">
            <RemNoteNotice />
          </p>
          <p>
            Die App wird ohne Gewähr bereitgestellt. Bitte exportiere wichtige Inhalte regelmäßig
            (Einstellungen → Import, Export &amp; Data).
          </p>
          <p>
            Der Quellcode steht unter der{' '}
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              MIT-Lizenz
            </a>{' '}
            auf{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            . Verwendete Open-Source-Bibliotheken stehen unter ihren eigenen Lizenzen.
          </p>
          <p>
            <Link to="/">Zurück zur App</Link>
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
