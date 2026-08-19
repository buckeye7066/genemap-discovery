import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobileUpdateCard from '../settings/MobileUpdateCard';

/**
 * This card WAS a link-only pointer at GitHub releases, because the sibling
 * app (sermonsmith PR #96) had removed an OTA path that applied a bundle it
 * could not verify. The owner asked for the in-app update back on 2026-08-19,
 * so the capability returns — but the property that got it removed does not:
 * nothing is applied unless its sha256 matches the published manifest.
 *
 * These tests pin that: the verified path applies, the unverified path is
 * refused and deleted, and a bundle that needs a newer native shell is
 * reported as "a new app version is required" instead of being offered as a
 * web update that cannot carry the change.
 */

const SHA_GOOD = 'a'.repeat(64);
const SHA_BAD = 'b'.repeat(64);

const plugin = {
  current: vi.fn(),
  download: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  addListener: vi.fn(),
};

// Mock the app's own plugin seam rather than the native package: it is the
// single place the OTA path reaches for the plugin, so this exercises the real
// manifest parsing, version comparison and checksum verification.
vi.mock('@/lib/capacitorUpdaterPlugin.js', () => ({
  loadCapacitorUpdater: async () => ({ plugin }),
  loadLocalNotifications: async () => ({ plugin: null }),
}));

function setNative(isNative) {
  if (isNative) {
    Object.defineProperty(window, 'Capacitor', {
      value: { isNativePlatform: () => true, getPlatform: () => 'android' },
      configurable: true,
      writable: true,
    });
  } else {
    delete window.Capacitor;
  }
}

function feed(overrides = {}) {
  return {
    version: '1.0.2',
    url: 'https://genemap-discovery.vercel.app/mobile/bundle-1.0.2.zip',
    sha256: SHA_GOOD,
    notes: '',
    builtAt: '',
    minNativeVersion: '1.0',
    ...overrides,
  };
}

function stubFeed(body) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
  );
}

beforeEach(() => {
  plugin.current.mockResolvedValue({ bundle: { version: '1.0.1' }, native: '1.0' });
  plugin.download.mockResolvedValue({ id: 'b1', version: '1.0.2', checksum: SHA_GOOD });
  plugin.set.mockResolvedValue(undefined);
  plugin.delete.mockResolvedValue(undefined);
  plugin.addListener.mockResolvedValue({ remove: vi.fn() });
});

afterEach(() => {
  delete window.Capacitor;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('MobileUpdateCard', () => {
  it('renders nothing in a plain web browser — a tab already runs the latest deploy', () => {
    setNative(false);
    const { container } = render(<MobileUpdateCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the installed app and bundle versions on a native device', async () => {
    setNative(true);
    render(<MobileUpdateCard />);
    expect(await screen.findByText(/web bundle v1\.0\.1/i)).toBeInTheDocument();
  });

  it('offers an install action when the feed publishes a newer verified bundle', async () => {
    setNative(true);
    stubFeed(feed());
    render(<MobileUpdateCard />);
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText(/update available: v1\.0\.2/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install v1\.0\.2/i })).toBeInTheDocument();
  });

  it('reports up to date when the feed matches the running bundle', async () => {
    setNative(true);
    stubFeed(feed({ version: '1.0.1' }));
    render(<MobileUpdateCard />);
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText(/up to date/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
  });

  it('downloads with the published checksum and applies a bundle that verifies', async () => {
    setNative(true);
    stubFeed(feed());
    render(<MobileUpdateCard />);
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
    fireEvent.click(await screen.findByRole('button', { name: /install v1\.0\.2/i }));
    await waitFor(() => expect(plugin.set).toHaveBeenCalledWith({ id: 'b1' }));
    expect(plugin.download).toHaveBeenCalledWith({
      url: feed().url,
      version: '1.0.2',
      checksum: SHA_GOOD,
    });
    expect(plugin.delete).not.toHaveBeenCalled();
  });

  it('REFUSES a bundle whose checksum does not match, and never applies it', async () => {
    setNative(true);
    stubFeed(feed());
    plugin.download.mockResolvedValue({ id: 'b1', version: '1.0.2', checksum: SHA_BAD });
    render(<MobileUpdateCard />);
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
    fireEvent.click(await screen.findByRole('button', { name: /install v1\.0\.2/i }));
    expect(await screen.findByText(/failed its integrity check/i)).toBeInTheDocument();
    expect(plugin.set).not.toHaveBeenCalled();
    expect(plugin.delete).toHaveBeenCalledWith({ id: 'b1' });
  });

  it('refuses a feed that publishes no checksum instead of offering an unverifiable update', async () => {
    setNative(true);
    const { sha256, ...noChecksum } = feed();
    expect(sha256).toBeTruthy();
    stubFeed(noChecksum);
    render(<MobileUpdateCard />);
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText(/missing a valid sha256/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
    expect(plugin.download).not.toHaveBeenCalled();
  });

  it('says a new APP version is required when the bundle needs a newer native shell', async () => {
    setNative(true);
    stubFeed(feed({ minNativeVersion: '2.0' }));
    render(<MobileUpdateCard />);
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText(/needs a new app version/i)).toBeInTheDocument();
    // no web update is offered — it could not carry a native change
    expect(screen.queryByRole('button', { name: /install v/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view signed releases/i })).toHaveAttribute(
      'href',
      'https://github.com/buckeye7066/genemap-discovery/releases',
    );
  });

  it('reports an unreachable feed honestly', async () => {
    setNative(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<MobileUpdateCard />);
    fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText(/could not reach the update server/i)).toBeInTheDocument();
  });
});
