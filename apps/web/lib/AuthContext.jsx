import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '@genemap/shared';

const AuthContext = createContext();

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
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
      if (error?.status === 403 && error?.code === 'user_not_registered') {
        setAuthError({ type: 'user_not_registered', message: error.message });
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

  const login = useCallback(async (credentials) => {
    const response = await apiClient.login(credentials);
    setUser(response.user);
    setIsAuthenticated(true);
    setAuthError(null);
    return response;
  }, []);

  const register = useCallback(async (credentials) => {
    const response = await apiClient.register(credentials);
    setUser(response.user);
    setIsAuthenticated(true);
    setAuthError(null);
    return response;
  }, []);

  const logout = useCallback(async () => {
    await apiClient.logout();
    setUser(null);
    setIsAuthenticated(false);
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
  }), [user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, login, register, logout, checkAuth]);

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
