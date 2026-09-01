import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  FileText,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  ExternalLink,
  Shield,
  Key,
  Link2,
} from 'lucide-react';
import { browseDriveFolders, syncDriveFolder } from '../services/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '537728611405-cgtolhfqij6fj514dbkjfv8atiqr4f6b.apps.googleusercontent.com';

function extractFolderId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  // Check if it's a full URL like https://drive.google.com/drive/folders/1ABCxyz...
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}

export default function DriveBrowserModal({ isOpen, onClose, onSyncComplete }) {
  const [activeTab, setActiveTab] = useState('url'); // 'url' or 'browse'
  const [directInput, setDirectInput] = useState('');
  const [currentParentId, setCurrentParentId] = useState('root');
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);
  const [folders, setFolders] = useState([]);
  const [supportedFiles, setSupportedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [driveToken, setDriveToken] = useState(() => sessionStorage.getItem('gdrive_access_token') || '');
  const [needsAuth, setNeedsAuth] = useState(false);

  const requestDriveAccessToken = () => {
    try {
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        alert('Google Identity Services script is loading. Please try again in a few seconds.');
        return;
      }

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            const token = tokenResponse.access_token;
            setDriveToken(token);
            sessionStorage.setItem('gdrive_access_token', token);
            setNeedsAuth(false);
            setError(null);
            loadFolder('root', token);
          } else if (tokenResponse && tokenResponse.error) {
            setError(`Authorization error: ${tokenResponse.error_description || tokenResponse.error}`);
          }
        },
      });

      client.requestAccessToken();
    } catch (err) {
      setError(`Failed to initiate Google OAuth: ${err.message}`);
    }
  };

  const loadFolder = async (folderId, tokenToUse = null) => {
    const activeToken = tokenToUse !== null ? tokenToUse : driveToken;

    // Without a Drive token the gateway falls back to its own service account,
    // whose Drive is empty - the browser then shows a successful listing of
    // zero folders and zero files, which reads as "your Drive is empty" rather
    // than "you have not granted access yet". Ask for consent instead.
    if (!activeToken) {
      setNeedsAuth(true);
      setFolders([]);
      setSupportedFiles([]);
      setCurrentParentId(folderId);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSyncResult(null);
      const data = await browseDriveFolders(folderId, activeToken);
      setFolders(data.folders || []);
      setSupportedFiles(data.supported_files || []);
      setCurrentParentId(folderId);
      setNeedsAuth(false);
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.includes('403') || errMsg.includes('scope') || errMsg.includes('permission') || errMsg.includes('authenticate')) {
        setNeedsAuth(true);
      }
      setError(errMsg || 'Failed to load Google Drive folder.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'browse') {
      loadFolder(currentParentId);
    }
  }, [isOpen, activeTab]);

  const handleOpenFolder = (folder) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadFolder(folder.id);
  };

  const handleBreadcrumbClick = (index) => {
    const target = breadcrumbs[index];
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    loadFolder(target.id);
  };

  // Syncing without a Drive token is worse than browsing without one: the
  // gateway would list the service account's empty Drive and then purge the
  // folder's documents as "removed from Drive".
  const requireDriveToken = () => {
    if (driveToken) return true;
    setNeedsAuth(true);
    setError('Grant Google Drive access before vectorizing a folder.');
    return false;
  };

  const handleSyncCurrentFolder = async () => {
    if (!requireDriveToken()) return;
    const currentFolder = breadcrumbs[breadcrumbs.length - 1];
    try {
      setSyncing(true);
      setError(null);
      setSyncResult(null);
      const res = await syncDriveFolder({
        folderId: currentFolder.id,
        folderName: currentFolder.name,
        driveToken,
      });
      setSyncResult(res);
      if (onSyncComplete) {
        onSyncComplete(res);
      }
    } catch (err) {
      setError(err.message || 'Failed to vectorize Google Drive folder.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDirectSync = async (e) => {
    e?.preventDefault();
    const folderId = extractFolderId(directInput);
    if (!folderId) {
      setError('Please enter a valid Google Drive Folder ID or URL.');
      return;
    }
    if (!requireDriveToken()) return;

    try {
      setSyncing(true);
      setError(null);
      setSyncResult(null);
      const res = await syncDriveFolder({
        folderId: folderId,
        folderName: 'Google Drive Folder',
        driveToken,
      });
      setSyncResult(res);
      if (onSyncComplete) {
        onSyncComplete(res);
      }
    } catch (err) {
      setError(err.message || 'Failed to vectorize Google Drive folder.');
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name || 'My Drive';
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        className="panel-card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          padding: 0,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-app)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HardDrive size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Google Drive Folder Vectorizer</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Index all documents in a Google Drive folder and keep them synchronized
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.6rem 1.5rem',
            backgroundColor: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <button
            className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
            onClick={() => setActiveTab('url')}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
          >
            <Link2 size={14} />
            <span>Enter Folder Link / ID</span>
          </button>

          <button
            className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
          >
            <Folder size={14} />
            <span>Visual Folder Browser</span>
          </button>
        </div>

        {/* Tab 1: Direct Folder URL / ID Mode */}
        {activeTab === 'url' && (
          <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                Google Drive Folder Link or Folder ID
              </label>
              <form onSubmit={handleDirectSync} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder="https://drive.google.com/drive/folders/1ABCxyz... or 1ABCxyz..."
                  value={directInput}
                  onChange={(e) => setDirectInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={syncing || !directInput.trim()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {syncing ? (
                    <>
                      <div className="spinner" style={{ width: '16px', height: '16px' }} />
                      <span>Vectorizing...</span>
                    </>
                  ) : (
                    <>
                      <FolderPlus size={16} />
                      <span>Vectorize Folder</span>
                    </>
                  )}
                </button>
              </form>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Paste the URL of any folder you have access to, or share the folder with your service account.
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
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {syncResult && (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: 'var(--accent-emerald)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  <CheckCircle2 size={16} />
                  <span>Folder Vectorized Successfully!</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Indexed <strong>{syncResult.vectorized_documents?.length || 0}</strong> file(s) ({syncResult.total_chunks_indexed || 0} vector chunks).{' '}
                  {syncResult.purged_documents?.length > 0 && (
                    <span style={{ color: 'var(--accent-amber)' }}>
                      Purged {syncResult.purged_documents.length} deleted file(s).
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Visual Browser Mode */}
        {activeTab === 'browse' && (
          <>
            {/* Breadcrumb Navigation Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.75rem 1.5rem',
                borderBottom: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                fontSize: '0.85rem',
                overflowX: 'auto',
              }}
            >
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id || idx}>
                  {idx > 0 && <ChevronRight size={14} color="var(--text-muted)" />}
                  <button
                    onClick={() => handleBreadcrumbClick(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: idx === breadcrumbs.length - 1 ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                    }}
                  >
                    {idx === 0 && <Home size={13} />}
                    <span>{crumb.name}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Search & Folder Contents Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Drive Authorization Banner */}
              {needsAuth && (
                <div
                  style={{
                    padding: '1.25rem',
                    backgroundColor: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Key size={24} color="var(--accent-blue)" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                        Google Drive Permission Required
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Grant read-only access to browse folders, or use the "Enter Folder Link / ID" tab above.
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={requestDriveAccessToken}
                    style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem' }}
                  >
                    <Shield size={15} />
                    <span>Grant Drive Access</span>
                  </button>
                </div>
              )}

              {error && !needsAuth && (
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
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {syncResult && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: 'var(--accent-emerald)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    <CheckCircle2 size={16} />
                    <span>Folder "{syncResult.folder_name}" Synchronized!</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Indexed <strong>{syncResult.vectorized_documents?.length || 0}</strong> file(s) ({syncResult.total_chunks_indexed || 0} vector chunks).{' '}
                    {syncResult.purged_documents?.length > 0 && (
                      <span style={{ color: 'var(--accent-amber)' }}>
                        Purged {syncResult.purged_documents.length} deleted file(s).
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Filter subfolders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ maxWidth: '280px', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {supportedFiles.length} indexable document(s) in this folder
                </div>
              </div>

              {loading ? (
                <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
                  <div className="spinner" style={{ width: '32px', height: '32px' }} />
                </div>
              ) : (
                <>
                  {/* Subfolders Grid */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                      Subfolders ({filteredFolders.length})
                    </div>

                    {filteredFolders.length === 0 ? (
                      <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                        {needsAuth ? 'Please grant Drive access above to list folders, or use the "Enter Folder Link / ID" tab.' : 'No subfolders found.'}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                        {filteredFolders.map((f) => (
                          <div
                            key={f.id}
                            onClick={() => handleOpenFolder(f)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              padding: '0.75rem 0.9rem',
                              backgroundColor: 'var(--bg-app)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                          >
                            <Folder size={18} color="var(--accent-blue)" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Supported Files in current directory */}
                  {supportedFiles.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                        Files to be Vectorized ({supportedFiles.length})
                      </div>
                      <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {supportedFiles.map((sf) => (
                          <div
                            key={sf.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.4rem 0.75rem',
                              backgroundColor: 'var(--bg-app)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.8rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <FileText size={14} color="var(--accent-purple)" />
                              <span>{sf.name}</span>
                            </div>
                            {sf.webViewLink && (
                              <a href={sf.webViewLink} target="_blank" rel="noreferrer" title="Open in Google Drive">
                                <ExternalLink size={12} color="var(--text-muted)" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Action Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-app)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Selected: <strong style={{ color: 'var(--text-primary)' }}>{currentFolderName}</strong>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-icon" onClick={() => loadFolder(currentParentId)} title="Refresh directory" style={{ width: '36px', height: '36px' }}>
                  <RefreshCw size={15} />
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSyncCurrentFolder}
                  disabled={syncing || loading || needsAuth}
                  style={{ padding: '0.6rem 1.25rem' }}
                >
                  {syncing ? (
                    <>
                      <div className="spinner" style={{ width: '16px', height: '16px' }} />
                      <span>Vectorizing Folder...</span>
                    </>
                  ) : (
                    <>
                      <FolderPlus size={16} />
                      <span>Vectorize "{currentFolderName}"</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
