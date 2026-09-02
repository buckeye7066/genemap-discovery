/**
 * API-side boundary enforcement sweep.
 *
 * The publication boundary in config/publishingBoundary.js is fail-closed for
 * the routes it knows about. What it cannot do on its own is notice that a NEW
 * route reaching a cloud model was added under a prefix nobody registered —
 * `isUnknownGenerationRoute` only covers /llm and /education, so a generation
 * route mounted at, say, /research would sail straight through.
 *
 * This sweep closes that. It walks services/api/src/routes/, works out which
 * route files can reach a cloud model (transitively, through the real import
 * graph — not a hand-maintained list), and asserts that every path those files
 * declare is accounted for by one of:
 *
 *   1. ROUTE_OWNED_TASKS                     - server-owned task, no client say
 *   2. CLIENT_TASK_ROUTES                    - versioned structured task contract
 *   3. SAFE_NON_GENERATION_EDUCATION_ROUTES  - explicitly non-generating
 *   4. SERVER_CONTEXT_GENERATION_ROUTES      - server-built context, strict body
 *   5. HIDDEN_PATH_PREFIXES                  - 404'd before the handler
 *   6. BOUNDARY_COVERAGE_ALLOWLIST below     - exceptional, justified routes
 *
 * Anything else fails, naming the offending path. The allowlist is the escape
 * hatch, and it costs a sentence of justification — which is the point. Do NOT
 * widen the model-capability detector to make a route disappear from this
 * sweep; add the route to the boundary, or add an allowlist entry saying why it
 * is safe.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { __test as boundaryInternals } from '../config/publishingBoundary.js';

const apiSrcRoot = fileURLToPath(new URL('..', import.meta.url));
const routesDir = path.join(apiSrcRoot, 'routes');
const indexPath = path.join(apiSrcRoot, 'index.js');

// Packages that ARE a cloud model provider. A module importing one of these —
// statically or dynamically — is a provider edge; everything that can reach it
// through the import graph is model-capable.
const PROVIDER_PACKAGES = ['@anthropic-ai/sdk', 'openai', '@google/generative-ai', 'cohere-ai'];

/**
 * Routes declared by a model-capable file that are nonetheless permitted.
 * Every entry needs a reason a reviewer can check. "It is fine" is not a reason.
 */
const BOUNDARY_COVERAGE_ALLOWLIST = new Map();

// --- import-graph model-capability analysis -------------------------------

function listSourceFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      listSourceFiles(absolute, output);
    } else if (entry.isFile() && /\.(?:js|mjs|ts)$/u.test(entry.name)) {
      output.push(absolute);
    }
  }
  return output;
}

function readSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/gu, // import ... from 'x' / export ... from 'x'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu, // dynamic import('x')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

function resolveLocal(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.ts`,
    path.join(base, 'index.js'),
    path.join(base, 'index.ts'),
  ];
  return candidates.find((candidate) => existsSync(candidate) && !candidate.endsWith(path.sep))
    ?? null;
}

const sourceFiles = listSourceFiles(apiSrcRoot);
const graph = new Map(); // absolute file -> { providerEdge: boolean, imports: string[] }

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  const specifiers = readSpecifiers(source);
  const providerEdge = [...specifiers].some((specifier) =>
    PROVIDER_PACKAGES.some(
      (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`)
    )
  );
  const localImports = [...specifiers]
    .map((specifier) => resolveLocal(file, specifier))
    .filter((resolved) => resolved !== null);
  graph.set(file, { providerEdge, imports: localImports });
}

const capabilityCache = new Map();
function reachesProvider(file, seen = new Set()) {
  if (capabilityCache.has(file)) return capabilityCache.get(file);
  if (seen.has(file)) return false; // cycle: this path contributes nothing
  seen.add(file);
  const node = graph.get(file);
  if (!node) return false;
  const result = node.providerEdge
    || node.imports.some((imported) => reachesProvider(imported, seen));
  if (result || seen.size === 1) capabilityCache.set(file, result);
  return result;
}

// --- route declaration extraction -----------------------------------------

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];
const ROUTE_CALL = new RegExp(
  `\\b(?:fastify|app|server|instance|scope)\\.(${METHODS.join('|')})\\(\\s*['"\`]([^'"\`]+)['"\`]`,
  'gu'
);

function declaredRoutes(source) {
  const routes = [];
  for (const match of source.matchAll(ROUTE_CALL)) {
    routes.push({ method: match[1].toUpperCase(), routePath: match[2] });
  }
  return routes;
}

function registeredPrefixes(indexSource) {
  // fastify.register(xRoutes, { prefix: '/x' }) -> importName -> '/x'
  const prefixes = new Map();
  const pattern = /register\(\s*([A-Za-z0-9_$]+)\s*,\s*\{\s*prefix:\s*['"]([^'"]+)['"]/gu;
  for (const match of indexSource.matchAll(pattern)) prefixes.set(match[1], match[2]);
  return prefixes;
}

function importedRouteModules(indexSource) {
  // import xRoutes from './routes/x.js' -> importName -> 'x.js'
  // Also handles a default import alongside named ones, which routes/llm.js uses:
  //   import llmRoutes, { isModelPublicationEnabled } from './routes/llm.js';
  const modules = new Map();
  const pattern =
    /import\s+([A-Za-z0-9_$]+)\s*(?:,\s*\{[^}]*\})?\s*from\s+['"]\.\/routes\/([^'"]+)['"]/gu;
  for (const match of indexSource.matchAll(pattern)) modules.set(match[1], match[2]);
  return modules;
}

const indexSource = readFileSync(indexPath, 'utf8');
const prefixByImport = registeredPrefixes(indexSource);
const moduleByImport = importedRouteModules(indexSource);

const prefixByRouteFile = new Map(); // 'llm.js' -> '/llm'
for (const [importName, moduleFile] of moduleByImport) {
  prefixByRouteFile.set(moduleFile.replace(/^\.\//u, ''), prefixByImport.get(importName) ?? '');
}

const routeFiles = readdirSync(routesDir)
  .filter((name) => /\.js$/u.test(name))
  .sort();

const modelCapableRouteFiles = routeFiles.filter((name) =>
  reachesProvider(path.join(routesDir, name))
);

function joinPath(prefix, routePath) {
  const combined = `${prefix}${routePath === '/' ? '' : routePath}`;
  return (combined.startsWith('/') ? combined : `/${combined}`).toLowerCase();
}

const routeOwned = boundaryInternals.routeOwnedTaskPaths();
const clientTask = boundaryInternals.clientTaskRoutePaths();
const safeNonGeneration = boundaryInternals.safeNonGenerationRoutePaths();
const serverContextGeneration = boundaryInternals.serverContextGenerationRoutePaths();
const hiddenPrefixes = boundaryInternals.HIDDEN_PATH_PREFIXES;

function coverageFor(fullPath) {
  if (routeOwned.has(fullPath)) return 'ROUTE_OWNED_TASKS';
  if (clientTask.has(fullPath)) return 'CLIENT_TASK_ROUTES';
  if (safeNonGeneration.has(fullPath)) return 'SAFE_NON_GENERATION_EDUCATION_ROUTES';
  if (serverContextGeneration.has(fullPath)) return 'SERVER_CONTEXT_GENERATION_ROUTES';
  if (hiddenPrefixes.some((prefix) => fullPath === prefix || fullPath.startsWith(`${prefix}/`))) {
    return 'HIDDEN_PATH_PREFIXES';
  }
  return null;
}

// --- the sweep -------------------------------------------------------------

describe('API boundary enforcement sweep', () => {
  it('finds route files to sweep and can resolve their mount prefixes', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
    const unmounted = routeFiles.filter(
      (name) => !prefixByRouteFile.has(name) && !indexSource.includes(`routes/${name}`)
    );
    expect(unmounted, 'route files not imported by src/index.js').toEqual([]);
  });

  it('detects model capability through the real import graph', () => {
    // If this ever reports zero, the detector broke and the sweep below would
    // pass vacuously. The provider choke point is services/llm.js.
    expect(
      reachesProvider(path.join(apiSrcRoot, 'services', 'llm.js')),
      'services/llm.js must be detected as model-capable',
    ).toBe(true);
    expect(modelCapableRouteFiles.length).toBeGreaterThan(0);
  });

  it('registers every model-capable route with the publication boundary', () => {
    const violations = [];
    const covered = [];

    for (const name of modelCapableRouteFiles) {
      const prefix = prefixByRouteFile.get(name);
      if (prefix === undefined) {
        violations.push(
          `routes/${name}: model-capable route file has no resolvable mount prefix in `
            + 'src/index.js, so its paths cannot be checked against the boundary'
        );
        continue;
      }
      const source = readFileSync(path.join(routesDir, name), 'utf8');
      for (const { method, routePath } of declaredRoutes(source)) {
        const fullPath = joinPath(prefix, routePath);
        const label = `${method} ${fullPath}`;
        const coverage = coverageFor(fullPath);
        if (coverage) {
          covered.push(`${label} -> ${coverage}`);
          continue;
        }
        const reason = BOUNDARY_COVERAGE_ALLOWLIST.get(label);
        if (reason) {
          covered.push(`${label} -> allowlist`);
          continue;
        }
        violations.push(
          `${label} (routes/${name}): declared by a model-capable route file but is not in `
            + 'ROUTE_OWNED_TASKS, CLIENT_TASK_ROUTES, SAFE_NON_GENERATION_EDUCATION_ROUTES, '
            + 'SERVER_CONTEXT_GENERATION_ROUTES, HIDDEN_PATH_PREFIXES, or '
            + 'BOUNDARY_COVERAGE_ALLOWLIST. Register it with the '
            + 'publication boundary, or add an allowlist entry with a written reason.'
        );
      }
    }

    // Printed so a CI log shows WHAT was swept, not merely that it passed. A
    // sweep whose extractor silently stops matching would otherwise look
    // identical to a clean tree.
    console.log(
      `[boundary-sweep] model-capable route files: ${modelCapableRouteFiles.join(', ')}\n`
        + covered.map((line) => `[boundary-sweep]   ${line}`).join('\n')
    );

    expect(covered.length, 'sweep matched no routes at all — the extractor is broken').toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it('keeps every allowlist entry justified and live', () => {
    const declaredLabels = new Set();
    for (const name of modelCapableRouteFiles) {
      const prefix = prefixByRouteFile.get(name) ?? '';
      const source = readFileSync(path.join(routesDir, name), 'utf8');
      for (const { method, routePath } of declaredRoutes(source)) {
        declaredLabels.add(`${method} ${joinPath(prefix, routePath)}`);
      }
    }

    const problems = [];
    for (const [label, reason] of BOUNDARY_COVERAGE_ALLOWLIST) {
      if (typeof reason !== 'string' || reason.trim().length < 40) {
        problems.push(`${label}: allowlist entry needs a written reason, not a placeholder`);
      }
      if (!declaredLabels.has(label)) {
        problems.push(
          `${label}: allowlist entry does not match any route declared by a model-capable `
            + 'file. Stale entries hide real gaps — remove it.'
        );
      }
      if (coverageFor(label.split(' ')[1]) !== null) {
        problems.push(
          `${label}: allowlist entry is redundant — the boundary already covers this path.`
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps both boundary hooks installed globally, before any route registers', () => {
    const hiddenHook = indexSource.indexOf("addHook('onRequest', enforceHiddenPathBoundary)");
    const publishingHook = indexSource.indexOf("addHook('preHandler', enforcePublishingBoundary)");
    expect(hiddenHook, 'enforceHiddenPathBoundary must be registered in src/index.js')
      .toBeGreaterThan(-1);
    expect(publishingHook, 'enforcePublishingBoundary must be registered in src/index.js')
      .toBeGreaterThan(-1);

    // Fastify only applies a hook to route scopes registered after it, so the
    // hooks must precede the first fastify.register(...routes) call.
    const firstRouteRegistration = indexSource.search(/register\([A-Za-z0-9_$]*Routes\b/u);
    expect(firstRouteRegistration).toBeGreaterThan(-1);
    expect(hiddenHook).toBeLessThan(firstRouteRegistration);
    expect(publishingHook).toBeLessThan(firstRouteRegistration);
  });
});
