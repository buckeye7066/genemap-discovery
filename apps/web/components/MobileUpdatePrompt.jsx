import React, { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadAndApplyUpdate } from '@/lib/mobileUpdater.js';
import { UPDATE_AVAILABLE_EVENT } from '@/lib/mobileUpdateNotifier.js';
import { RELEASES_URL } from '@/components/settings/MobileUpdateCard';

/**
 * In-app half of the update notification.
 *
 * The launch/resume checker (lib/mobileUpdateNotifier.js) raises a local OS
 * notification AND dispatches UPDATE_AVAILABLE_EVENT. This banner listens for
 * that event so the update is one tap away without hunting through Settings —
 * and, critically, so a user who denied the notification permission still
 * gets the update path. It renders nothing until an update is actually found,
 * so it is inert on the web and on an up-to-date device.
 */
export default function MobileUpdatePrompt() {
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [state, setState] = useState('idle'); // idle | installing | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onAvailable = (event) => {
      const next = /** @type {any} */ (event)?.detail;
      if (next?.manifest?.version) setDetail(next);
    };
    window.addEventListener(UPDATE_AVAILABLE_EVENT, onAvailable);
    return () => window.removeEventListener(UPDATE_AVAILABLE_EVENT, onAvailable);
  }, []);

  const install = useCallback(async () => {
    if (!detail?.manifest || state === 'installing') return;
    setState('installing');
    setError('');
    try {
      await downloadAndApplyUpdate(detail.manifest);
    } catch (err) {
      setError(err?.message || 'Update failed.');
      setState('error');
    }
  }, [detail, state]);

  if (!detail?.manifest) return null;
  const { manifest, needsNative } = detail;

  return (
    <div
      role="status"
      className="mx-4 mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-slate-800 dark:border-blue-900 dark:bg-blue-950 dark:text-slate-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {needsNative
              ? `A new app version is required (v${manifest.version}).`
              : `Update available: v${manifest.version}`}
          </p>
          {needsNative ? (
            <p className="text-xs opacity-80">
              An in-app update replaces the web bundle only, so it cannot deliver this change.
            </p>
          ) : (
            <p className="text-xs opacity-80">
              Downloads are verified against the published SHA-256 before anything is applied.
            </p>
          )}
          {state === 'error' && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>}
        </div>
        <button
          type="button"
          aria-label="Dismiss update notice"
          onClick={() => setDetail(null)}
          className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {needsNative ? (
          <Button asChild size="sm" variant="outline">
            <a href={RELEASES_URL} target="_blank" rel="noreferrer">
              View signed releases
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        ) : (
          <Button size="sm" onClick={install} disabled={state === 'installing'}>
            {state === 'installing' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Update now
          </Button>
        )}
      </div>
    </div>
  );
}
