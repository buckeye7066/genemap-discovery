import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLedgerService, loadLedgerConfig } from '../server.mjs';
import { createAccountClosureLedger } from '../../../services/api/src/services/accountClosureLedger.js';

const SECRET = 'test-ledger-transport-secret-with-more-than-thirty-two-characters';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function tombstone(receiptId = crypto.randomUUID(), overrides = {}) {
  return {
    version: 2,
    event: 'account_deletion_authorized',
    receiptId,
    userIdHash: HASH_A,
    identityKeyId: '2026-09',
    actorMode: 'self_service',
    authorizedAt: '2026-09-02T17:00:00.000Z',
    releaseSha: 'a'.repeat(40),
    billing: {
      checkoutSessionsExpired: 1,
      subscriptionsCancelled: 2,
    },
    ...overrides,
  };
}

function signature(timestamp, body = '', secret = SECRET) {
  const digest = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `sha256=${digest}`;
}

function verifySignedResponse(response, rawBody) {
  const timestamp = response.headers.get('x-genemap-ledger-timestamp');
  assert.ok(timestamp);
  assert.equal(
    response.headers.get('x-genemap-ledger-signature'),
    signature(timestamp, rawBody),
  );
}

async function signedFetch(baseUrl, route, { method = 'GET', payload, timestamp, headers = {} } = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const requestTimestamp = timestamp || new Date().toISOString();
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      'x-genemap-ledger-timestamp': requestTimestamp,
      'x-genemap-ledger-signature': signature(requestTimestamp, body),
      ...headers,
    },
    ...(method === 'POST' ? { body } : {}),
  });
}

async function fixture(t, { directory: suppliedDirectory } = {}) {
  const root = suppliedDirectory || await mkdtemp(path.join(os.tmpdir(), 'genemap-ledger-test-'));
  const directory = path.join(root, 'tombstones');
  const service = await createLedgerService({
    config: { directory, host: '127.0.0.1', port: 0, secret: SECRET },
    logger: { error() {} },
  });
  const address = await service.listen();
  t.after(async () => {
    await service.close();
    if (!suppliedDirectory) await rm(root, { recursive: true, force: true });
  });
  return { baseUrl: `http://127.0.0.1:${address.port}`, directory, root, service };
}

test('persists an authenticated tombstone and returns signed acknowledgements and pages', async (t) => {
  const { baseUrl, directory } = await fixture(t);
  const record = tombstone();
  const response = await signedFetch(baseUrl, '/tombstones/write', {
    method: 'POST',
    payload: record,
    headers: { 'idempotency-key': record.receiptId },
  });
  assert.equal(response.status, 201);
  const acknowledgement = await response.text();
  verifySignedResponse(response, acknowledgement);
  assert.deepEqual(JSON.parse(acknowledgement), { recorded: true, receiptId: record.receiptId });

  const readResponse = await signedFetch(baseUrl, '/tombstones/read?limit=1000');
  assert.equal(readResponse.status, 200);
  const rawPage = await readResponse.text();
  verifySignedResponse(readResponse, rawPage);
  assert.deepEqual(JSON.parse(rawPage), { tombstones: [record], nextCursor: null });

  const files = await readdir(directory);
  assert.deepEqual(files, [`${record.receiptId}.json`]);
});

test('is idempotent for an exact retry and rejects a conflicting receipt', async (t) => {
  const { baseUrl } = await fixture(t);
  const record = tombstone();
  const first = await signedFetch(baseUrl, '/tombstones/write', {
    method: 'POST', payload: record, headers: { 'idempotency-key': record.receiptId },
  });
  assert.equal(first.status, 201);

  const retry = await signedFetch(baseUrl, '/tombstones/write', {
    method: 'POST', payload: record, headers: { 'idempotency-key': record.receiptId },
  });
  assert.equal(retry.status, 200);

  const conflict = await signedFetch(baseUrl, '/tombstones/write', {
    method: 'POST',
    payload: { ...record, userIdHash: HASH_B },
    headers: { 'idempotency-key': record.receiptId },
  });
  assert.equal(conflict.status, 409);

  const page = await (await signedFetch(baseUrl, '/tombstones/read')).json();
  assert.equal(page.tombstones.length, 1);
  assert.equal(page.tombstones[0].userIdHash, HASH_A);
});

test('validates authentication and idempotency before mutating durable storage', async (t) => {
  const { baseUrl } = await fixture(t);
  const record = tombstone();
  const raw = JSON.stringify(record);
  const current = new Date().toISOString();

  const unsigned = await fetch(`${baseUrl}/tombstones/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': record.receiptId },
    body: raw,
  });
  assert.equal(unsigned.status, 401);

  const stale = await signedFetch(baseUrl, '/tombstones/write', {
    method: 'POST',
    payload: record,
    timestamp: '2020-01-01T00:00:00.000Z',
    headers: { 'idempotency-key': record.receiptId },
  });
  assert.equal(stale.status, 401);

  const tampered = await fetch(`${baseUrl}/tombstones/write`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': record.receiptId,
      'x-genemap-ledger-timestamp': current,
      'x-genemap-ledger-signature': signature(current, `${raw}tampered`),
    },
    body: raw,
  });
  assert.equal(tampered.status, 401);

  const wrongKey = await signedFetch(baseUrl, '/tombstones/write', {
    method: 'POST', payload: record, headers: { 'idempotency-key': crypto.randomUUID() },
  });
  assert.equal(wrongKey.status, 400);

  const page = await (await signedFetch(baseUrl, '/tombstones/read')).json();
  assert.deepEqual(page.tombstones, []);
});

test('rejects extra identity fields and malformed tombstones', async (t) => {
  const { baseUrl } = await fixture(t);
  const record = tombstone();
  const response = await signedFetch(baseUrl, '/tombstones/write', {
    method: 'POST',
    payload: { ...record, rawEmail: 'must-not-be-stored@example.invalid' },
    headers: { 'idempotency-key': record.receiptId },
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /fields do not match/i);
});

test('paginates without omitting or repeating tombstones', async (t) => {
  const { baseUrl } = await fixture(t);
  const records = [tombstone(), tombstone(), tombstone()];
  for (const record of records) {
    const response = await signedFetch(baseUrl, '/tombstones/write', {
      method: 'POST', payload: record, headers: { 'idempotency-key': record.receiptId },
    });
    assert.equal(response.status, 201);
  }

  const first = await (await signedFetch(baseUrl, '/tombstones/read?limit=2')).json();
  assert.equal(first.tombstones.length, 2);
  assert.ok(first.nextCursor);
  const second = await (await signedFetch(
    baseUrl,
    `/tombstones/read?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
  )).json();
  assert.equal(second.tombstones.length, 1);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(
    new Set([...first.tombstones, ...second.tombstones].map((item) => item.receiptId)),
    new Set(records.map((item) => item.receiptId)),
  );
});

test('reloads durable records after restart and refuses corrupt storage', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'genemap-ledger-restart-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const firstFixture = await fixture(t, { directory: root });
  const record = tombstone();
  assert.equal((await signedFetch(firstFixture.baseUrl, '/tombstones/write', {
    method: 'POST', payload: record, headers: { 'idempotency-key': record.receiptId },
  })).status, 201);
  await firstFixture.service.close();

  const restarted = await createLedgerService({
    config: { directory: firstFixture.directory, host: '127.0.0.1', port: 0, secret: SECRET },
    logger: { error() {} },
  });
  const address = await restarted.listen();
  t.after(() => restarted.close());
  const page = await (await signedFetch(`http://127.0.0.1:${address.port}`, '/tombstones/read')).json();
  assert.equal(page.tombstones[0].receiptId, record.receiptId);
  await restarted.close();

  await writeFile(path.join(firstFixture.directory, `${record.receiptId}.json`), '{"corrupt":true}\n');
  await assert.rejects(
    createLedgerService({
      config: { directory: firstFixture.directory, host: '127.0.0.1', port: 0, secret: SECRET },
      logger: { error() {} },
    }),
    /invalid envelope/i,
  );
});

test('production configuration rejects missing durable storage and example secrets', () => {
  assert.throws(() => loadLedgerConfig({
    NODE_ENV: 'production',
    ACCOUNT_CLOSURE_LEDGER_SECRET: SECRET,
  }), /ACCOUNT_CLOSURE_LEDGER_DIRECTORY/);
  assert.throws(() => loadLedgerConfig({
    NODE_ENV: 'production',
    ACCOUNT_CLOSURE_LEDGER_DIRECTORY: '/ledger-data/tombstones',
    ACCOUNT_CLOSURE_LEDGER_SECRET: 'REPLACE_WITH_32_PLUS_CHAR_RANDOM_TRANSPORT_SECRET',
  }), /non-placeholder secret/);
});

test('matches the API ledger client protocol end to end', async (t) => {
  const { baseUrl } = await fixture(t);
  const publicOrigin = 'https://ledger.example.invalid';
  const client = createAccountClosureLedger({
    env: {
      NODE_ENV: 'production',
      ACCOUNT_CLOSURE_LEDGER_WRITE_URL: `${publicOrigin}/tombstones/write`,
      ACCOUNT_CLOSURE_LEDGER_READ_URL: `${publicOrigin}/tombstones/read`,
      ACCOUNT_CLOSURE_LEDGER_SECRET: SECRET,
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: `2026-09=${'identity-secret-with-more-than-thirty-two-characters'}`,
      RELEASE_SHA: 'b'.repeat(40),
    },
    // The production URL is TLS. The test rewrites only its origin to the
    // ephemeral local HTTP listener while exercising the exact client/server
    // request and response contract.
    fetchImpl: (url, options) => fetch(String(url).replace(publicOrigin, baseUrl), options),
  });
  const receiptId = crypto.randomUUID();
  await assert.doesNotReject(client.authorize({
    receiptId,
    userIdHash: client.hashIdentity('user-end-to-end'),
    actorMode: 'admin',
    authorizedAt: new Date().toISOString(),
    billing: { checkoutSessionsExpired: 2, subscriptionsCancelled: 1 },
  }));
  const records = await client.listTombstones();
  assert.equal(records.length, 1);
  assert.equal(records[0].receiptId, receiptId);
  assert.equal(records[0].identityKeyId, '2026-09');
});
