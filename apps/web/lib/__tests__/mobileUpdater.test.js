import { describe, expect, it } from 'vitest';

import {
  compareVersions,
  fetchUpdateManifest,
  isNewerVersion,
  parseUpdateManifest,
  parseVersion,
  resolveFeedUrl,
  FEED_URL_OVERRIDE_KEY,
  UPDATE_BASE_URL,
} from '../mobileUpdater.js';

describe('mobileUpdater version compare', () => {
  it('parses dotted numeric versions and rejects non-versions', () => {
    expect(parseVersion('1.0.1')).toEqual([1, 0, 1]);
    expect(parseVersion('v2.10')).toEqual([2, 10]);
    expect(parseVersion('builtin')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it('orders numerically, not lexically, and pads missing parts with zero', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.1.0')).toBeLessThan(0);
  });

  it('is strict: equal or unparseable versions are never "newer"', () => {
    expect(isNewerVersion('1.0.1', '1.0.1')).toBe(false);
    expect(isNewerVersion('builtin', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.2', 'builtin')).toBe(false);
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
  });
});

describe('parseUpdateManifest', () => {
  it('accepts a valid manifest and normalizes optional fields', () => {
    expect(parseUpdateManifest({ version: '1.0.2', url: `${UPDATE_BASE_URL}/mobile/bundle-1.0.2.zip` })).toEqual({
      version: '1.0.2',
      url: `${UPDATE_BASE_URL}/mobile/bundle-1.0.2.zip`,
      notes: '',
      builtAt: '',
    });
  });

  it('rejects non-objects, bad versions, and non-https URLs honestly', () => {
    expect(() => parseUpdateManifest(null)).toThrow(/not available yet/);
    expect(() => parseUpdateManifest({ version: 'builtin', url: 'https://x/y.zip' })).toThrow(/invalid version/);
    expect(() => parseUpdateManifest({ version: '1.0.2', url: 'http://x/y.zip' })).toThrow(/absolute https/);
  });
});

describe('resolveFeedUrl', () => {
  it('defaults to the production feed and honors an explicit override', () => {
    expect(resolveFeedUrl({ localStorage: { getItem: () => null } })).toBe(`${UPDATE_BASE_URL}/mobile/latest.json`);
    const ls = { getItem: (k) => (k === FEED_URL_OVERRIDE_KEY ? 'http://localhost:8123/latest.json' : null) };
    expect(resolveFeedUrl({ localStorage: ls })).toBe('http://localhost:8123/latest.json');
  });
});

describe('fetchUpdateManifest', () => {
  it('fetches no-store with cache busting and validates the body', async () => {
    let seenUrl = null;
    let seenInit = null;
    const fetchImpl = async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ version: '9.9.9', url: `${UPDATE_BASE_URL}/mobile/bundle-9.9.9.zip` }),
      };
    };
    const manifest = await fetchUpdateManifest({ fetchImpl, feedUrl: 'https://example.test/mobile/latest.json' });
    expect(manifest.version).toBe('9.9.9');
    expect(seenUrl).toMatch(/^https:\/\/example\.test\/mobile\/latest\.json\?ts=\d+$/);
    expect(seenInit).toEqual({ cache: 'no-store' });
  });

  it('reports HTTP failures, network failures, and HTML bodies honestly', async () => {
    await expect(
      fetchUpdateManifest({ fetchImpl: async () => ({ ok: false, status: 404 }), feedUrl: 'https://x/l.json' }),
    ).rejects.toThrow(/HTTP 404/);
    await expect(
      fetchUpdateManifest({
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch');
        },
        feedUrl: 'https://x/l.json',
      }),
    ).rejects.toThrow(/Could not reach/);
    await expect(
      fetchUpdateManifest({
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        }),
        feedUrl: 'https://x/l.json',
      }),
    ).rejects.toThrow(/not available yet/);
  });
});
