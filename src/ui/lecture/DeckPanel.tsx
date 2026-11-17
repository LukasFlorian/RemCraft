/**
 * Header of a slide-deck document: open the slides / start a lecture,
 * import and export card files (`*.cards.json` + RemNote), the Claude skill
 * that writes them, export for AI,
 * handout, review and analysis.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Sparkles,
  BarChart3,
  Download,
  FileJson,
  ListChecks,
  Play,
  Presentation,
  Printer,
  Upload,
} from 'lucide-react';
import type { CardFileDoc } from '@core/lecture/cardFile';
import { CARD_FILE_SUFFIX, exportCardFile } from '@core/lecture/cardFile';
import type { RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { exportForAi } from '@data/lecture/context';
import { useApp, useSelector } from '../app/context';
import { SkillDownloadLink } from './SkillDownloadLink';
import { useToast } from '../components/Toast';
import { downloadText, pickFiles } from '../hooks/useFilePicker';
import { useDeckSlides, useUpToDateTitles } from './useSlides';
import { SlideView } from './SlideView';

/** Imports a card file into a deck and reports the result. */
export async function importCardFile(
  app: ReturnType<typeof useApp>,
  file: File,
  deckId: RemId | undefined,
  toast: (m: string, k?: 'info' | 'error') => void,
): Promise<RemId | undefined> {
  try {
    const doc = JSON.parse(await file.text()) as CardFileDoc;
    const target = deckId ?? app.lectures.suggestDeck(doc);
    if (!target) {
      toast(
        `Kein passender Foliensatz für ${doc.source?.pdf ?? file.name} gefunden - importiere zuerst das PDF.`,
        'error',
      );
      return undefined;
    }
    const res = app.lectures.importCards(target, doc, file.name);
    const how = Object.entries(res.mapped)
      .map(([k, v]) => `${v}× ${k}`)
      .join(', ');
    toast(
      `${res.cards} Karten, ${res.notes} Erklärungen importiert (${how}${res.unmapped ? `, ${res.unmapped} ohne Folie` : ''})`,
    );
    return target;
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
    return undefined;
  }
}

/** The deck header. */
export function DeckPanel({ deckId }: { deckId: RemId }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const slides = useDeckSlides(deckId);
  useUpToDateTitles(deckId);
  const deck = useSelector((s) => s.get(deckId));
  const base = (deck?.deck?.pdfName ?? toPlainText(deck?.text ?? [])).replace(/\.pdf$/i, '');
  return (
    <div className="deck-panel">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Presentation size={18} className="accent-icon" />
        <strong>Foliensatz</strong>
        <span className="muted">
          {slides.length} Folien · {deck?.deck?.pdfName}
        </span>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/lecture/${deckId}`)}>
          <Play size={14} /> Folien öffnen / Vorlesung
        </button>
        <button
          className="btn btn-sm"
          onClick={() =>
            void pickFiles('.json').then(([f]) => f && importCardFile(app, f, deckId, toast))
          }
        >
          <Upload size={14} /> Karten importieren
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            const { doc, remnote } = exportCardFile(app.store, deckId, base);
            downloadText(
              `${base}${CARD_FILE_SUFFIX}`,
              JSON.stringify(doc, null, 2),
              'application/json',
            );
            downloadText(`${base}.remnote.md`, remnote, 'text/markdown');
          }}
        >
          <FileJson size={14} /> Karten exportieren
        </button>
        <SkillDownloadLink
          className="btn btn-sm"
          title="Claude-Skill, der aus Folien Karten mit Folienzuordnung erstellt (Datei in Claude unter Einstellungen → Skills hochladen)"
        >
          <Sparkles size={14} /> Claude-Skill
        </SkillDownloadLink>
        <button
          className="btn btn-sm"
          onClick={() =>
            downloadText(`${base}-ki.md`, exportForAi(app.store, deckId, null), 'text/markdown')
          }
        >
          <Download size={14} /> Export für KI
        </button>
        <button
          className="icon-btn"
          title="Nacharbeiten"
          onClick={() => navigate(`/review/${deckId}`)}
        >
          <ListChecks size={17} />
        </button>
        <button
          className="icon-btn"
          title="Auswertung"
          onClick={() => navigate(`/lectures?deck=${deckId}`)}
        >
          <BarChart3 size={17} />
        </button>
        <button className="icon-btn" title="Handout" onClick={() => navigate(`/handout/${deckId}`)}>
          <Printer size={17} />
        </button>
      </div>
      <div className="deck-strip">
        {slides.map((s, i) => (
          <button
            key={s.id}
            className="deck-strip-item"
            title={toPlainText(s.text)}
            onClick={() => navigate(`/lecture/${deckId}?slide=${i + 1}`)}
          >
            <SlideView deckId={deckId} slide={s} width={200} />
            <span>{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
