/**
 * Channel of the running build and feature checks for the UI.
 */
import { isFeatureEnabled, parseChannel } from '@core/release/features';
import type { Channel, FeatureName } from '@core/release/features';

/** Channel of this build (`VITE_CHANNEL`, default stable). */
export const CHANNEL: Channel = parseChannel(
  (import.meta.env as Record<string, string | undefined>).VITE_CHANNEL,
);

/**
 * Whether a flagged feature is shown in this build.
 *
 * Args:
 *   name: The feature.
 */
export function feature(name: FeatureName): boolean {
  return isFeatureEnabled(name, CHANNEL);
}

/**
 * URL of the other channel's app (beta lives in `beta/` below the stable app).
 *
 * The beta link points to `beta/index.html`: the stable app's service worker
 * also covers `beta/` (same origin, parent scope), and older versions of it
 * answered every app URL with the stable app. URLs of files (with an
 * extension) always go to the network, so this reaches the beta reliably.
 *
 * Returns:
 *   Absolute path of the stable app when running beta, and vice versa.
 */
export function otherChannelUrl(): string {
  const base = import.meta.env.BASE_URL; // e.g. "/RemCraft/" or "/RemCraft/beta/"
  return CHANNEL === 'beta' ? base.replace(/beta\/$/, '') : `${base}beta/index.html`;
}

/**
 * When the stable app was served at a beta URL (an outdated service worker
 * answered it from its cache), reloads the real beta app.
 *
 * Args:
 *   location: Current location (pathname and hash are read).
 *   base: Base path of this build.
 *
 * Returns:
 *   The URL to load instead, or `null` when this build belongs here.
 */
export function wrongChannelRedirect(
  location: { pathname: string; hash: string },
  base: string = import.meta.env.BASE_URL,
): string | null {
  if (CHANNEL !== 'stable') return null;
  const beta = `${base}beta`;
  const p = location.pathname;
  if (p !== beta && p !== `${beta}/` && !p.startsWith(`${beta}/`)) return null;
  // Already the file URL: the network answered with the stable app, stop here.
  if (p.endsWith('/index.html')) return null;
  return `${beta}/index.html${location.hash}`;
}
