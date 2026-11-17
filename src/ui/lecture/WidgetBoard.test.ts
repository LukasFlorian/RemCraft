import { moveEdge } from './WidgetBoard';

describe('moveEdge', () => {
  // | a (0-6) | b (6-18) | c (18-24) |   top half
  // |      d (0-12)      | e (12-24) |   bottom half
  const layout = {
    a: { x: 0, y: 0, w: 6, h: 12 },
    b: { x: 6, y: 0, w: 12, h: 12 },
    c: { x: 18, y: 0, w: 6, h: 12 },
    d: { x: 0, y: 12, w: 12, h: 12 },
    e: { x: 12, y: 12, w: 12, h: 12 },
  };
  const ids = Object.keys(layout);

  it('moves a shared vertical border like split panes', () => {
    const next = moveEdge(layout, ids, 'a', 'x', 6, 2);
    expect(next.a).toMatchObject({ x: 0, w: 8 });
    expect(next.b).toMatchObject({ x: 8, w: 10 });
    // The bottom row has no border at x = 6 and stays as it is.
    expect(next.d).toEqual(layout.d);
  });

  it('moves a horizontal border for all widgets on it', () => {
    const next = moveEdge(layout, ids, 'b', 'y', 12, -3);
    for (const id of ['a', 'b', 'c']) expect(next[id as 'a']!.h).toBe(9);
    for (const id of ['d', 'e']) expect(next[id as 'd']).toMatchObject({ y: 9, h: 15 });
  });

  it('keeps a minimum size', () => {
    const next = moveEdge(layout, ids, 'a', 'x', 6, -10);
    expect(next.a!.w).toBe(3);
    expect(next.b).toMatchObject({ x: 3, w: 15 });
  });
});
