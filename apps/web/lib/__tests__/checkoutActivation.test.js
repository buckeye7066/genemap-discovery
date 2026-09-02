import { describe, expect, it, vi } from 'vitest';
import { pollCheckoutActivation } from '../checkoutActivation.js';

describe('checkout activation polling', () => {
  it('waits for the webhook-created entitlement instead of trusting checkout completion', async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce({
        state: 'processing', kind: 'personal', checkoutComplete: true, entitlementActive: false,
      })
      .mockResolvedValueOnce({
        state: 'active', kind: 'personal', checkoutComplete: true, entitlementActive: true,
      });

    const result = await pollCheckoutActivation({
      sessionId: 'cs_test_123', expectedKind: 'personal', getStatus,
      attempts: 2, delayMs: 0,
    });

    expect(result.outcome).toBe('active');
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('does not activate an institutional page from a personal checkout session', async () => {
    const result = await pollCheckoutActivation({
      sessionId: 'cs_test_personal', expectedKind: 'institutional',
      getStatus: async () => ({
        state: 'active', kind: 'personal', checkoutComplete: true, entitlementActive: true,
      }),
      attempts: 1, delayMs: 0,
    });

    expect(result.outcome).toBe('wrong_kind');
  });

  it('returns a recoverable pending result when activation is still unavailable', async () => {
    const getStatus = vi.fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({
        state: 'processing', kind: 'personal', checkoutComplete: true, entitlementActive: false,
      });

    const result = await pollCheckoutActivation({
      sessionId: 'cs_test_pending', expectedKind: 'personal', getStatus,
      attempts: 2, delayMs: 0,
    });

    expect(result.outcome).toBe('pending');
    expect(result.status.entitlementActive).toBe(false);
  });
});
