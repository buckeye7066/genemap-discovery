import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';

vi.mock('../services/genomicDatabases.js', () => ({
  lookupVariant: vi.fn(async (id) => ({ _id: id, dbsnp: { rsid: id } })),
  lookupGene: vi.fn(async (symbol) => ({ id: 'ENSG00000012048', display_name: symbol })),
  searchClinVar: vi.fn(async () => ({ esearchresult: { idlist: ['123'] } })),
  getClinVarVariant: vi.fn(async () => ({
    result: {
      123: {
        accession: 'VCV000000123',
        clinical_significance: { description: 'Benign' },
        review_status: 'criteria provided, single submitter',
      },
    },
  })),
  normalizeQuery: (query) => String(query ?? '').trim().toLowerCase(),
}));

let app;
let prisma;

const fixture = [
  '##fileformat=VCFv4.2',
  '##INFO=<ID=GENE,Number=1,Type=String,Description="Gene symbol">',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE',
  '17\t43071077\trs80357906\tA\tG\t99\tPASS\tGENE=BRCA1;DP=44\tGT:DP\t0/1:44',
].join('\n');

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false, includeGenomics: true });
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
});

function cookie() {
  return authCookie({ userId: 'u-1', email: 'user@example.com', role: 'user' }, prisma);
}

describe('VCF genomics routes', () => {
  it('parses VCF text deterministically without LLM calls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/parse',
      headers: { cookie: cookie() },
      payload: { text: fixture },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.variants).toHaveLength(1);
    expect(body.variants[0]).toMatchObject({
      chromosome: 'chr17',
      position: 43071077,
      rsid: 'rs80357906',
      ref: 'A',
      alt: 'G',
      gene: 'BRCA1',
      zygosity: 'heterozygous',
      variant_type: 'SNV',
    });
    expect(body.summary).toMatchObject({
      totalVariants: 1,
      parsedVariants: 1,
      variantTypes: { SNV: 1 },
    });
    expect(prisma._store.auditLog.some((row) => row.action === 'vcf.parse')).toBe(true);
  });

  it('rejects empty VCF parse payloads before audit logging', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/parse',
      headers: { cookie: cookie() },
      payload: { text: '   ' },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma._store.auditLog.some((row) => row.action === 'vcf.parse')).toBe(false);
  });

  it('enriches variants with source-grounded metadata', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/enrich',
      headers: { cookie: cookie() },
      payload: {
        variants: [{
          chromosome: 'chr17',
          position: 43071077,
          rsid: 'rs80357906',
          ref: 'A',
          alt: 'G',
          gene: 'BRCA1',
          stableVariantKey: 'chr17:43071077:A>G',
        }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enrichedVariants).toHaveLength(1);
    expect(body.enrichedVariants[0].annotations.myVariant).toMatchObject({
      status: 'found',
      source: { name: 'MyVariant.info' },
    });
    expect(body.enrichedVariants[0].annotations.clinVar).toMatchObject({
      status: 'found',
      source: { name: 'ClinVar E-utilities' },
    });
    expect(body.enrichedVariants[0].clinicalConfirmationRequired).toBe(true);
    expect(prisma._store.auditLog.some((row) => row.action === 'vcf.enrich')).toBe(true);
  });

  it('rejects empty enrichment batches', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/enrich',
      headers: { cookie: cookie() },
      payload: { variants: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma._store.auditLog.some((row) => row.action === 'vcf.enrich')).toBe(false);
  });

  it('rejects enrichment batches above the public lookup limit', async () => {
    const variants = Array.from({ length: 51 }, (_, index) => ({
      chromosome: 'chr17',
      position: 43071077 + index,
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/enrich',
      headers: { cookie: cookie() },
      payload: { variants },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma._store.auditLog.some((row) => row.action === 'vcf.enrich')).toBe(false);
  });

  it('annotates a cohort union and returns results keyed by stable variant key', async () => {
    const variants = Array.from({ length: 60 }, (_, index) => ({
      chromosome: 'chr17',
      position: 43071077 + index,
      ref: 'A',
      alt: 'G',
      stableVariantKey: `chr17:${43071077 + index}:A>G`,
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/enrich-cohort',
      headers: { cookie: cookie() },
      payload: { variants },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Cohort route lifts the 50-variant single-file cap.
    expect(body.enrichedVariants).toHaveLength(60);
    const firstKey = 'chr17:43071077:A>G';
    expect(body.byKey[firstKey]).toBeDefined();
    expect(body.byKey[firstKey].annotations.clinVar.status).toBe('found');
    expect(prisma._store.auditLog.some((row) => row.action === 'vcf.enrich_cohort')).toBe(true);
  });

  it('rejects cohort batches above the cohort lookup limit', async () => {
    const variants = Array.from({ length: 151 }, (_, index) => ({
      chromosome: 'chr17',
      position: 43071077 + index,
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/enrich-cohort',
      headers: { cookie: cookie() },
      payload: { variants },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma._store.auditLog.some((row) => row.action === 'vcf.enrich_cohort')).toBe(false);
  });

  it('deduplicates repeated variants so each distinct lookup runs once', async () => {
    const db = await import('../services/genomicDatabases.js');
    db.searchClinVar.mockClear();
    // 40 samples all carrying the SAME variant -> a single ClinVar lookup.
    const variants = Array.from({ length: 40 }, () => ({
      chromosome: 'chr13',
      position: 32340000,
      ref: 'C',
      alt: 'T',
      stableVariantKey: 'chr13:32340000:C>T',
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/genomics/vcf/enrich-cohort',
      headers: { cookie: cookie() },
      payload: { variants },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enrichedVariants).toHaveLength(40);
    // The point of cohort dedup: one network lookup, forty annotated occurrences.
    expect(db.searchClinVar).toHaveBeenCalledTimes(1);
  });
});
