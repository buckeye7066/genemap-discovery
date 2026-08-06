import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import clientErrorRoutes, { normalizeClientErrorEvent } from '../routes/clientError.js';

describe('client error publication boundary', () => {
  let app;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('reduces an accepted report to finite non-identifying enums', () => {
    const canary = 'patient@example.invalid chr1 12345 A G urgent diagnosis';
    const event = normalizeClientErrorEvent({
      eventCode: 'react_render_error',
      errorClass: 'TypeError',
      message: canary,
      stack: canary,
      componentStack: canary,
      route: `/search?q=${canary}`,
      statusCode: 599,
      user: { email: canary },
    });

    expect(event).toEqual({
      eventCode: 'react_render_error',
      errorClass: 'TypeError',
    });
    expect(JSON.stringify(event)).not.toContain(canary);
  });

  it('ignores unknown values and always returns 204 without a reporter dependency', async () => {
    app = Fastify({ logger: false });
    await app.register(clientErrorRoutes);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/report-client-error',
      payload: {
        eventCode: 'patient@example.invalid',
        errorClass: 'VCF chr1 12345 A G',
        message: 'health canary',
        stack: 'private stack',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(normalizeClientErrorEvent({ eventCode: 'unknown', errorClass: 'Error' })).toBeNull();
  });
});
