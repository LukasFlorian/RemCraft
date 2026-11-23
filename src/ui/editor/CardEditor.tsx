/**
 * Inline editor of one flashcard Rem (front, back, answer children), used on
 * the practice screen and in the lecture cards widget.
 */
import type { ReactNode } from 'react';
import { useSelector } from '../app/context';
import { Outliner } from './Outliner';
import { t } from '@core/i18n';

/**
 * Edits the Rem of a card in place.
 *
 * Args:
 *   remId: The card's Rem.
 */
export function CardEditor({ remId }: { remId: string }): ReactNode {
  const parentId = useSelector((s) => s.get(remId)?.parentId ?? null);
  if (!parentId)
    return (
      <div className="muted">
        {t('This card is a top-level Rem; open it from the sidebar to edit.')}
      </div>
    );
  // Rendered inside its parent so the answer mode inherited from it applies.
  return <Outliner rootId={parentId} only={remId} embedded />;
}
