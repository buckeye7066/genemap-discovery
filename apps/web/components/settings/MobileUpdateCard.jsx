import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { isNativeApp } from '@/lib/platform';
import {
  downloadAndApplyUpdate,
  fetchUpdateManifest,
  isNewerVersion,
  readInstalledVersions,
  requiresNativeUpdate,
} from '@/lib/mobileUpdater.js';

export const RELEASES_URL = 'https://github.com/buckeye7066/genemap-discovery/releases';

/**
 * "App Updates" card for Account Settings. Native (Capacitor) builds only —
 * a browser tab already runs the latest deploy on every page load, so the
 * card renders nothing on the web.
 *
 * Flow: check the pinned production feed -> compare versions -> download ->
 * VERIFY the bundle's sha256 against the feed -> apply -> reload. A bundle
 * that fails verification is deleted and never applied; see
 * lib/mobileUpdater.js for why that check is the whole point (sermonsmith
 * PR #96 removed an OTA path that lacked it).
 *
 * An OTA update carries the WEB bundle only. When the feed declares a native
 * floor this device does not meet, the card says a new app version is
 * required and links to the signed releases instead of offering a web update
 * that cannot deliver the change.
 */
export default function MobileUpdateCard() {
  const [isNative] = useState(() => isNativeApp());
  const [bundleVersion, setBundleVersion] = useState('');
  const [nativeVersion, setNativeVersion] = useState('');
  // idle | checking | available | native-required | downloading | applying | uptodate | error
  const [phase, setPhase] = useState('idle');
  const [manifest, setManifest] = useState(/** @type {any} */ (null));
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!isNative) return undefined;
    let cancelled = false;
    (async () => {
      const versions = await readInstalledVersions();
      if (cancelled) return;
      if (versions.bundleVersion) setBundleVersion(versions.bundleVersion);
      if (versions.nativeVersion) setNativeVersion(versions.nativeVersion);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNative]);

  const checkForUpdates = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('checking');
    setError('');
    setManifest(null);
    try {
      // Re-read rather than trusting render state: an "up to date" verdict
      // computed against a version we had not loaded yet would be a lie.
      const installed = await readInstalledVersions();
      setBundleVersion(installed.bundleVersion);
      if (installed.nativeVersion) setNativeVersion(installed.nativeVersion);
      const found = await fetchUpdateManifest();
      if (!isNewerVersion(found.version, installed.bundleVersion)) {
        setPhase('uptodate');
      } else if (requiresNativeUpdate(found, installed.nativeVersion)) {
        setManifest(found);
        setPhase('native-required');
      } else {
        setManifest(found);
        setPhase('available');
      }
    } catch (err) {
      setError(err?.message || 'Update check failed.');
      setPhase('error');
    } finally {
      busyRef.current = false;
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!manifest || busyRef.current) return;
    busyRef.current = true;
    setPhase('downloading');
    setError('');
    setProgress(0);
    try {
      await downloadAndApplyUpdate(manifest, {
        onProgress: (percent) => setProgress(percent),
      });
      // set() reloads the webview onto the new bundle; if we are still here,
      // say so honestly rather than claiming success.
      setPhase('applying');
    } catch (err) {
      setError(err?.message || 'Update failed.');
      setPhase('error');
    } finally {
      busyRef.current = false;
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
          App v{nativeVersion || '?'} — web bundle v{bundleVersion || '?'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {phase === 'uptodate' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Up to date{bundleVersion ? ` (v${bundleVersion})` : ''}.</AlertDescription>
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
        {phase === 'native-required' && manifest && (
          <Alert>
            <AlertDescription>
              Version {manifest.version} needs a new app version (this build is v
              {nativeVersion || 'unknown'}, and v{manifest.minNativeVersion} or newer is required).
              An in-app update replaces the web bundle only, so it cannot deliver this change —
              install the signed release below.
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
            <p className="text-sm text-slate-500">Downloading and verifying… {Math.round(progress)}%</p>
          </div>
        )}
        {phase === 'applying' && (
          <p className="text-sm text-slate-500">Applying the verified update and reloading…</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={checkForUpdates} disabled={busy}>
            {phase === 'checking' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Check for Updates
          </Button>
          {phase === 'available' && manifest && (
            <Button onClick={installUpdate} disabled={busy}>
              <Download className="h-4 w-4 mr-2" />
              Install v{manifest.version}
            </Button>
          )}
          {phase === 'native-required' && (
            <Button asChild variant="outline">
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                View signed releases
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Downloaded bundles are checked against the SHA-256 published with the release. A bundle
          that does not match is discarded and never applied.
        </p>
      </CardContent>
    </Card>
  );
}
