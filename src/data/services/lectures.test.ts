import { createRem } from '@core/model/factories';
import { buildLectureState, summarize } from '@core/lecture/session';
import { rt, toPlainText } from '@core/richtext/ops';
import { RemCraftApp } from '../app';
import { MemoryAdapter } from '../persistence/memory';

/** App with a hand-made deck of three slides (no PDF needed). */
async function setup() {
  const app = await RemCraftApp.create({ persistence: new MemoryAdapter(), backend: null, seed: false });
  const course = app.rems.createFolder(null, 'Big Data');
  app.store.transact((tx) => {
    tx.put('rems', createRem({ id: 'deck', parentId: course.id, text: rt('VL01'), isDocument: true, deck: { src: 'file:x', pdfName: 'VL01.pdf', pdfPages: 2, layout: '2x1', boxes: [[0, 0, 1, 0.5], [0, 0.5, 1, 1]] } }));
    ['Einführung Big Data', 'Die 5 Vs: Volume Velocity', 'Hadoop Architektur und HDFS'].forEach((text, i) =>
      tx.put('rems', createRem({ id: `s${i}`, parentId: 'deck', order: `a${i}`, text: rt(`Folie ${i + 1}`), slide: { index: i, page: Math.floor((i + 1) / 2), box: (i + 1) % 2 }, slideText: text })),
    );
  });
  return { app, courseId: course.id };
}

const DOC = {
  format: 'fokus-cards' as const,
  version: 1,
  source: { pdf: 'VL01.pdf', pdf_pages: 2 },
  cards: [
    { front: 'Was ist HDFS?', back: 'Verteiltes Dateisystem', pages: [2], anchor: 'Hadoop Architektur', remnote: 'Was ist HDFS? >> Verteiltes Dateisystem' },
    { front: 'Welche Vs?', type: 'mc', options: [{ text: 'Volume', correct: true }, { text: 'Vanity', correct: false }], pages: [2], anchor: 'Die 5 Vs' },
    { front: 'Verloren', back: 'x', anchor: 'kommt nicht vor' },
  ],
  notes: [{ pages: [1], anchor: 'Einführung', title: 'Überblick', text: '- **Kern:** Daten' }],
};

describe('LectureService', () => {
  it('imports fokus cards onto slides and keeps progress on re-import', async () => {
    const { app } = await setup();
    expect(app.lectures.suggestDeck(DOC)).toBe('deck');
    const res = app.lectures.importFokus('deck', DOC, 'VL01.fokus.json');
    expect(res).toMatchObject({ cards: 3, notes: 1, unmapped: 1 });
    const titles = (id: string) => app.store.children(id).map((r) => toPlainText(r.text));
    expect(titles('s2')).toEqual(['Was ist HDFS?']);
    expect(titles('s1')).toEqual(['Welche Vs?']);
    expect(titles('s0')).toEqual(['💡 Überblick']);
    const hdfs = app.store.children('s2')[0]!;
    app.practice.answer(`${hdfs.id}/f`, 3, { now: Date.now(), durationMs: 1, mode: 'srs' });
    app.lectures.importFokus('deck', { ...DOC, cards: DOC.cards.slice(0, 1) }, 'VL01.fokus.json');
    expect(app.store.children('s2')[0]!.id).toBe(hdfs.id);
    expect(app.practice.stateOf(`${hdfs.id}/f`)!.reps).toBe(1);
    expect(titles('s1')).toEqual([]);
  });

  it('records lectures and flags', async () => {
    const { app, courseId } = await setup();
    const lecture = app.lectures.start({ name: 'VL 1', deckId: 'deck', courseId, goal: 'Verstehen', trackAway: true });
    app.lectures.record(lecture.id, 'slide', { slide: 1 });
    app.lectures.setFlag('s1', 'unclear', true, lecture.id);
    app.lectures.setPaused(lecture.id, true);
    const st = buildLectureState(app.lectures.events(lecture.id));
    expect(summarize(st, Date.now())).toMatchObject({ paused: true, running: false, goal: 'Verstehen', lastSlide: 1 });
    expect(app.store.get('s1')!.slideFlags).toEqual(['unclear']);
    app.lectures.setAnnotations('s1', { strokes: [{ tool: 'pen', color: '#f00', width: 0.003, p: [0, 0, 1, 1] }] });
    expect(app.lectures.annotations('s1').strokes).toHaveLength(1);
    app.lectures.delete(lecture.id);
    expect(app.store.count('lectureEvents')).toBe(0);
  });
});
