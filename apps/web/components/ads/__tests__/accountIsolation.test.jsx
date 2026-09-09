import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { queryClientInstance } from '@/lib/query-client';

vi.mock('@genemap/shared', () => ({ hasStoredSession: () => false, setCsrfToken: vi.fn(), apiClient: { logout: vi.fn(async () => {}) } }));
let auth;
function Probe() { auth = useAuth(); return <p>{auth.user?.id || 'guest'}</p>; }
afterEach(() => { cleanup(); queryClientInstance.clear(); });
it('removes cached data before changing accounts and on logout, including cancelled requests', async () => {
  render(<AuthProvider><Probe /></AuthProvider>);
  act(() => auth.applyUser({ id: 'owner', role: 'super_admin' }));
  queryClientInstance.setQueryData(['account-result'], { private: 'owner-only fixture' });
  let complete;
  const oldRequest = queryClientInstance.fetchQuery({ queryKey: ['pending-owner-result'], queryFn: () => new Promise((resolve) => { complete = resolve; }) });
  oldRequest.catch(() => {});
  act(() => auth.applyUser({ id: 'different-user', role: 'user' }));
  expect(queryClientInstance.getQueryData(['account-result'])).toBeUndefined();
  await act(async () => { complete({ private: 'late owner response' }); await Promise.resolve(); });
  expect(queryClientInstance.getQueryData(['pending-owner-result'])).toBeUndefined();
  expect(auth.user.role).toBe('user');
  queryClientInstance.setQueryData(['account-result'], { private: 'different-user-only fixture' });
  await act(async () => auth.logout());
  expect(auth.user).toBeNull();
  expect(queryClientInstance.getQueryData(['account-result'])).toBeUndefined();
});
