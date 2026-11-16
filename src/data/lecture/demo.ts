/**
 * Demo content for lecture mode (port of Fokus `tools/make_demo.py`): a small
 * handout PDF with two slides per A4 page, notes, imported cards and two past
 * lectures, so analysis and review are filled immediately.
 */
import type { CardFileDoc } from '@core/lecture/cardFile';
import { rt } from '@core/richtext/ops';
import type { RemCraftApp } from '../app';

/** Slide contents of the demo deck. */
const SLIDES: { title: string; bullets: string[] }[] = [
  {
    title: 'Gradientenabstieg',
    bullets: [
      'Ziel: Minimum einer Verlustfunktion finden',
      'Schritt entgegen dem Gradienten',
      'Lernrate bestimmt die Schrittweite',
    ],
  },
  {
    title: 'Die Lernrate',
    bullets: [
      'zu groß: Divergenz',
      'zu klein: langsame Konvergenz',
      'Lernraten-Schedules und Adam',
    ],
  },
  {
    title: 'Backpropagation',
    bullets: [
      'Kettenregel rückwärts durch das Netz',
      'Gradienten aller Gewichte in einem Durchlauf',
      'Grundlage des Trainings neuronaler Netze',
    ],
  },
  {
    title: 'Überanpassung',
    bullets: [
      'Modell lernt Rauschen der Trainingsdaten',
      'Gegenmittel: Regularisierung, Dropout',
      'Validierungsdaten zur Kontrolle',
    ],
  },
  {
    title: 'Regularisierung',
    bullets: [
      'L2 bestraft große Gewichte',
      'L1 erzeugt dünn besetzte Modelle',
      'Early Stopping als implizite Regularisierung',
    ],
  },
];

/** Builds the demo handout PDF (A4 portrait, two framed slides per page). */
export async function makeDemoPdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const W = 595;
  const H = 842;
  for (let p = 0; p < Math.ceil(SLIDES.length / 2); p++) {
    const page = doc.addPage([W, H]);
    page.drawText('Maschinelles Lernen · Handout', {
      x: 40,
      y: H - 28,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    for (let k = 0; k < 2; k++) {
      const slide = SLIDES[p * 2 + k];
      if (!slide) continue;
      const top = k === 0 ? H - 60 : H / 2 - 20;
      const sw = W - 100;
      const sh = sw * 0.62;
      page.drawRectangle({
        x: 50,
        y: top - sh,
        width: sw,
        height: sh,
        borderColor: rgb(0.2, 0.25, 0.5),
        borderWidth: 1.5,
        color: rgb(0.97, 0.97, 1),
      });
      page.drawText(slide.title, {
        x: 70,
        y: top - 45,
        size: 24,
        font: bold,
        color: rgb(0.1, 0.12, 0.35),
      });
      slide.bullets.forEach((b, i) =>
        page.drawText(`• ${b}`, {
          x: 80,
          y: top - 100 - i * 32,
          size: 15,
          font,
          color: rgb(0.1, 0.1, 0.1),
        }),
      );
      page.drawText(`${p * 2 + k + 1}`, {
        x: 50 + sw - 24,
        y: top - sh + 12,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
    page.drawText(`Seite ${p + 1}`, {
      x: W / 2 - 15,
      y: 20,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  return doc.save();
}

/** Demo cards in the RemCraft card file format. */
export const DEMO_CARDS: CardFileDoc = {
  format: 'remcraft-cards',
  version: 1,
  source: { pdf: 'Demo_ML_Handout.pdf', pdf_pages: 3 },
  cards: [
    {
      section: 'Optimierung',
      type: 'basic',
      front: 'Wozu dient der Gradientenabstieg?',
      back: 'Um ein Minimum der Verlustfunktion zu finden',
      pages: [1],
      anchor: 'Gradientenabstieg',
      remnote: 'Wozu dient der Gradientenabstieg? >> Um ein Minimum der Verlustfunktion zu finden',
    },
    {
      section: 'Optimierung',
      type: 'mc',
      front: 'Was passiert bei zu großer Lernrate?',
      options: [
        { text: 'Divergenz', correct: true },
        { text: 'Langsamere Konvergenz', correct: false },
        { text: 'Nichts', correct: false },
      ],
      pages: [1],
      anchor: 'Die Lernrate',
    },
    {
      section: 'Training',
      type: 'cloze',
      front: 'Backpropagation nutzt die {{Kettenregel}}',
      pages: [2],
      anchor: 'Backpropagation',
      remnote: 'Backpropagation nutzt die {{Kettenregel}} rückwärts durch das Netz',
    },
    {
      section: 'Generalisierung',
      type: 'concept',
      front: 'Überanpassung',
      back: 'Das Modell lernt das Rauschen der Trainingsdaten',
      pages: [2],
      anchor: 'Überanpassung',
      remnote: 'Überanpassung :: Das Modell lernt das Rauschen der Trainingsdaten',
    },
    {
      section: 'Generalisierung',
      type: 'list',
      front: 'Formen der Regularisierung',
      items: ['L2', 'L1', 'Early Stopping'],
      pages: [3],
      anchor: 'Regularisierung',
      remnote: 'Formen der Regularisierung >>1.\n    - L2\n    - L1\n    - Early Stopping',
    },
  ],
  notes: [
    {
      pages: [2],
      anchor: 'Backpropagation',
      title: 'Warum Backprop effizient ist',
      text: '- Ein Vorwärts- und ein Rückwärtsdurchlauf genügen\n- Zwischenergebnisse werden wiederverwendet',
    },
  ],
};

/**
 * Creates the demo course: folder, deck, notes, cards and two past lectures.
 *
 * @returns Id of the deck document.
 */
export async function createDemo(app: RemCraftApp): Promise<string> {
  const bytes = await makeDemoPdf();
  const file = new File([bytes as BlobPart], 'Demo_ML_Handout.pdf', { type: 'application/pdf' });
  const course = app.rems.createFolder(null, 'Demo-Kurs: Maschinelles Lernen');
  const deckId = await app.lectures.importPdf(file, course.id);
  const slides = app.lectures.slides(deckId);
  const note = (i: number, text: string): void =>
    void (slides[i] && app.rems.create({ parentId: slides[i]!.id }, { text: rt(text) }));
  note(0, 'Analogie: im Nebel bergab gehen');
  note(1, '? Wie wählt man die Lernrate in der Praxis?');
  note(2, 'Backprop ist kein Lernverfahren, sondern berechnet nur Gradienten');
  if (slides[3]) app.lectures.setFlag(slides[3].id, 'unclear', true);
  if (slides[2]) app.lectures.setFlag(slides[2].id, 'important', true);
  app.lectures.importCards(deckId, DEMO_CARDS, 'demo.cards.json');
  // Two past lectures with synthetic attention data.
  const day = 24 * 3600_000;
  for (const [ago, awayAt] of [
    [8, 2],
    [1, 3],
  ] as const) {
    const t0 = Date.now() - ago * day;
    const lecture = app.lectures.start({
      name: `Demo-Vorlesung (vor ${ago} Tag${ago > 1 ? 'en' : ''})`,
      deckId,
      courseId: course.id,
      goal: 'Gradientenverfahren erklären können',
      trackAway: true,
      slide: 0,
    });
    const events = app.lectures.events(lecture.id);
    app.store.transact(
      (tx) => {
        for (const e of events)
          tx.put('lectureEvents', { ...e, t: t0 + (e.t - lecture.createdAt) });
        // The lecture itself took place back then, too.
        tx.put('lectures', { ...lecture, createdAt: t0, updatedAt: t0 });
      },
      { keepTimestamps: true },
    );
    const at = (min: number): number => t0 + min * 60_000;
    slides.forEach(
      (_, i) => i > 0 && app.lectures.record(lecture.id, 'slide', { slide: i, t: at(i * 12) }),
    );
    app.lectures.record(lecture.id, 'away', {
      start: at(awayAt * 12 + 2),
      end: at(awayAt * 12 + 4),
      slide: awayAt,
      t: at(awayAt * 12 + 4),
    });
    app.lectures.record(lecture.id, 'drift', { slide: 1, t: at(15) });
    const prompt = app.lectures.record(lecture.id, 'checkin_prompt', {
      text: 'Was war der Kernpunkt der letzten Minuten?',
      t: at(20),
    });
    app.lectures.record(lecture.id, 'checkin', {
      ref: prompt.id,
      text: 'Lernrate steuert Schrittweite',
      focus: 4,
      slide: 1,
      t: at(21),
    });
    app.lectures.record(lecture.id, 'stop', { t: at(65) });
    app.lectures.record(lecture.id, 'summary', {
      text: '1. Gradientenabstieg\n2. Lernrate\n3. Backprop',
      t: at(66),
    });
  }
  return deckId;
}
