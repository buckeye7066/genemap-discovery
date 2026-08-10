import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, Download, CheckCircle2, Smartphone } from 'lucide-react';
import { isNativeApp } from '@/lib/platform';
import { version as APP_VERSION } from '../package.json';
import { fetchUpdateManifest, isNewerVersion, parseVersion } from '@/lib/mobileUpdater';

/**
 * "App Updates" card for the Settings page — native Capacitor app only
 * (renders nothing on web/Electron, where every page load is already the
 * newest deploy).
 *
 * Manual OTA flow (autoUpdate disabled in apps/web/capacitor.config.ts):
 * check /mobile/latest.json on the production host, compare against the
 * active bundle version, then download + apply via @capgo/capacitor-updater
 * and reload.
 */
export default function MobileUpdateCard() {
  const isNative = isNativeApp();
  const [nativeVersion, setNativeVersion] = useState('');
  const [bundleVersion, setBundleVersion] = useState(APP_VERSION);
  const [phase, setPhase] = useState('idle'); // idle | checking | available | downloading | applying | uptodate | error
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const listenerRef = useRef(null);

  useEffect(() => {
    if (!isNative) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
        const current = await CapacitorUpdater.current();
        if (cancelled) return;
        const v = current?.bundle?.version; // "builtin" = APK-baked bundle
        setBundleVersion(parseVersion(v) ? v : APP_VERSION);
        if (current?.native) setNativeVersion(String(current.native));
      } catch {
        // Plugin unavailable (older APK) — keep the baked version display.
      }
    })();
    return () => {
      cancelled = true;
      listenerRef.current?.remove?.();
    };
  }, [isNative]);

  const checkForUpdates = useCallback(async () => {
    setPhase('checking');
    setError('');
    setManifest(null);
    try {
      const found = await fetchUpdateManifest();
      if (isNewerVersion(found.version, bundleVersion)) {
        setManifest(found);
        setPhase('available');
      } else {
        setPhase('uptodate');
      }
    } catch (err) {
      setError(err?.message || 'Update check failed.');
      setPhase('error');
    }
  }, [bundleVersion]);

  const downloadAndApply = useCallback(async () => {
    if (!manifest) return;
    setPhase('downloading');
    setError('');
    setProgress(0);
    try {
      const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
      listenerRef.current = await CapacitorUpdater.addListener('download', (event) => {
        if (typeof event?.percent === 'number') setProgress(event.percent);
      });
      const bundle = await CapacitorUpdater.download({ url: manifest.url, version: manifest.version });
      listenerRef.current?.remove?.();
      listenerRef.current = null;
      setPhase('applying');
      await CapacitorUpdater.set(bundle); // swaps bundle + reloads the webview
    } catch (err) {
      listenerRef.current?.remove?.();
      listenerRef.current = null;
      setError(err?.message || 'Update download failed.');
      setPhase('error');
    }
  }, [manifest]);

  if (!isNative) return null;

  const busy = phase === 'checking' || phase === 'downloading' || phase === 'applying';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-blue-600" />
          App Updates
        </CardTitle>
        <CardDescription>
          App v{nativeVersion || '?'} — content bundle v{bundleVersion}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {phase === 'uptodate' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Up to date (v{bundleVersion}).</AlertDescription>
          </Alert>
        )}
        {phase === 'available' && manifest && (
          <Alert>
            <AlertDescription>
              Update available: v{manifest.version}
              {manifest.notes ? ` — ${manifest.notes}` : ''}
            </AlertDescription>
          </Alert>
        )}
        {phase === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {phase === 'downloading' && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-gray-600 dark:text-gray-400">Downloading update… {Math.round(progress)}%</p>
          </div>
        )}
        {phase === 'applying' && (
          <p className="text-sm text-gray-600 dark:text-gray-400">Applying update and reloading…</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={checkForUpdates} disabled={busy}>
            {phase === 'checking' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Check for Updates
          </Button>
          {phase === 'available' && manifest && (
            <Button onClick={downloadAndApply} disabled={busy}>
              <Download className="w-4 h-4 mr-2" />
              Install v{manifest.version}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
