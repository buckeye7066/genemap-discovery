import { describe, it, expect } from 'vitest';
import {
  classifyVariant,
  accumulateVcfLines,
  summarizeCohort,
} from '../vcfCohort.js';

describe('classifyVariant', () => {
  it('classifies SNVs, MNVs, insertions and deletions', () => {
    expect(classifyVariant('A', 'G')).toBe('SNV');
    expect(classifyVariant('AC', 'GT')).toBe('MNV');
    expect(classifyVariant('A', 'AT')).toBe('Insertion');
    expect(classifyVariant('AT', 'A')).toBe('Deletion');
  });

  it('returns Unknown for missing alleles', () => {
    expect(classifyVariant('', 'A')).toBe('Unknown');
    expect(classifyVariant('A', '')).toBe('Unknown');
  });
});

describe('accumulateVcfLines', () => {
  const sample = [
    '##fileformat=VCFv4.2',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
    'chr1\t100\trs1\tA\tG\t50\tPASS\t.',
    'chr1\t200\t.\tAT\tA\t60\tPASS\t.',
    'chr2\t300\t.\tC\tG,T\t60\tPASS\t.', // multiallelic -> 2 variants
    'malformed line without tabs',
    'chr3\t400\t.\tG\t.\t.\t.\t.', // no alt -> skipped
    '',
  ];

  it('counts real variants and skips headers/malformed/empty lines', () => {
    const acc = accumulateVcfLines(sample);
    // rs1 (SNV) + AT>A (Deletion) + C>G + C>T (2 SNV) = 4
    expect(acc.variantCount).toBe(4);
    expect(acc.variantTypes.SNV).toBe(3);
    expect(acc.variantTypes.Deletion).toBe(1);
    expect(acc.keys.has('chr1:100:A>G')).toBe(true);
    expect(acc.keys.has('chr2:300:C>T')).toBe(true);
  });

  it('accumulates incrementally across streamed chunks', () => {
    const state = accumulateVcfLines(sample.slice(0, 4));
    const before = state.variantCount;
    accumulateVcfLines(sample.slice(4), { state });
    expect(state.variantCount).toBeGreaterThanOrEqual(before);
    expect(state.variantCount).toBe(4);
  });

  it('flags truncation when the key cap is exceeded', () => {
    const lines = Array.from({ length: 5 }, (_, i) => `chr1\t${i + 1}\t.\tA\tG\t.\t.\t.`);
    const acc = accumulateVcfLines(lines, { maxKeys: 2 });
    expect(acc.variantCount).toBe(5); // counts are always exact
    expect(acc.keys.size).toBe(2); // key set is capped
    expect(acc.keysTruncated).toBe(true);
  });
});

describe('summarizeCohort', () => {
  function fileFrom(name, lines) {
    const acc = accumulateVcfLines(lines);
    return { name, variantCount: acc.variantCount, variantTypes: acc.variantTypes, keys: acc.keys, keysTruncated: acc.keysTruncated };
  }

  it('aggregates totals, means, and shared-variant tallies across samples', () => {
    const shared = 'chr1\t100\t.\tA\tG\t.\t.\t.';
    const s1 = fileFrom('a.vcf', ['#CHROM', shared, 'chr1\t200\t.\tA\tT\t.\t.\t.']);
    const s2 = fileFrom('b.vcf', ['#CHROM', shared, 'chr2\t500\t.\tC\tG\t.\t.\t.']);
    const s3 = fileFrom('c.vcf', ['#CHROM', shared]);

    const summary = summarizeCohort([s1, s2, s3]);
    expect(summary.sampleCount).toBe(3);
    expect(summary.totalVariants).toBe(5);
    expect(summary.meanVariantsPerSample).toBe(2); // round(5/3)
    expect(summary.variantTypes.SNV).toBe(5);
    // chr1:100:A>G present in all 3 samples
    expect(summary.sharedAcrossAll).toBe(1);
    expect(summary.sharedByTwoOrMore).toBe(1);
    expect(summary.sharedApproximate).toBe(false);
  });

  it('marks shared figures approximate when any file was truncated', () => {
    const s1 = { name: 'a', variantCount: 10, variantTypes: { SNV: 10 }, keys: new Set(['chr1:1:A>G']), keysTruncated: true };
    const summary = summarizeCohort([s1]);
    expect(summary.sharedApproximate).toBe(true);
  });

  it('handles an empty cohort without dividing by zero', () => {
    const summary = summarizeCohort([]);
    expect(summary.sampleCount).toBe(0);
    expect(summary.meanVariantsPerSample).toBe(0);
    expect(summary.totalVariants).toBe(0);
  });
});
