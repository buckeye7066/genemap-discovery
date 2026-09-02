import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  accountClosureLedgerStatus,
  createAccountClosureLedger,
  __test,
} from '../services/accountClosureLedger.js';

const SECRET = 'ledger-transport-secret-that-is-at-least-thirty-two-characters';
const CURRENT_IDENTITY_SECRET = 'current-identity-key-that-is-at-least-thirty-two-characters';
const RETIRED_IDENTITY_SECRET = 'retired-identity-key-that-is-at-least-thirty-two-characters';
const ENV = {
  NODE_ENV: 'production',
  ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.invalid/write',
  ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.invalid/read',
  ACCOUNT_CLOSURE_LEDGER_SECRET: SECRET,
  ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: `2026-08=${CURRENT_IDENTITY_SECRET},2026-01=${RETIRED_IDENTITY_SECRET}`,
  RELEASE_SHA: 'a'.repeat(40),
};

function signedResponse(body, status = 200) {
  const timestamp = new Date().toISOString();
  const digest = crypto.createHmac('sha256', SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      'x-genemap-ledger-timestamp': timestamp,
      'x-genemap-ledger-signature': `sha256=${digest}`,
    },
    text: async () => body,
  };
}

describe('restore-independent account closure ledger', () => {
  it('fails closed in production when the external ledger or identity key ring is not configured', async () => {
    const ledger = createAccountClosureLedger({
      env: { NODE_ENV: 'production' },
      fetchImpl: vi.fn(),
    });

    await expect(ledger.authorize({ receiptId: 'receipt-1' })).rejects.toMatchObject({
      statusCode: 503,
      code: 'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
    });
    expect(accountClosureLedgerStatus({ NODE_ENV: 'production' }).configured).toBe(false);
    expect(accountClosureLedgerStatus({
      ...ENV,
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: '',
    })).toMatchObject({ configured: false, identityKeysConfigured: false });
    expect(accountClosureLedgerStatus({
      ...ENV,
      ACCOUNT_CLOSURE_LEDGER_SECRET: 'REPLACE_WITH_32_PLUS_CHAR_RANDOM_TRANSPORT_SECRET',
    })).toMatchObject({ configured: false, secretConfigured: false });
    expect(accountClosureLedgerStatus({
      ...ENV,
      ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS: 'current=REPLACE_WITH_32_PLUS_CHAR_IDENTITY_KEY',
    })).toMatchObject({ configured: false, identityKeysConfigured: false });
  });

  it('refuses an incomplete tombstone before sending it externally', async () => {
    const fetchImpl = vi.fn();
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    await expect(ledger.authorize({ receiptId: 'receipt-invalid' })).rejects.toMatchObject({
      statusCode: 500,
      code: 'ACCOUNT_DELETE_LEDGER_INVALID_TOMBSTONE',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('writes an idempotent HMAC-signed versioned tombstone and verifies the exact signed acknowledgement', async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body);
      return signedResponse(JSON.stringify({ recorded: true, receiptId: request.receiptId }));
    });
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    const result = await ledger.authorize({
      receiptId: 'receipt-2',
      userIdHash: ledger.hashIdentity('user-2'),
      actorMode: 'self_service',
      authorizedAt: '2026-08-09T21:30:00.000Z',
      billing: { checkoutSessionsExpired: 1, subscriptionsCancelled: 2 },
      rawEmail: 'must-not-be-sent@example.invalid',
    });

    expect(result).toEqual({
      mode: 'external',
      recorded: true,
      receiptId: 'receipt-2',
      identityKeyId: '2026-08',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENV.ACCOUNT_CLOSURE_LEDGER_WRITE_URL);
    expect(options.method).toBe('POST');
    expect(options.headers['idempotency-key']).toBe('receipt-2');
    const payload = JSON.parse(options.body);
    expect(payload).toEqual({
      version: 2,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-2',
      userIdHash: ledger.hashIdentity('user-2'),
      identityKeyId: '2026-08',
      actorMode: 'self_service',
      authorizedAt: '2026-08-09T21:30:00.000Z',
      releaseSha: ENV.RELEASE_SHA,
      billing: { checkoutSessionsExpired: 1, subscriptionsCancelled: 2 },
    });
    expect(options.body).not.toContain('must-not-be-sent');
    const timestamp = options.headers['x-genemap-ledger-timestamp'];
    const expected = crypto.createHmac('sha256', SECRET)
      .update(`${timestamp}.${options.body}`)
      .digest('hex');
    expect(options.headers['x-genemap-ledger-signature']).toBe(`sha256=${expected}`);
  });

  it('rejects unsigned, tampered, or mismatched write acknowledgements', async () => {
    const unsigned = createAccountClosureLedger({
      env: ENV,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {},
        text: async () => JSON.stringify({ recorded: true, receiptId: 'receipt-unsigned' }),
      })),
    });
    await expect(unsigned.authorize({
      receiptId: 'receipt-unsigned',
      userIdHash: unsigned.hashIdentity('user-unsigned'),
    })).rejects.toMatchObject({ code: 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED' });

    const mismatched = createAccountClosureLedger({
      env: ENV,
      fetchImpl: vi.fn(async () => signedResponse(JSON.stringify({
        recorded: true,
        receiptId: 'different-receipt',
      }))),
    });
    await expect(mismatched.authorize({
      receiptId: 'receipt-expected',
      userIdHash: mismatched.hashIdentity('user-mismatch'),
    })).rejects.toMatchObject({ code: 'ACCOUNT_DELETE_LEDGER_WRITE_FAILED' });
  });

  it('retains current and retired identity hashes so tombstones survive rotation', () => {
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl: vi.fn() });
    const candidates = ledger.hashIdentityCandidates('rotation-user');

    expect(ledger.currentIdentityKeyId).toBe('2026-08');
    expect(ledger.identityKeyIds).toEqual(['2026-08', '2026-01']);
    expect(candidates).toEqual(expect.arrayContaining([
      {
        identityKeyId: '2026-08',
        userIdHash: __test.identityHash(CURRENT_IDENTITY_SECRET, 'rotation-user'),
      },
      {
        identityKeyId: '2026-01',
        userIdHash: __test.identityHash(RETIRED_IDENTITY_SECRET, 'rotation-user'),
      },
    ]));
  });

  it('reads valid legacy and versioned deletion authorizations for restore reconciliation', async () => {
    const ledgerForHashes = createAccountClosureLedger({ env: ENV, fetchImpl: vi.fn() });
    const responseBody = JSON.stringify({
      tombstones: [
        {
          version: 2,
          event: 'account_deletion_authorized',
          receiptId: 'receipt-current',
          userIdHash: ledgerForHashes.hashIdentity('user-current'),
          identityKeyId: '2026-08',
        },
        {
          version: 2,
          event: 'account_deletion_authorized',
          receiptId: 'receipt-unknown-key',
          userIdHash: 'b'.repeat(64),
          identityKeyId: 'retired-but-unavailable',
        },
        {
          version: 1,
          event: 'account_deletion_authorized',
          receiptId: 'receipt-legacy',
          userIdHash: 'c'.repeat(64),
        },
      ],
      nextCursor: null,
    });
    const fetchImpl = vi.fn(async () => signedResponse(responseBody));
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    const tombstones = await ledger.listTombstones();

    expect(tombstones.map((item) => item.receiptId)).toEqual([
      'receipt-current',
      'receipt-unknown-key',
      'receipt-legacy',
    ]);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(fetchImpl.mock.calls[0][0]).toContain('limit=1000');
  });

  it('reads every signed page and rejects cursor loops, duplicates, or malformed tombstones', async () => {
    const pages = [
      {
        tombstones: [{
          version: 2,
          event: 'account_deletion_authorized',
          receiptId: 'receipt-page-1',
          userIdHash: 'a'.repeat(64),
          identityKeyId: '2026-08',
        }],
        nextCursor: 'cursor-1',
      },
      {
        tombstones: [{
          version: 1,
          event: 'account_deletion_authorized',
          receiptId: 'receipt-page-2',
          userIdHash: 'b'.repeat(64),
        }],
        nextCursor: null,
      },
    ];
    const fetchImpl = vi.fn(async () => signedResponse(JSON.stringify(pages.shift())));
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    await expect(ledger.listTombstones()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ receiptId: 'receipt-page-1' }),
      expect.objectContaining({ receiptId: 'receipt-page-2' }),
    ]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toContain('cursor=cursor-1');

    const malformedBody = JSON.stringify({
      tombstones: [{ version: 3, event: 'account_deletion_authorized', receiptId: 'bad', userIdHash: 'c'.repeat(64) }],
      nextCursor: null,
    });
    const malformed = createAccountClosureLedger({
      env: ENV,
      fetchImpl: vi.fn(async () => signedResponse(malformedBody)),
    });
    await expect(malformed.listTombstones()).rejects.toMatchObject({
      code: 'ACCOUNT_DELETE_LEDGER_INVALID_RESPONSE',
    });

    const duplicateBody = JSON.stringify({
      tombstones: [
        { version: 1, event: 'account_deletion_authorized', receiptId: 'duplicate', userIdHash: 'd'.repeat(64) },
        { version: 1, event: 'account_deletion_authorized', receiptId: 'duplicate', userIdHash: 'd'.repeat(64) },
      ],
      nextCursor: null,
    });
    const duplicate = createAccountClosureLedger({
      env: ENV,
      fetchImpl: vi.fn(async () => signedResponse(duplicateBody)),
    });
    await expect(duplicate.listTombstones()).rejects.toMatchObject({
      code: 'ACCOUNT_DELETE_LEDGER_INVALID_RESPONSE',
    });

    const loopBody = JSON.stringify({ tombstones: [], nextCursor: 'same-cursor' });
    const loop = createAccountClosureLedger({
      env: ENV,
      fetchImpl: vi.fn(async () => signedResponse(loopBody)),
    });
    await expect(loop.listTombstones()).rejects.toMatchObject({
      code: 'ACCOUNT_DELETE_LEDGER_INVALID_RESPONSE',
    });
  });

  it('rejects unsigned or tampered restore-ledger responses', async () => {
    const body = JSON.stringify({ tombstones: [] });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        'x-genemap-ledger-timestamp': new Date().toISOString(),
        'x-genemap-ledger-signature': 'sha256=not-valid',
      },
      text: async () => body,
    }));
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    await expect(ledger.listTombstones()).rejects.toMatchObject({
      statusCode: 503,
      code: 'ACCOUNT_DELETE_LEDGER_INVALID_SIGNATURE',
    });
  });

  it('keeps the timeout active while the response body is consumed', async () => {
    let requestSignal;
    const fetchImpl = vi.fn(async (_url, options) => {
      requestSignal = options.signal;
      return {
        ok: true,
        text: () => new Promise((_resolve, reject) => {
          requestSignal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        }),
      };
    });

    await expect(__test.fetchWithTimeout(
      fetchImpl,
      'https://ledger.example.invalid/read',
      { method: 'GET' },
      { consume: (response) => response.text(), timeoutMs: 10 },
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal.aborted).toBe(true);
  });
});
