import { describe, expect, it } from 'vitest';
import { sanitizePublicationTaskOutput } from '../services/publicationTaskOutput.js';

const TASK = 'candidate_gene_research';
const QUERY = {
  kind: 'curated_concept',
  conceptId: 'disease:cystic-fibrosis',
  canonicalLabel: 'Cystic Fibrosis',
  conceptKind: 'disease',
  source: 'genemap_curated',
  version: 1,
};

function sanitizeCandidates(candidateGenes) {
  return sanitizePublicationTaskOutput(
    TASK,
    {
      version: 1,
      operation: 'suggest_candidates',
      query: QUERY,
      audience: 'researcher',
    },
    { candidateGenes },
  );
}

describe('candidate gene symbol publication policy', () => {
  it('rejects clinical instructions masquerading as syntactically valid gene symbols', () => {
    const publication = sanitizeCandidates([
      { symbol: 'STOP-DRUG', name: 'invented lead' },
      { symbol: 'TAKE-5MG', name: 'invented lead' },
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
    ]);

    expect(publication).toMatchObject({
      contractVersion: 1,
      status: 'partial',
      reasonCode: 'clinical_fields_withheld',
      correlationId: 'legacy-publication-boundary',
    });
    expect(publication.limitations).toHaveLength(1);
    expect(publication.content.candidateGenes).toEqual([
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
    ]);
  });

  it('retains ordinary bounded gene symbols that do not contain clinical guidance', () => {
    const publication = sanitizeCandidates([
      { symbol: 'RUNX1' },
      { symbol: 'HLA-DQA1' },
      { symbol: 'SCN1A' },
    ]);

    expect(publication).toMatchObject({
      contractVersion: 1,
      status: 'available',
      reasonCode: null,
      correlationId: 'legacy-publication-boundary',
      limitations: [],
    });
    expect(publication.content.candidateGenes.map((gene) => gene.symbol)).toEqual([
      'RUNX1',
      'HLA-DQA1',
      'SCN1A',
    ]);
  });
});
