import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { ShieldCheck, AlertCircle, Database, FileText, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { Icon: FileText, label: 'Smart Chunking' },
  { Icon: Search, label: 'Vector Search' },
  { Icon: ShieldCheck, label: 'OAuth Whitelist' },
];

export default function LoginView({ agentStatus }) {
  const { loginWithGoogle, sessionExpired } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // The health poll already knows the gateway is down. Saying so here beats
  // letting the user click through to a failed sign-in to find out.
  const isOffline = agentStatus != null && agentStatus.status !== 'ok';

  // Explain an involuntary return to this screen, rather than showing the plain
  // sign-in page as though the user had logged out on purpose.
  const notice =
    error ||
    (sessionExpired ? 'Your session has expired. Please sign in again.' : null) ||
    (isOffline ? 'The gateway is not responding, so signing in will fail. Start the backend, then use the refresh button in the header.' : null);

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
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', overflowY: 'auto' }}>
      <div className="panel-card" style={{ maxWidth: '460px', width: '100%', textAlign: 'center' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--accent-blue)',
            boxShadow: 'var(--inset-highlight)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <Database size={28} aria-hidden="true" />
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          Document Q&amp;A Agent
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Upload PDF, TXT, and Markdown files and ask grounded questions powered by Cloud SQL (pgvector) &amp; Firestore Vector Search.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          {FEATURES.map(({ Icon, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Icon size={14} aria-hidden="true" color="var(--text-muted)" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {notice && (
          <div
            role="alert"
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: error ? 'var(--accent-red-wash)' : 'rgba(210, 153, 34, 0.12)',
              border: `1px solid ${error ? 'var(--accent-red-edge)' : 'rgba(210, 153, 34, 0.35)'}`,
              color: error ? 'var(--accent-red)' : 'var(--accent-amber)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem',
              textAlign: 'left',
            }}
          >
            <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{notice}</span>
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
