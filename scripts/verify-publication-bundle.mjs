import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultDist = fileURLToPath(new URL('../apps/web/dist', import.meta.url));
const distRoot = path.resolve(process.argv[2] || defaultDist);

const forbiddenChunkPrefixes = [
  'FunctionReviewer',
  'AdminFunctionTester',
  'AIAssistants',
  'Anastasia',
  'RobertClinical',
  'MedicalData',
  'VCFAnalysis',
  'VisualizationHub',
  'GSEA',
  'FHIRExporter',
  'AskAIButtons',
  'GenomeBrowser',
  'ComparativeGenomics',
  'GeneExpressionChart',
  'ChromosomeView',
  'PhenotypeNetwork',
  'ProteinDomains',
  'ProteinStructure',
  'ProteinInteractions',
  'ClinicalTrialFinder',
  'RobertClinicalSupport',
  'VCFParser',
  'ClinicalTrialMatcher',
  'MedicalDataComparison',
  'ComparativePathwayViz',
  'PathwayEnrichmentViz',
  'ResearchSuggester',
  'PathwayPredictor',
  'GeneticExplainer',
  'PathwayEnrichment',
  'BulkVCFAnalysis',
  'ExternalDatabaseIntegration',
  'AdaptiveVisualization',
  'CircosPlot',
  'ManhattanPlot',
  'ExpressionHeatmap',
];

const forbiddenContent = [
  'components/functionRegistry',
  '/admin/self-test',
  'runFunctionTests',
  'apps/web/pages/RobertClinical.jsx',
  'apps/web/pages/Anastasia.jsx',
  'apps/web/pages/AIAssistants.jsx',
  'apps/web/components/clinical/RobertClinicalSupport.jsx',
  'apps/web/components/medical/FHIRExporter.jsx',
  'Clinical genomics assistant',
  'Genetic-counselling companion',
  'pharmacogenomic analysis',
  'Comprehensive Variant Interpretation',
  'Analyze Against My Medical Data',
  'Clinical Trial Finder',
  'Export to FHIR Format',
  'Generate & Download FHIR',
  'Robert (Clinical)',
  'Anastasia (Counselor)',
  'Medical Data Upload Types',
  'Medical Records',
  '/entities/medical-data',
  '/entities/conversations',
  '/genomics/vcf',
  '/genomics/variant',
  '/genomics/clinvar',
  '/clinical-trials',
  '/aiassistants?prompt=',
  'apiClient.invokeLLM',
  'invokeLLM',
  'HIPAA Compliant',
  'FHIRExporter',
  'RobertClinicalSupport',
  'ComparativeGenomics',
  'ClinicalTrialMatcher',
  'MedicalDataComparison',
  'ComparativePathwayViz',
  'PathwayEnrichmentViz',
  'ResearchSuggester',
  'PathwayPredictor',
  'GeneticExplainer',
  'BulkVCFAnalysis',
  'ExternalDatabaseIntegration',
  'AdaptiveVisualization',
  'agentRegistry',
  'agentMesh',
  'AI Personalization',
  'personalized explanations',
];

const expectedTitle = '<title>GeneMap Discovery | Genetics Education &amp; Research Leads</title>';

// ---------------------------------------------------------------------------
// Allowlist assertion (runs ALONGSIDE the denylist above — defence in depth).
//
// The denylist names today's known-bad chunks. It cannot catch a page added
// under a new name six months from now. The allowlist inverts the question:
// the route map in apps/web/pages.config.js is the ONLY authorization for a
// page to reach the publishable bundle, so anything page-shaped that is not in
// that map is a violation regardless of what it is called.
//
// Three layers, because a page can escape in three different ways:
//   A. It is code-split and ships as its own chunk  -> caught in the dist walk.
//   B. It exists in apps/web/pages/ and is not routed and not declared
//      excluded -> caught before it is ever imported.
//   C. It is in the lazy-import graph of pages.config.js but absent from the
//      PAGES map (or vice versa) -> caught by comparing the two.
// ---------------------------------------------------------------------------

const webRoot = fileURLToPath(new URL('../apps/web', import.meta.url));
const pagesConfigPath = path.join(webRoot, 'pages.config.js');
const pagesSourceDir = path.join(webRoot, 'pages');

// Page modules that deliberately exist in the source tree but are NOT routed.
// Every entry needs a written reason. Adding a name here is a conscious
// decision to ship the file but never the route; it is not a way to silence
// the check.
const unroutedPageReasons = new Map([
  [
    'IconGenerator',
    'Developer-only PWA icon generation utility. Never part of the product '
      + 'surface; kept out of both the route map and the lazy-import graph, and '
      + 'regression-locked by apps/web/lib/__tests__/clinicalPublishingBoundary.test.js.',
  ],
]);

function readRouteMap(source) {
  const block = /export\s+const\s+PAGES\s*=\s*\{([\s\S]*?)\n\}/u.exec(source);
  if (!block) {
    throw new Error(
      `Could not locate the PAGES route map in ${pagesConfigPath}. The publication `
        + 'allowlist cannot be evaluated, so the bundle is not verifiable.',
    );
  }
  const routed = new Set();
  for (const match of block[1].matchAll(/["']([A-Za-z0-9_]+)["']\s*:/gu)) {
    routed.add(match[1]);
  }
  if (routed.size === 0) {
    throw new Error(
      `The PAGES route map in ${pagesConfigPath} parsed as empty. The publication `
        + 'allowlist cannot be evaluated, so the bundle is not verifiable.',
    );
  }
  return routed;
}

function readLazyImportGraph(source) {
  const imported = new Set();
  for (const match of source.matchAll(/import\(\s*["']\.\/pages\/([A-Za-z0-9_]+)["']\s*\)/gu)) {
    imported.add(match[1]);
  }
  return imported;
}

// Recursive: a page tucked into apps/web/pages/<subdir>/ is still a page, and
// its chunk is still named after the module. Only test fixtures are skipped.
function readPageModules(directory, modules = new Set()) {
  if (!existsSync(directory)) return modules;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
      readPageModules(path.join(directory, entry.name), modules);
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.(?:test|spec)\./u.test(entry.name)) continue;
    const match = /^([A-Za-z0-9_]+)\.(?:jsx|tsx|js|ts)$/u.exec(entry.name);
    if (match) modules.add(match[1]);
  }
  return modules;
}

// "Chunk-Hash.js" / "Chunk-Hash.css" -> "Chunk". Vite names a code-split chunk
// after its entry module, which for a lazily imported page is the page name.
function chunkBaseName(basename) {
  const match = /^(.+?)(?:-[A-Za-z0-9_-]{6,})?\.(?:js|css)(?:\.map)?$/u.exec(basename);
  return match ? match[1] : null;
}

const pagesConfigSource = readFileSync(pagesConfigPath, 'utf8');
const routedPages = readRouteMap(pagesConfigSource);
const lazyImportedPages = readLazyImportGraph(pagesConfigSource);
const pageModules = readPageModules(pagesSourceDir);

function walk(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

if (!existsSync(distRoot) || !statSync(distRoot).isDirectory()) {
  throw new Error(`Publication bundle directory does not exist: ${distRoot}`);
}

const files = walk(distRoot);
if (files.length === 0) {
  throw new Error(`Publication bundle directory is empty: ${distRoot}`);
}

const scriptFiles = files.filter((file) => /\.js$/iu.test(file));
if (scriptFiles.length === 0) {
  throw new Error('Publication bundle contains no JavaScript bundles.');
}

const violations = [];
for (const file of files) {
  const relative = path.relative(distRoot, file).replaceAll(path.sep, '/');
  const basename = path.basename(file);
  for (const prefix of forbiddenChunkPrefixes) {
    if (new RegExp(`^${prefix}(?:-[A-Za-z0-9_-]+)?\\.(?:js|css)(?:\\.map)?$`, 'iu').test(basename)) {
      violations.push(`${relative}: forbidden chunk "${prefix}"`);
    }
  }

  // Layer A - allowlist over route-bearing chunks. A chunk is route-bearing
  // when its name matches a page module in apps/web/pages/. Such a chunk may
  // ship only if that page is in the pages.config.js route map.
  const chunkBase = chunkBaseName(basename);
  if (chunkBase && pageModules.has(chunkBase) && !routedPages.has(chunkBase)) {
    violations.push(
      `${relative}: chunk "${chunkBase}" ships apps/web/pages/${chunkBase}, which is not in `
        + 'the pages.config.js route map',
    );
  }

  if (!/\.(?:css|html|js|json|map|txt)$/iu.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const marker of forbiddenContent) {
    if (source.includes(marker)) {
      violations.push(`${relative}: forbidden content ${JSON.stringify(marker)}`);
    }
  }
}

// Layer B - every page module on disk is either routed or declared unrouted
// with a written reason. This fires on a new page before it is ever imported,
// which is the case a dist-only check cannot see.
for (const pageModule of [...pageModules].sort()) {
  if (routedPages.has(pageModule)) continue;
  const reason = unroutedPageReasons.get(pageModule);
  if (!reason) {
    violations.push(
      `apps/web/pages/${pageModule}: page module is neither in the pages.config.js route map `
        + 'nor declared in unroutedPageReasons with a reason',
    );
  }
}

// A stale exclusion is also a defect: it means the reason no longer describes
// anything, and the next reader will trust a note about a file that is gone.
for (const declared of unroutedPageReasons.keys()) {
  if (!pageModules.has(declared)) {
    violations.push(
      `unroutedPageReasons lists "${declared}", but apps/web/pages/${declared} does not exist`,
    );
  }
  if (routedPages.has(declared)) {
    violations.push(
      `unroutedPageReasons lists "${declared}", but it IS in the pages.config.js route map`,
    );
  }
}

// Layer C - the lazy-import graph and the route map must name exactly the same
// pages. pages.config.js keeps excluded pages out of BOTH; this makes that
// invariant mechanical instead of a comment.
for (const imported of [...lazyImportedPages].sort()) {
  if (!routedPages.has(imported)) {
    violations.push(
      `apps/web/pages.config.js: lazily imports "./pages/${imported}" but does not route it; `
        + 'an excluded page must be absent from the import graph as well as the route map',
    );
  }
}
for (const routed of [...routedPages].sort()) {
  if (!lazyImportedPages.has(routed)) {
    violations.push(
      `apps/web/pages.config.js: routes "${routed}" with no matching import('./pages/${routed}')`,
    );
  }
  if (!pageModules.has(routed)) {
    violations.push(
      `apps/web/pages.config.js: routes "${routed}" but apps/web/pages/${routed} does not exist`,
    );
  }
}

const indexPath = path.join(distRoot, 'index.html');
if (!existsSync(indexPath)) {
  violations.push('index.html: missing web entry point');
} else {
  const indexHtml = readFileSync(indexPath, 'utf8');
  if (!indexHtml.includes(expectedTitle)) {
    violations.push('index.html: missing education/research title');
  }
  if (!/<div\s+id=["']root["']><\/div>/u.test(indexHtml)) {
    violations.push('index.html: missing root mount');
  }
}

if (violations.length > 0) {
  throw new Error(
    `High-risk or malformed code reached the publication bundle:\n${violations.join('\n')}`,
  );
}

console.log(
  `Publication bundle verified across ${files.length} files and ${scriptFiles.length} JavaScript bundles`
    + ` (denylist: ${forbiddenChunkPrefixes.length} chunk prefixes, ${forbiddenContent.length} content markers;`
    + ` allowlist: ${routedPages.size} routed pages, ${pageModules.size} page modules on disk,`
    + ` ${unroutedPageReasons.size} declared unrouted)`,
);
