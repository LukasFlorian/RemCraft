/**
 * Share scopes: which parts of a subtree are shared.
 *
 * A subtree (folder, course, slide deck, document) consists of four kinds of
 * content, each of which can be switched on or off:
 *
 * - **slides**: the PDF of a slide deck and the slide Rems,
 * - **notes**: everything written below slides and in documents,
 * - **cards**: Rems that generate flashcards (incl. answer children),
 * - **annotations**: ink, text boxes and highlights on the slides.
 *
 * Containers (folders, documents, decks, slides) are kept whenever something
 * inside them is shared, so the structure stays recognisable. Without
 * `cards`, flashcard Rems shared as notes are disabled (no cards, no clozes).
 * Pure functions only - used by snapshots (read-only shares) and the UI.
 */
import { answerChildren, effectiveAnswerMode, generateCards } from '../cards/generate';
import type { RemGraph } from '../model/graph';
import type { Rem, RemId } from '../model/types';
import { removeCloze } from '../richtext/ops';

/** The parts of a subtree included in a share. */
export interface ShareScope {
  slides: boolean;
  notes: boolean;
  cards: boolean;
  annotations: boolean;
}

/** Named scope presets offered in the UI. */
export type SharePreset = 'all' | 'slides-notes' | 'notes' | 'cards' | 'slides';

/** Preset definitions with German labels (UI language of the lecture features). */
export const SHARE_PRESETS: Record<
  SharePreset,
  { label: string; hint: string; scope: ShareScope }
> = {
  all: {
    label: 'Alles',
    hint: 'Folien, Notizen, Karten und Annotationen',
    scope: { slides: true, notes: true, cards: true, annotations: true },
  },
  'slides-notes': {
    label: 'Folien + Notizen',
    hint: 'ohne Karteikarten',
    scope: { slides: true, notes: true, cards: false, annotations: true },
  },
  notes: {
    label: 'Nur Notizen',
    hint: 'Notizen ohne Folien-PDF; Karten werden zu normalen Notizen',
    scope: { slides: false, notes: true, cards: false, annotations: false },
  },
  cards: {
    label: 'Nur Karteikarten',
    hint: 'nur Karten (mit ihrer Gliederung als Kontext)',
    scope: { slides: false, notes: false, cards: true, annotations: false },
  },
  slides: {
    label: 'Nur Folien',
    hint: 'Foliensatz ohne eigene Notizen',
    scope: { slides: true, notes: false, cards: false, annotations: true },
  },
};

/** The preset matching a scope exactly, if any. */
export function presetOf(scope: ShareScope): SharePreset | undefined {
  return (Object.keys(SHARE_PRESETS) as SharePreset[]).find((p) => {
    const s = SHARE_PRESETS[p].scope;
    return (
      s.slides === scope.slides &&
      s.notes === scope.notes &&
      s.cards === scope.cards &&
      s.annotations === scope.annotations
    );
  });
}

/** Short human-readable description of a scope. */
export function describeScope(scope: ShareScope): string {
  const preset = presetOf(scope);
  if (preset) return SHARE_PRESETS[preset].label;
  const parts = [
    scope.slides && 'Folien',
    scope.notes && 'Notizen',
    scope.cards && 'Karten',
    scope.annotations && 'Annotationen',
  ].filter(Boolean);
  return parts.join(' + ') || 'leer';
}

/** True for Rems that only structure content (folders, documents, decks, slides). */
export function isContainer(rem: Rem): boolean {
  return rem.isFolder || rem.isDocument || rem.deck !== undefined || rem.slide !== undefined;
}

/** True when the Rem itself generates flashcards. */
export function isCardRem(rem: Rem, children: readonly Rem[]): boolean {
  return generateCards(rem, children).length > 0;
}

/** Result of {@link selectScope}. */
export interface ScopeSelection {
  /** Included Rems (pre-order, root first), already transformed for the scope. */
  rems: Rem[];
  /** Slide Rems whose annotations are included. */
  annotatedSlides: RemId[];
}

/**
 * Selects the part of a subtree covered by a scope.
 *
 * @param graph Rem graph.
 * @param rootId Root of the shared subtree (always included).
 * @param scope Parts to include.
 */
export function selectScope(graph: RemGraph, rootId: RemId, scope: ShareScope): ScopeSelection {
  const root = graph.get(rootId);
  if (!root) return { rems: [], annotatedSlides: [] };
  const out: Rem[] = [];
  const annotatedSlides: RemId[] = [];

  /**
   * Visits a Rem; returns whether it (or something below it) is included.
   * `answerOf` is set for answer children of a card (they follow the card).
   */
  const visit = (rem: Rem, answerOf: 'card' | null, isRoot: boolean): boolean => {
    const children = graph.children(rem.id);
    const card = answerOf === 'card' || isCardRem(rem, children) || rem.extraCardDetail === true;
    const container = isContainer(rem);
    // Content rule for the Rem itself.
    let own: boolean;
    if (container)
      own =
        isRoot ||
        (rem.slide !== undefined && scope.slides) ||
        (rem.deck !== undefined && scope.slides);
    else if (card) own = scope.cards || scope.notes;
    else own = scope.notes;

    // Answer children of a card follow the card (MC options, list items, …).
    const answers =
      card && answerOf === null && effectiveAnswerMode(rem, children) !== 'inline'
        ? new Set(answerChildren(children).map((c) => c.id))
        : new Set<RemId>();

    const index = out.length;
    out.push(rem); // placeholder, removed below when nothing is included
    let any = false;
    for (const child of children) {
      const followsCard = answers.has(child.id) || (card && child.extraCardDetail === true);
      if (followsCard && !own) continue;
      if (visit(child, followsCard ? 'card' : null, false)) any = true;
    }
    if (!own && !any) {
      out.splice(index);
      return false;
    }
    out[index] = transform(rem, scope, card && !scope.cards, isRoot);
    if (rem.slide && scope.slides && scope.annotations) annotatedSlides.push(rem.id);
    return true;
  };

  visit(root, null, true);
  return { rems: out, annotatedSlides };
}

/**
 * Applies the scope to one Rem: strips slide data without `slides` and turns
 * flashcards into plain notes without `cards`.
 */
function transform(rem: Rem, scope: ShareScope, disableCard: boolean, isRoot: boolean): Rem {
  const next: Rem = { ...rem };
  if (!scope.slides) {
    delete next.deck;
    delete next.slide;
    delete next.slideText;
    if (rem.deck) next.isDocument = true;
  }
  if (!scope.notes) delete next.slideFlags;
  if (disableCard) {
    next.direction = 'disabled';
    next.text = removeCloze(rem.text);
    if (rem.back) next.back = removeCloze(rem.back);
    delete next.clozeHints;
  }
  if (isRoot) next.parentId = null;
  return next;
}
