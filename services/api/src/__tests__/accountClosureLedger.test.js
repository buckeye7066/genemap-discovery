import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  accountClosureLedgerStatus,
  createAccountClosureLedger,
} from '../services/accountClosureLedger.js';

const SECRET = 'ledger-secret-that-is-at-least-thirty-two-characters';
const ENV = {
  NODE_ENV: 'production',
  ACCOUNT_CLOSURE_LEDGER_WRITE_URL: 'https://ledger.example.invalid/write',
  ACCOUNT_CLOSURE_LEDGER_READ_URL: 'https://ledger.example.invalid/read',
  ACCOUNT_CLOSURE_LEDGER_SECRET: SECRET,
  RELEASE_SHA: 'a'.repeat(40),
};

describe('restore-independent account closure ledger', () => {
  it('fails closed in production when the external ledger is not configured', async () => {
    const ledger = createAccountClosureLedger({
      env: { NODE_ENV: 'production' },
      fetchImpl: vi.fn(),
    });

    await expect(ledger.authorize({ receiptId: 'receipt-1' })).rejects.toMatchObject({
      statusCode: 503,
      code: 'ACCOUNT_DELETE_LEDGER_UNAVAILABLE',
    });
    expect(accountClosureLedgerStatus({ NODE_ENV: 'production' }).configured).toBe(false);
  });


  it('refuses an incomplete tombstone before sending it externally', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 204 }));
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    await expect(ledger.authorize({ receiptId: 'receipt-invalid' })).rejects.toMatchObject({
      statusCode: 500,
      code: 'ACCOUNT_DELETE_LEDGER_INVALID_TOMBSTONE',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('writes an idempotent HMAC-signed tombstone without raw identity fields', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 204 }));
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    const result = await ledger.authorize({
      receiptId: 'receipt-2',
      userIdHash: ledger.hashIdentity('user-2'),
      actorMode: 'self_service',
      authorizedAt: '2026-08-09T21:30:00.000Z',
      billing: { checkoutSessionsExpired: 1, subscriptionsCancelled: 2 },
      rawEmail: 'must-not-be-sent@example.invalid',
    });

    expect(result).toEqual({ mode: 'external', recorded: true, receiptId: 'receipt-2' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENV.ACCOUNT_CLOSURE_LEDGER_WRITE_URL);
    expect(options.method).toBe('POST');
    expect(options.headers['idempotency-key']).toBe('receipt-2');
    const payload = JSON.parse(options.body);
    expect(payload).toEqual({
      version: 1,
      event: 'account_deletion_authorized',
      receiptId: 'receipt-2',
      userIdHash: ledger.hashIdentity('user-2'),
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

  it('reads only valid versioned deletion authorizations for restore reconciliation', async () => {
    const responseBody = JSON.stringify({
      tombstones: [
        {
          version: 1,
          event: 'account_deletion_authorized',
          receiptId: 'receipt-valid',
          userIdHash: 'a'.repeat(64),
        },
        { version: 2, event: 'account_deletion_authorized', receiptId: 'wrong-version' },
        { version: 1, event: 'other', receiptId: 'wrong-event' },
      ],
    });
    const responseTimestamp = new Date().toISOString();
    const responseSignature = crypto.createHmac('sha256', SECRET)
      .update(`${responseTimestamp}.${responseBody}`)
      .digest('hex');
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        'x-genemap-ledger-timestamp': responseTimestamp,
        'x-genemap-ledger-signature': `sha256=${responseSignature}`,
      },
      text: async () => responseBody,
    }));
    const ledger = createAccountClosureLedger({ env: ENV, fetchImpl });

    const tombstones = await ledger.listTombstones();

    expect(tombstones).toEqual([
      expect.objectContaining({ receiptId: 'receipt-valid' }),
    ]);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET' });
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

});
