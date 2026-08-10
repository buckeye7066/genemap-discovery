import { describe, expect, it } from 'vitest';
import {
  sanitizePublicationArtifact,
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
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, complete))
      .toMatchObject({ status: 'available', content: complete });

    const disguised = 'Do not use this output for diagnosis or treatment is recommended for this patient.';
    expect(__test.containsProhibitedClinicalGuidance(disguised)).toBe(true);
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, disguised))
      .toMatchObject({ status: 'withheld', content: null, reasonCode: 'clinical_boundary' });
  });

  it('rejects clinical instructions masquerading as syntactically valid gene symbols', () => {
    const result = sanitizePublicationTaskOutput(
      CANDIDATE_TASK,
      { version: 1, operation: 'suggest_candidates', query: DISEASE_QUERY },
      {
        candidateGenes: [
          { symbol: 'STOP-DRUG' },
          { symbol: 'TAKE-5MG' },
          { symbol: 'RUNX1', explanation: 'Exploratory lead requiring source verification.' },
        ],
      },
    ).content;

    expect(result.candidateGenes).toEqual([
      { symbol: 'RUNX1', explanation: 'Exploratory lead requiring source verification.' },
    ]);
  });

  it('rejects spelled-out doses, dosage forms, and administration frequency', () => {
    const unsafe = [
      'Use five milligrams each morning.',
      'Take two tablets of aspirin daily.',
      'Apply the medicine at bedtime as needed.',
    ];

    for (const instruction of unsafe) {
      expect(__test.containsProhibitedClinicalGuidance(instruction)).toBe(true);
      expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, instruction))
        .toMatchObject({ status: 'withheld', content: null, reasonCode: 'clinical_boundary' });
    }

    const safeResearchText = 'The structured cohort contains five treatment-response variables for aggregate comparison.';
    expect(__test.containsProhibitedClinicalGuidance(safeResearchText)).toBe(false);
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, safeResearchText))
      .toMatchObject({ status: 'available', content: safeResearchText });
  });

  it('neutralizes reference-style Markdown and protocol-relative targets', () => {
    const raw = 'Review ![tracking pixel][image] and [the source][source].\n\n[image]: //tracker.example/pixel.png\n[source]: //untrusted.example/record';
    const result = sanitizePublicationTaskOutput(RESEARCH_TASK, {}, raw).content;

    expect(result).toContain('tracking pixel');
    expect(result).toContain('the source');
    expect(result).not.toContain('//tracker.example');
    expect(result).not.toContain('//untrusted.example');
    expect(result).not.toContain('![');
  });

  it.each([
    {
      label: 'withheld',
      summary: 'T<em>ak</em>e Zorblax.',
      expectedStatus: 'withheld',
      expectedReason: 'clinical_boundary',
    },
    {
      label: 'unavailable',
      summary: '',
      expectedStatus: 'unavailable',
      expectedReason: 'profile_summary_unavailable',
    },
  ])('promotes a terminal $label gene-profile summary to a content-free artifact', ({
    summary,
    expectedStatus,
    expectedReason,
  }) => {
    const result = sanitizePublicationArtifact(
      CANDIDATE_TASK,
      { version: 1, operation: 'gene_profile', gene: { symbol: 'RUNX1' } },
      {
        completion: 'complete',
        text: {
          summary,
          keyTakeaways: ['A field that must not escape beside a terminal summary.'],
          phenotypes: [{ name: 'A phenotype that must not escape.' }],
        },
      },
      { correlationId: `profile-${expectedStatus}-test` },
    );

    expect(result).toMatchObject({
      status: expectedStatus,
      content: null,
      reasonCode: expectedReason,
    });
    expect(JSON.stringify(result)).not.toMatch(/keyTakeaways|phenotype|RUNX1/i);
  });

  it('publishes a gene profile as partial only with safe content and a visible limitation', () => {
    const result = sanitizePublicationArtifact(
      CANDIDATE_TASK,
      { version: 1, operation: 'gene_profile', gene: { symbol: 'RUNX1' } },
      {
        completion: 'complete',
        text: {
          summary: 'RUNX1 is a transcription-factor candidate for source-based research.',
          keyTakeaways: [
            'Review authoritative gene records.',
            'You should take Zorblax.',
          ],
          phenotypes: [{ name: 'Exploratory phenotype evidence' }],
        },
      },
      { correlationId: 'profile-partial-test' },
    );

    expect(result.status).toBe('partial');
    expect(result.reasonCode).toBe('clinical_fields_withheld');
    expect(result.limitations).toHaveLength(1);
    expect(result.content).toMatchObject({
      summaryStatus: 'available',
      summary: 'RUNX1 is a transcription-factor candidate for source-based research.',
      keyTakeaways: ['Review authoritative gene records.'],
    });
    expect(JSON.stringify(result.content)).not.toContain('Zorblax');
  });
});
