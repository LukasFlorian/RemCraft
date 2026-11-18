/**
 * Live lecture view (Fokus "Live"): slides with notes, drawings and cards,
 * plus attention tools - recording with pause, time outside the app,
 * "I drifted off", recall check-ins, goal and summary.
 *
 * Route: `/lecture/:deckId?slide=N&lecture=ID`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Grid3x3,
  Highlighter,
  ListChecks,
  Maximize2,
  MousePointer2,
  Pause,
  PenLine,
  Play,
  Printer,
  Sparkles,
  Square,
  Type,
  LayoutDashboard,
} from 'lucide-react';
import { lectureKpis } from '@core/lecture/analytics';
import {
  activeDuration,
  currentSlide,
  isRunning,
  openCheckin,
  summarize,
} from '@core/lecture/session';
import { FLAG_ICONS, FLAG_LABELS } from '@core/lecture/notes';
import type { RemId, SlideFlag } from '@core/model/types';
import { rt, toPlainText } from '@core/richtext/ops';
import { LAYOUT_MODES } from '@core/lecture/layout';
import { useApp, useNow, useRem } from '../app/context';
import { useToast } from '../components/Toast';
import { useController } from '../editor/controller';
import { Outliner } from '../editor/Outliner';
import { useHotkeys } from '../hooks/useHotkeys';
import { useLocalState } from '../hooks/useLocalState';
import { AssistantPanel } from './AssistantPanel';
import {
  CheckinDialog,
  LectureHelp,
  SlideOverview,
  StartLectureDialog,
  SummaryDialog,
} from './LectureDialogs';
import { SlideCards } from './SlideCards';
import { ReviewContent } from './ReviewPage';
import { DeckLecturesPanel } from './LecturesPage';
import type { SlideTool } from './SlideView';
import { PEN_COLORS, SlideView } from './SlideView';
import {
  clock,
  useActiveLecture,
  useAwayTracking,
  useCheckinTimer,
  useLectureSettings,
  useLectureState,
} from './useLecture';
import { useDeckPdf, useDeckSlides, useUpToDateTitles } from './useSlides';
import type { WidgetRect } from './WidgetBoard';
import { WidgetBoard } from './WidgetBoard';

/** Default widget layout (24 × 24 grid). */
const DEFAULT_LAYOUT: Record<string, WidgetRect> = {
  prev: { x: 0, y: 0, w: 5, h: 5 },
  current: { x: 5, y: 0, w: 13, h: 15 },
  next: { x: 18, y: 0, w: 6, h: 5 },
  notes: { x: 18, y: 5, w: 6, h: 19 },
  focus: { x: 0, y: 5, w: 5, h: 10 },
  cards: { x: 0, y: 15, w: 9, h: 9 },
  kpis: { x: 9, y: 15, w: 9, h: 9 },
};

/** The lecture page. */
export function LecturePage(): ReactNode {
  const { deckId = '' } = useParams();
  const deck = useRem(deckId);
  if (!deck?.deck)
    return (
      <div className="main-scroll">
        <div className="page">
          <div className="empty">Kein Foliensatz.</div>
        </div>
      </div>
    );
  return <LectureView key={deckId} deckId={deckId} />;
}

function LectureView({ deckId }: { deckId: RemId }): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  // Opened from a card while practising: offer the way back into the session.
  const returnTo = (useLocation().state as { returnTo?: string } | null)?.returnTo;
  const toast = useToast();
  const controller = useController();
  const [params, setParams] = useSearchParams();
  // Review / statistics shown inside lecture mode (`?view=review|stats`).
  const view = (['review', 'stats'] as const).find((v) => v === params.get('view')) ?? null;
  const setView = (v: 'review' | 'stats' | null): void => {
    const p = new URLSearchParams(params);
    if (v) p.set('view', v);
    else p.delete('view');
    setParams(p);
  };
  // Re-attach notes/cards that an earlier layout change detached from their slide.
  useEffect(() => {
    const n = app.lectures.repairDeck(deckId);
    if (n) toast(`${n} Notizblöcke wieder ihren Folien zugeordnet`);
  }, [app, deckId]); // eslint-disable-line react-hooks/exhaustive-deps
  useUpToDateTitles(deckId);
  const now = useNow(1000);
  const deck = useRem(deckId)!;
  const slides = useDeckSlides(deckId);
  const { error } = useDeckPdf(deckId);
  const cfg = useLectureSettings();
  const active = useActiveLecture();
  const lecture = active && active.deckId === deckId ? active : null;
  const lectureId = lecture?.id ?? null;
  const state = useLectureState(lectureId);
  const running = state ? isRunning(state) : false;
  const paused = state?.pausedSince != null;
  const [lastSlide, setLastSlide] = useLocalState<number>(`deck.${deckId}.slide`, 0);
  const urlSlide = params.get('slide') ? Number(params.get('slide')) - 1 : null;
  const index = Math.min(
    Math.max(0, urlSlide ?? (state ? (currentSlide(state) ?? lastSlide) : lastSlide)),
    Math.max(0, slides.length - 1),
  );
  const slide = slides[index];
  const [tool, setTool] = useState<SlideTool>('select');
  const [color, setColor] = useState(PEN_COLORS[0]!);
  const [dialog, setDialog] = useState<null | 'start' | 'summary' | 'overview' | 'help'>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [assistant, setAssistant] = useState<{ open: boolean; quote?: string }>({ open: false });
  const notesRef = useRef<HTMLDivElement>(null);
  const welcome = useAwayTracking(lectureId, running, index, cfg);
  const [welcomeDismissed, setWelcomeDismissed] = useState<number | null>(null);
  useCheckinTimer(lectureId, state, cfg);
  const checkin = state ? openCheckin(state) : null;

  /** Navigates to a slide (and records it in the running lecture). */
  const go = (i: number, dropParams: string[] = []): void => {
    const next = Math.min(Math.max(0, i), slides.length - 1);
    if (next === index) {
      if (dropParams.length) {
        const p = new URLSearchParams(params);
        for (const k of dropParams) p.delete(k);
        setParams(p);
      }
      return;
    }
    setLastSlide(next);
    const p = new URLSearchParams(params);
    p.delete('slide');
    for (const k of dropParams) p.delete(k);
    setParams(p, { replace: true });
    if (lectureId && (running || paused)) app.lectures.record(lectureId, 'slide', { slide: next });
  };
  useEffect(() => {
    if (urlSlide !== null && lectureId && running && state && currentSlide(state) !== urlSlide)
      app.lectures.record(lectureId, 'slide', { slide: urlSlide });
  }, [urlSlide]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFlag = (flag: SlideFlag): void => {
    if (!slide) return;
    app.lectures.setFlag(slide.id, flag, !slide.slideFlags?.includes(flag), lectureId ?? undefined);
  };
  /** Adds a note Rem to the current slide and focuses it. */
  const addNote = (text: string): void => {
    if (!slide) return;
    const rem = app.rems.create({ parentId: slide.id }, { text: rt(text) });
    const instance = notesRef.current?.querySelector<HTMLElement>('.outliner')?.dataset.instance;
    if (instance) controller.focus(instance, rem.id, 'end');
    if (lectureId) app.lectures.record(lectureId, 'note', { slide: index });
  };
  const drift = (): void => {
    if (!lectureId || !running) return;
    app.lectures.record(lectureId, 'drift', { slide: index });
    toast('Abschweifen bemerkt - wo ist der Prof gerade?');
    addNote('');
  };
  const startLecture = (name: string, goal: string): void => {
    app.lectures.start({
      name,
      deckId,
      courseId: deck.parentId,
      goal,
      trackAway: cfg.trackAway,
      slide: index,
    });
    setDialog(null);
  };
  const stopLecture = (): void => {
    if (!lectureId) return;
    app.lectures.stop(lectureId);
    setDialog('summary');
  };
  const summaryTarget = useRef<string | null>(null);
  if (lectureId) summaryTarget.current = lectureId;

  useHotkeys({
    arrowright: () => go(index + 1),
    arrowleft: () => go(index - 1),
    pagedown: () => go(index + 1),
    pageup: () => go(index - 1),
    g: () => setDialog('overview'),
    w: () => toggleFlag('important'),
    u: () => toggleFlag('unclear'),
    f: (e) => (e.preventDefault(), addNote('? ')),
    a: (e) => (e.preventDefault(), drift()),
    b: () => lectureId && app.lectures.setPaused(lectureId, running),
    n: (e) => {
      e.preventDefault();
      const instance = notesRef.current?.querySelector<HTMLElement>('.outliner')?.dataset.instance;
      const first = slide ? app.store.children(slide.id)[0] : undefined;
      if (instance && first) controller.focus(instance, first.id, 'end');
      else addNote('');
    },
    v: () => setFocusMode((f) => !f),
    p: () => setTool('pen'),
    m: () => setTool('marker'),
    e: () => setTool('eraser'),
    t: () => setTool('text'),
    escape: () => (focusMode ? setFocusMode(false) : setTool('select')),
    k: () => setAssistant((a) => ({ open: !a.open })),
    'shift+?': () => setDialog('help'),
  });

  const sumState = state ? summarize(state, now) : null;
  const kpis = state ? lectureKpis(state, cfg, slides.length, now) : null;
  const slideIds = useMemo(() => slides.map((s) => s.id), [slides]);

  const toolButton = (t: SlideTool, icon: ReactNode, label: string): ReactNode => (
    <button
      className={`icon-btn${tool === t ? ' active' : ''}`}
      title={label}
      aria-label={label}
      onClick={() => setTool(t)}
    >
      {icon}
    </button>
  );

  const currentWidget = (
    <div className="current-slide">
      <SlideView
        deckId={deckId}
        slide={slide}
        interactive
        tool={tool}
        color={color}
        onTextAction={(action, text) =>
          action === 'note' ? addNote(`> ${text}`) : setAssistant({ open: true, quote: text })
        }
      />
      <div className="slide-toolbar">
        <button className="icon-btn" aria-label="Vorherige Folie" onClick={() => go(index - 1)}>
          <ChevronLeft size={18} />
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setDialog('overview')}>
          {slides.length ? index + 1 : 0} / {slides.length}
        </button>
        <button className="icon-btn" aria-label="Nächste Folie" onClick={() => go(index + 1)}>
          <ChevronRight size={18} />
        </button>
        <button
          className="icon-btn"
          title="Folienübersicht (G)"
          onClick={() => setDialog('overview')}
        >
          <Grid3x3 size={16} />
        </button>
        <span className="toolbar-sep" />
        {toolButton('select', <MousePointer2 size={16} />, 'Auswählen / Text markieren (Esc)')}
        {toolButton('pen', <PenLine size={16} />, 'Stift (P)')}
        {toolButton('marker', <Highlighter size={16} />, 'Marker (M)')}
        {toolButton('eraser', <Eraser size={16} />, 'Radierer (E)')}
        {toolButton('text', <Type size={16} />, 'Textfeld (T)')}
        {(tool === 'pen' || tool === 'marker') &&
          PEN_COLORS.map((c) => (
            <button
              key={c}
              className={`mark-swatch${color === c ? ' active' : ''}`}
              style={{ background: c }}
              aria-label="Farbe"
              onClick={() => setColor(c)}
            />
          ))}
        <span className="spacer" />
        <select
          className="select layout-select"
          value={deck.deck!.layout}
          title="Folien pro Seite"
          onChange={(e) =>
            void app.lectures
              .relayout(deckId, e.target.value)
              .then(() => toast('Layout aktualisiert'))
          }
        >
          {Object.entries(LAYOUT_MODES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const notesWidget = (
    <div ref={notesRef} className="slide-notes">
      {slide ? <Outliner rootId={slide.id} /> : <div className="faint">Keine Folie.</div>}
    </div>
  );

  const focusWidget = (
    <div className="focus-widget">
      {sumState?.goal ? (
        <div className="goal">
          <span className="faint">Ziel</span>
          <div>{sumState.goal}</div>
        </div>
      ) : (
        <div className="faint" style={{ fontSize: 13 }}>
          {lectureId
            ? 'Kein Ziel gesetzt.'
            : 'Starte eine Vorlesung, um Zeit, Abwesenheit und Check-ins aufzuzeichnen.'}
        </div>
      )}
      <div className="col" style={{ gap: 6 }}>
        <button className="btn" disabled={!running} onClick={drift} title="Taste A">
          ↺ Abgelenkt
        </button>
        <div className="row">
          {(['important', 'unclear'] as SlideFlag[]).map((f) => (
            <button
              key={f}
              className={`btn btn-sm${slide?.slideFlags?.includes(f) ? ' btn-primary' : ''}`}
              onClick={() => toggleFlag(f)}
              title={f === 'important' ? 'Taste W' : 'Taste U'}
            >
              {FLAG_ICONS[f]} {FLAG_LABELS[f]}
            </button>
          ))}
        </div>
        <button className="btn btn-sm" onClick={() => addNote('? ')} title="Taste F">
          ✎ Frage
        </button>
      </div>
    </div>
  );

  const kpiWidget = kpis ? (
    <div className="kpi-grid">
      <Kpi label="Dauer" value={clock(kpis.durationMs)} />
      <Kpi
        label="In der App"
        value={kpis.focusRatio === null ? '—' : `${Math.round(kpis.focusRatio * 100)} %`}
      />
      <Kpi label="Außerhalb" value={clock(kpis.awayMs)} hint={`${kpis.awayCount}×`} />
      <Kpi label="Abschweifen bemerkt" value={String(kpis.drifts)} />
      <Kpi
        label="Check-ins"
        value={`${kpis.checkinsAnswered}/${kpis.checkins}`}
        hint={kpis.focusAvg ? `Ø Fokus ${kpis.focusAvg}` : undefined}
      />
      <Kpi
        label="Folien besprochen"
        value={String(kpis.slidesSeen)}
        hint={kpis.paceMs ? `Ø ${clock(kpis.paceMs)}` : undefined}
      />
    </div>
  ) : (
    <div className="faint" style={{ fontSize: 13 }}>
      Kennzahlen erscheinen, sobald eine Vorlesung läuft.
    </div>
  );

  return (
    <div className={`lecture${focusMode ? ' focus-mode' : ''}`}>
      <div className="topbar lecture-top">
        {returnTo ? (
          <button className="btn btn-sm btn-primary" onClick={() => navigate(returnTo)}>
            ← Weiter üben
          </button>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/rem/${deckId}`)}>
            ← {toPlainText(deck.text) || 'Foliensatz'}
          </button>
        )}
        <span className="spacer" />
        {lecture && (
          <span className={`lecture-status ${running ? 'running' : 'paused'}`}>
            <span className="dot" /> {lecture.name} ·{' '}
            {clock(state ? activeDuration(state, now) : 0)}
          </span>
        )}
        {!lecture && (
          <button className="btn btn-sm btn-primary" onClick={() => setDialog('start')}>
            <Play size={14} /> Vorlesung starten
          </button>
        )}
        {lecture && (
          <button
            className="btn btn-sm"
            onClick={() => app.lectures.setPaused(lecture.id, running)}
            title="Taste B"
          >
            {running ? <Pause size={14} /> : <Play size={14} />} {running ? 'Pause' : 'Weiter'}
          </button>
        )}
        {lecture && (
          <button className="btn btn-sm" onClick={stopLecture}>
            <Square size={14} /> Abschließen
          </button>
        )}
        <button
          title="Nacharbeiten"
          aria-label="Nacharbeiten"
          className={`icon-btn${view === 'review' ? ' active' : ''}`}
          onClick={() => setView(view === 'review' ? null : 'review')}
        >
          <ListChecks size={17} />
        </button>
        <button
          title="Auswertung"
          aria-label="Auswertung"
          className={`icon-btn${view === 'stats' ? ' active' : ''}`}
          onClick={() => setView(view === 'stats' ? null : 'stats')}
        >
          <BarChart3 size={17} />
        </button>
        <button
          className="icon-btn"
          title="Handout drucken"
          aria-label="Handout"
          onClick={() => navigate(`/handout/${deckId}`)}
        >
          <Printer size={17} />
        </button>
        <button
          className={`icon-btn${editingLayout ? ' active' : ''}`}
          title="Ausgeblendete Widgets / Standard-Layout"
          aria-label="Layout"
          onClick={() => setEditingLayout(!editingLayout)}
        >
          <LayoutDashboard size={17} />
        </button>
        <button
          className="icon-btn"
          title="Fokusmodus (V)"
          aria-label="Fokusmodus"
          onClick={() => setFocusMode(!focusMode)}
        >
          <Maximize2 size={17} />
        </button>
        <button
          className={`icon-btn${assistant.open ? ' active' : ''}`}
          title="Assistent (K)"
          aria-label="Assistent"
          onClick={() => setAssistant((a) => ({ open: !a.open }))}
        >
          <Sparkles size={17} />
        </button>
      </div>
      {error && <div className="banner banner-error">PDF nicht verfügbar: {error}</div>}
      {welcome && welcomeDismissed !== welcome.since && (
        <div className="banner">
          Willkommen zurück - du warst {clock(welcome.ms)} weg. Folie{' '}
          {welcome.slide !== null ? welcome.slide + 1 : '?'} landet in „Nacharbeiten“.
          <button className="btn btn-sm" onClick={() => setWelcomeDismissed(welcome.since)}>
            OK
          </button>
        </div>
      )}
      <div className="lecture-body">
        {view ? (
          <div className="lecture-panel">
            <div className="lecture-panel-bar">
              <button className="btn btn-sm" onClick={() => setView(null)}>
                ← Zurück zu den Folien
              </button>
            </div>
            <div className="lecture-panel-body">
              {view === 'review' ? (
                <ReviewContent
                  deckId={deckId}
                  lectureFilter={null}
                  onOpenSlide={(i) => go(i, ['view'])}
                />
              ) : (
                <DeckLecturesPanel
                  deckId={deckId}
                  onSlides={() => setView(null)}
                  onReview={() => setView('review')}
                />
              )}
            </div>
          </div>
        ) : focusMode ? (
          <div className="focus-layout">
            <div className="focus-slide">{currentWidget}</div>
            <div className="focus-notes">{notesWidget}</div>
          </div>
        ) : (
          <WidgetBoard
            storageKey="lecture.layout.v2"
            defaults={DEFAULT_LAYOUT}
            editing={editingLayout}
            onEditingChange={setEditingLayout}
            widgets={[
              {
                id: 'prev',
                title: 'Vorherige',
                render: () => (
                  <div className="clickable-slide" onClick={() => go(index - 1)}>
                    <SlideView deckId={deckId} slide={slides[index - 1]} width={300} />
                  </div>
                ),
              },
              { id: 'current', title: `Folie ${index + 1}`, render: () => currentWidget },
              {
                id: 'next',
                title: 'Nächste',
                render: () => (
                  <div className="clickable-slide" onClick={() => go(index + 1)}>
                    <SlideView deckId={deckId} slide={slides[index + 1]} width={300} />
                  </div>
                ),
              },
              { id: 'notes', title: 'Notizen', render: () => notesWidget },
              { id: 'focus', title: 'Fokus', render: () => focusWidget },
              {
                id: 'cards',
                title: 'Karten',
                render: () => <SlideCards slideId={slide?.id} deckSlideIds={slideIds} />,
              },
              { id: 'kpis', title: 'Kennzahlen', render: () => kpiWidget },
            ]}
          />
        )}
        {assistant.open && (
          <AssistantPanel
            deckId={deckId}
            slideIndex={index}
            lectureId={lectureId}
            quote={assistant.quote}
            onClose={() => setAssistant({ open: false })}
            onToNotes={(text) => addNote(text)}
          />
        )}
      </div>
      {dialog === 'start' && (
        <StartLectureDialog
          defaultName={`${toPlainText(deck.text)} - ${new Date().toLocaleDateString()}`}
          onStart={startLecture}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'summary' && summaryTarget.current && (
        <SummaryDialog
          initial=""
          onClose={() => setDialog(null)}
          onSave={(text) => {
            app.lectures.record(summaryTarget.current!, 'summary', { text });
            setDialog(null);
            navigate(`/lectures/${summaryTarget.current}`);
          }}
        />
      )}
      {dialog === 'overview' && (
        <SlideOverview
          deckId={deckId}
          current={index}
          onPick={(i) => (go(i), setDialog(null))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'help' && <LectureHelp onClose={() => setDialog(null)} />}
      {checkin && lectureId && (
        <CheckinDialog
          checkin={checkin}
          onAnswer={(text, focus, skipped) =>
            app.lectures.record(lectureId, 'checkin', {
              ref: checkin.id,
              text,
              skipped,
              slide: index,
              ...(focus ? { focus } : {}),
            })
          }
        />
      )}
    </div>
  );
}

/** A KPI tile. */
function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}): ReactNode {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}
