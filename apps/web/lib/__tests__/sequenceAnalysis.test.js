import { describe, expect, it } from 'vitest';
import {
  MAX_ALIGNMENT_LENGTH,
  SequenceInputError,
  analyzeDna,
  globalAlign,
  normalizeDna,
  reverseComplement,
  translateDna,
} from '../sequenceAnalysis';

describe('educational sequence analysis', () => {
  it('accepts FASTA and preserves IUPAC ambiguity explicitly', () => {
    expect(normalizeDna('>synthetic example\nacgt ryn')).toEqual({
      sequence: 'ACGTRYN',
      valid: true,
      invalidSymbols: [],
    });
    expect(analyzeDna('ACGTNN')).toMatchObject({
      length: 6,
      gcPercent: 33.3,
      ambiguousBases: 2,
      transcript: 'ACGUNN',
    });
  });

  it('does not silently clean unsupported input', () => {
    expect(normalizeDna('ACGT?12')).toMatchObject({ valid: false, invalidSymbols: ['?', '1', '2'] });
    expect(() => analyzeDna('ACGT?')).toThrow(SequenceInputError);
  });

  it('computes reverse complements and standard-code translations', () => {
    expect(reverseComplement('ATGCRY')).toBe('RYGCAT');
    expect(translateDna('ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG')).toBe('MAIVMGR*KGAR*');
    expect(translateDna('ATGNNT')).toBe('MX');
  });

  it('produces a deterministic short global alignment', () => {
    expect(globalAlign('ACGT', 'AGT')).toEqual({
      first: 'ACGT',
      comparison: '| ||',
      second: 'A-GT',
      score: 4,
      identityPercent: 75,
    });
  });

  it('bounds quadratic alignment work', () => {
    expect(() => globalAlign('A'.repeat(MAX_ALIGNMENT_LENGTH + 1), 'A')).toThrow(/limited/i);
  });
});
