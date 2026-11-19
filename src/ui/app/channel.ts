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
 * Returns:
 *   Absolute path of the stable app when running beta, and vice versa.
 */
export function otherChannelUrl(): string {
  const base = import.meta.env.BASE_URL; // e.g. "/RemCraft/" or "/RemCraft/beta/"
  return CHANNEL === 'beta' ? base.replace(/beta\/$/, '') : `${base}beta/`;
}
