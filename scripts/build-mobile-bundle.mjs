#!/usr/bin/env node
// Publish the OTA web-bundle feed for the native (Capacitor) app.
//
// Runs as apps/web `postbuild` (part of Vercel's buildCommand) always refreshes the feed. After `vite build`
// produces apps/web/dist/, this zips the built assets into
//   apps/web/dist/mobile/bundle-<version>.zip
// and writes
//   apps/web/dist/mobile/latest.json  ->  { version, url, notes, builtAt }
// pointing at the zip with an absolute production URL. Vercel serves the
// static file ahead of the SPA rewrite, so merging + deploying makes the feed
// live at https://genemap-discovery.vercel.app/mobile/latest.json.
//
// The in-app "Check for Updates" card (apps/web/lib/mobileUpdater.js)
// consumes this feed via @capgo/capacitor-updater. Version = apps/web
// package.json version.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'apps', 'web');
const distDir = path.join(webDir, 'dist');
const mobileDir = path.join(distDir, 'mobile');
const pkg = JSON.parse(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'));
const version = pkg.version;
const baseUrl = process.env.MOBILE_UPDATE_BASE_URL || 'https://genemap-discovery.vercel.app';

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[mobile-bundle] apps/web/dist/index.html not found — run the web build first (pnpm --filter @genemap/web build).');
  process.exit(1);
}

fs.rmSync(mobileDir, { recursive: true, force: true });
fs.mkdirSync(mobileDir, { recursive: true });

const zip = new AdmZip();
for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (entry.name === 'mobile') continue; // never nest the feed inside its own bundle
  const full = path.join(distDir, entry.name);
  if (entry.isDirectory()) zip.addLocalFolder(full, entry.name);
  else zip.addLocalFile(full);
}

const zipName = `bundle-${version}.zip`;
zip.writeZip(path.join(mobileDir, zipName));

const manifest = {
  version,
  url: `${baseUrl}/mobile/${zipName}`,
  notes: `GeneMap Discovery web bundle v${version}`,
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(mobileDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const zipBytes = fs.statSync(path.join(mobileDir, zipName)).size;
console.log(`[mobile-bundle] wrote apps/web/dist/mobile/${zipName} (${(zipBytes / 1024 / 1024).toFixed(1)} MB) and latest.json -> ${manifest.url}`);
