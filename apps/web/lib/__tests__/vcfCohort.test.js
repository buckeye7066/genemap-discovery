import { describe, it, expect } from 'vitest';
import {
  classifyVariant,
  accumulateVcfLines,
  summarizeCohort,
  extractGeneFromInfo,
  parseVariantKey,
  collectCohortVariants,
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

describe('extractGeneFromInfo', () => {
  it('reads explicit gene keys', () => {
    expect(extractGeneFromInfo('DP=44;GENE=BRCA1')).toBe('BRCA1');
    expect(extractGeneFromInfo('SYMBOL=TP53;AF=0.1')).toBe('TP53');
  });
  it('reads the gene field from snpEff ANN / VEP CSQ annotations', () => {
    expect(extractGeneFromInfo('ANN=G|missense_variant|MODERATE|BRCA2|ENSG')).toBe('BRCA2');
    expect(extractGeneFromInfo('CSQ=G|missense|MODERATE|EGFR|ENSG')).toBe('EGFR');
  });
  it('returns null when no gene is present', () => {
    expect(extractGeneFromInfo('.')).toBeNull();
    expect(extractGeneFromInfo('DP=44;AF=0.1')).toBeNull();
  });
});

describe('parseVariantKey', () => {
  it('round-trips a chr:pos:ref>alt key', () => {
    expect(parseVariantKey('chr17:43071077:A>G')).toEqual({
      chromosome: 'chr17', position: 43071077, ref: 'A', alt: 'G',
    });
  });
  it('handles indels and rejects malformed keys', () => {
    expect(parseVariantKey('chr1:200:AT>A')).toMatchObject({ ref: 'AT', alt: 'A' });
    expect(parseVariantKey('garbage')).toBeNull();
  });
});

describe('collectCohortVariants', () => {
  function fileFrom(name, lines) {
    const acc = accumulateVcfLines(lines);
    return {
      name,
      variantCount: acc.variantCount,
      variantTypes: acc.variantTypes,
      keys: acc.keys,
      keyMeta: acc.keyMeta,
      keysTruncated: acc.keysTruncated,
    };
  }

  it('ranks distinct variants by cohort prevalence and carries rsid/gene', () => {
    const shared = 'chr1\t100\trs99\tA\tG\t.\t.\tGENE=BRCA1';
    const s1 = fileFrom('a.vcf', ['#CHROM', shared, 'chr1\t200\t.\tA\tT\t.\t.\t.']);
    const s2 = fileFrom('b.vcf', ['#CHROM', shared]);
    const s3 = fileFrom('c.vcf', ['#CHROM', shared]);

    const { variants, distinctTotal, sampleCount } = collectCohortVariants([s1, s2, s3]);
    expect(sampleCount).toBe(3);
    expect(distinctTotal).toBe(2);
    // Most prevalent variant ranks first.
    expect(variants[0].stableVariantKey).toBe('chr1:100:A>G');
    expect(variants[0].sampleCount).toBe(3);
    expect(variants[0].cohortFraction).toBe(1);
    expect(variants[0].rsid).toBe('rs99');
    expect(variants[0].gene).toBe('BRCA1');
    expect(variants[1].sampleCount).toBe(1);
  });

  it('respects the limit (top-by-prevalence)', () => {
    const s1 = fileFrom('a.vcf', [
      '#CHROM',
      'chr1\t1\t.\tA\tG\t.\t.\t.',
      'chr1\t2\t.\tA\tG\t.\t.\t.',
      'chr1\t3\t.\tA\tG\t.\t.\t.',
    ]);
    const { variants } = collectCohortVariants([s1], { limit: 2 });
    expect(variants).toHaveLength(2);
  });
});
