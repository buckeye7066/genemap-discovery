import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    request: vi.fn(() => Promise.resolve()),
  },
}));

import { apiClient } from '@genemap/shared';
import { reportClientError } from '../reportClientError.js';

describe('reportClientError publication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends only finite enums and drops all free-text canaries', () => {
    const canary = 'patient@example.invalid chr1 12345 A G urgent diagnosis';
    const error = new TypeError(canary);
    error.stack = canary;

    reportClientError(error, {
      componentStack: canary,
      statusCode: 599,
    });

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const [path, options] = apiClient.request.mock.calls[0];
    expect(path).toBe('/report-client-error');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      eventCode: 'react_render_error',
      errorClass: 'TypeError',
    });
    expect(options.body).not.toContain(canary);
    expect(options.body).not.toContain('stack');
    expect(options.body).not.toContain('route');
    expect(options.body).not.toContain('status');
  });
});
