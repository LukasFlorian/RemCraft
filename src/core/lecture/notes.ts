/**
 * Light-weight syntax inside slide notes (Fokus `notes.py`):
 * `? Warum …` is a question, answered once the line contains an arrow
 * (`→`, `->`, `=>`); `a >> b` lines are flashcards (handled by the normal
 * RemCraft card syntax).
 */
import { t } from '../i18n';

const ARROW = /→|->|=>/;

/** True when a line is a question (`? …`). */
export function isQuestion(line: string): boolean {
  return line.trimStart().startsWith('?') && line.trim().length > 1;
}

/** Questions of a text with their state. */
export function questions(text: string): { text: string; open: boolean }[] {
  return text
    .split('\n')
    .filter(isQuestion)
    .map((line) => {
      const body = line.trimStart().slice(1).trim();
      return { text: body, open: !ARROW.test(body) };
    });
}

/** Unanswered questions of a text. */
export function openQuestions(text: string): string[] {
  return questions(text)
    .filter((q) => q.open)
    .map((q) => q.text);
}

/** Labels of the slide markers. */
export const FLAG_LABELS = { important: t('Important'), unclear: t('Unclear') } as const;
/** Icons of the slide markers. */
export const FLAG_ICONS = { important: '★', unclear: '?' } as const;
