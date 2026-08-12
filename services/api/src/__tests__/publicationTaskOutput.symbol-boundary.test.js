import { describe, expect, it } from 'vitest';
import { sanitizePublicationTaskOutput } from '../services/publicationTaskOutput.js';

function sanitizeCandidates(candidateGenes) {
  return sanitizePublicationTaskOutput(
    'candidate_gene_research',
    { version: 1, operation: 'suggest_candidates' },
    { candidateGenes },
  );
}

describe('candidate gene publication boundary', () => {
  it('rejects clinical instructions that satisfy the syntactic symbol pattern', () => {
    const publication = sanitizeCandidates([
      { symbol: 'STOP-DRUG' },
      { symbol: 'TAKE-5MG' },
      { symbol: 'TAKE-ASPIRIN' },
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
    ]);

    expect(publication).toMatchObject({
      contractVersion: 1,
      status: 'partial',
      reasonCode: 'clinical_fields_withheld',
      correlationId: 'legacy-publication-boundary',
    });
    expect(publication.limitations).toHaveLength(1);
    expect(publication.content).toEqual({
      candidateGenes: [
        { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
      ],
    });
  });

  it('drops direct medication guidance from candidate names and explanations', () => {
    const publication = sanitizeCandidates([
      { symbol: 'RUNX1', name: 'Take aspirin.', explanation: 'Aspirin is recommended.' },
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator', explanation: 'Exploratory candidate for source verification.' },
    ]);

    expect(publication).toMatchObject({
      contractVersion: 1,
      status: 'partial',
      reasonCode: 'clinical_fields_withheld',
      correlationId: 'legacy-publication-boundary',
    });
    expect(publication.limitations).toHaveLength(1);
    expect(publication.content).toEqual({
      candidateGenes: [
        { symbol: 'RUNX1' },
        {
          symbol: 'CFTR',
          name: 'CF transmembrane conductance regulator',
          explanation: 'Exploratory candidate for source verification.',
        },
      ],
    });
  });
});
