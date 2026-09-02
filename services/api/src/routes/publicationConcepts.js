import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireResearchSearch } from '../middleware/entitlements.js';
import { searchPublicationConcepts } from '../services/publicationResolvers.js';

const searchSchema = z.object({
  q: z.string().trim().min(2).max(80).refine((value) => !/[\r\n]/u.test(value)),
  kind: z.enum(['phenotype', 'disease']),
});

/**
 * Read-only deterministic concept search. It never calls a model and never
 * authorizes generation by label: clients must submit the selected HPO/MONDO
 * id, and the generation preHandler revalidates that exact id upstream.
 */
export default async function publicationConceptRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireResearchSearch);

  fastify.get('/search', async (request) => {
    const { q, kind } = searchSchema.parse(request.query || {});
    const suggestions = await searchPublicationConcepts(q, kind);
    return {
      suggestions,
      generationInput: 'selected_identifier_only',
      modelInvoked: false,
    };
  });
}
