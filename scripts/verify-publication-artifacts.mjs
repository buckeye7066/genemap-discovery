import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const distDir = path.resolve(process.argv[2] || 'apps/web/dist');

const FORBIDDEN_PAGE_CHUNKS = [
  'MedicalData',
  'VCFAnalysis',
  'AIAssistants',
  'Anastasia',
  'RobertClinical',
  'VisualizationHub',
  'GSEA',
  'FHIRExporter',
  'AskAIButtons',
  'GenomeBrowser',
  'ComparativeGenomics',
  'ChromosomeView',
  'GeneExpressionChart',
  'PhenotypeNetwork',
  'ProteinDomains',
  'ProteinStructure',
  'ProteinInteractions',
  'ClinicalTrialFinder',
  'RobertClinicalSupport',
  'VCFParser',
  'FunctionReviewer',
];

const FORBIDDEN_PUBLISHED_STRINGS = [
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
  'HIPAA Compliant',
  'FHIRExporter',
  'RobertClinicalSupport',
  'ComparativeGenomics',
];

const EXPECTED_TITLE = '<title>GeneMap Discovery | Genetics Education &amp; Research Leads</title>';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function main() {
  const details = await stat(distDir).catch(() => null);
  if (!details?.isDirectory()) {
    throw new Error(`Web artifact directory does not exist: ${distDir}`);
  }

  const files = await walk(distDir);
  const relativeFiles = files.map((file) => path.relative(distDir, file));
  const scriptFiles = files.filter((file) => /\.js$/i.test(file));
  if (scriptFiles.length === 0) throw new Error('Web artifact contains no JavaScript bundles.');

  for (const pageName of FORBIDDEN_PAGE_CHUNKS) {
    const chunkPattern = new RegExp(
      `^${escapeRegExp(pageName)}(?:-[A-Za-z0-9_-]+)?\\.(?:js|css)(?:\\.map)?$`,
      'i'
    );
    const emitted = relativeFiles.find((file) => chunkPattern.test(path.basename(file)));
    if (emitted) {
      throw new Error(`Forbidden publication page chunk was emitted: ${emitted}`);
    }
  }

  const searchableFiles = files.filter((file) => /\.(?:html|js|css)$/i.test(file));
  for (const file of searchableFiles) {
    const content = await readFile(file, 'utf8');
    for (const forbidden of FORBIDDEN_PUBLISHED_STRINGS) {
      if (content.includes(forbidden)) {
        throw new Error(
          `Forbidden publication string ${JSON.stringify(forbidden)} was emitted in ${path.relative(distDir, file)}`
        );
      }
    }
  }

  const indexHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
  if (!indexHtml.includes(EXPECTED_TITLE) || !/<div\s+id=["']root["']><\/div>/.test(indexHtml)) {
    throw new Error('Web artifact is missing the education/research title or root mount.');
  }

  console.log(
    `Publication artifact verified: ${relativeFiles.length} files, ${scriptFiles.length} JavaScript bundles, no forbidden route chunks, endpoints, or labels.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
