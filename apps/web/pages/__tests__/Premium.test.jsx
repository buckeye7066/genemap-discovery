import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import { useAuth } from '@/lib/AuthContext';
import PremiumPage from '../Premium';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    getBillingCatalog: vi.fn(),
    getCheckoutActivationStatus: vi.fn(),
    getEducationEntitlements: vi.fn(),
    getMe: vi.fn(),
  },
}));

vi.mock('@/lib/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/platform', () => ({ isNativeApp: () => false }));
vi.mock('@/lib/checkoutActivation', () => ({ pollCheckoutActivation: vi.fn() }));

const catalog = {
  personal: {
    monthly: { amountMinor: 999, currency: 'usd', interval: 'month' },
    yearly: { amountMinor: 9_999, currency: 'usd', interval: 'year' },
  },
  institutional: {
    team: {
      minSeats: 5,
      maxSeats: 20,
      monthly: { amountMinor: 799, currency: 'usd', interval: 'month' },
      yearly: { amountMinor: 7_999, currency: 'usd', interval: 'year' },
    },
  },
};

function authUser(source, { canManageBilling = false } = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
    entitlements: {
      tier: 'premium',
      isPremium: true,
      isAdmin: false,
      access: {
        source,
        canManageBilling,
        expiresAt: '2026-09-09T00:00:00.000Z',
      },
    },
  };
}

describe('Premium billing states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.getBillingCatalog.mockResolvedValue(catalog);
    apiClient.getEducationEntitlements.mockResolvedValue({
      tier: 'premium',
      isPremium: true,
      todayUsage: null,
      limits: null,
    });
    apiClient.createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.example/session',
      sessionId: 'cs_test_personal',
      reused: false,
    });
  });

  it('lets a complimentary user choose a paid plan before access expires', async () => {
    useAuth.mockReturnValue({
      user: authUser('complimentary'),
      isLoadingAuth: false,
      applyUser: vi.fn(),
    });

    render(<MemoryRouter><PremiumPage /></MemoryRouter>);

    expect(await screen.findByText(/Keep Premium after your complimentary period/iu)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Monthly/iu })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Yearly/iu })).toBeEnabled();
  });

  it('does not offer a second checkout to an active paid subscriber', async () => {
    useAuth.mockReturnValue({
      user: authUser('subscription', { canManageBilling: true }),
      isLoadingAuth: false,
      applyUser: vi.fn(),
    });

    render(<MemoryRouter><PremiumPage /></MemoryRouter>);

    expect(await screen.findByText('Paid Subscription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manage Subscription/iu })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Monthly/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Yearly/iu })).not.toBeInTheDocument();
  });

  it('shows the server billing recovery message instead of replacing it generically', async () => {
    useAuth.mockReturnValue({
      user: authUser('complimentary'),
      isLoadingAuth: false,
      applyUser: vi.fn(),
    });
    apiClient.createCheckoutSession.mockRejectedValueOnce(new Error(
      'Your completed checkout is still being activated. Wait for activation instead of starting another subscription.',
    ));

    render(<MemoryRouter><PremiumPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Monthly/iu }));

    await waitFor(() => expect(screen.getByText(/completed checkout is still being activated/iu)).toBeInTheDocument());
  });
});
