import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultDist = fileURLToPath(new URL('../apps/web/dist', import.meta.url));
const distRoot = path.resolve(process.argv[2] || defaultDist);

const forbiddenChunkPrefixes = [
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

  if (!/\.(?:css|html|js|json|map|txt)$/iu.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const marker of forbiddenContent) {
    if (source.includes(marker)) {
      violations.push(`${relative}: forbidden content ${JSON.stringify(marker)}`);
    }
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
  `Publication bundle verified across ${files.length} files and ${scriptFiles.length} JavaScript bundles`,
);
