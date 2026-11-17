/**
 * PDF engine port + pdf.js implementation.
 *
 * Everything the lecture mode needs from a PDF: page count and size,
 * rendering (whole page or a slide box), low-resolution ink masks and image
 * rectangles for layout detection, and text with positions (search, anchors,
 * text selection). pdf.js is loaded lazily so it does not weigh on the
 * initial bundle.
 */
import type * as PdfJsModule from 'pdfjs-dist';
import type { Mask } from '@core/lecture/layout';

/** A positioned text run, coordinates relative to the page (0..1). */
export interface TextItem {
  str: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** An opened PDF. */
export interface PdfDoc {
  readonly pageCount: number;
  /** Page size in PDF points. */
  pageSize(page: number): Promise<{ width: number; height: number }>;
  /**
   * Renders a page (or a relative box of it) into a canvas.
   *
   * @param page 0-based page.
   * @param width Target width of the box in CSS pixels × device pixel ratio.
   * @param box Relative box `[x0, y0, x1, y1]` (default: the whole page).
   */
  render(page: number, width: number, box?: number[]): Promise<HTMLCanvasElement>;
  /** Ink mask of a page rendered `width` pixels wide (non-white pixels). */
  inkMask(page: number, width?: number): Promise<Mask>;
  /** Rectangles of embedded images (relative page coordinates). */
  imageRects(page: number): Promise<number[][]>;
  /** Text runs with positions. */
  text(page: number): Promise<TextItem[]>;
  destroy(): void;
}

/** Opens PDFs. */
export interface PdfEngine {
  open(data: ArrayBuffer | Blob): Promise<PdfDoc>;
}

type PdfJs = typeof PdfJsModule;
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads pdf.js and its worker once. */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const lib = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  return pdfjsPromise;
}

/** Multiplies two affine matrices `[a, b, c, d, e, f]`. */
function mul(m: number[], n: number[]): number[] {
  return [
    m[0]! * n[0]! + m[2]! * n[1]!,
    m[1]! * n[0]! + m[3]! * n[1]!,
    m[0]! * n[2]! + m[2]! * n[3]!,
    m[1]! * n[2]! + m[3]! * n[3]!,
    m[0]! * n[4]! + m[2]! * n[5]! + m[4]!,
    m[1]! * n[4]! + m[3]! * n[5]! + m[5]!,
  ];
}

/** pdf.js-backed {@link PdfEngine}. */
export const pdfJsEngine: PdfEngine = {
  async open(data) {
    const lib = await loadPdfJs();
    const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
    const doc = await lib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    const pages = new Map<number, Awaited<ReturnType<typeof doc.getPage>>>();
    const page = async (i: number) => {
      let p = pages.get(i);
      if (!p) {
        p = await doc.getPage(i + 1);
        pages.set(i, p);
      }
      return p;
    };

    const self: PdfDoc = {
      pageCount: doc.numPages,
      async pageSize(i) {
        const vp = (await page(i)).getViewport({ scale: 1 });
        return { width: vp.width, height: vp.height };
      },
      async render(i, width, box = [0, 0, 1, 1]) {
        const p = await page(i);
        const base = p.getViewport({ scale: 1 });
        const bw = (box[2]! - box[0]!) * base.width;
        const bh = (box[3]! - box[1]!) * base.height;
        const scale = Math.max(0.1, width / bw);
        const viewport = p.getViewport({
          scale,
          offsetX: -box[0]! * base.width * scale,
          offsetY: -box[1]! * base.height * scale,
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bw * scale));
        canvas.height = Math.max(1, Math.round(bh * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await p.render({ canvas, canvasContext: ctx, viewport }).promise;
        return canvas;
      },
      async inkMask(i, width = 360) {
        const canvas = await self.render(i, width);
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        const mask = new Uint8Array(canvas.width * canvas.height);
        for (let k = 0; k < mask.length; k++) {
          const gray = 0.299 * data[k * 4]! + 0.587 * data[k * 4 + 1]! + 0.114 * data[k * 4 + 2]!;
          mask[k] = gray < 235 ? 1 : 0;
        }
        return { w: canvas.width, h: canvas.height, data: mask };
      },
      async imageRects(i) {
        const lib = await loadPdfJs();
        const p = await page(i);
        const vp = p.getViewport({ scale: 1 });
        const ops = await p.getOperatorList();
        const stack: number[][] = [];
        let ctm = vp.transform as number[];
        const rects: number[][] = [];
        const imageOps = new Set([
          lib.OPS.paintImageXObject,
          lib.OPS.paintInlineImageXObject,
          lib.OPS.paintImageMaskXObject,
        ]);
        ops.fnArray.forEach((fn, k) => {
          if (fn === lib.OPS.save) stack.push(ctm);
          else if (fn === lib.OPS.restore) ctm = stack.pop() ?? ctm;
          else if (fn === lib.OPS.transform) ctm = mul(ctm, ops.argsArray[k] as number[]);
          else if (imageOps.has(fn)) {
            // Images are drawn into the unit square of the current transform.
            const pts = [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ].map(([x, y]) => [
              ctm[0]! * x! + ctm[2]! * y! + ctm[4]!,
              ctm[1]! * x! + ctm[3]! * y! + ctm[5]!,
            ]);
            const xs = pts.map((q) => q[0]!);
            const ys = pts.map((q) => q[1]!);
            rects.push([
              Math.min(...xs) / vp.width,
              Math.min(...ys) / vp.height,
              Math.max(...xs) / vp.width,
              Math.max(...ys) / vp.height,
            ]);
          }
        });
        return rects;
      },
      async text(i) {
        const p = await page(i);
        const vp = p.getViewport({ scale: 1 });
        const content = await p.getTextContent();
        const out: TextItem[] = [];
        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const [x, y] = vp.convertToViewportPoint(
            item.transform[4] as number,
            item.transform[5] as number,
          ) as [number, number];
          const h =
            Math.hypot(item.transform[2] as number, item.transform[3] as number) ||
            item.height ||
            10;
          out.push({
            str: item.str,
            x0: x / vp.width,
            y0: (y - h) / vp.height,
            x1: (x + item.width) / vp.width,
            y1: y / vp.height,
          });
        }
        return out;
      },
      destroy() {
        void doc.cleanup();
      },
    };
    return self;
  },
};

/** Text of the runs inside a relative box, in reading order. */
export function textInBox(items: readonly TextItem[], box: readonly number[]): string {
  const inside = items.filter((t) => {
    const cx = (t.x0 + t.x1) / 2;
    const cy = (t.y0 + t.y1) / 2;
    return cx >= box[0]! && cx <= box[2]! && cy >= box[1]! && cy <= box[3]!;
  });
  inside.sort((a, b) => Math.round(a.y0 * 200) - Math.round(b.y0 * 200) || a.x0 - b.x0);
  const lines: string[] = [];
  let lastY = -1;
  for (const t of inside) {
    if (lastY >= 0 && Math.abs(t.y0 - lastY) < 0.006) lines[lines.length - 1] += ` ${t.str}`;
    else lines.push(t.str);
    lastY = t.y0;
  }
  return lines
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
