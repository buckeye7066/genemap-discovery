import React from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isNativeApp } from '@/lib/platform';

const RELEASES_URL = 'https://github.com/buckeye7066/genemap-discovery/releases';

/**
 * Android-only update guidance.
 *
 * Deliberately a POINTER to signed releases, not an in-app updater. The
 * sibling app (SermonSmith) shipped a self-hosted OTA bundle first and then
 * removed it — "fix(android): remove unsigned OTA update path" — because
 * downloading and executing a mutable web bundle at runtime defeats the whole
 * point of shipping a signed package: the code that runs is no longer the code
 * that was signed. Do not "improve" this card into an auto-updater.
 *
 * Renders nothing outside the native Android build: the same web bundle ships
 * to the browser and to Capacitor, so this is a runtime check.
 */
export default function MobileUpdateCard() {
  const capacitor = typeof window !== 'undefined' ? window['Capacitor'] : undefined;
  if (!isNativeApp() || capacitor?.getPlatform?.() !== 'android') return null;
  const nativeVersion = import.meta.env.VITE_NATIVE_VERSION;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-blue-600" />
          App Updates
        </CardTitle>
        <CardDescription>
          {nativeVersion
            ? `Installed Android version: ${nativeVersion}`
            : 'Version available in Android app settings'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Updates are distributed as signed Android releases. Installing a complete signed package
          preserves the application’s verified code and content boundary.
        </p>
        <Button asChild variant="outline">
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">
            View signed releases
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
