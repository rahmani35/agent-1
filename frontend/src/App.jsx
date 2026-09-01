import React, { useState, useEffect } from 'react';
import { MessageSquare, UploadCloud } from 'lucide-react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Header from './components/Header';
import ChatView from './components/ChatView';
import DocumentUploadView from './components/DocumentUploadView';
import LoginView from './components/LoginView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { checkHealth } from './services/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '738361864192-example.apps.googleusercontent.com';

function MainApp() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('chat');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [sessionId, setSessionId] = useState(() => `session_${Math.random().toString(36).substring(2, 9)}`);
  const [agentStatus, setAgentStatus] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchHealth = async () => {
    const status = await checkHealth();
    setAgentStatus(status);
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  if (loading) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '36px', height: '36px' }} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header
        agentStatus={agentStatus}
        theme={theme}
        toggleTheme={toggleTheme}
        onRefreshHealth={fetchHealth}
      />

      {!isAuthenticated ? (
        <LoginView agentStatus={agentStatus} />
      ) : (
        <>
          <nav className="nav-tabs">
            <button
              className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare size={16} />
              <span>Document Q&amp;A Chat</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              <UploadCloud size={16} />
              <span>Documents &amp; Vector Index</span>
            </button>
          </nav>

          <main className="content-area">
            {activeTab === 'chat' && (
              <ChatView
                sessionId={sessionId}
                setSessionId={setSessionId}
                activeBackend={agentStatus?.active_backend}
              />
            )}
            {activeTab === 'documents' && (
              <DocumentUploadView
                activeBackend={agentStatus?.active_backend}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
