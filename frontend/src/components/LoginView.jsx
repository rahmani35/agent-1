import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { ShieldCheck, AlertCircle, Database, FileText, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginView() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSuccess = async (credentialResponse) => {
    try {
      setLoading(true);
      setError(null);
      await loginWithGoogle(credentialResponse.credential);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your Google account is authorized.');
    } finally {
      setLoading(false);
    }
  };

  const handleError = () => {
    setError('Google Sign-In failed or was cancelled.');
  };

  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
  const buildSha = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
      <div className="panel-card" style={{ maxWidth: '460px', width: '100%', textAlign: 'center' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            boxShadow: '0 4px 16px rgba(88, 166, 255, 0.4)',
          }}
        >
          <Database size={28} />
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Document Q&amp;A Agent
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Upload PDF, TXT, and Markdown files and ask grounded questions powered by Cloud SQL (pgvector) &amp; Firestore Vector Search.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', marginBottom: '1.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <FileText size={14} color="var(--accent-blue)" />
            <span>Smart Chunking</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Search size={14} color="var(--accent-purple)" />
            <span>Vector Search</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={14} color="var(--accent-green)" />
            <span>OAuth Whitelist</span>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(248, 81, 73, 0.12)',
              border: '1px solid rgba(248, 81, 73, 0.3)',
              color: 'var(--accent-red)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem',
              textAlign: 'left',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          {loading ? (
            <div className="spinner" style={{ width: '28px', height: '28px' }} />
          ) : (
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={handleError}
              useOneTap={false}
              theme="filled_blue"
              shape="pill"
              text="continue_with"
            />
          )}
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          v{appVersion} ({buildSha})
        </div>
      </div>
    </div>
  );
}
