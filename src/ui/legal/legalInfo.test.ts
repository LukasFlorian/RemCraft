import { describe, expect, it } from 'vitest';
import { isLegalInfoComplete, legalInfo } from './legalInfo';

describe('legalInfo', () => {
  it('splits the address on |, real and literal newlines', () => {
    const info = legalInfo({
      VITE_LEGAL_NAME: ' Max Muster ',
      VITE_LEGAL_ADDRESS: 'Straße 1|12345 Stadt\\nDeutschland',
      VITE_LEGAL_EMAIL: 'max@example.org',
    });
    expect(info.name).toBe('Max Muster');
    expect(info.address).toEqual(['Straße 1', '12345 Stadt', 'Deutschland']);
    expect(isLegalInfoComplete(info)).toBe(true);
  });

  it('reports missing details', () => {
    const info = legalInfo({});
    expect(info.address).toEqual([]);
    expect(isLegalInfoComplete(info)).toBe(false);
  });
});
