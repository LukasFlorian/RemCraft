import { parseEditAnswer, scopeEntries } from '@core/ai/editPlan';
import { rt, toPlainText } from '@core/richtext/ops';
import { RemCraftApp } from '../app';
import { MemoryAdapter } from '../persistence/memory';

describe('applying AI edits', () => {
  it('updates, adds and deletes in one undo step, parsing lines like pasted text', async () => {
    const app = await RemCraftApp.create({
      persistence: new MemoryAdapter(),
      backend: null,
      seed: false,
    });
    const doc = app.rems.createDocument(null, 'Doc');
    const card = app.rems.create(
      { parentId: doc.id },
      { text: rt('Hash'), back: rt('Streuwert'), direction: 'forward' },
    );
    const note = app.rems.create({ parentId: doc.id }, { text: rt('Notiz') });
    const entries = scopeEntries(app.store, doc.id);
    const ref = (id: string): string => entries.find((e) => e.remId === id)!.ref;
    const { ops } = parseEditAnswer(
      JSON.stringify({
        summary: 's',
        ops: [
          { op: 'update', ref: ref(card.id), line: 'Hash :: Streuwert' },
          { op: 'add', parent: ref(doc.id), after: ref(card.id), line: 'Neu >> Karte' },
          { op: 'delete', ref: ref(note.id) },
        ],
      }),
      entries,
    );
    expect(app.io.applyEdits(ops)).toBe(3);
    const kids = app.store.children(doc.id);
    expect(kids.map((r) => toPlainText(r.text))).toEqual(['Hash', 'Neu']);
    expect(app.store.get(card.id)).toMatchObject({ kind: 'concept', direction: 'both' });
    expect(toPlainText(kids[1]!.back)).toBe('Karte');
    // One undo restores everything.
    app.store.undo();
    expect(app.store.children(doc.id).map((r) => toPlainText(r.text))).toEqual(['Hash', 'Notiz']);
    expect(app.store.get(card.id)?.kind).not.toBe('concept');
    app.dispose();
  });
});
