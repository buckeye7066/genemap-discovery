const EVENT_CODES = new Set(['client_runtime_error', 'react_render_error']);
const ERROR_CLASSES = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError']);

export function normalizeClientErrorEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const eventCode = EVENT_CODES.has(body.eventCode) ? body.eventCode : null;
  const errorClass = ERROR_CLASSES.has(body.errorClass) ? body.errorClass : null;
  if (!eventCode || !errorClass) return null;
  return { eventCode, errorClass };
}

/**
 * Finite client error signal. The endpoint intentionally accepts no free text,
 * route, stack, status, token identity, or user metadata. It always returns 204
 * so error reporting cannot create a secondary failure path.
 */
export default async function clientErrorRoutes(fastify) {
  fastify.post('/report-client-error', async (request, reply) => {
    const event = normalizeClientErrorEvent(request.body);
    if (event) {
      request.log.warn(
        {
          requestId: request.id,
          eventCode: event.eventCode,
          errorClass: event.errorClass,
        },
        'client error event',
      );
    }
    return reply.code(204).send();
  });
}
