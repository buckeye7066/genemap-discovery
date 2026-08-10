import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountSettings from '../AccountSettings';

const shared = vi.hoisted(() => ({ request: vi.fn() }));

const auth = vi.hoisted(() => ({
  user: { email: 'learner@example.invalid', role: 'user' },
  isLoadingAuth: false,
  clearSession: vi.fn(),
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('@genemap/shared', () => ({
  apiClient: shared,
}));

function LoginDestination() {
  const location = useLocation();
  return <div>Login destination {location.search}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accountsettings']}>
      <Routes>
        <Route path="/accountsettings" element={<AccountSettings />} />
        <Route path="/login" element={<LoginDestination />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AccountSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { email: 'learner@example.invalid', role: 'user' };
    auth.isLoadingAuth = false;
  });

  it('keeps permanent deletion disabled until every action-bound confirmation matches', () => {
    renderPage();
    const button = screen.getByRole('button', { name: /permanently delete my account/i });

    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/account email/i), {
      target: { value: 'other@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'DeleteMe!234' },
    });
    fireEvent.change(screen.getByLabelText(/type delete my account/i), {
      target: { value: 'DELETE MY ACCOUNT' },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/account email/i), {
      target: { value: 'learner@example.invalid' },
    });
    expect(button).toBeEnabled();
  });

  it('submits the exact deletion contract, clears local auth, and navigates to confirmation', async () => {
    shared.request.mockResolvedValue({
      success: true,
      receiptId: 'receipt-1',
      billing: { subscriptionsCancelled: 0, customersDeleted: 0, customerCleanupPending: false },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText(/account email/i), {
      target: { value: 'learner@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'DeleteMe!234' },
    });
    fireEvent.change(screen.getByLabelText(/type delete my account/i), {
      target: { value: 'DELETE MY ACCOUNT' },
    });
    fireEvent.click(screen.getByRole('button', { name: /permanently delete my account/i }));

    await screen.findByText('Login destination ?accountDeleted=1');
    expect(shared.request).toHaveBeenCalledWith('/account/delete', {
      method: 'POST',
      body: JSON.stringify({
        email: 'learner@example.invalid',
        password: 'DeleteMe!234',
        confirmation: 'DELETE MY ACCOUNT',
      }),
      timeoutMs: 60_000,
    });
    expect(auth.clearSession).toHaveBeenCalledWith('Account deleted');
  });

  it('executes the limited purge and distinguishes it from account closure', async () => {
    shared.request.mockResolvedValue({ request: { status: 'completed' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^purge supported content$/i }));

    await screen.findByText(/search history and other supported self-service content were purged/i);
    expect(shared.request).toHaveBeenCalledWith('/entities/data-deletion-request', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(screen.getByText(/does not close your account, cancel billing/i)).toBeInTheDocument();
  });

  it('leaves the user on the page with a precise error and reconciliation receipt when deletion fails closed', async () => {
    const error = Object.assign(
      new Error('Account deletion is temporarily unavailable because billing cancellation cannot be verified. No account data was deleted.'),
      { receiptId: 'receipt-reconcile-123' },
    );
    shared.request.mockRejectedValue(error);
    renderPage();

    fireEvent.change(screen.getByLabelText(/account email/i), {
      target: { value: 'learner@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'DeleteMe!234' },
    });
    fireEvent.change(screen.getByLabelText(/type delete my account/i), {
      target: { value: 'DELETE MY ACCOUNT' },
    });
    fireEvent.click(screen.getByRole('button', { name: /permanently delete my account/i }));

    const errorText = await screen.findByText(/billing cancellation cannot be verified/i);
    const errorAlert = errorText.closest('[role="alert"]');
    expect(errorAlert).toBeTruthy();
    expect(within(errorAlert).getByText(/no account data was deleted/i)).toBeInTheDocument();
    expect(within(errorAlert).getByText(/receipt-reconcile-123/i)).toBeInTheDocument();
    await waitFor(() => expect(auth.clearSession).not.toHaveBeenCalled());
  });

  it('does not claim support was notified when a limited purge remains pending', async () => {
    shared.request.mockResolvedValue({ request: { status: 'pending' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^purge supported content$/i }));

    const message = await screen.findByText(/purge request was retained but did not complete/i);
    expect(message).toHaveTextContent(/open contact support/i);
    expect(message).not.toHaveTextContent(/support has been notified/i);
  });

  it('uses a non-live note for the static destructive-action explanation', () => {
    renderPage();
    expect(screen.getByRole('note')).toHaveTextContent(/independent deletion authorization/i);
  });
});