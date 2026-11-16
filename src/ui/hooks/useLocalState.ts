/**
 * `useState` persisted in `localStorage` (per-device UI preferences such as
 * expanded sidebar items). Reads and writes are wrapped in try/catch because
 * storage can be unavailable (private mode, quota).
 */
import { useCallback, useState } from 'react';

/**
 * @param key Storage key (prefixed with `remcraft.ui.`).
 * @param initial Value used when nothing is stored.
 */
export function useLocalState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const fullKey = `remcraft.ui.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(fullKey, JSON.stringify(resolved));
        } catch {
          // ignore
        }
        return resolved;
      });
    },
    [fullKey],
  );
  return [value, set];
}
