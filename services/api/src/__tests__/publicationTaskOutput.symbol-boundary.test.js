import { describe, expect, it } from 'vitest';
import { sanitizePublicationTaskOutput } from '../services/publicationTaskOutput.js';

function sanitizeCandidates(candidateGenes) {
  return JSON.parse(sanitizePublicationTaskOutput(
    'candidate_gene_research',
    { version: 1, operation: 'suggest_candidates' },
    { candidateGenes },
  ));
}

describe('candidate gene publication boundary', () => {
  it('rejects clinical instructions that satisfy the syntactic symbol pattern', () => {
    const result = sanitizeCandidates([
      { symbol: 'STOP-DRUG' },
      { symbol: 'TAKE-5MG' },
      { symbol: 'TAKE-ASPIRIN' },
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
    ]);

    expect(result).toEqual({
      candidateGenes: [
        { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
      ],
    });
  });

  it('drops direct medication guidance from candidate names and explanations', () => {
    const result = sanitizeCandidates([
      { symbol: 'RUNX1', name: 'Take aspirin.', explanation: 'Aspirin is recommended.' },
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator', explanation: 'Exploratory candidate for source verification.' },
    ]);

    expect(result).toEqual({
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