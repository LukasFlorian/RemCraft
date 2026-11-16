/**
 * Live plain-text title of a Rem.
 */
import type { RemId } from '@core/model/types';
import { toPlainText } from '@core/richtext/ops';
import { useSelector } from '../app/context';

/** Returns the Rem's plain-text title (re-renders when it changes). */
export function useRemTitle(id: RemId | null | undefined, fallback = 'Untitled'): string {
  return useSelector((s) => {
    if (!id) return fallback;
    const rem = s.get(id);
    if (!rem) return fallback;
    return toPlainText(rem.text, (r) => toPlainText(s.get(r)?.text ?? [])) || fallback;
  });
}
