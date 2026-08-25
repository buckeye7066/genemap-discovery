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
import {
  getPublicationAssociationEvidence,
  isPublicationGeneSymbol,
} from '../services/associationEvidenceContract.js';
import { getGeneNetwork } from '../services/geneNetwork.js';
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

const vcfCohortEnrichSchema = z.object({
  variants: z.array(vcfVariantSchema).min(1).max(VCF_LIMITS.COHORT_MAX_VARIANTS),
});

const enrichSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  phenotypes: z.array(z.string().trim().min(1).max(256)).max(100).optional(),
});

const hpoReferenceSchema = z.object({
  kind: z.literal('hpo'),
  identifier: z.string().trim().regex(/^HP:\d{7}$/iu),
  canonicalLabel: z.string().trim().min(1).max(256).optional(),
  source: z.string().trim().min(1).max(256).optional(),
  apiVersion: z.string().trim().min(1).max(64).optional(),
  ontologyVersion: z.string().trim().min(1).max(128).nullable().optional(),
  obsolete: z.boolean().optional(),
}).strict();

const mondoReferenceSchema = z.object({
  kind: z.literal('mondo'),
  identifier: z.string().trim().regex(/^MONDO:\d{7}$/iu),
  canonicalLabel: z.string().trim().min(1).max(256).optional(),
  source: z.string().trim().min(1).max(256).optional(),
  apiVersion: z.string().trim().min(1).max(64).optional(),
  ontologyVersion: z.string().trim().min(1).max(128).nullable().optional(),
  obsolete: z.boolean().optional(),
}).strict();

const curatedReferenceSchema = z.object({
  kind: z.literal('curated_concept'),
  conceptId: z.string().trim().min(1).max(128),
  canonicalLabel: z.string().trim().min(1).max(256),
  conceptKind: z.enum(['disease', 'phenotype']),
  source: z.literal('genemap_curated'),
  version: z.literal(1),
}).strict();

const publicationSymbolSchema = z.string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,14}$/u)
  .refine(isPublicationGeneSymbol, 'Candidate symbol violates the publication boundary');

const associationEvidenceSchema = z.object({
  query: z.discriminatedUnion('kind', [
    hpoReferenceSchema,
    mondoReferenceSchema,
    curatedReferenceSchema,
  ]),
  symbols: z.array(publicationSymbolSchema).min(1).max(15),
}).strict();

const geneNetworkSchema = z.object({
  symbols: z.array(publicationSymbolSchema)
    .min(2)
    .max(10)
    .refine((values) => new Set(values).size >= 2, 'At least two distinct gene symbols are required'),
  requiredScore: z.number().int().min(0).max(1000).default(400),
  addNodes: z.number().int().min(0).max(5).default(3),
}).strict();

/**
 * Preserve each authoritative adapter's original source-retrieval timestamp.
 * The route-level response time is reported separately as `adapterRetrievedAt`;
 * it must never overwrite a cached record's immutable `retrievedAt` evidence.
 */
function preserveSourceRetrieval(records) {
  return Object.fromEntries(
    Object.entries(records || {}).map(([key, record]) => [
      key,
      record && typeof record === 'object'
        ? { ...record, retrievedAt: record.retrievedAt || null }
        : record,
    ]),
  );
}

/**
 * Ensembl gene lookup is opt-in. Read at call time (not module load) so tests
 * and a redeploy can flip it without a rebuild. Anything other than the exact
 * string 'true' is OFF -- an unset or misspelled value must not silently open
 * an external egress path.
 */
function geneLookupEnabled() {
  return process.env.GENOMICS_GENE_LOOKUP_ENABLED === 'true';
}

export default async function genomicsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  // These genomics routes are intentionally authenticated baseline features:
  // they proxy public reference databases and deterministic VCF parsing. Paid
  // entitlements may gate higher-volume or AI-assisted interpretation later,
  // but raw public lookup access is not premium-only.

  // Deterministic VCF parsing. Raw VCF text is parsed by this API only; it is
  // never forwarded to an LLM by default. Override the global 1MB body limit so
  // real single-sample VCFs (a few MB) can actually be uploaded here; the byte
  // cap inside parseVcfText (VCF_MAX_TEXT_BYTES) is the real bound.
  fastify.post('/vcf/parse', { bodyLimit: 16 * 1024 * 1024 }, async (request) => {
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

  // Cohort annotation: run the SAME source-grounded annotation pipeline across a
  // whole study cohort in one request instead of one VCF at a time. The client
  // collapses every sample's variants to the distinct union (variants shared by
  // many samples appear once) and sends that union here; the service dedups
  // again, annotates with bounded concurrency to respect public-database rate
  // limits, and returns results keyed by stable variant key so the client can
  // re-join cohort prevalence to each annotation.
  fastify.post('/vcf/enrich-cohort', async (request) => {
    const { variants } = vcfCohortEnrichSchema.parse(request.body);
    const enrichedVariants = await enrichVcfVariants(variants, {
      maxVariants: VCF_LIMITS.COHORT_MAX_VARIANTS,
      hardMax: VCF_LIMITS.COHORT_MAX_VARIANTS,
      concurrency: VCF_LIMITS.COHORT_CONCURRENCY,
    });

    const byKey = {};
    for (const enriched of enrichedVariants) {
      const variant = enriched.originalVariant || {};
      const key = variant.stableVariantKey ||
        `${variant.chromosome}:${variant.position}:${variant.ref}>${variant.alt}`;
      byKey[key] = enriched;
    }

    await createAuditLog(
      fastify.prisma,
      {
        userId: request.user.userId,
        action: 'vcf.enrich_cohort',
        entityType: 'genomic_variant',
        metadata: { variantCount: enrichedVariants.length },
      },
      { required: true }
    );

    return { enrichedVariants, enriched_variants: enrichedVariants, byKey };
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
  // GATED OFF BY DEFAULT (2026-08-20, owner instruction "gate genemap's
  // findings"). This route sends the caller's gene symbol to Ensembl
  // (rest.ensembl.org). The processor register recorded it as an ACTIVE,
  // undisclosed egress path reachable by ANY authenticated user, while NO
  // client in this repo calls it -- verified across apps/, packages/ and
  // services/: the only `/gene/` hits are outbound NCBI reference LINKS, and
  // the single test reference asserts route-label formatting, not behaviour.
  // An egress path nothing uses is pure disclosure surface, so it is off
  // unless deliberately enabled. Set GENOMICS_GENE_LOOKUP_ENABLED=true to
  // restore it -- and disclose Ensembl in docs/PROCESSOR_REGISTER.md if you do.
  fastify.get('/gene/:symbol', async (request) => {
    if (!geneLookupEnabled()) {
      throw new NotFoundError('Gene lookup is disabled on this deployment');
    }
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

  // ─── Source-grounded association evidence ─────────────────────
  // Candidate symbols remain AI-generated research leads until this bounded
  // adapter returns a complete source-labelled association tuple. Numeric
  // provider scores are deliberately absent from the browser contract.
  fastify.post('/association-evidence', async (request) => {
    const { query, symbols } = associationEvidenceSchema.parse(request.body || {});
    return getPublicationAssociationEvidence(query, symbols);
  });

  // ─── Source-grounded functional association network ───────────
  // Only bounded public gene symbols leave the API. STRING scores and evidence
  // channels remain labeled provider outputs; they do not alter GeneMap's
  // gene-disease ranking and are not clinical or causal conclusions.
  fastify.post('/gene-network', async (request) => {
    const { symbols, requiredScore, addNodes } = geneNetworkSchema.parse(request.body || {});
    return getGeneNetwork(
      symbols,
      { requiredScore, addNodes },
      { logger: fastify.log },
    );
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
    const adapterRetrievedAt = new Date().toISOString();
    return {
      genes: preserveSourceRetrieval(genes),
      phenotypes: preserveSourceRetrieval(hpo),
      adapterRetrievedAt,
    };
  });
}