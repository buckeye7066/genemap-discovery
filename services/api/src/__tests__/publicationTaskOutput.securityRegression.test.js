import { describe, expect, it } from 'vitest';
import {
  sanitizePublicationTaskOutput,
  __test,
} from '../services/publicationTaskOutput.js';

const CANDIDATE_TASK = 'candidate_gene_research';
const RESEARCH_TASK = 'research_hypothesis';
const DISEASE_QUERY = {
  kind: 'curated_concept',
  conceptId: 'disease:cystic-fibrosis',
  canonicalLabel: 'Cystic Fibrosis',
  conceptKind: 'disease',
  source: 'genemap_curated',
  version: 1,
};

describe('publication output security regressions', () => {
  it('allows a complete boundary disclaimer but rejects a run-on clinical clause', () => {
    const complete = 'Do not use this output for diagnosis, personal-risk prediction, treatment, dosing, screening, or other clinical decisions. Compare aggregate patterns only.';
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, complete)).toBe(complete);

    const disguised = 'Do not use this output for diagnosis or treatment is recommended for this patient.';
    expect(__test.containsProhibitedClinicalGuidance(disguised)).toBe(true);
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, disguised))
      .toBe(__test.PUBLICATION_BOUNDARY_MESSAGE);
  });

  it('rejects clinical instructions masquerading as syntactically valid gene symbols', () => {
    const result = JSON.parse(sanitizePublicationTaskOutput(
      CANDIDATE_TASK,
      { version: 1, operation: 'suggest_candidates', query: DISEASE_QUERY },
      {
        candidateGenes: [
          { symbol: 'STOP-DRUG' },
          { symbol: 'TAKE-5MG' },
          { symbol: 'RUNX1', explanation: 'Exploratory lead requiring source verification.' },
        ],
      },
    ));

    expect(result.candidateGenes).toEqual([
      { symbol: 'RUNX1', explanation: 'Exploratory lead requiring source verification.' },
    ]);
  });

  it('neutralizes reference-style Markdown and protocol-relative targets', () => {
    const raw = 'Review ![tracking pixel][image] and [the source][source].\n\n[image]: //tracker.example/pixel.png\n[source]: //untrusted.example/record';
    const result = sanitizePublicationTaskOutput(RESEARCH_TASK, {}, raw);

    expect(result).toContain('tracking pixel');
    expect(result).toContain('the source');
    expect(result).not.toContain('//tracker.example');
    expect(result).not.toContain('//untrusted.example');
    expect(result).not.toContain('![');
  });
});
