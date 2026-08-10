import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/errors.js';

function harness(error) {
  const send = vi.fn((body) => body);
  const status = vi.fn(() => ({ send }));
  const request = {
    id: 'req-123',
    method: 'POST',
    url: '/llm/invoke',
    routeOptions: { url: '/llm/invoke' },
    server: { env: { isProduction: true } },
    log: { error: vi.fn() },
  };
  errorHandler(error, request, { status });
  return { status, body: send.mock.calls[0]?.[0] };
}

describe('publication error details', () => {
  it('serializes a validated unavailable artifact without content', () => {
    const error = new AppError('Publication is disabled during safe recovery.', 503);
    error.code = 'MODEL_PUBLICATION_DISABLED';
    error.details = {
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'model_publication_disabled',
        correlationId: 'req-123:kill-switch',
        limitations: [],
      },
    };

    const { status, body } = harness(error);
    expect(status).toHaveBeenCalledWith(503);
    expect(body.details).toEqual(error.details);
  });

  it.each([
    { status: 'available', content: 'must not leak' },
    { status: 'withheld', content: 'must not leak' },
    { status: 'unavailable', content: null, correlationId: 'invalid id with spaces' },
  ])('drops unsafe or malformed publication details', (override) => {
    const error = new AppError('Publication failed.', 503);
    error.details = {
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'provider_unavailable',
        correlationId: 'req-123',
        limitations: [],
        ...override,
      },
    };

    expect(harness(error).body).not.toHaveProperty('details');
  });
});
