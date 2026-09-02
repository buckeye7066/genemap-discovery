import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLedgerStore } from './store.mjs';

const DEFAULT_PORT = 3000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const MIN_SECRET_LENGTH = 32;
const MAX_INTEGRITY_CACHE_MS = 30_000;

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function usableSecret(value) {
  if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) return false;
  const normalized = value.toLowerCase();
  return !normalized.includes('replace_with')
    && !normalized.includes('placeholder')
    && !normalized.includes('change-in-production');
}

function safeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

export function loadLedgerConfig(source = process.env) {
  const production = source.NODE_ENV === 'production';
  const port = safeInteger(source.PORT, DEFAULT_PORT);
  const host = String(source.HOST || '0.0.0.0');
  const secret = source.ACCOUNT_CLOSURE_LEDGER_SECRET;
  const defaultDirectory = path.resolve(process.cwd(), '.ledger-data');
  const directory = source.ACCOUNT_CLOSURE_LEDGER_DIRECTORY || (production ? '' : defaultDirectory);

  const problems = [];
  if (port < 1 || port > 65535) problems.push('PORT must be an integer from 1 through 65535');
  if (!host.trim()) problems.push('HOST must not be empty');
  if (!usableSecret(secret)) {
    problems.push('ACCOUNT_CLOSURE_LEDGER_SECRET must be a non-placeholder secret with at least 32 characters');
  }
  if (!directory) {
    problems.push('ACCOUNT_CLOSURE_LEDGER_DIRECTORY is required in production');
  } else if (!path.isAbsolute(directory)) {
    problems.push('ACCOUNT_CLOSURE_LEDGER_DIRECTORY must be an absolute path');
  } else if (path.parse(directory).root === path.resolve(directory)) {
    problems.push('ACCOUNT_CLOSURE_LEDGER_DIRECTORY must not be a filesystem root');
  }
  if (problems.length) throw new Error(`[closure-ledger] unsafe configuration: ${problems.join('; ')}`);

  return { directory: path.resolve(directory), host, port, secret };
}

function hmac(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function header(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticate(req, secret, body, now) {
  const timestamp = header(req, 'x-genemap-ledger-timestamp');
  const supplied = header(req, 'x-genemap-ledger-signature');
  const parsed = Date.parse(timestamp || '');
  if (!timestamp || !Number.isFinite(parsed) || Math.abs(now() - parsed) > MAX_CLOCK_SKEW_MS) {
    throw new HttpError(401, 'LEDGER_AUTH_FAILED', 'Request authentication failed.');
  }
  const expected = `sha256=${hmac(secret, timestamp, body)}`;
  if (!constantTimeEqual(supplied, expected)) {
    throw new HttpError(401, 'LEDGER_AUTH_FAILED', 'Request authentication failed.');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        reject(new HttpError(413, 'LEDGER_BODY_TOO_LARGE', 'Request body is too large.'));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
  });
}

function setResponseHeaders(response) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
}

function sendJson(response, statusCode, value, secret = null) {
  const body = JSON.stringify(value);
  setResponseHeaders(response);
  if (secret) {
    const timestamp = new Date().toISOString();
    response.setHeader('x-genemap-ledger-timestamp', timestamp);
    response.setHeader('x-genemap-ledger-signature', `sha256=${hmac(secret, timestamp, body)}`);
  }
  response.statusCode = statusCode;
  response.end(body);
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'LEDGER_INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function publicError(error) {
  if (error instanceof HttpError || Number.isInteger(error?.statusCode)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.code || 'LEDGER_REQUEST_FAILED', message: error.message },
    };
  }
  return {
    statusCode: 503,
    body: { error: 'LEDGER_UNAVAILABLE', message: 'Ledger storage is unavailable.' },
  };
}

export async function createLedgerService({
  config = loadLedgerConfig(),
  now = Date.now,
  logger = console,
} = {}) {
  const store = createLedgerStore({ directory: config.directory });
  await store.initialize();
  let lastIntegrityCheck = now();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://ledger.internal');

      if (request.method === 'GET' && url.pathname === '/healthz') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/readyz') {
        if (now() - lastIntegrityCheck >= MAX_INTEGRITY_CACHE_MS) {
          await store.verifyAll();
          lastIntegrityCheck = now();
        }
        sendJson(response, 200, { status: 'ready', durableStorage: true });
        return;
      }

      if (url.pathname === '/tombstones/write') {
        if (request.method !== 'POST') {
          throw new HttpError(405, 'LEDGER_METHOD_NOT_ALLOWED', 'Method not allowed.');
        }
        const contentType = header(request, 'content-type') || '';
        if (!contentType.toLowerCase().startsWith('application/json')) {
          throw new HttpError(415, 'LEDGER_CONTENT_TYPE_REQUIRED', 'Content-Type must be application/json.');
        }
        const raw = await readBody(request);
        authenticate(request, config.secret, raw, now);
        const payload = parseJson(raw);
        if (header(request, 'idempotency-key') !== payload?.receiptId) {
          throw new HttpError(400, 'LEDGER_IDEMPOTENCY_KEY_MISMATCH', 'Idempotency-Key must equal receiptId.');
        }
        const result = await store.write(payload);
        sendJson(response, result.created ? 201 : 200, {
          recorded: true,
          receiptId: result.payload.receiptId,
        }, config.secret);
        return;
      }

      if (url.pathname === '/tombstones/read') {
        if (request.method !== 'GET') {
          throw new HttpError(405, 'LEDGER_METHOD_NOT_ALLOWED', 'Method not allowed.');
        }
        authenticate(request, config.secret, '', now);
        const limit = url.searchParams.has('limit')
          ? safeInteger(url.searchParams.get('limit'), 0)
          : undefined;
        if (limit !== undefined && (limit < 1 || limit > 1_000)) {
          throw new HttpError(400, 'LEDGER_INVALID_PAGE', 'limit must be from 1 through 1000.');
        }
        const page = await store.list({
          cursor: url.searchParams.get('cursor') || null,
          limit,
        });
        sendJson(response, 200, page, config.secret);
        return;
      }

      throw new HttpError(404, 'LEDGER_NOT_FOUND', 'Route not found.');
    } catch (error) {
      const published = publicError(error);
      if (published.statusCode >= 500) {
        logger.error?.('[closure-ledger] request failed', {
          code: error?.code || 'LEDGER_UNAVAILABLE',
          message: error?.message || String(error),
        });
      }
      sendJson(response, published.statusCode, published.body);
    }
  });

  server.requestTimeout = 10_000;
  server.headersTimeout = 12_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;

  return {
    config,
    server,
    store,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.off('error', reject);
          resolve();
        });
      });
      return server.address();
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (
        error ? reject(error) : resolve()
      )));
    },
  };
}

export function isEntrypoint(metaUrl, argvPath) {
  if (!argvPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(argvPath);
}

async function main() {
  const service = await createLedgerService();
  const address = await service.listen();
  console.log(`[closure-ledger] listening on ${address.address}:${address.port}`);

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[closure-ledger] received ${signal}; stopping`);
    await service.close();
  };
  process.once('SIGTERM', () => stop('SIGTERM').catch((error) => {
    console.error('[closure-ledger] shutdown failed', error?.message || error);
    process.exitCode = 1;
  }));
  process.once('SIGINT', () => stop('SIGINT').catch((error) => {
    console.error('[closure-ledger] shutdown failed', error?.message || error);
    process.exitCode = 1;
  }));
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

export const __test = {
  MAX_BODY_BYTES,
  MAX_CLOCK_SKEW_MS,
  authenticate,
  constantTimeEqual,
  hmac,
  usableSecret,
};
