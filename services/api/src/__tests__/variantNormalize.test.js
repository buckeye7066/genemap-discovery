import { describe, expect, it } from 'vitest';
import {
  CLINVAR_VERSION,
  DEFAULT_REFERENCE_BUILD,
  GNOMAD_VERSION,
  decomposeMultiallelic,
  genomicHgvs,
  leftAlignAlleles,
  normalizeVcfAlleleRows,
  parseAnnotationHeader,
} from '../services/variantNormalize.js';

describe('variantNormalize', () => {
  it('left-aligns alleles without emptying either allele', () => {
    // REF=TCG ALT=TG → shared suffix G trimmed → POS 100 REF=TC ALT=T
    const aligned = leftAlignAlleles(100, 'TCG', 'TG');
    expect(aligned).toEqual({
      position: 100,
      referenceAllele: 'TC',
      alternateAllele: 'T',
    });
  });

  it('left-aligns a classic insertion padding case toward the leftmost position', () => {
    // REF=AT, ALT=ATT → shared suffix T trimmed → POS 100, REF=A, ALT=AT
    // (leftmost genomic position; not the right-shifted POS 101 form).
    expect(leftAlignAlleles(100, 'AT', 'ATT')).toEqual({
      position: 100,
      referenceAllele: 'A',
      alternateAllele: 'AT',
    });
  });

  it('decomposes multiallelic ALT alleles', () => {
    expect(decomposeMultiallelic('C', 'G,T')).toEqual([
      { referenceAllele: 'C', alternateAllele: 'G' },
      { referenceAllele: 'C', alternateAllele: 'T' },
    ]);
  });

  it('builds accession-aware genomic HGVS', () => {
    expect(genomicHgvs({
      chromosome: '17',
      position: 43071077,
      referenceAllele: 'A',
      alternateAllele: 'G',
      accession: 'NC_000017.11',
    })).toBe('NC_000017.11:g.43071077A>G');
  });

  it('parses ANN/CSQ headers and normalizes rows with pinned DB versions', () => {
    const headers = parseAnnotationHeader([
      '##INFO=<ID=ANN,Number=.,Type=String,Description="Functional annotations: \'Allele|Consequence|IMPACT|SYMBOL|Gene\'">',
    ]);
    expect(headers.ANN).toEqual(['Allele', 'Consequence', 'IMPACT', 'SYMBOL', 'Gene']);

    const rows = normalizeVcfAlleleRows({
      chromosome: '1',
      position: 100,
      ref: 'AC',
      altText: 'A,AT',
      info: { ANN: 'A|synonymous_variant|LOW|GENE1|ENSG1' },
      annotationHeaders: headers,
      accession: 'NC_000001.11',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].referenceBuild).toBe(DEFAULT_REFERENCE_BUILD);
    expect(rows[0].gene).toBe('GENE1');
    expect(rows[0].provenance.gnomadVersion).toBe(GNOMAD_VERSION);
    expect(rows[0].provenance.clinvarVersion).toBe(CLINVAR_VERSION);
    expect(rows[0].hgvs).toContain('NC_000001.11:g.');
  });
});
