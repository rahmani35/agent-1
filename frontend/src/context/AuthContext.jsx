import React, { createContext, useContext, useState, useEffect } from 'react';
import { authenticateGoogleToken, fetchUserProfile } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('agent1_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

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
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('agent1_google_token');
    localStorage.removeItem('agent1_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, logout, loading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
