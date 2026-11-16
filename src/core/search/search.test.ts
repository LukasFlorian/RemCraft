import { createRem } from '../model/factories';
import { rt } from '../richtext/ops';
import { parseSearchQuery, search } from './search';

describe('search', () => {
  const items = [
    { rem: createRem({ id: 'doc', text: rt('Big Data'), isDocument: true }), text: 'Big Data' },
    {
      rem: createRem({ id: 'r1', text: rt('Data mining finds patterns in big data') }),
      text: 'Data mining finds patterns in big data',
    },
    {
      rem: createRem({ id: 'r2', text: rt('Clustering'), tags: ['t'], todo: 'unfinished' }),
      text: 'Clustering',
    },
    {
      rem: createRem({ id: 'r3', text: rt('Über Daten'), aliases: ['ueber'] }),
      text: 'Über Daten',
    },
  ];
  const tagName = (id: string) => (id === 't' ? 'ml' : '');

  it('ranks documents and exact matches first', () => {
    expect(search(items, 'big data', tagName).map((h) => h.remId)).toEqual(['doc', 'r1']);
  });
  it('folds accents and searches aliases', () => {
    expect(search(items, 'uber', tagName).map((h) => h.remId)).toEqual(['r3']);
    expect(search(items, 'ueber', tagName).map((h) => h.remId)).toEqual(['r3']);
  });
  it('filters by tag and flags', () => {
    expect(search(items, '#ml', tagName).map((h) => h.remId)).toEqual(['r2']);
    expect(search(items, 'is:unfinished', tagName).map((h) => h.remId)).toEqual(['r2']);
    expect(search(items, '', tagName)).toEqual([]);
  });
  it('parses queries', () => {
    expect(parseSearchQuery('"exact phrase" #Tag is:card x')).toEqual({
      terms: ['exact phrase', 'x'],
      tags: ['tag'],
      flags: ['card'],
    });
  });
});
