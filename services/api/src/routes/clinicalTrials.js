import { authenticate } from '../middleware/auth.js';
import { searchTrials, getTrialDetails } from '../services/clinicalTrials.js';
import { ValidationError } from '../utils/errors.js';

export default async function clinicalTrialRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  // GET /clinical-trials/search?condition=&gene=&status=&pageSize=
  fastify.get('/search', async (request) => {
    const { condition, gene, status, pageSize } = request.query;

    if (!condition && !gene) {
      throw new ValidationError('At least one of condition or gene is required');
    }

    const result = await searchTrials({
      condition: condition || undefined,
      gene: gene || undefined,
      status: status || undefined,
      pageSize: pageSize ? Number(pageSize) : 20,
    });

    return result;
  });

  // GET /clinical-trials/:nctId
  fastify.get('/:nctId', async (request) => {
    const { nctId } = request.params;
    const study = await getTrialDetails(nctId);
    return { study };
  });
}
