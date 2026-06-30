import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  lookupVariant,
  searchVariants,
  lookupGene,
  searchClinVar,
  searchPhenotypes,
  enrichGenes,
  validateHpoTerms,
} from '../services/genomicDatabases.js';
import { parseVcfText, enrichVcfVariants, VCF_LIMITS } from '../services/vcf.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

const vcfParseSchema = z.object({
  text: z.string().trim().min(1, 'VCF text is required'),
  maxVariants: z.number().int().min(1).max(VCF_LIMITS.HARD_MAX_VARIANTS).optional(),
});

const vcfVariantSchema = z.object({
  chromosome: z.string().trim().min(1),
  position: z.number().int().positive(),
}).passthrough();

const vcfEnrichSchema = z.object({
  variants: z.array(vcfVariantSchema).min(1).max(50),
});

const enrichSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  phenotypes: z.array(z.string().trim().min(1).max(256)).max(100).optional(),
});

export default async function genomicsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  // These genomics routes are intentionally authenticated baseline features:
  // they proxy public reference databases and deterministic VCF parsing. Paid
  // entitlements may gate higher-volume or AI-assisted interpretation later,
  // but raw public lookup access is not premium-only.

  // Deterministic VCF parsing. Raw VCF text is parsed by this API only; it is
  // never forwarded to an LLM by default.
  fastify.post('/vcf/parse', async (request) => {
    const { text, maxVariants } = vcfParseSchema.parse(request.body);
    const result = parseVcfText(text, { maxVariants });

    await createAuditLog(
      fastify.prisma,
      {
        userId: request.user.userId,
        action: 'vcf.parse',
        entityType: 'genomic_variant',
        metadata: {
          totalVariants: result.summary.totalVariants,
          parsedVariants: result.summary.parsedVariants,
          truncated: result.summary.truncated,
        },
      },
      { required: true }
    );

    return { ...result, limits: VCF_LIMITS };
  });

  fastify.post('/vcf/enrich', async (request) => {
    const { variants } = vcfEnrichSchema.parse(request.body);
    const enrichedVariants = await enrichVcfVariants(variants);

    await createAuditLog(
      fastify.prisma,
      {
        userId: request.user.userId,
        action: 'vcf.enrich',
        entityType: 'genomic_variant',
        metadata: { variantCount: enrichedVariants.length },
      },
      { required: true }
    );

    return { enrichedVariants, enriched_variants: enrichedVariants };
  });

  // ─── Variant Lookup ────────────────────────────────────────────
  fastify.get('/variant/search', async (request) => {
    const { q } = request.query;
    if (!q) throw new ValidationError('Query parameter q is required');
    const data = await searchVariants(q);
    return data;
  });

  fastify.get('/variant/:id', async (request) => {
    const { id } = request.params;
    const data = await lookupVariant(id);
    if (!data) throw new NotFoundError('Variant not found');
    return data;
  });

  // ─── Gene Lookup ───────────────────────────────────────────────
  fastify.get('/gene/:symbol', async (request) => {
    const { symbol } = request.params;
    const data = await lookupGene(symbol);
    if (!data) throw new NotFoundError('Gene not found');
    return data;
  });

  // ─── ClinVar Search ───────────────────────────────────────────
  fastify.get('/clinvar/search', async (request) => {
    const { q } = request.query;
    if (!q) throw new ValidationError('Query parameter q is required');
    const data = await searchClinVar(q);
    return data;
  });

  // ─── Phenotype / HPO Search ────────────────────────────────────
  fastify.get('/phenotype/search', async (request) => {
    const { q } = request.query;
    if (!q) throw new ValidationError('Query parameter q is required');
    const data = await searchPhenotypes(q);
    return data;
  });

  // ─── Authoritative enrichment ──────────────────────────────────
  // Replaces LLM-guessed gene coordinates/IDs with authoritative records
  // (MyGene.info → Ensembl/NCBI) and validates phenotype names against HPO.
  // Both inputs are optional so callers can resolve just genes, just HPO
  // terms, or both in one round trip. Always fails soft (unresolved → null/
  // unverified) so it can never break the gene search that calls it.
  fastify.post('/enrich', async (request) => {
    const { symbols = [], phenotypes = [] } = enrichSchema.parse(request.body || {});
    const [genes, hpo] = await Promise.all([
      symbols.length ? enrichGenes(symbols) : Promise.resolve({}),
      phenotypes.length ? validateHpoTerms(phenotypes) : Promise.resolve({}),
    ]);
    return { genes, phenotypes: hpo };
  });
}
