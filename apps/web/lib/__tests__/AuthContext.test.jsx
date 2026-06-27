import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { apiClient } from '@genemap/shared';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
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
