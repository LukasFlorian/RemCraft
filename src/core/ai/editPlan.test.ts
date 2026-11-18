import { createRem } from '../model/factories';
import { createMemoryGraph } from '../model/graph';
import { rt } from '../richtext/ops';
import { batchEntries, editUserPrompt, parseEditAnswer, scopeEntries } from './editPlan';

describe('AI edit plan', () => {
  const doc = createRem({ id: 'D', isDocument: true, text: rt('Doc') });
  const card = createRem({
    id: 'C',
    parentId: 'D',
    text: rt('Hash'),
    back: rt('Streuwert'),
    direction: 'forward',
  });
  const mc = createRem({
    id: 'M',
    parentId: 'D',
    order: 'b',
    text: rt('Welche?'),
    answerMode: 'mc',
    direction: 'forward',
    back: [],
  });
  const optA = createRem({ id: 'A', parentId: 'M', text: rt('eins'), mcCorrect: true });
  const optB = createRem({ id: 'B', parentId: 'M', order: 'b', text: rt('zwei') });
  const graph = createMemoryGraph([doc, card, mc, optA, optB]);
  const entries = scopeEntries(graph, 'D');

  it('shows the scope as referenced lines with option correctness', () => {
    const text = editUserPrompt('X', entries);
    expect(text).toContain('[r2] Hash >> Streuwert');
    expect(text).toContain('[r4] eins   (option: correct)');
    expect(batchEntries(entries)).toHaveLength(1);
  });

  it('validates operations and maps refs to ids', () => {
    const answer = `Here you go: {"summary": "ok", "ops": [
      {"op": "update", "ref": "r2", "line": "Hash :: Streuwert"},
      {"op": "update", "ref": "r5", "correct": true},
      {"op": "update", "ref": "r4", "line": "eins"},
      {"op": "add", "parent": "r3", "after": "r5", "line": "drei"},
      {"op": "delete", "ref": "r1"},
      {"op": "update", "ref": "r99", "line": "x"}
    ]}`;
    const parsed = parseEditAnswer(answer, entries);
    expect(parsed.ops).toEqual([
      { op: 'update', remId: 'C', before: 'Hash >> Streuwert', line: 'Hash :: Streuwert' },
      { op: 'update', remId: 'B', before: 'zwei', correct: true },
      { op: 'add', parentId: 'M', afterId: 'B', line: 'drei' },
    ]);
    expect(parsed.warnings).toHaveLength(2);
  });

  it('rejects answers without JSON', () => {
    expect(() => parseEditAnswer('Sorry, cannot help.', entries)).toThrow(/JSON/);
  });
});
