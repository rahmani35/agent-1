import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HardDrive,
  FileQuestion,
} from 'lucide-react';
import { uploadDocument, fetchDocuments, deleteDocument, searchDocuments } from '../services/api';
import DriveBrowserModal from './DriveBrowserModal';
import ConfirmDialog from './ConfirmDialog';

function SkeletonRows({ count = 3 }) {
  return (
    <div style={{ marginTop: '0.75rem' }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton" style={{ width: `${72 - i * 12}%` }} />
          <div className="skeleton" style={{ width: '70%' }} />
          <div className="skeleton" style={{ width: '55%' }} />
          <div className="skeleton" style={{ width: '16px' }} />
        </div>
      ))}
    </div>
  );
}

export default function DocumentUploadView({ activeBackend }) {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Settings
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(150);

  // Test Search Box
  const [testQuery, setTestQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [searching, setSearching] = useState(false);

  const fileInputRef = useRef(null);

  const loadDocs = async () => {
    try {
      setLoadingDocs(true);
      const res = await fetchDocuments();
      setDocuments(res.documents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [activeBackend]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      setUploadStatus(null);
      const res = await uploadDocument(file, chunkSize, chunkOverlap);
      setUploadStatus({
        type: 'success',
        message: `Indexed "${file.name}" into ${res.chunk_count} vector chunks.`,
      });
      loadDocs();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      setError(null);
      await deleteDocument(pendingDelete.doc_id);
      setPendingDelete(null);
      loadDocs();
    } catch (err) {
      setPendingDelete(null);
      setError(`Could not delete "${pendingDelete.filename}": ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleTestSearch = async (e) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    try {
      setSearching(true);
      setSearchError(null);
      const res = await searchDocuments({ query: testQuery, topK: 3 });
      setSearchResults(res.results || []);
    } catch (err) {
      // Reported in the results pane, where the user is already looking.
      setSearchError(err.message || 'Vector search failed. Check that the store is reachable.');
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="upload-view-container">
      <DriveBrowserModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onSyncComplete={() => {
          loadDocs();
          setUploadStatus({
            type: 'success',
            message: 'Google Drive folder synchronized and vectorized.',
          });
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        busy={deleting}
        title={`Delete "${pendingDelete?.filename}"?`}
        body="This removes the document and every vector embedding generated from it. The agent will no longer be able to cite it. This cannot be undone."
        confirmLabel="Delete document"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Left Column: Upload & Indexed Documents */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="panel-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <h3 className="panel-heading">
              <UploadCloud size={18} aria-hidden="true" color="var(--text-secondary)" />
              <span>Add Documents</span>
            </h3>

            <button type="button" className="btn-secondary" onClick={() => setIsDriveModalOpen(true)}>
              <HardDrive size={15} aria-hidden="true" />
              <span>Browse Google Drive</span>
            </button>
          </div>

          <button
            type="button"
            className={`dropzone ${isDragActive ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleDrop}
            onClick={openFilePicker}
            disabled={uploading}
          >
            <UploadCloud size={32} color="var(--accent-blue)" aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.925rem' }}>
                {uploading ? 'Processing and generating embeddings...' : 'Drop local files here or click to browse'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Supports PDF, Markdown (.md), and TXT files
              </div>
            </div>
            {uploading && <div className="spinner" style={{ width: '24px', height: '24px' }} />}
          </button>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".pdf,.txt,.md,.markdown,.json,.csv"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />

          {/* Chunking Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="chunk-size" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Chunk Size (chars)
              </label>
              <input
                id="chunk-size"
                type="number"
                min={100}
                max={4000}
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="chat-input"
                style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="chunk-overlap" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Chunk Overlap (chars)
              </label>
              <input
                id="chunk-overlap"
                type="number"
                min={0}
                max={Math.max(0, chunkSize - 1)}
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(Number(e.target.value))}
                className="chat-input"
                style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {uploadStatus && (
            <div className="banner is-success" style={{ marginTop: '0.75rem' }}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span className="banner-body">{uploadStatus.message}</span>
            </div>
          )}

          {error && (
            <div className="banner is-error" style={{ marginTop: '0.75rem' }} role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span className="banner-body">{error}</span>
            </div>
          )}
        </div>

        {/* Document List */}
        <div className="panel-card" style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h3 className="panel-heading">
              <FileText size={18} aria-hidden="true" color="var(--text-secondary)" />
              <span>Indexed Documents ({documents.length})</span>
            </h3>
            <button
              className="btn-icon"
              onClick={loadDocs}
              title="Refresh documents"
              aria-label="Refresh documents"
              style={{ width: '30px', height: '30px' }}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </div>

          {loadingDocs ? (
            <SkeletonRows />
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <FileQuestion size={30} className="empty-state-icon" aria-hidden="true" />
              <div className="empty-state-title">No documents indexed yet</div>
              <div style={{ maxWidth: '38ch' }}>
                Add a file and the agent can start answering questions from it with citations.
              </div>
              <div className="empty-state-actions">
                <button type="button" className="btn-primary" onClick={openFilePicker}>
                  <UploadCloud size={15} aria-hidden="true" />
                  <span>Upload a file</span>
                </button>
                <button type="button" className="btn-secondary" onClick={() => setIsDriveModalOpen(true)}>
                  <HardDrive size={15} aria-hidden="true" />
                  <span>Browse Google Drive</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Source</th>
                    <th>Chunks</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const isGDrive = doc.doc_id.startsWith('gdrive_');
                    return (
                      <tr key={doc.doc_id}>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <FileText size={14} aria-hidden="true" color="var(--text-muted)" />
                            <span title={doc.filename}>{doc.filename}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.15rem 0.45rem',
                              backgroundColor: 'var(--bg-app)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 500,
                            }}
                          >
                            {isGDrive && <HardDrive size={10} aria-hidden="true" />}
                            <span>{isGDrive ? 'Google Drive' : 'Upload'}</span>
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '0.15rem 0.45rem',
                              backgroundColor: 'var(--bg-app)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontFamily: 'var(--font-mono)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {doc.chunk_count}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn-icon is-danger"
                            onClick={() => setPendingDelete(doc)}
                            title={`Delete ${doc.filename}`}
                            aria-label={`Delete ${doc.filename}`}
                            style={{ width: '28px', height: '28px', marginLeft: 'auto' }}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Direct Vector Search Sandbox */}
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <h3 className="panel-heading" style={{ marginBottom: '0.5rem' }}>
          <Search size={18} aria-hidden="true" color="var(--text-secondary)" />
          <span>Vector Search Sandbox</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Test cosine similarity retrieval directly against the active vector store.
        </p>

        <form onSubmit={handleTestSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="chat-input"
            placeholder="Enter query to test vector similarity..."
            aria-label="Vector similarity test query"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={searching || !testQuery.trim()}>
            {searching ? <div className="spinner" style={{ width: '16px', height: '16px' }} /> : <Search size={16} aria-hidden="true" />}
            <span>Search</span>
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {searchError ? (
            <div className="banner is-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span className="banner-body">{searchError}</span>
            </div>
          ) : searchResults === null ? (
            <div className="empty-state">
              <Search size={26} className="empty-state-icon" aria-hidden="true" />
              <div className="empty-state-title">No query run yet</div>
              <div style={{ maxWidth: '36ch' }}>
                Search above to preview the chunks the agent would retrieve, and how closely each one matches.
              </div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="empty-state">
              <FileQuestion size={26} className="empty-state-icon" aria-hidden="true" />
              <div className="empty-state-title">No matching chunks</div>
              <div style={{ maxWidth: '36ch' }}>
                Nothing in the store was close enough to this query. Try different wording, or index more documents.
              </div>
            </div>
          ) : (
            searchResults.map((chunk, idx) => {
              const pct = Math.max(0, Math.min(100, Math.round((chunk.score || 0) * 100)));
              return (
                <div key={chunk.id || idx} className="citation-box">
                  <div className="citation-head">
                    <span className="citation-source">
                      {chunk.filename} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>chunk #{chunk.chunk_index}</span>
                    </span>
                    <span className="citation-score">{(chunk.score * 100).toFixed(1)}%</span>
                  </div>
                  <div
                    className="score-track"
                    role="meter"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Similarity score for chunk ${chunk.chunk_index}`}
                  >
                    <div className="score-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="citation-text">{chunk.content}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
