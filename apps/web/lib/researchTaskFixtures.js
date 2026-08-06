export const MANDATED_RESEARCH_EXAMPLES = Object.freeze([
  'I have WES data from 50 patients with early-onset symptoms and need to identify genetic variants across the cohort.',
  'I have an anonymized aggregate cohort of 200 patients with genotype, symptom-frequency, and treatment-response variables for population-level association research.',
  'I have RNA-seq from 30 patients with symptoms and controls; compare variants at the cohort level.',
]);

export function isValidAggregateSampleCount(value) {
  const sampleCount = Number(value);
  return Number.isInteger(sampleCount)
    && sampleCount >= 2
    && sampleCount <= 1_000_000;
}

export function researchFocusControls(focus) {
  if (focus?.kind === 'hpo') {
    return { focusKind: 'hpo', focusConceptId: '', focusHpoId: focus.identifier };
  }
  if (focus?.kind === 'curated_concept') {
    return { focusKind: 'curated', focusConceptId: focus.conceptId, focusHpoId: '' };
  }
  return { focusKind: 'none', focusConceptId: '', focusHpoId: '' };
}

const EXAMPLE_TASK_INPUTS = Object.freeze([
  {
    version: 1,
    cohort: { sampleCount: 50, classification: 'deidentified_aggregate', hasControls: false },
    modalities: ['wes', 'phenotype'],
    objective: 'identify_variants',
    focus: publicationConceptById('phenotype:early-onset-symptoms'),
  },
  {
    version: 1,
    cohort: { sampleCount: 200, classification: 'deidentified_aggregate', hasControls: false },
    modalities: ['genotype', 'phenotype', 'treatment_response'],
    objective: 'association_analysis',
  },
  {
    version: 1,
    cohort: { sampleCount: 30, classification: 'deidentified_aggregate', hasControls: true },
    modalities: ['rna_seq', 'phenotype'],
    objective: 'identify_variants',
  },
]);

// Compatibility parser for the three published examples. It recognizes exact
// examples only and returns a fresh, bounded object. Arbitrary prose never
// becomes model input and must instead be represented through the guided UI.
export function parseAggregateResearchExample(text) {
  const index = MANDATED_RESEARCH_EXAMPLES.indexOf(String(text).trim());
  return index === -1 ? null : JSON.parse(JSON.stringify(EXAMPLE_TASK_INPUTS[index]));
}
import { publicationConceptById } from './publicationConceptCatalog.js';
