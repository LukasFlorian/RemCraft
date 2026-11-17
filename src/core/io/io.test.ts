import { createMemoryGraph } from '../model/graph';
import type { Rem } from '../model/types';
import { toPlainText } from '../richtext/ops';
import { createBackup, parseBackup } from './backup';
import { csvToCardRems, detectDelimiter, parseCsv } from './csv';
import { exportMarkdown, importMarkdown, optionTexts } from './markdown';
import { parseOpml } from './opml';
import { countNodes, parseOutline } from './outline';

/** Import context resolving names to deterministic ids. */
function ctx() {
  const created: string[] = [];
  return {
    created,
    resolveRef: (name: string) => {
      created.push(name);
      return `ref:${name}`;
    },
    resolveTag: (name: string) => `tag:${name}`,
    now: 1,
  };
}

const HOUSE_FORMAT = `- 3 - Scheduling
    - Which algorithms are preemptive? {CORRECT: A, B} >>A)
        - SRTF
        - Round Robin
        - FCFS
            - FCFS is non-preemptive.
    - 
    - Average waiting time (in time units)→Korrekte Antwort: 4 Rechenweg: (0+6+3+7)/4 = 4
    - Semaphore :: integer counter
        - initial value for mutex ;; 1
    - Steps of a context switch >>1.
        - Save context
        - Load context
    - The {{TLB}}{({cache})} caches PTEs
        - Hit avoids memory access #[[Extra Card Detail]]
`;

describe('parseOutline', () => {
  it('builds a tree from indentation', () => {
    const tree = parseOutline(HOUSE_FORMAT);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.text.slice(0, 10))).toEqual([
      'Which algo',
      '',
      'Average wa',
      'Semaphore ',
      'Steps of a',
      'The {{TLB}',
    ]);
  });

  it('nests content under Markdown headings and detects blocks', () => {
    const md =
      '# Title\nintro\n## Sub\n- [ ] todo\n- [x] done\n> quote\n---\n```js\nconst a = 1;\n```\n# Next\n$$x^2$$\n![alt](a.png)';
    const tree = parseOutline(md);
    expect(tree.map((n) => n.text)).toEqual(['Title', 'Next']);
    const title = tree[0]!;
    expect(title.block.heading).toBe(1);
    expect(title.children.map((c) => c.text)).toEqual(['intro', 'Sub']);
    const sub = title.children[1]!;
    expect(sub.children.map((c) => c.block)).toEqual([
      { todo: 'unfinished' },
      { todo: 'finished' },
      { quote: true },
      { divider: true },
      { code: { language: 'js' } },
    ]);
    expect(sub.children[4]!.text).toBe('const a = 1;');
    expect(tree[1]!.children.map((c) => c.block)).toEqual([
      { latexBlock: true },
      { image: { alt: 'alt', src: 'a.png' } },
    ]);
    expect(countNodes(tree)).toBe(11);
  });
});

describe('importMarkdown', () => {
  const rems = importMarkdown(HOUSE_FORMAT, 'root', ctx());
  const byText = (t: string): Rem => rems.find((r) => toPlainText(r.text).startsWith(t))!;

  it('skips empty spacer bullets', () => {
    expect(rems.some((r) => toPlainText(r.text) === '' && !r.divider)).toBe(false);
  });

  it('honours {CORRECT: …} for multiple choice', () => {
    const mc = byText('Which algorithms');
    expect(mc).toMatchObject({ answerMode: 'mc', direction: 'forward' });
    expect(toPlainText(mc.text)).toBe('Which algorithms are preemptive?');
    const options = rems.filter((r) => r.parentId === mc.id);
    expect(options.map((o) => o.mcCorrect)).toEqual([true, true, false]);
    // Explanations below an option are children of the option.
    expect(rems.filter((r) => r.parentId === options[2]!.id)).toHaveLength(1);
  });

  it('imports concept/descriptor/list/cloze cards', () => {
    expect(byText('Semaphore')).toMatchObject({ kind: 'concept', direction: 'both' });
    expect(byText('initial value')).toMatchObject({ kind: 'descriptor', direction: 'forward' });
    expect(byText('Steps of')).toMatchObject({ answerMode: 'list' });
    const cloze = byText('The ');
    expect(Object.values(cloze.clozeHints ?? {})).toEqual(['cache']);
    expect(byText('Hit avoids')).toMatchObject({ extraCardDetail: true });
  });

  it('keeps arrows that are not delimiters as text', () => {
    expect(byText('Average')).toMatchObject({ direction: 'none' });
  });

  it('round-trips through export', () => {
    const graph = createMemoryGraph(rems);
    const rootIds = rems.filter((r) => r.parentId === 'root').map((r) => r.id);
    const md = exportMarkdown(graph, rootIds);
    expect(md).toContain('- 3 - Scheduling');
    expect(md).toContain('    - Which algorithms are preemptive? {CORRECT: A, B} >>A)');
    expect(md).toContain('    - Semaphore :: integer counter');
    expect(md).toContain('        - initial value for mutex ;; 1');
    expect(md).toContain('    - Steps of a context switch >>1.');
    expect(md).toContain('    - The {{TLB}}{({cache})} caches PTEs');
    expect(md).toContain('#[[Extra Card Detail]]');
    // Re-import produces the same structure.
    const again = importMarkdown(md, 'root', ctx());
    expect(again).toHaveLength(rems.length);
    const mc = again.find((r) => r.answerMode === 'mc')!;
    expect(optionTexts(createMemoryGraph(again), mc.id)).toEqual(['SRTF', 'Round Robin', 'FCFS']);
  });

  it('resolves references and tags through the context', () => {
    const c = ctx();
    const [rem] = importMarkdown('- see [[Other]] #[[Book]]', null, c);
    expect(rem!.text).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'ref', remId: 'ref:Other' },
    ]);
    expect(rem!.tags).toEqual(['tag:Book']);
  });
});

describe('CSV', () => {
  it('detects delimiters and parses quoted fields', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t');
    expect(parseCsv('a,"b, ""c"""\n"multi\nline",x\n\n')).toEqual([
      ['a', 'b, "c"'],
      ['multi\nline', 'x'],
    ]);
  });
  it('creates cards', () => {
    const rems = csvToCardRems(parseCsv('front;back\nQ1;A1\n{{x}} y;'), {
      parentId: 'p',
      hasHeader: true,
    });
    expect(rems).toHaveLength(2);
    expect(rems[0]).toMatchObject({ parentId: 'p', direction: 'forward' });
    expect(rems[1]).toMatchObject({ direction: 'none', back: null });
  });
});

describe('OPML', () => {
  it('parses nested outlines with notes and entities', () => {
    const xml =
      '<opml><body><outline text="A &amp; B"><outline text="child" _note="note"/></outline><outline text="C" _complete="true"/></body></opml>';
    const nodes = parseOpml(xml);
    expect(nodes.map((n) => n.text)).toEqual(['A & B', 'C']);
    expect(nodes[0]!.children[0]!.children[0]!.text).toBe('note');
    expect(nodes[1]!.block.todo).toBe('finished');
  });
});

describe('backup', () => {
  it('round-trips and validates', () => {
    const b = createBackup(
      {
        settings: [],
        schedulers: [],
        rems: [],
        cards: [],
        logs: [],
        exams: [],
        annotations: [],
        lectures: [],
        lectureEvents: [],
      },
      5,
    );
    expect(parseBackup(JSON.stringify(b))).toEqual(b);
    expect(() => parseBackup('{"format":"x"}')).toThrow(/Not a RemCraft backup/);
    expect(
      parseBackup('{"format":"remcraft-backup","version":1,"collections":{}}').collections.rems,
    ).toEqual([]);
  });
});
