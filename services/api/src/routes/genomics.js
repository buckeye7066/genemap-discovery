import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireGenomicsTools } from '../middleware/entitlements.js';
import {
  searchPhenotypes,
  enrichGenes,
  validateHpoTerms,
} from '../services/genomicDatabases.js';
import {
  getPublicationAssociationEvidence,
  isPublicationGeneSymbol,
} from '../services/associationEvidenceContract.js';
import { ValidationError } from '../utils/errors.js';

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

export default async function genomicsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  // All routes in this plugin are Premium research tools. This server hook is
  // the boundary: hiding pages in the browser is not sufficient because a
  // caller can invoke the API directly.
  fastify.addHook('preHandler', requireGenomicsTools);

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
