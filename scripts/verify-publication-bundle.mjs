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
for (const file of files) {
  const relative = path.relative(distRoot, file).replaceAll(path.sep, '/');
  for (const marker of forbiddenChunkNames) {
    if (path.basename(file).includes(marker)) {
      violations.push(`${relative}: forbidden chunk marker "${marker}"`);
    }
  }

  if (!/\.(?:css|html|js|json|map|txt)$/u.test(file)) continue;
  const content = readFileSync(file, 'utf8');
  for (const marker of forbiddenContent) {
    if (content.includes(marker)) {
      violations.push(`${relative}: forbidden content marker "${marker}"`);
    }
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
