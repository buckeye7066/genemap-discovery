#!/usr/bin/env node
// Publish the OTA web-bundle feed for the native (Capacitor) app.
//
// Chained onto the DEPLOY build (vercel.json `buildCommand`, and
// `pnpm build:web:deploy` locally), so merging to main -> Vercel builds main
// -> the feed is republished. It is deliberately NOT part of
// `pnpm --filter @genemap/web build`:
//
//   * pnpm does not run pre/post lifecycle scripts unless
//     `enable-pre-post-scripts=true`, so a `postbuild` hook would silently do
//     nothing — the exact failure mode this feed must not have; and
//   * the native builds run that same web build before `cap sync`, and the
//     OTA feed must never be baked INTO the signed package. CI enforces that
//     (ci.yml android-build-smoke rejects `assets/public/mobile/` and any
//     packaged .zip), and this split is what keeps it true.
//
// After `vite build` produces apps/web/dist/, this zips the built assets into
//   apps/web/dist/mobile/bundle-<version>.zip
// and writes
//   apps/web/dist/mobile/latest.json
//     -> { version, url, sha256, minNativeVersion, notes, builtAt }
// pointing at the zip with an absolute production URL. Vercel serves static
// files ahead of the SPA rewrite, so the feed goes live at
// https://genemap-discovery.vercel.app/mobile/latest.json.
//
// `sha256` is the digest of the exact zip bytes written here. The app refuses
// to apply a bundle whose hash does not match it (apps/web/lib/mobileUpdater.js),
// which is what makes a downloaded bundle trustworthy despite not being part
// of the signed package.
//
// Run standalone (after a web build) with:  pnpm build:mobile-bundle

import { zipSync } from 'fflate';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';


export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_BASE_URL = 'https://genemap-discovery.vercel.app';

// Native floor for this web bundle, in the ANDROID/iOS version lineage (see
// apps/web/android/app/build.gradle -> ANDROID_VERSION_NAME, default "1.0").
// Bump it in the same commit as any change that needs a NEW NATIVE BUILD — a
// new Capacitor plugin, a permission, a native config change. Devices below
// the floor are told to install a new app version instead of being offered a
// web bundle that cannot carry the change.
export const DEFAULT_MIN_NATIVE_VERSION = '1.0';

/**
 * Zip a built web dist and write the update manifest beside it.
 *
 * @param {object} [opts]
 * @param {string} [opts.distDir] built web assets (must contain index.html)
 * @param {string} [opts.version] bundle version (defaults to apps/web package.json)
 * @param {string} [opts.baseUrl] absolute production origin serving the feed
 * @param {string} [opts.minNativeVersion] native floor for this bundle
 * @param {string} [opts.appName] label used in the manifest notes
 * @returns {{ manifest: object, zipPath: string, manifestPath: string, bytes: number }}
 */
export function publishMobileBundle({
  distDir = path.join(REPO_ROOT, 'apps', 'web', 'dist'),
  version,
  baseUrl = process.env.MOBILE_UPDATE_BASE_URL || DEFAULT_BASE_URL,
  minNativeVersion = process.env.MOBILE_MIN_NATIVE_VERSION || DEFAULT_MIN_NATIVE_VERSION,
  appName = 'GeneMap Discovery',
} = {}) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(
      `[mobile-bundle] ${path.join(distDir, 'index.html')} not found — run the web build first (pnpm build:web).`,
    );
  }
  const resolvedVersion =
    version ??
    JSON.parse(fs.readFileSync(path.join(distDir, 'app-update.json'), 'utf8')).bundleVersion;
  if (!/^\d+\.\d+\.\d+$/.test(resolvedVersion || '')) {
    throw new Error('Build identity is missing a numeric bundleVersion. Run the web build first.');
  }

  const mobileDir = path.join(distDir, 'mobile');
  fs.rmSync(mobileDir, { recursive: true, force: true });
  fs.mkdirSync(mobileDir, { recursive: true });

  const files = Object.create(null);
  function collect(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!prefix && entry.name === 'mobile') continue;
      const full = path.join(directory, entry.name);
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('[mobile-bundle] symlinks are not publishable: ' + name);
      if (entry.isDirectory()) collect(full, name + '/');
      else if (entry.isFile()) files[name] = new Uint8Array(fs.readFileSync(full));
    }
  }
  collect(distDir);

  const zipName = `bundle-${resolvedVersion}.zip`;
  const zipPath = path.join(mobileDir, zipName);
  fs.writeFileSync(zipPath, zipSync(files, { level: 6 }));

  // Hash the file as it now exists on disk — not the in-memory buffer — so the
  // published digest describes exactly the bytes a device will download.
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');

  const manifest = {
    version: resolvedVersion,
    url: `${baseUrl}/mobile/${zipName}`,
    sha256,
    minNativeVersion,
    notes: `${appName} web bundle v${resolvedVersion}`,
    builtAt: new Date().toISOString(),
  };
  const manifestPath = path.join(mobileDir, 'latest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { manifest, zipPath, manifestPath, bytes: fs.statSync(zipPath).size };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const { manifest, bytes } = publishMobileBundle();
    console.log(
      `[mobile-bundle] wrote apps/web/dist/mobile/bundle-${manifest.version}.zip (${(bytes / 1024 / 1024).toFixed(1)} MB, sha256 ${manifest.sha256.slice(0, 12)}…) and latest.json -> ${manifest.url}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

