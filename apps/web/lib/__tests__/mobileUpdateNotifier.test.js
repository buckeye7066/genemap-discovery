import { describe, expect, it, vi } from 'vitest';
import { NOTIFIED_VERSION_KEY } from '@/lib/mobileUpdater.js';
import {
  UPDATE_NOTIFICATION_ID,
  checkForUpdateAndNotify,
  shouldNotifyForVersion,
} from '@/lib/mobileUpdateNotifier.js';

const SHA = 'c'.repeat(64);

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    data,
  };
}

function manifest(overrides = {}) {
  return {
    version: '1.0.2',
    url: 'https://genemap-discovery.vercel.app/mobile/bundle-1.0.2.zip',
    sha256: SHA,
    minNativeVersion: '',
    notes: '',
    builtAt: '',
    ...overrides,
  };
}

function grantedNotifier() {
  return {
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn(),
    schedule: vi.fn().mockResolvedValue({ notifications: [] }),
  };
}

describe('shouldNotifyForVersion', () => {
  it('is false for a version already notified about', () => {
    const storage = memoryStorage({ [NOTIFIED_VERSION_KEY]: '1.0.2' });
    expect(shouldNotifyForVersion('1.0.2', storage)).toBe(false);
    expect(shouldNotifyForVersion('1.0.3', storage)).toBe(true);
  });
});

describe('checkForUpdateAndNotify', () => {
  it('does nothing when the feed is not newer', async () => {
    const notifications = grantedNotifier();
    const emit = vi.fn();
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest({ version: '1.0.1' }),
      currentVersion: '1.0.1',
      notifications,
      storage: memoryStorage(),
      emit,
    });
    expect(result.status).toBe('up-to-date');
    expect(notifications.schedule).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('swallows a failed check instead of surfacing an app error', async () => {
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => {
        throw new Error('offline');
      },
      currentVersion: '1.0.1',
    });
    expect(result.status).toBe('check-failed');
  });

  it('notifies once and records the version', async () => {
    const notifications = grantedNotifier();
    const storage = memoryStorage();
    const emit = vi.fn();
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest(),
      currentVersion: '1.0.1',
      nativeVersion: '1.0',
      notifications,
      storage,
      emit,
    });
    expect(result.status).toBe('notified');
    expect(notifications.schedule).toHaveBeenCalledTimes(1);
    const scheduled = notifications.schedule.mock.calls[0][0].notifications[0];
    expect(scheduled.id).toBe(UPDATE_NOTIFICATION_ID);
    expect(scheduled.body).toMatch(/1\.0\.2/);
    expect(storage.data[NOTIFIED_VERSION_KEY]).toBe('1.0.2');
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('does NOT notify twice for the same version', async () => {
    const notifications = grantedNotifier();
    const storage = memoryStorage();
    const opts = {
      fetchManifest: async () => manifest(),
      currentVersion: '1.0.1',
      nativeVersion: '1.0',
      notifications,
      storage,
    };
    await checkForUpdateAndNotify(opts);
    const second = await checkForUpdateAndNotify(opts);
    expect(second.status).toBe('already-notified');
    expect(notifications.schedule).toHaveBeenCalledTimes(1);
  });

  it('notifies again for a NEWER version', async () => {
    const notifications = grantedNotifier();
    const storage = memoryStorage();
    await checkForUpdateAndNotify({
      fetchManifest: async () => manifest(),
      currentVersion: '1.0.1',
      notifications,
      storage,
    });
    const next = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest({ version: '1.0.3' }),
      currentVersion: '1.0.1',
      notifications,
      storage,
    });
    expect(next.status).toBe('notified');
    expect(notifications.schedule).toHaveBeenCalledTimes(2);
  });

  it('degrades silently when the notification permission is denied — and still drives the in-app prompt', async () => {
    const notifications = {
      checkPermissions: vi.fn().mockResolvedValue({ display: 'denied' }),
      requestPermissions: vi.fn(),
      schedule: vi.fn(),
    };
    const storage = memoryStorage();
    const emit = vi.fn();
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest(),
      currentVersion: '1.0.1',
      notifications,
      storage,
      emit,
    });
    expect(result.status).toBe('notification-suppressed');
    expect(notifications.schedule).not.toHaveBeenCalled();
    // never re-prompt a user who already said no
    expect(notifications.requestPermissions).not.toHaveBeenCalled();
    // the in-app update path is untouched by the denied permission
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].manifest.version).toBe('1.0.2');
    // not marked as notified, so a later permission grant still earns one
    expect(storage.data[NOTIFIED_VERSION_KEY]).toBeUndefined();
  });

  it('requests the permission exactly once when the OS has not been asked yet', async () => {
    const notifications = {
      checkPermissions: vi.fn().mockResolvedValue({ display: 'prompt' }),
      requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
      schedule: vi.fn().mockResolvedValue({ notifications: [] }),
    };
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest(),
      currentVersion: '1.0.1',
      notifications,
      storage: memoryStorage(),
    });
    expect(notifications.requestPermissions).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('notified');
  });

  it('survives a missing notifications plugin', async () => {
    const emit = vi.fn();
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest(),
      currentVersion: '1.0.1',
      notifications: null,
      storage: memoryStorage(),
      emit,
    });
    expect(result.status).toBe('notification-suppressed');
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('says a new APP version is required when the bundle needs a newer native shell', async () => {
    const notifications = grantedNotifier();
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest({ minNativeVersion: '2.0' }),
      currentVersion: '1.0.1',
      nativeVersion: '1.0',
      notifications,
      storage: memoryStorage(),
    });
    expect(result.needsNative).toBe(true);
    const scheduled = notifications.schedule.mock.calls[0][0].notifications[0];
    expect(scheduled.body).toMatch(/new app install/i);
  });

  it('does not let a throwing in-app listener block the notification', async () => {
    const notifications = grantedNotifier();
    const result = await checkForUpdateAndNotify({
      fetchManifest: async () => manifest(),
      currentVersion: '1.0.1',
      notifications,
      storage: memoryStorage(),
      emit: () => {
        throw new Error('listener blew up');
      },
    });
    expect(result.status).toBe('notified');
  });
});
