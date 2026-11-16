import { toPlainText, rt } from '@core/richtext/ops';
import { DAY, isoDate } from '@core/util/time';
import { MemoryAdapter } from '../persistence/memory';
import { RemCraftApp } from '../app';
import { selectCardIndex, selectDueCounts, selectExamPlans, selectGlobalQueue } from '../selectors';
import { DAILY_FOLDER_ID, dailyRemId } from './rems';

/** Fresh app without seed data or backend. */
async function makeApp(): Promise<RemCraftApp> {
  return RemCraftApp.create({ persistence: new MemoryAdapter(), backend: null, seed: false });
}

const titles = (app: RemCraftApp, parentId: string | null): string[] => app.store.children(parentId).map((r) => toPlainText(r.text));

describe('RemService', () => {
  it('creates documents, folders and Rems in order', async () => {
    const app = await makeApp();
    const folder = app.rems.createFolder(null, 'F');
    const doc = app.rems.createDocument(folder.id, 'D');
    const a = app.rems.create({ parentId: doc.id }, { text: rt('a') });
    app.rems.create({ parentId: doc.id }, { text: rt('c') });
    app.rems.create({ parentId: doc.id, afterId: a.id }, { text: rt('b') });
    app.rems.create({ parentId: doc.id, afterId: null }, { text: rt('0') });
    expect(titles(app, doc.id)).toEqual(['0', 'a', 'b', 'c']);
    expect(app.rems.path(a.id).map((r) => r.id)).toEqual([folder.id, doc.id]);
  });

  it('indents, outdents and moves', async () => {
    const app = await makeApp();
    const doc = app.rems.createDocument(null, 'D');
    const [a, b, c] = ['a', 'b', 'c'].map((t) => app.rems.create({ parentId: doc.id }, { text: rt(t) }));
    expect(app.rems.indent([b!.id, c!.id])).toBe(true);
    expect(titles(app, a!.id)).toEqual(['b', 'c']);
    expect(app.rems.outdent([b!.id], doc.id)).toBe(true);
    expect(titles(app, doc.id)).toEqual(['a', 'b']);
    expect(titles(app, a!.id)).toEqual(['c']);
    expect(app.rems.moveUp(b!.id)).toBe(true);
    expect(titles(app, doc.id)).toEqual(['b', 'a']);
    expect(app.rems.moveDown(b!.id)).toBe(true);
    expect(titles(app, doc.id)).toEqual(['a', 'b']);
    // Cannot move a Rem into its own subtree.
    expect(app.rems.move([a!.id], { parentId: c!.id })).toBe(false);
    // Moving several Rems keeps them between their new neighbours.
    const d = app.rems.create({ parentId: doc.id }, { text: rt('d') });
    app.rems.move([a!.id, b!.id], { parentId: doc.id, afterId: d.id });
    expect(titles(app, doc.id)).toEqual(['d', 'a', 'b']);
    app.store.undo();
    expect(titles(app, doc.id)).toEqual(['a', 'b', 'd']);
  });

  it('splits and merges', async () => {
    const app = await makeApp();
    const doc = app.rems.createDocument(null, 'D');
    const a = app.rems.create({ parentId: doc.id }, { text: rt('hello world') });
    const b = app.rems.split(a.id, rt('hello '), rt('world'))!;
    expect(titles(app, doc.id)).toEqual(['hello ', 'world']);
    app.rems.create({ parentId: b.id }, { text: rt('kid') });
    expect(app.rems.mergeInto(b.id, a.id)).toBe(6);
    expect(titles(app, doc.id)).toEqual(['hello world']);
    expect(titles(app, a.id)).toEqual(['kid']);
  });

  it('deletes subtrees with their card states, undoably', async () => {
    const app = await makeApp();
    const doc = app.rems.createDocument(null, 'D');
    const q = app.rems.create({ parentId: doc.id }, { text: rt('Q'), back: rt('A'), direction: 'forward' });
    app.practice.answer(`${q.id}/f`, 3, { now: Date.now(), durationMs: 1000, mode: 'srs' });
    expect(app.store.getRecord('cards', `${q.id}/f`)).toBeDefined();
    app.rems.delete([doc.id]);
    expect(app.store.get(q.id)).toBeUndefined();
    expect(app.store.getRecord('cards', `${q.id}/f`)).toBeUndefined();
    app.store.undo();
    expect(app.store.get(q.id)).toBeDefined();
    expect(app.store.getRecord('cards', `${q.id}/f`)).toBeDefined();
  });

  it('finds or creates Rems by name and daily documents', async () => {
    const app = await makeApp();
    const doc = app.rems.createDocument(null, 'Über Daten');
    expect(app.rems.ensureByName('uber daten')).toBe(doc.id);
    const created = app.rems.ensureByName('New Topic');
    expect(app.store.get(created)).toMatchObject({ parentId: null, isDocument: true });
    const today = isoDate(Date.now());
    expect(app.rems.ensureDaily(today)).toBe(dailyRemId(today));
    expect(app.rems.ensureDaily(today)).toBe(dailyRemId(today));
    expect(app.store.children(DAILY_FOLDER_ID)).toHaveLength(1);
  });

  it('copies subtrees and applies templates', async () => {
    const app = await makeApp();
    const tpl = app.rems.createDocument(null, 'Template');
    app.rems.create({ parentId: tpl.id }, { text: rt('Section 1') });
    app.rems.create({ parentId: tpl.id }, { text: rt('Section 2') });
    const target = app.rems.createDocument(null, 'Target');
    app.rems.applyTemplate(tpl.id, target.id);
    expect(titles(app, target.id)).toEqual(['Section 1', 'Section 2']);
    const dup = app.rems.duplicate(target.id)!;
    expect(titles(app, dup)).toEqual(['Section 1', 'Section 2']);
    expect(app.store.children(null).map((r) => r.id)).toEqual([tpl.id, target.id, dup]);
  });
});

describe('PracticeService', () => {
  it('answers, previews and undoes', async () => {
    const app = await makeApp();
    const doc = app.rems.createDocument(null, 'D');
    const q = app.rems.create({ parentId: doc.id }, { text: rt('Q'), back: rt('A'), direction: 'forward' });
    const cardId = `${q.id}/f`;
    const now = Date.now();
    expect(selectGlobalQueue(app.store, now).map((c) => c.cardId)).toEqual([cardId]);
    const previews = app.practice.previews(cardId, now)!;
    expect(previews[1]).toBeLessThan(previews[4]);
    const result = app.practice.answer(cardId, 4, { now, durationMs: 5000, mode: 'srs' })!;
    expect(result.state.phase).toBe('review');
    expect(app.store.count('logs')).toBe(1);
    expect(selectGlobalQueue(app.store, now)).toEqual([]);
    expect(app.practice.undoAnswer(result.log!.id)).toBe(true);
    expect(app.store.count('logs')).toBe(0);
    expect(app.practice.stateOf(cardId)!.phase).toBe('new');
  });

  it('does not store cram reviews and supports disable/reset', async () => {
    const app = await makeApp();
    const doc = app.rems.createDocument(null, 'D');
    const q = app.rems.create({ parentId: doc.id }, { text: rt('Q'), back: rt('A'), direction: 'forward' });
    const cardId = `${q.id}/f`;
    expect(app.practice.answer(cardId, 3, { now: Date.now(), durationMs: 1, mode: 'cram' })!.log).toBeNull();
    expect(app.store.count('logs')).toBe(0);
    app.practice.setDisabled([cardId], true);
    expect(selectGlobalQueue(app.store, Date.now())).toEqual([]);
    app.practice.reset([cardId]);
    expect(app.practice.stateOf(cardId)!.disabled).toBe(true);
  });

  it('builds document queues and due counts', async () => {
    const app = await makeApp();
    const folder = app.rems.createFolder(null, 'F');
    const doc = app.rems.createDocument(folder.id, 'D');
    app.rems.create({ parentId: doc.id }, { text: [{ type: 'text', text: 'x', marks: { cloze: 'c1' } }] });
    app.rems.create({ parentId: doc.id }, { text: rt('Q'), back: rt('A'), direction: 'both' });
    const now = Date.now();
    expect(selectCardIndex(app.store).specs).toHaveLength(3);
    expect(app.practice.buildQueue({ kind: 'rem', remId: doc.id, mode: 'all-in-order' }, now)).toHaveLength(3);
    expect(selectDueCounts(app.store, now).get(folder.id)).toBe(3);
    app.rems.update(folder.id, { priority: 'paused' });
    expect(app.practice.buildQueue({ kind: 'global' }, now)).toEqual([]);
    expect(app.practice.buildQueue({ kind: 'rem', remId: doc.id, mode: 'srs' }, now)).toHaveLength(3);
  });

  it('applies exam planning to the global queue', async () => {
    const app = await makeApp();
    const doc = app.rems.createDocument(null, 'Exam doc');
    for (let i = 0; i < 30; i++) app.rems.create({ parentId: doc.id }, { text: rt(`Q${i}`), back: rt('A'), direction: 'forward' });
    app.settings.update({ newCardsPerDay: 0 });
    const now = Date.now();
    expect(selectGlobalQueue(app.store, now)).toEqual([]);
    const exam = app.exams.create({ name: 'Exam', date: now + 11 * DAY, scope: [doc.id], finalReviewDays: 1 });
    const plan = selectExamPlans(app.store, now)[0]!;
    expect(plan.totalCards).toBe(30);
    expect(plan.todayNewQuota).toBeGreaterThan(0);
    const queue = selectGlobalQueue(app.store, now);
    expect(queue).toHaveLength(plan.todayNewQuota);
    expect(queue.every((c) => c.bucket === 'exam-new' && c.examId === exam.id)).toBe(true);
    // Extra practice keeps a card in learning until two successes.
    const first = queue[0]!.cardId;
    const r1 = app.practice.answer(first, 4, { now, durationMs: 1, mode: 'srs' })!;
    expect(r1.state.phase).toBe('learning');
    expect(r1.log!.mode).toBe('exam');
  });
});

describe('ImportExportService', () => {
  it('imports markdown as a document, pastes and exports', async () => {
    const app = await makeApp();
    const { docId, count } = app.io.importAsDocument('Deck', '- Q1 >> A1\n- Q2 :: A2\n    - attr ;; v\n- see [[Other]]', 'markdown');
    expect(count).toBe(4);
    expect(titles(app, docId)).toEqual(['Q1', 'Q2', 'see ']);
    expect(app.rems.findByName('Other')).toBeDefined();
    const first = app.store.children(docId)[0]!;
    app.io.pasteAt({ parentId: docId, afterId: first.id }, '- pasted >> yes');
    expect(titles(app, docId)).toEqual(['Q1', 'pasted', 'Q2', 'see ']);
    const md = app.io.exportMarkdown([docId], false);
    expect(md).toContain('- Q1 >> A1');
    expect(md).toContain('    - attr ;; v');
    expect(md).toContain('[[Other]]');
  });

  it('imports CSV and restores backups', async () => {
    const app = await makeApp();
    const { docId } = app.io.importAsDocument('Quizlet', 'front\tback\nHund\tdog\nKatze\tcat', 'csv', null, { hasHeader: true });
    expect(titles(app, docId)).toEqual(['Hund', 'Katze']);
    const backup = JSON.stringify(app.io.exportBackup());
    const other = await makeApp();
    expect(other.io.importBackup(backup, 'replace')).toBeGreaterThan(0);
    expect(titles(other, docId)).toEqual(['Hund', 'Katze']);
  });
});
