/**
 * Builds the question/answer *view model* of a card for the practice UI.
 *
 * The view model is UI-agnostic: it says *what* to show (which rich text,
 * which children, which cloze to hide), the React layer decides *how*.
 */
import { ancestors } from '../model/graph';
import type { RemGraph } from '../model/graph';
import type { CardId, Rem, RemId, RemImage, RemKind, RichText } from '../model/types';
import { toPlainText } from '../richtext/ops';
import { answerChildren, effectiveAnswerMode, parseCardId, SLOT_BACKWARD, SLOT_FORWARD } from './generate';

/** Fields shared by all card views. */
interface CommonView {
  cardId: CardId;
  remId: RemId;
  /** Ancestors (root first) shown as breadcrumb context. */
  context: RemId[];
  /** Rems marked as extra card detail, shown on the back. */
  extra: RemId[];
  /** The user must type the answer (inherited "type in answer" powerup). */
  typeIn: boolean;
  /** Plain-text answer used to grade typed answers. */
  expectedAnswer: string;
}

/** Front/back card (basic, concept, descriptor). */
export interface BasicView extends CommonView {
  type: 'basic';
  question: RichText;
  answer: RichText;
  reversed: boolean;
  kind: RemKind;
}

/** Multi-line card: answer items revealed at once. */
export interface SetView extends CommonView {
  type: 'set';
  question: RichText;
  items: RemId[];
  /** Backward card: the items are shown and the question is asked. */
  reversed: boolean;
  kind: RemKind;
}

/** List-answer card: items revealed one by one in order. */
export interface ListView extends CommonView {
  type: 'list';
  question: RichText;
  items: RemId[];
  reversed: boolean;
  kind: RemKind;
}

/** Multiple-choice card. */
export interface McView extends CommonView {
  type: 'mc';
  question: RichText;
  options: { remId: RemId; correct: boolean }[];
}

/** Cloze card. */
export interface ClozeView extends CommonView {
  type: 'cloze';
  text: RichText;
  clozeId: string;
  hint?: string;
  /** Back text of the Rem (shown as additional answer when present). */
  back: RichText | null;
}

/** Image-occlusion card. */
export interface OcclusionView extends CommonView {
  type: 'occlusion';
  question: RichText;
  image: RemImage;
  occlusionId: string;
}

/** View model of any card. */
export type CardView = BasicView | SetView | ListView | McView | ClozeView | OcclusionView;

/**
 * Whether a powerup flag is set on the Rem or any ancestor.
 */
function inherited(rem: Rem, chain: readonly Rem[], key: 'typeInAnswer' | 'hideContextInQueue'): boolean {
  if (rem[key]) return true;
  return chain.some((a) => a[key]);
}

/**
 * Determines which options of a multiple-choice Rem are correct. If no option
 * is explicitly marked, the first one is correct (RemNote's import rule).
 */
export function mcOptions(children: readonly Rem[]): { remId: RemId; correct: boolean }[] {
  const options = answerChildren(children);
  const anyMarked = options.some((o) => o.mcCorrect !== undefined);
  return options.map((o, i) => ({ remId: o.id, correct: anyMarked ? o.mcCorrect === true : i === 0 }));
}

/**
 * Builds the view model of a card.
 *
 * @param cardId Card id.
 * @param graph Rem graph.
 * @returns The view or `undefined` when the card no longer exists.
 */
export function buildCardView(cardId: CardId, graph: RemGraph): CardView | undefined {
  const { remId, slot } = parseCardId(cardId);
  const rem = graph.get(remId);
  if (!rem) return undefined;
  const chain = ancestors(graph, remId);
  const children = graph.children(remId);
  const refText = (id: RemId): string => toPlainText(graph.get(id)?.text ?? []);
  const common: CommonView = {
    cardId,
    remId,
    context: inherited(rem, chain, 'hideContextInQueue') ? [] : chain.map((a) => a.id),
    extra: children.filter((c) => c.extraCardDetail).map((c) => c.id),
    typeIn: inherited(rem, chain, 'typeInAnswer'),
    expectedAnswer: '',
  };

  if (slot.startsWith('c:')) {
    const clozeId = slot.slice(2);
    const hidden = rem.text.filter((s) => s.marks?.cloze === clozeId);
    if (hidden.length === 0) return undefined;
    const hint = rem.clozeHints?.[clozeId];
    return {
      ...common,
      type: 'cloze',
      text: rem.text,
      clozeId,
      ...(hint ? { hint } : {}),
      back: rem.back,
      expectedAnswer: toPlainText(hidden, refText),
    };
  }

  if (slot.startsWith('o:')) {
    const occlusionId = slot.slice(2);
    if (!rem.image?.occlusions?.some((o) => o.id === occlusionId)) return undefined;
    const label = rem.image.occlusions.find((o) => o.id === occlusionId)?.label ?? '';
    return { ...common, type: 'occlusion', question: rem.text, image: rem.image, occlusionId, expectedAnswer: label };
  }

  if (slot !== SLOT_FORWARD && slot !== SLOT_BACKWARD) return undefined;
  const reversed = slot === SLOT_BACKWARD;
  const mode = effectiveAnswerMode(rem, children);
  const items = answerChildren(children).map((c) => c.id);
  const itemsText = items.map((id) => refText(id)).join(', ');

  switch (mode) {
    case 'mc':
      return { ...common, type: 'mc', question: rem.text, options: mcOptions(children) };
    case 'set':
      return {
        ...common,
        type: 'set',
        question: rem.text,
        items,
        reversed,
        kind: rem.kind,
        expectedAnswer: reversed ? toPlainText(rem.text, refText) : itemsText,
      };
    case 'list':
      return {
        ...common,
        type: 'list',
        question: rem.text,
        items,
        reversed,
        kind: rem.kind,
        expectedAnswer: reversed ? toPlainText(rem.text, refText) : itemsText,
      };
    case 'inline': {
      const back = rem.back ?? [];
      return {
        ...common,
        type: 'basic',
        question: reversed ? back : rem.text,
        answer: reversed ? rem.text : back,
        reversed,
        kind: rem.kind,
        expectedAnswer: toPlainText(reversed ? rem.text : back, refText),
      };
    }
  }
}
