import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  authenticateGoogleToken,
  clearStoredSession,
  fetchUserProfile,
  SESSION_EXPIRED_EVENT,
} from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('agent1_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // The token is only checked once at startup, but it lapses after about an
  // hour. Any request that comes back 401 announces it, so the app drops back
  // to the sign-in screen instead of leaving a signed-in UI where nothing works.
  useEffect(() => {
    const handleExpiry = () => {
      setUser(null);
      setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
  }, []);

  useEffect(() => {
    async function initAuth() {
      const profile = await fetchUserProfile();
      if (profile) {
        setUser(profile);
        localStorage.setItem('agent1_user', JSON.stringify(profile));
      } else {
        setUser(null);
      }
      setLoading(false);
    }
    initAuth();
  }, []);

  const loginWithGoogle = async (credential) => {
    const data = await authenticateGoogleToken(credential);
    localStorage.setItem('agent1_google_token', credential);
    localStorage.setItem('agent1_user', JSON.stringify(data.user));
    setUser(data.user);
    setSessionExpired(false);
    return data.user;
  };

  const logout = () => {
    clearStoredSession();
    setUser(null);
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, loginWithGoogle, logout, loading, sessionExpired, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
