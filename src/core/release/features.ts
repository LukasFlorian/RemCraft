/**
 * Release channels and feature flags.
 *
 * RemCraft is deployed twice from `main`: the stable app at `/<repo>/` and a
 * beta app at `/<repo>/beta/` (`VITE_CHANNEL=beta`). New user-facing features
 * are registered here with status `beta`: they are merged into `main` once
 * the automated tests pass, but only the beta app shows them. After people
 * tested them for a while, the status becomes `stable` (plus a release note)
 * and the stable app shows them too. See docs/development.md → "Beta channel".
 */

/** Deployment channel of this build. */
export type Channel = 'stable' | 'beta';

/** Status of a feature. */
export type FeatureStatus = 'beta' | 'stable';

/** A feature behind a flag. */
export interface FeatureInfo {
  status: FeatureStatus;
  /** Name shown to beta testers. */
  title: string;
  /** One sentence for beta testers: what to try. */
  description: string;
}

/** All flagged features. Promote by setting `status: 'stable'`. */
export const FEATURES = {
  habits: {
    status: 'beta',
    title: 'Gewohnheiten',
    description:
      'Gewohnheiten mit Jahres-Raster, Zielen pro Tag/Woche/Monat, Serien, Statistiken, Notizen, Erinnerungen und Teilen-Karten.',
  },
  fileDrop: {
    status: 'beta',
    title: 'Dateien hineinziehen',
    description:
      'PDFs, Karten (.cards.json), Markdown, CSV, Freigaben, Bilder und andere Dateien einfach in die Seitenleiste, auf Ordner, Dokumente oder eine geöffnete Vorlesung ziehen.',
  },
} satisfies Record<string, FeatureInfo>;

/** Name of a flagged feature. */
export type FeatureName = keyof typeof FEATURES;

/**
 * Whether a feature is available in a channel.
 *
 * Args:
 *   name: The feature.
 *   channel: The channel of the running build.
 */
export function isFeatureEnabled(name: FeatureName, channel: Channel): boolean {
  const info: FeatureInfo = FEATURES[name];
  return info.status === 'stable' || channel === 'beta';
}

/** Features that are only available in the beta channel. */
export function betaFeatures(): (FeatureInfo & { name: FeatureName })[] {
  return (Object.entries(FEATURES) as [FeatureName, FeatureInfo][])
    .filter(([, f]) => f.status === 'beta')
    .map(([name, f]) => ({ name, ...f }));
}

/**
 * Channel from a build-time value (`VITE_CHANNEL`).
 *
 * Args:
 *   value: The variable, e.g. "beta".
 */
export function parseChannel(value: string | undefined): Channel {
  return value === 'beta' ? 'beta' : 'stable';
}
