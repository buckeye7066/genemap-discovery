import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

// Regression guard for the bundle configuration.
//
// The Vite build declared a `vendor-3d: ['three']` manual chunk, but nothing in
// the app imports `three`. Rollup therefore emitted an empty `vendor-3d` chunk
// on every build and `three` (a large 3D library) sat in the dependency tree as
// dead weight. Both were removed; this test keeps them from creeping back.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relative) {
  return readFileSync(path.join(webRoot, relative), 'utf8');
}

describe('web bundle configuration', () => {
  it('does not declare an empty vendor-3d manual chunk', () => {
    const viteConfig = read('vite.config.js');
    expect(viteConfig).not.toContain('vendor-3d');
    expect(viteConfig).not.toContain("'three'");
  });

  it('does not depend on the unused `three` package', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies?.three).toBeUndefined();
    expect(pkg.devDependencies?.three).toBeUndefined();
  });
});
