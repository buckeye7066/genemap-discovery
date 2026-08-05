import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { apiClient, hasStoredSession, setCsrfToken } from '@genemap/shared';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  // Default: pretend a prior session hint exists so the legacy tests keep
  // exercising the getMe() path; individual tests override to cover the
  // anonymous fast-path.
  hasStoredSession: vi.fn(() => true),
  setCsrfToken: vi.fn(),
}));

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(auth.isLoadingAuth)}</div>
      <div data-testid="authenticated">{String(auth.isAuthenticated)}</div>
      <div data-testid="error">{auth.authError?.type || 'none'}</div>
      <button onClick={() => auth.login({ email: 'a@b.com', password: 'password123' })}>login</button>
      <button onClick={() => auth.register({ email: 'new@b.com', password: 'password123' })}>register</button>
      <button onClick={() => auth.logout()}>logout</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the /auth/me round-trip entirely for anonymous visitors (no session hint)', async () => {
    hasStoredSession.mockReturnValue(false);

    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('auth_required');
    // The whole point: no network call means no 401, means no browser
    // console error on a clean /login visit.
    expect(apiClient.getMe).not.toHaveBeenCalled();

    hasStoredSession.mockReturnValue(true);
  });

  it('drops a stale session hint when the stored session 401s', async () => {
    apiClient.getMe.mockRejectedValue({ status: 401, message: 'Authentication required' });

    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('error')).toHaveTextContent('auth_required');
    expect(setCsrfToken).toHaveBeenCalledWith(null);
  });

  it('classifies a startup 401 as auth_required without logging an error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiClient.getMe.mockRejectedValue({ status: 401, message: 'Authentication required' });

    renderAuth();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('auth_required');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sets authenticated state after login or register and clears it on logout', async () => {
    apiClient.getMe.mockRejectedValue({ status: 401, message: 'Authentication required' });
    apiClient.login.mockResolvedValue({ user: { id: 'u-1', email: 'a@b.com', role: 'user' } });
    apiClient.register.mockResolvedValue({ user: { id: 'u-2', email: 'new@b.com', role: 'user' } });
    apiClient.logout.mockResolvedValue({ success: true });

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    screen.getByText('login').click();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');

    screen.getByText('logout').click();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(screen.getByTestId('error')).toHaveTextContent('auth_required');

    screen.getByText('register').click();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });
});
