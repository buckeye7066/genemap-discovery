import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const resources = path.resolve(process.argv[2] || 'apps/desktop/dist-electron/win-unpacked/resources');
const web = path.join(resources, 'app');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const identity = JSON.parse(fs.readFileSync(path.join(web, 'app-update.json'), 'utf8'));
assert.equal(identity.app, 'genemap-discovery');
assert.ok(identity.assets?.length > 0, 'Build asset inventory is missing');
for (const { path: asset } of identity.assets) {
  assert.ok(!path.isAbsolute(asset) && !asset.split('/').includes('..'), 'Invalid asset path');
  assert.ok(fs.statSync(path.join(web, asset)).isFile(), `Missing packaged asset: ${asset}`);
}
assert.ok(!/(?:src|href)="\/assets\//.test(html), 'Desktop assets must use relative paths');
assert.ok(/src="\.\/assets\/[^"?#]+\.js"/.test(html), 'Desktop JavaScript entry is missing');
console.log(`Verified ${identity.assets.length} desktop resources for build ${identity.build}`);
