import { describe, expect, it, vi } from 'vitest';
import {
  BAKED_BUNDLE_VERSION,
  FEED_URL_OVERRIDE_KEY,
  UPDATE_BASE_URL,
  checksumMatches,
  compareVersions,
  downloadAndApplyUpdate,
  fetchUpdateManifest,
  isNewerVersion,
  isSha256,
  parseUpdateManifest,
  parseVersion,
  readInstalledVersions,
  requiresNativeUpdate,
  resolveFeedUrl,
} from '@/lib/mobileUpdater.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function validManifest(overrides = {}) {
  return {
    version: '1.0.2',
    url: 'https://genemap-discovery.vercel.app/mobile/bundle-1.0.2.zip',
    sha256: SHA_A,
    ...overrides,
  };
}

describe('version helpers', () => {
  it('parses dotted numeric versions and rejects placeholders', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v1.2')).toEqual([1, 2]);
    expect(parseVersion('builtin')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it('compares numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.0.1', '1.0.1')).toBe(false);
    // incomparable versions are never "newer" — we must not offer an update
    // just because we could not read the installed version.
    expect(isNewerVersion('1.0.2', 'builtin')).toBe(false);
  });
});

describe('checksum helpers', () => {
  it('accepts only a full 64-char hex digest', () => {
    expect(isSha256(SHA_A)).toBe(true);
    expect(isSha256(SHA_A.slice(0, 63))).toBe(false);
    expect(isSha256('')).toBe(false);
    expect(isSha256(undefined)).toBe(false);
  });

  it('treats a missing or malformed checksum as a MISMATCH, never a pass', () => {
    expect(checksumMatches(SHA_A, SHA_A.toUpperCase())).toBe(true);
    expect(checksumMatches(SHA_A, SHA_B)).toBe(false);
    expect(checksumMatches(SHA_A, '')).toBe(false);
    expect(checksumMatches(SHA_A, undefined)).toBe(false);
    expect(checksumMatches('', '')).toBe(false);
  });
});

describe('parseUpdateManifest', () => {
  it('normalizes a well-formed manifest', () => {
    const parsed = parseUpdateManifest(
      validManifest({ sha256: SHA_A.toUpperCase(), notes: 'hi', minNativeVersion: '1.2' }),
    );
    expect(parsed.version).toBe('1.0.2');
    expect(parsed.sha256).toBe(SHA_A);
    expect(parsed.notes).toBe('hi');
    expect(parsed.minNativeVersion).toBe('1.2');
  });

  it('rejects the SPA index.html the host serves for unknown paths', () => {
    expect(() => parseUpdateManifest('<!doctype html>')).toThrow(/no signed update manifest/i);
  });

  it('rejects a non-https bundle URL', () => {
    expect(() => parseUpdateManifest(validManifest({ url: 'http://evil.test/b.zip' }))).toThrow(
      /absolute https/i,
    );
  });

  it('FAILS CLOSED when the feed publishes no checksum', () => {
    const { sha256, ...withoutChecksum } = validManifest();
    expect(sha256).toBeTruthy();
    expect(() => parseUpdateManifest(withoutChecksum)).toThrow(/sha256/i);
  });

  it('FAILS CLOSED when the checksum is not a real sha256', () => {
    expect(() => parseUpdateManifest(validManifest({ sha256: 'deadbeef' }))).toThrow(/sha256/i);
  });
});

describe('resolveFeedUrl', () => {
  const store = { getItem: () => 'https://attacker.test/latest.json' };

  it('honours the localStorage override in development only', () => {
    expect(resolveFeedUrl({ localStorage: store, isDev: true })).toBe(
      'https://attacker.test/latest.json',
    );
  });

  it('IGNORES the localStorage override in production builds', () => {
    // Anything able to write localStorage could otherwise repoint the updater
    // at a host it controls. In production the feed origin is pinned.
    expect(resolveFeedUrl({ localStorage: store, isDev: false })).toBe(
      `${UPDATE_BASE_URL}/mobile/latest.json`,
    );
    expect(FEED_URL_OVERRIDE_KEY).toBe('genemap.mobileUpdateFeedUrl');
  });

  it('falls back to the pinned feed when storage throws', () => {
    const hostile = {
      getItem() {
        throw new Error('blocked');
      },
    };
    expect(resolveFeedUrl({ localStorage: hostile, isDev: true })).toBe(
      `${UPDATE_BASE_URL}/mobile/latest.json`,
    );
  });
});

describe('fetchUpdateManifest', () => {
  it('reports an HTTP failure honestly', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchUpdateManifest({ fetchImpl, feedUrl: 'https://x.test/f.json' })).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it('returns a parsed manifest and busts caches', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => validManifest() });
    const manifest = await fetchUpdateManifest({ fetchImpl, feedUrl: 'https://x.test/f.json' });
    expect(manifest.version).toBe('1.0.2');
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^https:\/\/x\.test\/f\.json\?ts=\d+$/);
    expect(fetchImpl.mock.calls[0][1].cache).toBe('no-store');
  });
});

describe('requiresNativeUpdate', () => {
  it('is false when the feed declares no native floor', () => {
    expect(requiresNativeUpdate({ minNativeVersion: '' }, '1.0')).toBe(false);
  });

  it('is false when the installed app meets the floor', () => {
    expect(requiresNativeUpdate({ minNativeVersion: '1.2' }, '1.2')).toBe(false);
    expect(requiresNativeUpdate({ minNativeVersion: '1.2' }, '1.3')).toBe(false);
  });

  it('is true when the installed app is below the floor', () => {
    expect(requiresNativeUpdate({ minNativeVersion: '1.2' }, '1.1')).toBe(true);
  });

  it('fails CLOSED when the native version cannot be read', () => {
    expect(requiresNativeUpdate({ minNativeVersion: '1.2' }, undefined)).toBe(true);
  });
});

describe('readInstalledVersions', () => {
  it('falls back to the baked version for capgo\'s "builtin" placeholder', async () => {
    const updater = { current: async () => ({ bundle: { version: 'builtin' }, native: '1.0' }) };
    const versions = await readInstalledVersions({ updater });
    // "builtin" carries no version; treating it as unknown would make every
    // comparison report "up to date" and hide real updates.
    expect(versions.bundleVersion).toBe(BAKED_BUNDLE_VERSION);
    expect(versions.nativeVersion).toBe('1.0');
  });

  it('reports an active OTA bundle version as-is', async () => {
    const updater = { current: async () => ({ bundle: { version: '9.9.9' }, native: '1.0' }) };
    await expect(readInstalledVersions({ updater })).resolves.toEqual({
      bundleVersion: '9.9.9',
      nativeVersion: '1.0',
    });
  });

  it('survives a package built without the updater plugin', async () => {
    const updater = {
      current: async () => {
        throw new Error('plugin not available');
      },
    };
    await expect(readInstalledVersions({ updater })).resolves.toEqual({
      bundleVersion: BAKED_BUNDLE_VERSION,
      nativeVersion: null,
    });
  });
});

describe('downloadAndApplyUpdate', () => {
  function fakeUpdater({ checksum }) {
    return {
      download: vi.fn().mockResolvedValue({ id: 'bundle-id', version: '1.0.2', checksum }),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    };
  }

  it('passes the published checksum to the plugin and applies a verified bundle', async () => {
    const updater = fakeUpdater({ checksum: SHA_A });
    const progress = [];
    await downloadAndApplyUpdate(validManifest(), {
      updater,
      onProgress: (p) => progress.push(p),
    });
    expect(updater.download).toHaveBeenCalledWith({
      url: validManifest().url,
      version: '1.0.2',
      checksum: SHA_A,
    });
    expect(updater.set).toHaveBeenCalledWith({ id: 'bundle-id' });
    expect(updater.delete).not.toHaveBeenCalled();
  });

  it('REFUSES and deletes the bundle when the checksum does not match', async () => {
    const updater = fakeUpdater({ checksum: SHA_B });
    await expect(downloadAndApplyUpdate(validManifest(), { updater })).rejects.toThrow(
      /integrity check/i,
    );
    expect(updater.set).not.toHaveBeenCalled();
    expect(updater.delete).toHaveBeenCalledWith({ id: 'bundle-id' });
  });

  it('REFUSES when the plugin reports no checksum at all', async () => {
    const updater = fakeUpdater({ checksum: '' });
    await expect(downloadAndApplyUpdate(validManifest(), { updater })).rejects.toThrow(
      /integrity check/i,
    );
    expect(updater.set).not.toHaveBeenCalled();
  });

  it('REFUSES before downloading anything when the manifest has no checksum', async () => {
    const updater = fakeUpdater({ checksum: SHA_A });
    await expect(
      downloadAndApplyUpdate(
        /** @type {any} */ ({ version: '1.0.2', url: 'https://x.test/b.zip' }),
        { updater },
      ),
    ).rejects.toThrow(/did not publish a bundle checksum/i);
    expect(updater.download).not.toHaveBeenCalled();
  });
});
