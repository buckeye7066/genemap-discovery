import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultDist = fileURLToPath(new URL('../apps/web/dist', import.meta.url));
const distRoot = path.resolve(process.argv[2] || defaultDist);

const forbiddenChunkNames = [
  'AIAssistants-',
  'Anastasia-',
  'RobertClinical-',
  'MedicalData-',
  'VCFAnalysis-',
  'VisualizationHub-',
  'GSEA-',
  'FunctionReviewer-',
  'GenomeBrowser-',
  'ComparativeGenomics-',
];

// These exact, high-specificity strings are stable evidence that excluded
// clinical-persona, patient-data, or FHIR modules reached the browser graph.
// Broad words such as "clinical" are intentionally not used: legal/disclaimer
// copy needs to describe the boundary without failing this gate.
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
  '/entities/medical-data',
  '/entities/conversations',
  '/genomics/variant',
  '/genomics/clinvar',
  '/genomics/phenotype/search',
  '/genomics/vcf/',
  '/clinical-trials/',
  'getMedicalData',
  'saveMedicalData',
  'deleteMedicalData',
  'getConversations',
  'saveConversation',
  'updateConversation',
  'lookupVariant',
  'searchVariants',
  'searchClinVar',
  'searchPhenotypes',
  'parseVcf',
  'enrichVcfVariants',
  'enrichVcfCohort',
  'searchClinicalTrials',
  'getClinicalTrial',
  'GenomeBrowser',
  'ComparativeGenomics',
  'apiClient.invokeLLM',
];

// The publication-safe client must still expose the deterministic education
// and public reference-data paths used by the surviving UI. A build that
// accidentally drops all client code should not pass merely because it lacks
// the forbidden markers.
const requiredContent = [
  '/genomics/gene/',
  '/genomics/enrich',
  '/genomics/publication-concepts/search',
  'lookupGene',
  'enrichGenomicData',
  'searchPublicationConcepts',
];

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

const violations = [];
let searchableContent = '';
for (const file of files) {
  const relative = path.relative(distRoot, file).replaceAll(path.sep, '/');
  for (const marker of forbiddenChunkNames) {
    if (path.basename(file).includes(marker)) {
      violations.push(`${relative}: forbidden chunk marker "${marker}"`);
    }
  }

  if (!/\.(?:css|html|js|json|map|txt)$/u.test(file)) continue;
  const content = readFileSync(file, 'utf8');
  searchableContent += `\n${content}`;
  for (const marker of forbiddenContent) {
    if (content.includes(marker)) {
      violations.push(`${relative}: forbidden content marker "${marker}"`);
    }
  }
}

for (const marker of requiredContent) {
  if (!searchableContent.includes(marker)) {
    violations.push(`publication bundle: required public client marker missing "${marker}"`);
  }
}

if (violations.length > 0) {
  throw new Error(
    `High-risk code reached the publication bundle:\n${violations.join('\n')}`,
  );
}

console.log(
  `Publication bundle boundary verified across ${files.length} files in ${distRoot}`,
);
