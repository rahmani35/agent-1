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
} from 'lucide-react';
import { uploadDocument, fetchDocuments, deleteDocument, searchDocuments } from '../services/api';
import DriveBrowserModal from './DriveBrowserModal';

export default function DocumentUploadView({ activeBackend }) {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  // Settings
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(150);

  // Test Search Box
  const [testQuery, setTestQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
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
        message: `Indexed "${file.name}" into ${res.chunk_count} vector chunks!`,
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

  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`Delete document "${filename}" and its vector embeddings?`)) return;
    try {
      await deleteDocument(docId);
      loadDocs();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleTestSearch = async (e) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    try {
      setSearching(true);
      const res = await searchDocuments({ query: testQuery, topK: 3 });
      setSearchResults(res.results || []);
    } catch (err) {
      alert(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="upload-view-container">
      {/* Google Drive Visual Browser Modal */}
      <DriveBrowserModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onSyncComplete={() => {
          loadDocs();
          setUploadStatus({
            type: 'success',
            message: 'Google Drive folder synchronized and vectorized successfully!',
          });
        }}
      />

      {/* Left Column: Upload & Indexed Documents */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Upload & Drive Actions Box */}
        <div className="panel-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UploadCloud size={18} color="var(--accent-blue)" />
              <span>Add Documents</span>
            </h3>

            {/* Browse Google Drive Button */}
            <button
              onClick={() => setIsDriveModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: 'var(--accent-blue)',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <HardDrive size={15} />
              <span>Browse Google Drive</span>
            </button>
          </div>

          <div
            className={`dropzone ${isDragActive ? 'drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.txt,.md,.markdown,.json,.csv"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
            <UploadCloud size={32} color="var(--accent-blue)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.925rem' }}>
                {uploading ? 'Processing & Generating Embeddings...' : 'Drop local files here or click to browse'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Supports PDF, Markdown (.md), and TXT files
              </div>
            </div>
            {uploading && <div className="spinner" style={{ width: '24px', height: '24px' }} />}
          </div>

          {/* Chunking Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Chunk Size (chars)
              </label>
              <input
                type="number"
                min={100}
                max={4000}
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="chat-input"
                style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Chunk Overlap (chars)
              </label>
              <input
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
            <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: 'rgba(63, 185, 80, 0.12)', border: '1px solid rgba(63, 185, 80, 0.3)', color: 'var(--accent-green)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={16} />
              <span>{uploadStatus.message}</span>
            </div>
          )}

          {error && (
            <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: 'rgba(248, 81, 73, 0.12)', border: '1px solid rgba(248, 81, 73, 0.3)', color: 'var(--accent-red)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Document List */}
        <div className="panel-card" style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} color="var(--accent-purple)" />
              <span>Indexed Documents ({documents.length})</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '999px',
                  backgroundColor: activeBackend === 'cloudsql' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: activeBackend === 'cloudsql' ? 'var(--accent-blue)' : 'var(--accent-emerald)',
                  border: `1px solid ${activeBackend === 'cloudsql' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                }}
              >
                {activeBackend === 'cloudsql' ? 'PostgreSQL pgvector' : 'Cloud Firestore'}
              </span>
            </h3>
            <button className="btn-icon" onClick={loadDocs} title="Refresh documents" style={{ width: '30px', height: '30px' }}>
              <RefreshCw size={14} />
            </button>
          </div>

          {loadingDocs ? (
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" style={{ width: '28px', height: '28px' }} />
            </div>
          ) : documents.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No documents indexed yet. Upload a local file or browse Google Drive above to start.
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
                            <FileText size={14} color={isGDrive ? 'var(--accent-emerald)' : 'var(--accent-blue)'} />
                            <span title={doc.filename}>{doc.filename}</span>
                          </div>
                        </td>
                        <td>
                          {isGDrive ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.15rem 0.45rem',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                color: 'var(--accent-emerald)',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                              }}
                            >
                              <HardDrive size={10} />
                              <span>Google Drive</span>
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '0.15rem 0.45rem',
                                backgroundColor: 'var(--bg-app)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                              }}
                            >
                              Upload
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ padding: '0.15rem 0.45rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                            {doc.chunk_count}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn-icon"
                            onClick={() => handleDelete(doc.doc_id, doc.filename)}
                            title="Delete document and vector chunks"
                            style={{ width: '28px', height: '28px', color: 'var(--accent-red)', marginLeft: 'auto' }}
                          >
                            <Trash2 size={13} />
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
      <div className="panel-card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Search size={18} color="var(--accent-green)" />
          <span>Vector Search Sandbox</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Directly test cosine similarity retrieval against your active vector database chunks.
        </p>

        <form onSubmit={handleTestSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="chat-input"
            placeholder="Enter query to test vector similarity..."
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={searching || !testQuery.trim()}>
            {searching ? <div className="spinner" style={{ width: '16px', height: '16px' }} /> : <Search size={16} />}
            <span>Search</span>
          </button>
        </form>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {searchResults === null ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Run a test query above to preview vector retrieval chunks and similarity scores.
            </div>
          ) : searchResults.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No matching chunks found for query.
            </div>
          ) : (
            searchResults.map((chunk, idx) => (
              <div key={chunk.id || idx} className="citation-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                    {chunk.filename} (Chunk #{chunk.chunk_index})
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                    Score: {(chunk.score * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {chunk.content}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
