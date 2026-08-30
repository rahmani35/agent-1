import React, { useState } from 'react';
import { Database, Sun, Moon, LogOut, RefreshCw, Layers, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { switchVectorBackend } from '../services/api';

export default function Header({ agentStatus, theme, toggleTheme, onRefreshHealth }) {
  const { user, logout, isAuthenticated } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isOnline = agentStatus && agentStatus.status === 'ok';
  const backend = agentStatus?.active_backend || 'firestore';

  const handleSelectBackend = async (targetBackend) => {
    if (targetBackend === backend || switching) return;
    try {
      setSwitching(true);
      setDropdownOpen(false);
      await switchVectorBackend(targetBackend);
      await onRefreshHealth();
    } catch (err) {
      alert(`Failed to switch backend: ${err.message}`);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="logo-badge">
          <Database size={20} />
        </div>
        <div>
          <h1 className="brand-title">Agent-1</h1>
          <div className="brand-subtitle">Document Q&amp;A (RAG)</div>
        </div>
      </div>

      <div className="header-actions">
        {/* Dynamic Vector Backend Switcher Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className="backend-badge"
            onClick={() => setDropdownOpen((prev) => !prev)}
            title="Click to switch active Vector Store backend"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {switching ? (
              <div className="spinner" style={{ width: '12px', height: '12px' }} />
            ) : (
              <Layers size={14} />
            )}
            <span>{backend === 'cloudsql' ? 'Cloud SQL (pgvector)' : 'Firestore Vector'}</span>
            <ChevronDown size={13} style={{ opacity: 0.7 }} />
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-lg)',
                minWidth: '220px',
                zIndex: 50,
                padding: '0.4rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <div style={{ padding: '0.35rem 0.6rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Active Vector Solution
              </div>

              {/* Firestore Option */}
              <button
                onClick={() => handleSelectBackend('firestore')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: backend === 'firestore' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: backend === 'firestore' ? 'var(--accent-blue)' : 'var(--text-primary)',
                  fontSize: '0.825rem',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>Cloud Firestore</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Serverless k-NN (Native)</div>
                </div>
                {backend === 'firestore' && <Check size={14} color="var(--accent-blue)" />}
              </button>

              {/* Cloud SQL Option */}
              <button
                onClick={() => handleSelectBackend('cloudsql')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: backend === 'cloudsql' ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: backend === 'cloudsql' ? 'var(--accent-blue)' : 'var(--text-primary)',
                  fontSize: '0.825rem',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>Cloud SQL (pgvector)</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>HNSW Cosine Index (db-f1-micro)</div>
                </div>
                {backend === 'cloudsql' && <Check size={14} color="var(--accent-blue)" />}
              </button>
            </div>
          )}
        </div>

        {/* Health Status Badge */}
        <div
          className="status-badge"
          title={isOnline ? 'Gateway & Agent Online' : 'Gateway Offline'}
        >
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          <span>{isOnline ? 'Ready' : 'Offline'}</span>
        </div>

        <button
          className="btn-icon"
          onClick={onRefreshHealth}
          title="Refresh Backend Health"
        >
          <RefreshCw size={16} />
        </button>

        <button
          className="btn-icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {isAuthenticated && user && (
          <div className="user-profile">
            {user.picture ? (
              <img src={user.picture} alt={user.name || user.email} className="user-avatar" />
            ) : (
              <div className="user-avatar" style={{ background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.75rem' }}>
                {(user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <span className="user-email" title={user.email}>{user.name || user.email}</span>
            <button className="btn-icon" onClick={logout} title="Sign Out" style={{ width: '28px', height: '28px' }}>
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
