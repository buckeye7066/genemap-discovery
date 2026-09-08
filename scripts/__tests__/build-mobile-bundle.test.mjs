import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';

import { publishMobileBundle } from '../build-mobile-bundle.mjs';


function fakeDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genemap-mobile-bundle-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>GeneMap</title>');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log("hi")');
  return dir;
}

test('publishes a manifest whose sha256 is the digest of the zip it wrote', () => {
  const distDir = fakeDist();
  try {
    const { manifest, zipPath } = publishMobileBundle({
      distDir,
      version: '1.2.3',
      baseUrl: 'https://genemap-discovery.vercel.app',
      minNativeVersion: '1.0',
    });

    const onDisk = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
    // This equality is the whole security property: the app refuses any bundle
    // whose bytes do not hash to the value published here.
    assert.equal(manifest.sha256, onDisk);
    assert.match(manifest.sha256, /^[0-9a-f]{64}$/);
    assert.equal(manifest.version, '1.2.3');
    assert.equal(manifest.url, 'https://genemap-discovery.vercel.app/mobile/bundle-1.2.3.zip');
    assert.equal(manifest.minNativeVersion, '1.0');
    assert.ok(Date.parse(manifest.builtAt) > 0);
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test('the zip carries the built app and never nests the feed inside itself', () => {
  const distDir = fakeDist();
  try {
    const { zipPath, manifestPath } = publishMobileBundle({ distDir, version: '1.2.3' });
    const files = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
    const names = Object.keys(files);
    assert.equal(strFromU8(files['assets/index-abc123.js']), 'console.log("hi")');

    assert.ok(names.includes('index.html'), 'bundle must contain the app entrypoint');
    assert.ok(names.some((n) => n.startsWith('assets/')), 'bundle must contain hashed assets');
    assert.ok(
      !names.some((n) => n.startsWith('mobile/')),
      'the feed must never be zipped into its own bundle',
    );
    assert.ok(fs.existsSync(manifestPath));
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test('a second run republishes cleanly instead of stacking stale bundles', () => {
  const distDir = fakeDist();
  try {
    publishMobileBundle({ distDir, version: '1.2.3' });
    publishMobileBundle({ distDir, version: '1.2.4' });
    const files = fs.readdirSync(path.join(distDir, 'mobile')).sort();
    assert.deepEqual(files, ['bundle-1.2.4.zip', 'latest.json']);
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

test('refuses to publish a feed for a dist that was never built', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genemap-empty-dist-'));
  try {
    assert.throws(() => publishMobileBundle({ distDir: dir }), /index\.html not found/);
    assert.ok(!fs.existsSync(path.join(dir, 'mobile')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
