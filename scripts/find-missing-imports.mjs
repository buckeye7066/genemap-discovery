// Quick offline scanner: for every JS/JSX module under apps/web, resolve
// every relative-or-aliased import and report ones that don't exist on disk.
// Used during the production-readiness sweep to identify missing component
// stubs in one pass instead of fixing build errors one-at-a-time.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';

const ROOT = resolve('apps/web');

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'public') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) yield full;
  }
}

const importRegex = /(?:from\s+|import\s*\(\s*)['"](@\/[^'"]+|\.{1,2}\/[^'"]+)['"]/g;
const candidates = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];

const missing = new Map();

for (const file of walk(ROOT)) {
  const content = readFileSync(file, 'utf8');
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    const importPath = m[1];
    let target;
    if (importPath.startsWith('@/')) {
      target = join(ROOT, importPath.slice(2));
    } else {
      target = resolve(dirname(file), importPath);
    }
    let found = false;
    for (const ext of candidates) {
      try {
        if (existsSync(target + ext) && statSync(target + ext).isFile()) {
          found = true;
          break;
        }
      } catch {}
    }
    if (!found) {
      const rel = target.replace(ROOT, '').replace(/\\/g, '/');
      if (!missing.has(rel)) missing.set(rel, new Set());
      missing.get(rel).add(file.replace(ROOT, '').replace(/\\/g, '/'));
    }
  }
}

const sorted = [...missing.entries()].sort();
for (const [path, importers] of sorted) {
  console.log(`${path}\t<= ${[...importers].join(', ')}`);
}
console.log(`\nTotal missing: ${sorted.length}`);
