import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import compress from '@fastify/compress';
import { gunzipSync } from 'node:zlib';
import educationRoutes from '../routes/education.js';

/**
 * Regression guard for the empty-gzip-body bug.
 *
 * With @fastify/compress in global mode, a bare `reply.send()` inside an async
 * handler races the handler's `undefined` return: the gzip stream is finalized
 * with Content-Length: 0, so the browser (which always sends
 * `Accept-Encoding: gzip`) receives an EMPTY body even though the server logged
 * a 200. Every sizable /education/* response (topics, explanations, quizzes)
 * came back blank this way, while `curl -H 'Accept-Encoding: identity'` showed
 * the full payload. The fix is to `return` the payload instead of bare-sending.
 *
 * The main test harness does not register compress, which is exactly why this
 * slipped through — so this test wires compress up the way production does.
 */
async function buildCompressedApp() {
  const app = Fastify({ logger: false });
  await app.register(compress, { global: true });
  app.decorate('prisma', {}); // /education/topics never touches the DB
  await app.register(educationRoutes, { prefix: '/education' });
  return app;
}

describe('compression does not blank out responses', () => {
  it('GET /education/topics returns a real gzipped body, not Content-Length: 0', async () => {
    const app = await buildCompressedApp();
    const res = await app.inject({
      method: 'GET',
      url: '/education/topics',
      headers: { 'accept-encoding': 'gzip' },
    });

    expect(res.statusCode).toBe(200);
    // The core symptom: an empty body / zero-length compressed payload.
    expect(res.rawPayload.length).toBeGreaterThan(0);
    expect(res.headers['content-length']).not.toBe('0');

    // And it must decode back to the real catalog.
    const decoded =
      res.headers['content-encoding'] === 'gzip'
        ? gunzipSync(res.rawPayload).toString('utf8')
        : res.payload;
    const body = JSON.parse(decoded);
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBeGreaterThan(0);

    await app.close();
  });
});
