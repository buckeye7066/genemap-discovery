import { authenticate } from '../middleware/auth.js';
import {
  lookupVariant,
  searchVariants,
  lookupGene,
  searchClinVar,
  searchPhenotypes,
} from '../services/genomicDatabases.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

export default async function genomicsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

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
}
