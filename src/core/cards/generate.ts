/**
 * Derives the flashcards of a Rem.
 *
 * Cards are *not* stored with the Rem: they are recomputed from the Rem's
 * content. Each card has a deterministic id (`${remId}/${slot}`), which links
 * it to its persistent {@link CardState}. Editing a question therefore keeps
 * its learning history, while deleting a cloze retires exactly that card.
 */
import type { AnswerMode, CardId, CardKind, Rem, RemId } from '../model/types';
import { clozeIds, isEmpty } from '../richtext/ops';

/** Description of one derived card. */
export interface CardSpec {
  id: CardId;
  remId: RemId;
  kind: CardKind;
  /** For cloze cards: the cloze id. */
  clozeId?: string;
  /** For image-occlusion cards: the occlusion id. */
  occlusionId?: string;
}

/** Slot names used in card ids. */
export const SLOT_FORWARD = 'f';
export const SLOT_BACKWARD = 'b';

/** Builds a card id from a Rem id and a slot. */
export function makeCardId(remId: RemId, slot: string): CardId {
  return `${remId}/${slot}`;
}

/** Splits a card id into Rem id and slot. */
export function parseCardId(id: CardId): { remId: RemId; slot: string } {
  const at = id.indexOf('/');
  return at === -1 ? { remId: id, slot: '' } : { remId: id.slice(0, at), slot: id.slice(at + 1) };
}

/**
 * Children that form the answer of a multi-line card (extra card details and
 * property values are excluded).
 */
export function answerChildren(children: readonly Rem[]): Rem[] {
  return children.filter((c) => !c.extraCardDetail && !c.propertyId && !c.isProperty);
}

/**
 * The answer mode actually used: an inline card without back text but with
 * children behaves like a multi-line (set) card - this is how RemNote's
 * "`==` then Enter" multi-line cards work.
 */
export function effectiveAnswerMode(rem: Rem, children: readonly Rem[]): AnswerMode {
  if (rem.answerMode === 'inline' && isEmpty(rem.back) && answerChildren(children).length > 0)
    return 'set';
  return rem.answerMode;
}

/** True when a Rem has an answer usable for forward/backward cards. */
function hasAnswer(rem: Rem, mode: AnswerMode, children: readonly Rem[]): boolean {
  switch (mode) {
    case 'inline':
      return !isEmpty(rem.back);
    case 'set':
    case 'list':
      return answerChildren(children).length > 0;
    case 'mc':
      return answerChildren(children).length >= 2;
  }
}

/**
 * Computes all cards of a Rem.
 *
 * @param rem The Rem.
 * @param children Its ordered children (needed for multi-line cards).
 * @returns Card descriptions in a stable order.
 */
export function generateCards(rem: Rem, children: readonly Rem[]): CardSpec[] {
  if (rem.direction === 'disabled' || rem.extraCardDetail || rem.isFolder || rem.isProperty)
    return [];
  const cards: CardSpec[] = [];

  // Cloze deletions: one card per distinct cloze id (merged clozes share an id).
  for (const clozeId of clozeIds(rem.text)) {
    cards.push({ id: makeCardId(rem.id, `c:${clozeId}`), remId: rem.id, kind: 'cloze', clozeId });
  }

  // Front/back cards from the separator.
  if (rem.direction !== 'none') {
    const mode = effectiveAnswerMode(rem, children);
    if (hasAnswer(rem, mode, children) && !isEmpty(rem.text)) {
      if (rem.direction === 'forward' || rem.direction === 'both') {
        cards.push({ id: makeCardId(rem.id, SLOT_FORWARD), remId: rem.id, kind: 'forward' });
      }
      if ((rem.direction === 'backward' || rem.direction === 'both') && mode !== 'mc') {
        cards.push({ id: makeCardId(rem.id, SLOT_BACKWARD), remId: rem.id, kind: 'backward' });
      }
    }
  }

  // Image occlusion.
  for (const occ of rem.image?.occlusions ?? []) {
    cards.push({
      id: makeCardId(rem.id, `o:${occ.id}`),
      remId: rem.id,
      kind: 'occlusion',
      occlusionId: occ.id,
    });
  }
  return cards;
}

/**
 * Human-readable card type label (used in the card browser).
 */
export function cardTypeLabel(rem: Rem, spec: CardSpec, children: readonly Rem[]): string {
  if (spec.kind === 'cloze') return 'Cloze';
  if (spec.kind === 'occlusion') return 'Image occlusion';
  const mode = effectiveAnswerMode(rem, children);
  const dir = spec.kind === 'backward' ? ' (backward)' : '';
  const base =
    mode === 'mc'
      ? 'Multiple choice'
      : mode === 'list'
        ? 'List answer'
        : mode === 'set'
          ? 'Multi-line'
          : rem.kind === 'concept'
            ? 'Concept'
            : rem.kind === 'descriptor'
              ? 'Descriptor'
              : 'Basic';
  return base + dir;
}
