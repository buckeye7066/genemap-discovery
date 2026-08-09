import { describe, expect, it } from 'vitest';
import { sanitizePublicationTaskOutput } from '../services/publicationTaskOutput.js';

function sanitizeCandidates(candidateGenes) {
  return JSON.parse(sanitizePublicationTaskOutput(
    'candidate_gene_research',
    { version: 1, operation: 'suggest_candidates' },
    { candidateGenes },
  ));
}

describe('candidate gene symbol publication boundary', () => {
  it('rejects clinical instructions that satisfy the syntactic symbol pattern', () => {
    const result = sanitizeCandidates([
      { symbol: 'STOP-DRUG' },
      { symbol: 'TAKE-5MG' },
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
    ]);

    expect(result).toEqual({
      candidateGenes: [
        { symbol: 'CFTR', name: 'CF transmembrane conductance regulator' },
      ],
    });
  });
});
