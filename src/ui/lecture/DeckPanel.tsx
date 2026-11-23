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
import { t } from '@core/i18n';

/** Imports a card file into a deck and reports the result. */
export async function importCardFile(
  app: ReturnType<typeof useApp>,
  file: File,
  deckId: RemId | undefined,
  toast: (m: string, k?: 'info' | 'error') => void,
  within?: RemId | null,
): Promise<RemId | undefined> {
  try {
    const doc = JSON.parse(await file.text()) as CardFileDoc;
    const target = deckId ?? app.lectures.suggestDeck(doc, within);
    if (!target) {
      toast(
        t('No matching slide deck found for {name} – import the PDF first.', {
          name: doc.source?.pdf ?? file.name,
        }),
        'error',
      );
      return undefined;
    }
    const res = app.lectures.importCards(target, doc, file.name);
    const how = Object.entries(res.mapped)
      .map(([k, v]) => `${v}× ${k}`)
      .join(', ');
    toast(
      t('{cards} cards, {notes} explanations imported ({how}{unmapped})', {
        cards: res.cards,
        notes: res.notes,
        how,
        unmapped: res.unmapped ? t(', {n} without slide', { n: res.unmapped }) : '',
      }),
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
        <strong>{t('Slide deck')}</strong>
        <span className="muted">
          {slides.length} {t('slides ·')} {deck?.deck?.pdfName}
        </span>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/lecture/${deckId}`)}>
          <Play size={14} /> {t('Open slides / lecture')}
        </button>
        <button
          className="btn btn-sm"
          onClick={() =>
            void pickFiles('.json').then(([f]) => f && importCardFile(app, f, deckId, toast))
          }
        >
          <Upload size={14} /> {t('Import cards')}
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
          <FileJson size={14} /> {t('Export cards')}
        </button>
        <SkillDownloadLink
          className="btn btn-sm"
          title={t(
            'Claude skill that creates cards mapped to slides from your slides (upload the file in Claude under Settings → Skills)',
          )}
        >
          <Sparkles size={14} /> {t('Claude skill')}
        </SkillDownloadLink>
        <button
          className="btn btn-sm"
          onClick={() =>
            downloadText(`${base}-ki.md`, exportForAi(app.store, deckId, null), 'text/markdown')
          }
        >
          <Download size={14} /> {t('Export for AI')}
        </button>
        <button
          className="icon-btn"
          title={t('Follow-up')}
          onClick={() => navigate(`/review/${deckId}`)}
        >
          <ListChecks size={17} />
        </button>
        <button
          className="icon-btn"
          title={t('Analysis')}
          onClick={() => navigate(`/lectures?deck=${deckId}`)}
        >
          <BarChart3 size={17} />
        </button>
        <button
          className="icon-btn"
          title={t('Handout')}
          onClick={() => navigate(`/handout/${deckId}`)}
        >
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
