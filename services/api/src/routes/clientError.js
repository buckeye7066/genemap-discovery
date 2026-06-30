import { verifyAccessToken } from '../utils/auth.js';
import { reportErrorToOwner } from '../services/errorReporter.js';

/**
 * Frontend error ingest. The web app POSTs uncaught errors / rejected promises /
 * React error-boundary captures here so the owner can be notified.
 *
 * Auth is intentionally OPTIONAL: a client error frequently coincides with an
 * expired or broken session, and we still want the report. When a valid access
 * token is present we attach the user (so the reporter's admin exclusion works);
 * otherwise the report is treated as anonymous. Always replies 204.
 */
export default async function clientErrorRoutes(fastify) {
  fastify.post('/report-client-error', async (request, reply) => {
    const body = request.body || {};

    // Guard: a report with no message is not actionable.
    if (!body.message || typeof body.message !== 'string') {
      return reply.code(204).send();
    }

    // Soft auth — read the user if a valid token is present, never reject.
    let user = null;
    try {
      const token = request.cookies?.accessToken;
      const payload = token ? verifyAccessToken(token) : null;
      if (payload?.userId) {
        user = { userId: payload.userId, email: payload.email, role: payload.role };
      }
    } catch {
      /* ignore — anonymous report */
    }

    // Reconstruct a synthetic Error carrying the client-supplied details.
    const error = new Error(String(body.message).slice(0, 2000));
    if (typeof body.name === 'string' && body.name) error.name = body.name;
    if (typeof body.stack === 'string' && body.stack) error.stack = body.stack;

    const extra =
      typeof body.componentStack === 'string' && body.componentStack
        ? { componentStack: body.componentStack.slice(0, 4000) }
        : undefined;

    reportErrorToOwner({
      error,
      source: 'frontend',
      user,
      route: typeof body.route === 'string' ? body.route : undefined,
      method: 'CLIENT',
      requestId: request.id,
      statusCode: Number(body.statusCode) || 500,
      extra,
    });

    return reply.code(204).send();
  });
}
