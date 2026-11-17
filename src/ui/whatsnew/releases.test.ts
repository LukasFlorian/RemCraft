import { RELEASES, unseenReleases } from './releases';

describe('release notes', () => {
  const releases = [
    { id: '2026-11-18a', title: 'B', items: ['b'] },
    { id: '2026-11-17a', title: 'A', items: ['a'] },
  ];

  it('shows releases newer than the last seen one', () => {
    expect(unseenReleases('2026-11-17a', releases).map((r) => r.id)).toEqual(['2026-11-18a']);
    expect(unseenReleases('2026-11-18a', releases)).toEqual([]);
  });

  it('shows nothing to first-time users', () => {
    expect(unseenReleases(null, releases)).toEqual([]);
  });

  it('keeps the list newest first with unique ids', () => {
    const ids = RELEASES.map((r) => r.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
