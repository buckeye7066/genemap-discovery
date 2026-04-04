// Tests moved to src/__tests__/client.test.js for comprehensive coverage.
// This file is intentionally left as a redirect to avoid duplicate runs.

import { describe, it, expect } from 'vitest';
import { ApiClient } from '../src/client.js';

describe('ApiClient (basic)', () => {
  it('should create instance with custom baseURL', () => {
    const client = new ApiClient('https://api.example.com');
    expect(client.baseURL).toBe('https://api.example.com');
  });
});
