/**
 * Hooks for slide decks: the opened PDF, rendered slide images (cached) and
 * the slide texts with positions.
 */
import { useEffect, useState } from 'react';
import type { Rem, RemId } from '@core/model/types';
import type { PdfDoc, TextItem } from '@data/lecture/pdf';
import { useApp, useSelector } from '../app/context';
import { TITLE_VERSION } from '@data/services/lectures';

/** Rendered images by `src:page:box:width`. */
const imageCache = new Map<string, Promise<string>>();

/** Slide Rems of a deck (stable array between changes). */
export function useDeckSlides(deckId: RemId | null): Rem[] {
  return useSelector((s) =>
    deckId
      ? s.memo(`slides:${deckId}`, [s.collectionVersion('rems')], () =>
          s
            .children(deckId)
            .filter((r) => r.slide)
            .sort((a, b) => a.slide!.index - b.slide!.index),
        )
      : [],
  );
}

/** The opened PDF of a deck (`null` while loading, error message on failure). */
export function useDeckPdf(deckId: RemId | null): { pdf: PdfDoc | null; error: string | null } {
  const app = useApp();
  const src = useSelector((s) => (deckId ? s.get(deckId)?.deck?.src : undefined));
  const [state, setState] = useState<{ pdf: PdfDoc | null; error: string | null }>({
    pdf: null,
    error: null,
  });
  useEffect(() => {
    if (!deckId || !src) return;
    let alive = true;
    app.lectures
      .openDeck(deckId)
      .then((pdf) => alive && setState({ pdf, error: null }))
      .catch(
        (e: unknown) =>
          alive && setState({ pdf: null, error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      alive = false;
    };
  }, [app, deckId, src]);
  return state;
}

/**
 * Object URL of a rendered slide.
 *
 * @param deckId Deck document.
 * @param slide Slide Rem.
 * @param width Target width in CSS pixels (rounded up to a step to reuse renders).
 */
export function useSlideImage(
  deckId: RemId | null,
  slide: Rem | undefined,
  width: number,
): string | null {
  const app = useApp();
  const deck = useSelector((s) => (deckId ? s.get(deckId)?.deck : undefined));
  const [url, setUrl] = useState<string | null>(null);
  const page = slide?.slide?.page;
  const boxIdx = slide?.slide?.box ?? 0;
  const step = Math.max(160, Math.ceil((width * (window.devicePixelRatio || 1)) / 160) * 160);
  useEffect(() => {
    if (!deckId || !deck || page === undefined) return;
    const box = deck.boxes[boxIdx] ?? [0, 0, 1, 1];
    const key = `${deck.src}:${page}:${box.join(',')}:${step}`;
    let job = imageCache.get(key);
    if (!job) {
      job = app.lectures
        .openDeck(deckId)
        .then((pdf) => pdf.render(page, step, box))
        .then(
          (canvas) =>
            new Promise<string>((resolve) =>
              canvas.toBlob(
                (b) => resolve(b ? URL.createObjectURL(b) : canvas.toDataURL()),
                'image/png',
              ),
            ),
        );
      job.catch(() => imageCache.delete(key));
      imageCache.set(key, job);
    }
    let alive = true;
    void job.then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [app, deckId, deck, page, boxIdx, step]);
  return url;
}

/** Text runs of a slide, relative to the slide box (for selection and highlights). */
export function useSlideText(deckId: RemId | null, slide: Rem | undefined): TextItem[] {
  const app = useApp();
  const deck = useSelector((s) => (deckId ? s.get(deckId)?.deck : undefined));
  const [items, setItems] = useState<TextItem[]>([]);
  const page = slide?.slide?.page;
  const boxIdx = slide?.slide?.box ?? 0;
  useEffect(() => {
    if (!deckId || !deck || page === undefined) return;
    let alive = true;
    const box = deck.boxes[boxIdx] ?? [0, 0, 1, 1];
    const bw = box[2]! - box[0]!;
    const bh = box[3]! - box[1]!;
    void app.lectures
      .openDeck(deckId)
      .then((pdf) => pdf.text(page))
      .then((all) => {
        if (!alive) return;
        setItems(
          all
            .filter(
              (t) =>
                (t.x0 + t.x1) / 2 >= box[0]! &&
                (t.x0 + t.x1) / 2 <= box[2]! &&
                (t.y0 + t.y1) / 2 >= box[1]! &&
                (t.y0 + t.y1) / 2 <= box[3]!,
            )
            .map((t) => ({
              str: t.str,
              x0: (t.x0 - box[0]!) / bw,
              x1: (t.x1 - box[0]!) / bw,
              y0: (t.y0 - box[1]!) / bh,
              y1: (t.y1 - box[1]!) / bh,
            })),
        );
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [app, deckId, deck, page, boxIdx]);
  return items;
}

/** Decks whose titles were already re-detected in this session. */
const retitled = new Set<RemId>();

/**
 * Brings old decks up to the current slide title detection (once per deck):
 * re-reads the PDF text layout and renames generated slide titles.
 */
export function useUpToDateTitles(deckId: RemId): void {
  const app = useApp();
  const outdated = useSelector((s) => {
    const info = s.get(deckId)?.deck;
    return Boolean(info) && info!.titles !== TITLE_VERSION;
  });
  useEffect(() => {
    if (!outdated || retitled.has(deckId)) return;
    retitled.add(deckId);
    void app.lectures.retitle(deckId).catch(() => undefined);
  }, [app, deckId, outdated]);
}
