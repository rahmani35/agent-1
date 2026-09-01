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
import Modal from './Modal';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '537728611405-cgtolhfqij6fj514dbkjfv8atiqr4f6b.apps.googleusercontent.com';

function extractFolderId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  // Check if it's a full URL like https://drive.google.com/drive/folders/1ABCxyz...
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}

function SyncResultBanner({ result, title }) {
  return (
    <div className="banner is-success">
      <CheckCircle2 size={16} aria-hidden="true" />
      <div className="banner-body">
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="banner-detail">
          Indexed <strong>{result.vectorized_documents?.length || 0}</strong> file(s)
          {' '}({result.total_chunks_indexed || 0} vector chunks).{' '}
          {result.purged_documents?.length > 0 && (
            <span className="banner-warn">
              Purged {result.purged_documents.length} deleted file(s).
            </span>
          )}
        </div>
      </div>
    </div>
  );
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
        setError('Google sign-in is still loading. Wait a moment and try again.');
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

  const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name || 'My Drive';
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      // A stray click outside the panel mid-vectorize used to discard the sync
      // result the user was waiting on.
      dismissable={!syncing}
      labelledBy="drive-modal-title"
      panelClassName="modal-panel"
    >
      <div className="modal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <div className="modal-icon">
            <HardDrive size={18} aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 id="drive-modal-title" className="modal-title">Google Drive Folder Vectorizer</h3>
            <div className="modal-subtitle">
              Index all documents in a Google Drive folder and keep them synchronized
            </div>
          </div>
        </div>
        <button
          className="btn-icon"
          onClick={onClose}
          disabled={syncing}
          title="Close"
          aria-label="Close"
        >
          <X size={18} aria-hidden="true" />
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
          <Link2 size={14} aria-hidden="true" />
          <span>Enter Folder Link / ID</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => setActiveTab('browse')}
          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
        >
          <Folder size={14} aria-hidden="true" />
          <span>Visual Folder Browser</span>
        </button>
      </div>

      {/* Tab 1: Direct Folder URL / ID Mode */}
      {activeTab === 'url' && (
        <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
          <div>
            <label htmlFor="drive-folder-input" style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
              Google Drive Folder Link or Folder ID
            </label>
            <form onSubmit={handleDirectSync} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="drive-folder-input"
                type="text"
                className="chat-input"
                placeholder="https://drive.google.com/drive/folders/1ABCxyz... or 1ABCxyz..."
                value={directInput}
                onChange={(e) => setDirectInput(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="submit" className="btn-primary" disabled={syncing || !directInput.trim()}>
                {syncing ? (
                  <>
                    <div className="spinner" style={{ width: '16px', height: '16px' }} />
                    <span>Vectorizing...</span>
                  </>
                ) : (
                  <>
                    <FolderPlus size={16} aria-hidden="true" />
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
            <div className="banner is-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span className="banner-body">{error}</span>
            </div>
          )}

          {syncResult && <SyncResultBanner result={syncResult} title="Folder vectorized" />}
        </div>
      )}

      {/* Tab 2: Visual Browser Mode */}
      {activeTab === 'browse' && (
        <>
          {/* Breadcrumb Navigation Bar */}
          <nav
            aria-label="Folder path"
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
                {idx > 0 && <ChevronRight size={14} color="var(--text-muted)" aria-hidden="true" />}
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  aria-current={idx === breadcrumbs.length - 1 ? 'location' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    whiteSpace: 'nowrap',
                    color: idx === breadcrumbs.length - 1 ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                  }}
                >
                  {idx === 0 && <Home size={13} aria-hidden="true" />}
                  <span>{crumb.name}</span>
                </button>
              </React.Fragment>
            ))}
          </nav>

          {/* Search & Folder Contents Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {needsAuth && (
              <div
                style={{
                  padding: '1.25rem',
                  backgroundColor: 'var(--accent-wash)',
                  border: '1px solid var(--accent-edge)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Key size={24} color="var(--accent-blue)" aria-hidden="true" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                      Google Drive permission required
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Grant read-only access to browse folders, or use the "Enter Folder Link / ID" tab above.
                    </div>
                  </div>
                </div>
                <button className="btn-primary" onClick={requestDriveAccessToken}>
                  <Shield size={15} aria-hidden="true" />
                  <span>Grant Drive Access</span>
                </button>
              </div>
            )}

            {error && !needsAuth && (
              <div className="banner is-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span className="banner-body">{error}</span>
              </div>
            )}

            {syncResult && (
              <SyncResultBanner result={syncResult} title={`Folder "${syncResult.folder_name}" synchronized`} />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="chat-input"
                placeholder="Filter subfolders..."
                aria-label="Filter subfolders"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ maxWidth: '280px', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
              />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {supportedFiles.length} indexable document(s) in this folder
              </div>
            </div>

            {loading ? (
              <div className="folder-grid" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="skeleton" style={{ height: '46px', borderRadius: 'var(--radius-sm)' }} />
                ))}
              </div>
            ) : (
              <>
                <div>
                  <div className="section-label">Subfolders ({filteredFolders.length})</div>

                  {filteredFolders.length === 0 ? (
                    <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      {needsAuth
                        ? 'Grant Drive access above to list folders, or use the "Enter Folder Link / ID" tab.'
                        : searchTerm
                          ? `No subfolder matches "${searchTerm}".`
                          : 'No subfolders here.'}
                    </div>
                  ) : (
                    <div className="folder-grid">
                      {filteredFolders.map((f) => (
                        <button
                          type="button"
                          key={f.id}
                          className="folder-tile"
                          onClick={() => handleOpenFolder(f)}
                        >
                          <Folder size={18} color="var(--accent-blue)" aria-hidden="true" style={{ flexShrink: 0 }} />
                          <span className="folder-tile-name">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {supportedFiles.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div className="section-label">Files to be vectorized ({supportedFiles.length})</div>
                    <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {supportedFiles.map((sf) => (
                        <div
                          key={sf.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            padding: '0.4rem 0.75rem',
                            backgroundColor: 'var(--bg-app)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                            <FileText size={14} color="var(--text-muted)" aria-hidden="true" style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.name}</span>
                          </div>
                          {sf.webViewLink && (
                            <a
                              href={sf.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              title="Open in Google Drive"
                              aria-label={`Open ${sf.name} in Google Drive`}
                              style={{ display: 'flex', flexShrink: 0 }}
                            >
                              <ExternalLink size={12} color="var(--text-muted)" aria-hidden="true" />
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
          <div className="modal-footer">
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: 0 }}>
              Selected: <strong style={{ color: 'var(--text-primary)' }}>{currentFolderName}</strong>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn-icon"
                onClick={() => loadFolder(currentParentId)}
                disabled={syncing}
                title="Refresh directory"
                aria-label="Refresh directory"
              >
                <RefreshCw size={15} aria-hidden="true" />
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
                    <span>Vectorizing folder...</span>
                  </>
                ) : (
                  <>
                    <FolderPlus size={16} aria-hidden="true" />
                    <span>Vectorize "{currentFolderName}"</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
