import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiClient account-closure recovery errors', () => {
  it('preserves receipt and bounded billing progress from the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Account closure needs a safe retry.',
      code: 'ACCOUNT_DELETE_FINALIZE_RECOVERY_REQUIRED',
      receiptId: 'receipt-safe-id',
      details: {
        billingProgress: {
          checkoutSessionsExamined: 2,
          checkoutSessionsExpired: 1,
          subscriptionsCancelled: 1,
          customersDeleted: 0,
        },
      },
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })));
    const client = new ApiClient('https://api.example.invalid');

    let caught: unknown;
    try {
      await client.request('/account/delete', { method: 'POST', body: '{}' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({
      status: 503,
      code: 'ACCOUNT_DELETE_FINALIZE_RECOVERY_REQUIRED',
      receiptId: 'receipt-safe-id',
      details: {
        billingProgress: {
          checkoutSessionsExamined: 2,
          checkoutSessionsExpired: 1,
          subscriptionsCancelled: 1,
          customersDeleted: 0,
        },
      },
    });
  });
});
