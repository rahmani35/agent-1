import React, { useState, useRef, useEffect } from 'react';
import { Database, Sun, Moon, LogOut, RefreshCw, Layers, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { switchVectorBackend } from '../services/api';

const BACKENDS = [
  {
    id: 'firestore',
    label: 'Cloud Firestore',
    hint: 'Serverless k-NN (Native)',
    short: 'Firestore Vector',
  },
  {
    id: 'cloudsql',
    label: 'Cloud SQL (pgvector)',
    hint: 'HNSW Cosine Index (db-f1-micro)',
    short: 'Cloud SQL (pgvector)',
  },
];

export default function Header({ agentStatus, theme, toggleTheme, onRefreshHealth }) {
  const { user, logout, isAuthenticated } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switchError, setSwitchError] = useState(null);
  const menuRef = useRef(null);

  const isOnline = agentStatus && agentStatus.status === 'ok';
  const backend = agentStatus?.active_backend || 'firestore';
  const activeBackend = BACKENDS.find((b) => b.id === backend) || BACKENDS[0];

  // The menu used to toggle only on its own button, so it stayed open over the
  // content until you clicked it again.
  useEffect(() => {
    if (!dropdownOpen) return;

    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setDropdownOpen(false);
        setSwitchError(null);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setSwitchError(null);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dropdownOpen]);

  const handleSelectBackend = async (targetBackend) => {
    if (targetBackend === backend || switching) return;
    try {
      setSwitching(true);
      setSwitchError(null);
      await switchVectorBackend(targetBackend);
      await onRefreshHealth();
      setDropdownOpen(false);
    } catch (err) {
      // Reported in the menu that triggered it, not in an OS dialog.
      setSwitchError(err.message || 'Could not switch the vector store. Check the gateway and try again.');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="logo-badge">
          <Database size={20} aria-hidden="true" />
        </div>
        <div>
          <h1 className="brand-title">Agent-1</h1>
          <div className="brand-subtitle">Document Q&amp;A (RAG)</div>
        </div>
      </div>

      <div className="header-actions">
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            className="backend-badge"
            onClick={() => setDropdownOpen((prev) => !prev)}
            title="Switch the active vector store"
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
          >
            {switching ? (
              <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
            ) : (
              <Layers size={14} aria-hidden="true" />
            )}
            <span className="backend-badge-text">{activeBackend.short}</span>
            <ChevronDown size={13} aria-hidden="true" style={{ opacity: 0.7 }} />
          </button>

          {dropdownOpen && (
            <div className="backend-menu" role="menu" aria-label="Active vector store">
              <div className="backend-menu-label">Active Vector Solution</div>

              {BACKENDS.map((option) => (
                <button
                  key={option.id}
                  role="menuitemradio"
                  aria-checked={backend === option.id}
                  className="backend-option"
                  onClick={() => handleSelectBackend(option.id)}
                  disabled={switching}
                >
                  <span>
                    <span className="backend-option-title">{option.label}</span>
                    <span className="backend-option-hint" style={{ display: 'block' }}>
                      {option.hint}
                    </span>
                  </span>
                  {backend === option.id && <Check size={14} aria-hidden="true" />}
                </button>
              ))}

              {switchError && (
                <div className="banner is-error" style={{ marginTop: '0.25rem' }}>
                  <AlertCircle size={15} aria-hidden="true" />
                  <span className="banner-body">{switchError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="status-badge"
          title={isOnline ? 'Gateway & Agent Online' : 'Gateway Offline'}
        >
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          <span className="status-badge-text">{isOnline ? 'Ready' : 'Offline'}</span>
        </div>

        <button className="btn-icon" onClick={onRefreshHealth} title="Refresh backend health" aria-label="Refresh backend health">
          <RefreshCw size={16} aria-hidden="true" />
        </button>

        <button
          className="btn-icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>

        {isAuthenticated && user && (
          <div className="user-profile">
            {user.picture ? (
              <img src={user.picture} alt="" className="user-avatar" />
            ) : (
              <div
                className="user-avatar"
                aria-hidden="true"
                style={{
                  background: 'var(--accent-blue)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '0.75rem',
                }}
              >
                {(user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <span className="user-email" title={user.email}>{user.name || user.email}</span>
            <button
              className="btn-icon"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              style={{ width: '28px', height: '28px' }}
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
