import { describe, it, expect } from 'vitest';
import { variantReferenceLinks } from '../variantReferenceLinks.js';

describe('variantReferenceLinks', () => {
  it('links dbSNP + exact ClinVar variation + gnomAD when all ids are present', () => {
    const variant = { chromosome: 'chr11', position: 5227002, ref: 'T', alt: 'A', rsid: 'rs334' };
    const annotations = {
      myVariant: { data: { dbsnp: { rsid: 'rs334' } } },
      clinVar: { search: { esearchresult: { idlist: ['15333'] } } },
    };
    const urls = variantReferenceLinks(variant, annotations).map((l) => l.url);
    expect(urls).toContain('https://www.ncbi.nlm.nih.gov/snp/rs334');
    expect(urls).toContain('https://www.ncbi.nlm.nih.gov/clinvar/variation/15333/');
    // gnomAD strips the chr prefix and joins chr-pos-ref-alt.
    expect(urls).toContain('https://gnomad.broadinstitute.org/variant/11-5227002-T-A?dataset=gnomad_r4');
  });

  it('falls back to a ClinVar search when no variation id resolved', () => {
    const urls = variantReferenceLinks({ rsid: 'rs7412' }, {}).map((l) => l.url);
    expect(urls).toContain('https://www.ncbi.nlm.nih.gov/clinvar/?term=rs7412');
    // No coordinates → no gnomAD link.
    expect(urls.some((u) => u.includes('gnomad'))).toBe(false);
  });

  it('ignores a non-rsID id and yields only coordinate-based links', () => {
    const variant = { chromosome: '7', position: 100, referenceAllele: 'G', alternateAllele: 'C', id: '.' };
    const urls = variantReferenceLinks(variant, {}).map((l) => l.url);
    expect(urls.some((u) => u.includes('/snp/'))).toBe(false);
    expect(urls).toContain('https://gnomad.broadinstitute.org/variant/7-100-G-C?dataset=gnomad_r4');
  });

  it('returns [] when there is no usable identifier', () => {
    expect(variantReferenceLinks({}, {})).toEqual([]);
  });
});
