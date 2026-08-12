import React from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isNativeApp } from '@/lib/platform';

const RELEASES_URL = 'https://github.com/buckeye7066/genemap-discovery/releases';

/**
 * Native-only update guidance. Android updates are complete, signed packages
 * published from main; the app never downloads or executes a mutable web
 * bundle outside that signed release.
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
          {nativeVersion ? `Installed Android version: ${nativeVersion}` : 'Version available in Android app settings'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Updates are distributed as signed Android releases. Installing a complete signed package preserves the
          application’s verified code and content boundary.
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
