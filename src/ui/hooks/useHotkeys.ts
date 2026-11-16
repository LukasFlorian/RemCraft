/**
 * Global keyboard shortcuts.
 */
import { useEffect, useRef } from 'react';

/** True on macOS (Cmd) - otherwise Ctrl is the primary modifier. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** True when the primary modifier (Cmd on macOS, Ctrl elsewhere) is pressed. */
export function isMod(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}

/** Display label of the primary modifier. */
export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

/** A shortcut definition: `mod+k`, `shift+?`, `escape`, … */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/** Normalises a keyboard event to the `mod+shift+key` form. */
export function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMod(e)) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

/** True when the event target is an editable element. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/**
 * Registers global shortcuts.
 *
 * @param map Combination -> handler.
 * @param options `allowInInputs`: also fire while typing in inputs.
 */
export function useHotkeys(map: HotkeyMap, options: { allowInInputs?: boolean; enabled?: boolean } = {}): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (options.enabled === false) return;
    const onKey = (e: KeyboardEvent): void => {
      const handler = ref.current[eventCombo(e)];
      if (!handler) return;
      if (!options.allowInInputs && isEditableTarget(e.target)) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options.allowInInputs, options.enabled]);
}
