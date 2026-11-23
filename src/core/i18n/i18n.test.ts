import { describe, expect, it } from 'vitest';
import { DE } from './de';
import { detectLang, t } from './index';

/** Source of every module below src (Vite loads them as raw text). */
const SOURCES = import.meta.glob(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Literal first arguments of t()/tr()/tn() calls, with the file they are in. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const call = /\b(?:t|tr)\(\s*(['"])((?:\\.|(?!\1).)*)\1/gs;
  const plural = /\btn\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3/gs;
  const unescape = (raw: string): string =>
    JSON.parse(`"${raw.replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"')}"`) as string;
  for (const [file, src] of Object.entries(SOURCES)) {
    for (const m of src.matchAll(call)) keys.set(unescape(m[2]!), file);
    for (const m of src.matchAll(plural)) {
      keys.set(unescape(m[2]!), file);
      keys.set(unescape(m[4]!), file);
    }
  }
  return keys;
}

describe('i18n', () => {
  it('has a German translation for every text passed to t()', () => {
    const missing = [...usedKeys()]
      .filter(([key]) => !(key in DE))
      .map(([key, file]) => `${key}  (${file})`);
    expect(missing).toEqual([]);
  });

  it('keeps the placeholders of every text', () => {
    const names = (s: string): string =>
      [...s.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',');
    const broken = Object.entries(DE).filter(([en, de]) => names(en) !== names(de));
    expect(broken).toEqual([]);
  });

  it('detects the language and fills in values', () => {
    expect(detectLang('de', 'en-US')).toBe('de');
    expect(detectLang(null, 'de-AT')).toBe('de');
    expect(detectLang(null, 'fr-FR')).toBe('en');
    expect(t('Imported {count} Rems', { count: 3 })).toMatch(/3/);
  });
});
