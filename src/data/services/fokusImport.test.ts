/**
 * Imports a data directory produced by the real Fokus app
 * (`scripts/make_fokus_fixture.py`) and checks every kind of data arrives.
 */
import { buildLectureState, summarize } from '@core/lecture/session';
import { toPlainText } from '@core/richtext/ops';
import { RemCraftApp } from '../app';
import { MemoryAdapter } from '../persistence/memory';
import { selectCardIndex, selectSettings } from '../selectors';
import { archiveFromFiles } from './fokusImport';
import type { FokusArchive } from './fokusImport';

import fixtureJson from '../testing/fixtures/fokus-data.json';

const fixture = fixtureJson as Record<string, string>;

/** Bytes of a base64 string. */
const bytes = (b64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** The fixture as files of a selected folder (like `<input webkitdirectory>`). */
function folder(prefix = 'Fokus/'): File[] {
  return Object.entries(fixture).map(([path, b64]) => {
    const file = new File([bytes(b64)], path.split('/').pop()!);
    Object.defineProperty(file, 'webkitRelativePath', { value: prefix + path });
    return file;
  });
}

async function app(): Promise<RemCraftApp> {
  return RemCraftApp.create({ persistence: new MemoryAdapter(), backend: null, seed: false });
}

const titled = (a: RemCraftApp, title: string) =>
  a.store.all('rems').find((r) => toPlainText(r.text) === title);

describe('Fokus import', () => {
  let a: RemCraftApp;
  let archive: FokusArchive;
  beforeEach(async () => {
    a = await app();
    archive = archiveFromFiles(folder());
  });
  afterEach(() => a.dispose());

  it('imports courses, decks with their exact layout, notes, markers and drawings', async () => {
    const summary = await a.fokusImport.run(archive);
    expect(summary).toMatchObject({
      courses: 1,
      decks: 1,
      slidesWithNotes: 1,
      annotatedSlides: 1,
      lectures: 2,
      files: 1,
    });
    expect(summary.warnings).toEqual([]);

    const course = titled(a, 'Machine Learning')!;
    expect(course.isFolder).toBe(true);
    const deck = a.store.children(course.id).find((r) => r.deck)!;
    expect(deck.deck).toMatchObject({ pdfName: 'handout.pdf', pdfPages: 3, layout: 'auto' });
    expect(deck.deck!.boxes).toHaveLength(2);
    const slides = a.lectures.slides(deck.id);
    expect(slides.map((s) => [s.slide!.page, s.slide!.box])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
    ]);
    // Only the course's extra file is added; its PDF is the deck already.
    expect(
      a.store
        .children(course.id)
        .filter((r) => r.file)
        .map((r) => r.file!.name),
    ).toEqual(['blatt1.txt']);

    // Notes of slide 2 (index 1): lines become Rems, ">>" becomes a flashcard.
    const notes = a.store.children(slides[1]!.id).map((r) => toPlainText(r.text));
    expect(notes).toEqual(['Prof: wichtig für Klausur', '? Warum quadratischer Fehler', 'Loss']);
    const card = a.store.children(slides[1]!.id)[2]!;
    expect(toPlainText(card.back)).toBe('mittlerer quadratischer Fehler');
    expect(a.store.children(card.id).map((r) => toPlainText(r.text))).toEqual([
      'Unterpunkt eingerückt',
    ]);
    expect(slides[1]!.slideFlags).toEqual(['important']);
    expect(slides[2]!.slideFlags).toEqual(['unclear']);

    const ann = a.lectures.annotations(slides[1]!.id);
    expect(ann.strokes.map((s) => s.tool)).toEqual(['pen', 'marker']);
    expect(ann.strokes[0]!.p).toEqual([0.1, 0.1, 0.2, 0.2]);
    expect(ann.boxes[0]).toMatchObject({ text: 'Merken!', bg: 'note' });
    expect(ann.marks[0]).toMatchObject({ text: 'Regression' });
  });

  it('imports fokus cards on their slides and keeps disabled cards disabled', async () => {
    const summary = await a.fokusImport.run(archive);
    expect(summary.cards).toBe(2);
    expect(summary.disabledCards).toBe(1);
    const disabled = titled(a, 'Deaktivierte Karte')!;
    const index = selectCardIndex(a.store);
    const state = a.store.getRecord('cards', index.byRem.get(disabled.id)![0]!.id);
    expect(state?.disabled).toBe(true);
    const ok = titled(a, 'Was minimiert lineare Regression?')!;
    expect(a.store.get(ok.parentId!)?.slide).toBeDefined();
  });

  it('imports lectures with their full history and closes a lecture left running', async () => {
    await a.fokusImport.run(archive);
    const lectures = a.store.all('lectures');
    const vl1 = lectures.find((l) => l.name === 'VL 1')!;
    const deck = a.store.all('rems').find((r) => r.deck)!;
    expect(vl1.deckId).toBe(deck.id);
    expect(vl1.courseId).toBe(titled(a, 'Machine Learning')!.id);
    const st = buildLectureState(a.lectures.events(vl1.id));
    const sum = summarize(st, Date.now());
    expect(st.goal).toBe('Regression verstehen');
    expect(st.summary).toContain('MSE');
    expect(st.drifts).toHaveLength(1);
    expect(st.away).toHaveLength(1);
    expect(st.checkins[0]).toMatchObject({
      prompt: 'Was war der Kernpunkt?',
      text: 'MSE minimieren',
      focus: 4,
    });
    expect(sum).toBeDefined();

    const spontaneous = lectures.find((l) => l.name === 'Spontane Vorlesung')!;
    expect(spontaneous.deckId).toBeNull();
    const st2 = buildLectureState(a.lectures.events(spontaneous.id));
    expect(st2.intervals.every(([, end]) => end !== null)).toBe(true);
  });

  it('can run again without duplicating anything', async () => {
    await a.fokusImport.run(archive);
    const counts = (): number[] => [
      a.store.count('rems'),
      a.store.count('lectures'),
      a.store.count('lectureEvents'),
      a.store.count('annotations'),
    ];
    const before = counts();
    const again = await a.fokusImport.run(archiveFromFiles(folder('other/path/')));
    expect(counts()).toEqual(before);
    expect(again).toMatchObject({
      courses: 0,
      decks: 0,
      lectures: 0,
      files: 0,
      slidesWithNotes: 0,
    });
    expect(Object.keys(selectSettings(a.store).externalIds ?? {}).length).toBeGreaterThan(2);
  });

  it('rejects folders without Fokus data', () => {
    expect(() => archiveFromFiles([new File(['x'], 'a.txt')])).toThrow(/Keine Fokus-Daten/);
  });
});
