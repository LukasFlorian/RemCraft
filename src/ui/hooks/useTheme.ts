/**
 * Applies the theme setting (`dark`, `light`, `system`) to the document.
 */
import { useEffect } from 'react';
import { selectSettings } from '@data/selectors';
import { useSelector } from '../app/context';

/** Keeps `<html data-theme>` in sync with the settings. */
export function useTheme(): void {
  const theme = useSelector((s) => selectSettings(s).theme);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const resolved = theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme;
      root.dataset.theme = resolved;
    };
    apply();
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [theme]);
}
