import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/errors.js';
import { errorHandler, publicBillingProgress } from '../middleware/errorHandler.js';

function replyDouble() {
  const reply = {
    statusCode: null,
    body: null,
    status: vi.fn((statusCode) => {
      reply.statusCode = statusCode;
      return reply;
    }),
    send: vi.fn((body) => {
      reply.body = body;
      return body;
    }),
  };
  return reply;
}

describe('account-closure error serialization', () => {
  it('publishes bounded progress counts without Stripe or checkout identifiers', () => {
    const error = new AppError('Database finalization failed after billing was secured.', 503);
    error.code = 'ACCOUNT_DELETE_DATABASE_FINALIZE_FAILED';
    error.receiptId = 'receipt-safe-random-id';
    error.billingProgress = {
      checkoutSessionsExamined: ['cs_secret_1', 'cs_secret_2'],
      checkoutSessionsExpired: ['cs_secret_1'],
      subscriptionsCancelled: ['sub_secret_1'],
      customersDeleted: [],
      discoveredSubscriptionIds: ['sub_secret_1'],
      discoveredCustomerIds: ['cus_secret_1'],
    };
    const request = {
      id: 'request-1',
      method: 'DELETE',
      url: '/account/delete',
      routeOptions: { url: '/account/delete' },
      server: { env: { isProduction: true } },
      log: { error: vi.fn() },
    };
    const reply = replyDouble();

    errorHandler(error, request, reply);

    expect(reply.statusCode).toBe(503);
    expect(reply.body).toEqual({
      error: 'Database finalization failed after billing was secured.',
      code: 'ACCOUNT_DELETE_DATABASE_FINALIZE_FAILED',
      requestId: 'request-1',
      receiptId: 'receipt-safe-random-id',
      details: {
        billingProgress: {
          checkoutSessionsExamined: 2,
          checkoutSessionsExpired: 1,
          subscriptionsCancelled: 1,
          customersDeleted: 0,
        },
      },
    });
    expect(JSON.stringify(reply.body)).not.toMatch(/cs_secret|sub_secret|cus_secret/);
  });

  it('normalizes malformed progress to finite non-negative counts', () => {
    expect(publicBillingProgress({
      checkoutSessionsExamined: Number.POSITIVE_INFINITY,
      checkoutSessionsExpired: -1,
      subscriptionsCancelled: ['one'],
      customersDeleted: null,
    })).toEqual({
      checkoutSessionsExamined: 0,
      checkoutSessionsExpired: 0,
      subscriptionsCancelled: 1,
      customersDeleted: 0,
    });
  });
});
