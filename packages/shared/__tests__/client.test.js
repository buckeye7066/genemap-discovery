import { describe, it, expect } from 'vitest';
import { ApiClient } from '../src/client.js';

describe('ApiClient', () => {
  it('should create instance with default baseURL', () => {
    const client = new ApiClient();
    expect(client).toBeDefined();
    expect(client.baseURL).toBeDefined();
  });

  it('should create instance with custom baseURL', () => {
    const client = new ApiClient('https://api.example.com');
    expect(client.baseURL).toBe('https://api.example.com');
  });
});
