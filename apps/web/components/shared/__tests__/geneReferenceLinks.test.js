import { describe, it, expect } from 'vitest';
import { geneReferenceLinks, normalizeGeneSymbols } from '../geneReferenceLinks.js';

describe('normalizeGeneSymbols', () => {
  it('accepts strings and { symbol } objects, dedupes case-insensitively', () => {
    const out = normalizeGeneSymbols(['BRCA1', { symbol: 'brca1' }, 'TP53', '', null, { symbol: '' }]);
    expect(out).toEqual(['BRCA1', 'TP53']);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeGeneSymbols(undefined)).toEqual([]);
    expect(normalizeGeneSymbols(null)).toEqual([]);
  });
});

describe('geneReferenceLinks', () => {
  it('builds a per-gene NCBI lookup plus ClinVar/PubMed/MedlinePlus anchors', () => {
    const links = geneReferenceLinks(['BRCA1', 'TP53']);
    const urls = links.map((l) => l.url);
    expect(urls).toContain('https://www.ncbi.nlm.nih.gov/gene/?term=BRCA1');
    expect(urls).toContain('https://www.ncbi.nlm.nih.gov/gene/?term=TP53');
    expect(urls.some((u) => u.startsWith('https://www.ncbi.nlm.nih.gov/clinvar/?term=BRCA1'))).toBe(true);
    expect(urls.some((u) => u.startsWith('https://pubmed.ncbi.nlm.nih.gov/?term='))).toBe(true);
    expect(urls).toContain('https://medlineplus.gov/genetics/');
    // Every link is a well-formed https URL with a label.
    for (const l of links) {
      expect(l.url.startsWith('https://')).toBe(true);
      expect(l.label).toBeTruthy();
    }
  });

  it('URL-encodes symbols so a query cannot break the link', () => {
    const links = geneReferenceLinks(['BRCA1 OR x']);
    // The space/OR must be encoded, never raw in the href.
    expect(links[0].url).toContain('BRCA1%20OR%20x');
  });

  it('caps at 8 per-gene lookups', () => {
    const many = Array.from({ length: 20 }, (_, i) => `GENE${i}`);
    const links = geneReferenceLinks(many);
    const geneLookups = links.filter((l) => l.url.includes('/gene/?term=GENE'));
    expect(geneLookups.length).toBe(8);
  });

  it('falls back to database homepages when there are no genes', () => {
    const links = geneReferenceLinks([]);
    const urls = links.map((l) => l.url);
    expect(urls).toContain('https://www.ncbi.nlm.nih.gov/gene/');
    expect(urls).toContain('https://www.ensembl.org/');
    expect(urls).toContain('https://medlineplus.gov/genetics/');
  });
});
