import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    request: vi.fn(() => Promise.resolve()),
  },
}));

import { apiClient } from '@genemap/shared';
import { reportClientError } from '../reportClientError.js';

const requestMock = vi.mocked(apiClient.request);

describe('reportClientError publication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends only finite enums and drops all free-text canaries', () => {
    const canary = 'patient@example.invalid chr1 12345 A G urgent diagnosis';
    const error = new TypeError(canary);
    error.stack = canary;

    reportClientError(error, /** @type {any} */ ({
      componentStack: canary,
      statusCode: 599,
    }));

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [path, options] = requestMock.mock.calls[0];
    const serialized = String(options.body);
    expect(path).toBe('/report-client-error');
    expect(options.method).toBe('POST');
    expect(JSON.parse(serialized)).toEqual({
      eventCode: 'react_render_error',
      errorClass: 'TypeError',
    });
    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('route');
    expect(serialized).not.toContain('status');
  });
});
