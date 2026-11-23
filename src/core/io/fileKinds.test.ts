import { describe, expect, it } from 'vitest';
import { classifyByName, classifyJson, looksTabSeparated } from './fileKinds';

describe('file kinds', () => {
  it('recognises files by name and type', () => {
    expect(classifyByName('VL03.pdf')).toBe('pdf');
    expect(classifyByName('scan', 'application/pdf')).toBe('pdf');
    expect(classifyByName('notes.md')).toBe('markdown');
    expect(classifyByName('anki.txt')).toBe('markdown');
    expect(classifyByName('vocab.csv')).toBe('csv');
    expect(classifyByName('outline.opml')).toBe('opml');
    expect(classifyByName('photo.JPG')).toBe('image');
    expect(classifyByName('VL03.cards.json')).toBe('cards');
    expect(classifyByName('VL03.fokus.json')).toBe('cards');
    expect(classifyByName('Mappe.remcraft.json')).toBe('share');
    expect(classifyByName('data.json')).toBe('file');
    expect(classifyByName('slides.pptx')).toBe('file');
  });

  it('recognises JSON files by content', () => {
    expect(classifyJson({ format: 'remcraft-cards', cards: [] })).toBe('cards');
    expect(classifyJson({ format: 'remcraft-share' })).toBe('share');
    expect(classifyJson({ format: 'remcraft-backup' })).toBe('backup');
    expect(classifyJson({ hello: 1 })).toBeNull();
    expect(classifyJson(null)).toBeNull();
  });

  it('detects tab separated exports', () => {
    expect(looksTabSeparated('Haus\thouse\nBaum\ttree\n')).toBe(true);
    expect(looksTabSeparated('- Frage >> Antwort\n- Noch eine')).toBe(false);
  });
});
