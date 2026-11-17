/**
 * Slide titles from the text layout of a slide deck.
 *
 * The first line in PDF order is often not the title: many templates write
 * footers ("NoSQL · Document Stores · 12"), course names or the lecturer
 * first. So titles are chosen by layout instead:
 *
 * 1. Lines that recur on many slides (footers, headers, dates, page numbers)
 *    are boilerplate and ignored.
 * 2. The title is the line with the largest font in the upper part of the
 *    slide; a title broken over two lines of the same size is joined.
 * 3. Without a usable candidate, the first non-boilerplate line is used.
 */

/** A positioned text run (coordinates relative to the page, 0..1). */
export interface TextRun {
  str: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A text line of a slide (coordinates relative to the slide box). */
export interface SlideLine {
  text: string;
  /** Top of the line (0 = top of the slide). */
  y: number;
  /** Line height relative to the slide height (≈ font size). */
  size: number;
}

/**
 * Groups the runs inside a slide box into lines.
 *
 * @param runs Runs of the page.
 * @param box Slide box `[x0, y0, x1, y1]` on the page.
 */
export function slideLines(runs: readonly TextRun[], box: readonly number[]): SlideLine[] {
  const [bx0, by0, bx1, by1] = box as [number, number, number, number];
  const h = Math.max(1e-6, by1 - by0);
  const inside = runs.filter((t) => {
    const cx = (t.x0 + t.x1) / 2;
    const cy = (t.y0 + t.y1) / 2;
    return t.str.trim() && cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1;
  });
  inside.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: (SlideLine & { sizes: number[] })[] = [];
  for (const t of inside) {
    const y = (t.y0 - by0) / h;
    const size = (t.y1 - t.y0) / h;
    const last = lines[lines.length - 1];
    if (last && Math.abs(y - last.y) < Math.max(0.012, size * 0.4)) {
      last.text += ` ${t.str}`;
      last.sizes.push(size);
      last.size = Math.max(...last.sizes);
    } else lines.push({ text: t.str, y, size, sizes: [size] });
  }
  return lines
    .map(({ text, y, size }) => ({ text: text.replace(/\s+/g, ' ').trim(), y, size }))
    .filter((l) => l.text);
}

/** Normalises a line for the boilerplate check (numbers vary on every slide). */
function key(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^\p{L}#]+/gu, ' ')
    .trim();
}

/** True for lines that cannot be a title (page numbers, dates, symbols). */
function meaningless(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return letters < 3;
}

/**
 * Titles of all slides of a deck.
 *
 * @param slides Lines per slide.
 * @returns One title per slide (empty when nothing usable was found).
 */
export function detectTitles(slides: readonly (readonly SlideLine[])[]): string[] {
  // Boilerplate: lines that occur on a large share of the slides.
  const count = new Map<string, number>();
  for (const lines of slides)
    for (const k of new Set(lines.map((l) => key(l.text)))) count.set(k, (count.get(k) ?? 0) + 1);
  const threshold = slides.length >= 4 ? Math.max(3, slides.length * 0.25) : Infinity;
  const boiler = (l: SlideLine): boolean =>
    (count.get(key(l.text)) ?? 0) >= threshold || meaningless(l.text);

  return slides.map((lines) => {
    const content = lines.filter((l) => !boiler(l));
    const upper = content.filter((l) => l.y < 0.5);
    if (upper.length === 0) return content[0]?.text ?? '';
    const max = Math.max(...upper.map((l) => l.size));
    const first = upper.find((l) => l.size >= max * 0.85)!;
    // A title broken over two lines: the next line has (almost) the same size and follows directly.
    const i = content.indexOf(first);
    const next = content[i + 1];
    const joined =
      next &&
      Math.abs(next.size - first.size) <= first.size * 0.15 &&
      next.y - first.y < first.size * 2.2
        ? `${first.text} ${next.text}`
        : first.text;
    return joined.replace(/\s+/g, ' ').trim();
  });
}
