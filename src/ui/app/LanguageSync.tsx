/**
 * Keeps the interface language of this device in line with the synced
 * setting: another device changed it, so this one follows (with one reload,
 * because texts are translated when the app starts).
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { lang, setLang } from '@core/i18n';
import type { Lang } from '@core/i18n';
import { selectSettings } from '@data/selectors';
import type { RemCraftApp } from '@data/app';
import { useSelector } from './context';

/**
 * Changes the language everywhere: synced setting, this device, reload.
 *
 * Args:
 *   app: The app (settings are written through it).
 *   next: The new language.
 */
export function switchLanguage(app: RemCraftApp, next: Lang): void {
  if (next === lang()) return;
  app.settings.update({ language: next });
  setLang(next);
  // Persist the setting before reloading.
  void app.flush().then(() => window.location.reload());
}

/** Follows language changes made on other devices. */
export function LanguageSync(): ReactNode {
  const synced = useSelector((s) => selectSettings(s).language);
  useEffect(() => {
    if (synced && synced !== lang()) {
      setLang(synced);
      window.location.reload();
    }
  }, [synced]);
  return null;
}
