import { describe, expect, it } from 'vitest';
import { betaFeatures, isFeatureEnabled, parseChannel } from './features';

describe('feature flags', () => {
  it('shows beta features only in the beta channel', () => {
    expect(isFeatureEnabled('habits', 'beta')).toBe(true);
    expect(isFeatureEnabled('habits', 'stable')).toBe(false);
    expect(betaFeatures().map((f) => f.name)).toContain('habits');
  });

  it('parses the channel', () => {
    expect(parseChannel('beta')).toBe('beta');
    expect(parseChannel(undefined)).toBe('stable');
    expect(parseChannel('prod')).toBe('stable');
  });
});
