/**
 * Handout layouts: find the individual slides on a PDF page (port of Fokus
 * `layout.py`). Works on *ink masks* (non-white pixels of pages rendered at
 * low resolution, produced by the PDF engine) and on the rectangles of
 * embedded images, so it stays independent of the PDF library.
 *
 * Boxes are relative page coordinates `[x0, y0, x1, y1]`.
 */

/** Layout modes: `auto` or rows × columns. */
export const LAYOUT_MODES: Record<string, string> = {
  auto: 'Automatisch erkennen',
  '1x1': '1 Folie pro Seite',
  '2x1': '2 untereinander',
  '1x2': '2 nebeneinander',
  '3x1': '3 untereinander',
  '2x2': '4 (2×2)',
  '3x2': '6 (3×2)',
};

/** The whole page. */
export const FULL_PAGE: number[] = [0, 0, 1, 1];

/** A boolean image (row-major, 1 = ink). */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

/** Share of ink per row. */
function rowProfile(m: Mask, c0 = 0, c1 = m.w): number[] {
  const out: number[] = [];
  for (let r = 0; r < m.h; r++) {
    let n = 0;
    for (let c = c0; c < c1; c++) n += m.data[r * m.w + c]!;
    out.push(n / Math.max(1, c1 - c0));
  }
  return out;
}

/** Share of ink per column within rows `[r0, r1)`. */
function colProfile(m: Mask, r0 = 0, r1 = m.h): number[] {
  const out = new Array<number>(m.w).fill(0);
  for (let r = r0; r < r1; r++) for (let c = 0; c < m.w; c++) out[c]! += m.data[r * m.w + c]!;
  return out.map((n) => n / Math.max(1, r1 - r0));
}

/** Contiguous true runs `[start, end)`; gaps shorter than `minGap` are bridged. */
export function runs(profile: boolean[], minGap: number): [number, number][] {
  const out: [number, number][] = [];
  profile.forEach((on, i) => {
    if (!on) return;
    const last = out[out.length - 1];
    if (last && i - last[1] < minGap) last[1] = i + 1;
    else out.push([i, i + 1]);
  });
  return out;
}

/** Removes thin text lines in the outer 7 % of the page (headers, footers, page numbers). */
export function dropMargins(m: Mask): Mask {
  const data = new Uint8Array(m.data);
  for (const [r0, r1] of runs(rowProfile(m).map((v) => v > 0.002), Math.max(2, Math.floor(0.01 * m.h)))) {
    const thin = r1 - r0 < 0.03 * m.h;
    if (thin && (r1 <= 0.07 * m.h || r0 >= 0.93 * m.h)) data.fill(0, r0 * m.w, r1 * m.w);
  }
  return { ...m, data };
}

/** Union of masks of equal size. */
export function unionMasks(masks: readonly Mask[]): Mask | null {
  const first = masks[0];
  if (!first) return null;
  const data = new Uint8Array(first.data);
  for (const m of masks.slice(1)) {
    if (m.w !== first.w || m.h !== first.h) continue;
    for (let i = 0; i < data.length; i++) data[i] = data[i]! | m.data[i]!;
  }
  return dropMargins({ w: first.w, h: first.h, data });
}

/** Relative box from pixel bounds with padding. */
function toRel(r0: number, r1: number, c0: number, c1: number, m: Mask, pad = 0.004): number[] {
  return [Math.max(0, c0 / m.w - pad), Math.max(0, r0 / m.h - pad), Math.min(1, c1 / m.w + pad), Math.min(1, r1 / m.h + pad)];
}

/** Real handout slides have (nearly) equal sizes. */
function consistent(boxes: number[][]): boolean {
  const ws = boxes.map((b) => b[2]! - b[0]!);
  const hs = boxes.map((b) => b[3]! - b[1]!);
  return Math.max(...ws) / Math.min(...ws) < 1.35 && Math.max(...hs) / Math.min(...hs) < 1.35;
}

/**
 * Finds big content blocks (≥ 12 % page height, ≥ 25 % width) row by row.
 * Falls back to the full page for landscape pages and to a 2×1 grid for
 * portrait pages with inconsistent blocks.
 */
export function detectAuto(u: Mask): number[][] {
  const boxes: number[][] = [];
  for (const [r0, r1] of runs(rowProfile(u).map((v) => v > 0.002), Math.max(2, Math.floor(0.015 * u.h)))) {
    if (r1 - r0 < 0.12 * u.h) continue;
    for (const [c0, c1] of runs(colProfile(u, r0, r1).map((v) => v > 0.002), Math.max(2, Math.floor(0.03 * u.w)))) {
      if (c1 - c0 >= 0.25 * u.w) boxes.push(toRel(r0, r1, c0, c1, u));
    }
  }
  if (boxes.length > 1 && consistent(boxes)) return boxes;
  return u.h > 1.2 * u.w ? detectGrid(u, 2, 1) : [FULL_PAGE];
}

/** Bounding box `[r0, r1, c0, c1]` of all content in a region. */
function contentBox(m: Mask, y0: number, y1: number, x0: number, x1: number): [number, number, number, number] | null {
  let r0 = -1;
  let r1 = -1;
  let c0 = x1;
  let c1 = -1;
  for (let r = y0; r < y1; r++) {
    let n = 0;
    for (let c = x0; c < x1; c++) n += m.data[r * m.w + c]!;
    if (n / Math.max(1, x1 - x0) > 0.002) {
      if (r0 < 0) r0 = r;
      r1 = r + 1;
    }
  }
  for (let c = x0; c < x1; c++) {
    let n = 0;
    for (let r = y0; r < y1; r++) n += m.data[r * m.w + c]!;
    if (n / Math.max(1, y1 - y0) > 0.002) {
      c0 = Math.min(c0, c);
      c1 = c + 1;
    }
  }
  return r0 < 0 || c1 < 0 ? null : [r0, r1, c0, c1];
}

/** Splits into a grid and tightens each cell to its content. */
export function detectGrid(u: Mask, rows: number, cols: number): number[][] {
  if (rows === 1 && cols === 1) return [FULL_PAGE];
  const boxes: number[][] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const y0 = Math.floor((i * u.h) / rows);
      const y1 = Math.floor(((i + 1) * u.h) / rows);
      const x0 = Math.floor((j * u.w) / cols);
      const x1 = Math.floor(((j + 1) * u.w) / cols);
      const cell = [x0 / u.w, y0 / u.h, x1 / u.w, y1 / u.h];
      const block = contentBox(u, y0, y1, x0, x1);
      if (!block) {
        boxes.push(cell);
        continue;
      }
      const [r0, r1, c0, c1] = block;
      // Too little content to trust a tight box: keep the cell.
      if ((r1 - r0) * (c1 - c0) < 0.25 * (y1 - y0) * (x1 - x0)) boxes.push(cell);
      else boxes.push(toRel(r0, r1, c0, c1, u, 0.015));
    }
  }
  return boxes;
}

/** Intersection over the smaller box. */
function overlapRatio(a: number[], b: number[]): number {
  const w = Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!));
  const h = Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!));
  const small = Math.min((a[2]! - a[0]!) * (a[3]! - a[1]!), (b[2]! - b[0]!) * (b[3]! - b[1]!));
  return small > 0 ? (w * h) / small : 0;
}

/**
 * Slide boxes from embedded images (screenshots pasted into a handout): if
 * the sampled pages consistently contain the same number of large images at
 * the same positions, their median positions are the slides.
 *
 * @param pages Relative image rectangles per sampled page.
 * @param portrait Pages are portrait.
 */
export function detectImages(pages: readonly number[][][], portrait: boolean): number[][] | null {
  const layouts = pages.map((rects) => {
    const boxes: number[][] = [];
    for (const r of rects) {
      const rel = [Math.max(0, r[0]!), Math.max(0, r[1]!), Math.min(1, r[2]!), Math.min(1, r[3]!)];
      if ((rel[2]! - rel[0]!) * (rel[3]! - rel[1]!) >= 0.12 && !boxes.some((b) => overlapRatio(rel, b) > 0.5)) boxes.push(rel);
    }
    return boxes.sort((a, b) => Math.round(a[1]! * 10) - Math.round(b[1]! * 10) || a[0]! - b[0]!);
  });
  if (layouts.length === 0) return null;
  const counts = layouts.map((l) => l.length);
  const n = [...new Set(counts)].sort((a, b) => counts.filter((c) => c === b).length - counts.filter((c) => c === a).length || b - a)[0]!;
  if (n === 0 || (n === 1 && !portrait)) return null;
  const same = layouts.filter((l) => l.length === n);
  if (same.length < Math.max(1, 0.6 * layouts.length)) return null;
  const result: number[][] = [];
  for (let k = 0; k < n; k++) {
    const box: number[] = [];
    for (let c = 0; c < 4; c++) {
      const vals = same.map((l) => l[k]![c]!).sort((a, b) => a - b);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      if (sd > 0.03) return null;
      box.push(Math.round(vals[Math.floor(vals.length / 2)]! * 10000) / 10000);
    }
    result.push(box);
  }
  return result;
}

/** Input for {@link detectLayout}, produced by the PDF engine. */
export interface LayoutInput {
  /** Ink masks of evenly spaced sample pages. */
  sampleMasks: Mask[];
  /** Image rectangles of the same sample pages. */
  sampleImages: number[][][];
  portrait: boolean;
}

/** Computes the slide boxes of a deck for a layout mode. */
export function detectBoxes(input: LayoutInput, mode = 'auto'): number[][] {
  const union = unionMasks(input.sampleMasks);
  if (mode === 'auto' || !(mode in LAYOUT_MODES)) {
    return detectImages(input.sampleImages, input.portrait) ?? (union ? detectAuto(union) : [FULL_PAGE]);
  }
  const [rows, cols] = mode.split('x').map(Number);
  return union ? detectGrid(union, rows!, cols!) : [FULL_PAGE];
}

/**
 * Which boxes of a page actually contain a slide (empty cells, e.g. the lower
 * half of the last page with an odd slide count, are skipped).
 */
export function nonEmptyBoxes(mask: Mask, boxes: readonly number[][]): number[] {
  if (boxes.length === 1) return [0];
  const out: number[] = [];
  boxes.forEach(([x0, y0, x1, y1], b) => {
    const r0 = Math.floor(y0! * mask.h);
    const r1 = Math.floor(y1! * mask.h);
    const c0 = Math.floor(x0! * mask.w);
    const c1 = Math.floor(x1! * mask.w);
    let n = 0;
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) n += mask.data[r * mask.w + c]!;
    // A frame alone is ~1-2 % ink; an empty cell is ~0 %.
    if ((r1 - r0) * (c1 - c0) > 0 && n / ((r1 - r0) * (c1 - c0)) > 0.003) out.push(b);
  });
  return out;
}
