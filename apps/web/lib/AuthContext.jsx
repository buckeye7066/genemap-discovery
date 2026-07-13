import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '@genemap/shared';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      const userData = await apiClient.getMe();
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      if (error?.status === 403 && error?.code === 'user_not_registered') {
        setAuthError({ type: 'user_not_registered', message: error.message });
      } else if (error?.status === 401) {
        setAuthError({ type: 'auth_required', message: error.message || 'Authentication required' });
      } else {
        console.error('Auth check failed:', error);
        setAuthError({ type: 'auth_error', message: error?.message || 'Unable to check authentication' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const navigateToLogin = useCallback(() => {
    window.location.href = '/login';
  }, []);

  // Apply a fresh user object returned by a write (e.g. PUT /auth/me) so the
  // app's auth state stays in sync WITHOUT an extra round-trip. Critical for
  // the onboarding flow: after saving demographics the gate must immediately
  // see demographics_collected=true, or it bounces the user back to the
  // profile-build screen in an endless loop.
  const applyUser = useCallback((userData) => {
    if (!userData) return;
    setUser(userData);
    setIsAuthenticated(true);
    setAuthError(null);
  }, []);

  // The /login and /register responses intentionally carry only a thin user
  // ({ id, email, role }) for speed. But the rest of the app treats the auth
  // user as canonical — the onboarding gate reads `demographics_collected` and
  // the Premium page reads `entitlements`, neither of which is on the thin
  // object. Using it directly bounced EVERY returning user to a blank
  // "Complete Your Profile" screen (undefined demographics_collected === falsy)
  // and, if they clicked Continue, overwrote their real name/phone with empty
  // strings. So after authenticating we hydrate the full canonical user via
  // getMe(), falling back to the thin object only if that call fails (login
  // still succeeds).
  const hydrateUser = useCallback(async (fallbackUser) => {
    try {
      return await apiClient.getMe();
    } catch (err) {
      console.error('Post-auth profile hydration failed; using minimal user:', err);
      return fallbackUser;
    }
  }, []);

  const login = useCallback(async (credentials) => {
    const response = await apiClient.login(credentials);
    setUser(await hydrateUser(response.user));
    setIsAuthenticated(true);
    setAuthError(null);
    return response;
  }, [hydrateUser]);

  const register = useCallback(async (credentials) => {
    const response = await apiClient.register(credentials);
    setUser(await hydrateUser(response.user));
    setIsAuthenticated(true);
    setAuthError(null);
    return response;
  }, [hydrateUser]);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Logged out' });
    }
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
    login,
    register,
    logout,
    checkAuth,
    applyUser,
  }), [user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, login, register, logout, checkAuth, applyUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
