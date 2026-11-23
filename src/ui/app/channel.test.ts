import { describe, expect, it } from 'vitest';
import { otherChannelUrl, wrongChannelRedirect } from './channel';

describe('channel links (stable build)', () => {
  it('links to the beta by its file URL', () => {
    expect(otherChannelUrl()).toBe('/beta/index.html');
  });

  it('reloads the beta when the stable app was served at a beta URL', () => {
    expect(wrongChannelRedirect({ pathname: '/R/beta/', hash: '#/habits' }, '/R/')).toBe(
      '/R/beta/index.html#/habits',
    );
    expect(wrongChannelRedirect({ pathname: '/R/beta', hash: '' }, '/R/')).toBe(
      '/R/beta/index.html',
    );
    // Not a beta URL, or already the file URL (no redirect loop).
    expect(wrongChannelRedirect({ pathname: '/R/', hash: '' }, '/R/')).toBeNull();
    expect(wrongChannelRedirect({ pathname: '/R/betatest', hash: '' }, '/R/')).toBeNull();
    expect(wrongChannelRedirect({ pathname: '/R/beta/index.html', hash: '' }, '/R/')).toBeNull();
  });
});
