import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiClient } from '@genemap/shared';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const userData = await apiClient.getMe();
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const login = async (credentials) => {
    const response = await apiClient.login(credentials);
    setUser(response.user);
    setIsAuthenticated(true);
    return response;
  };

  const register = async (credentials) => {
    const response = await apiClient.register(credentials);
    setUser(response.user);
    setIsAuthenticated(true);
    return response;
  };

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      login,
      register,
      logout,
      checkAuth
    }}>
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
