import React from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from './Modal';

/**
 * Replaces window.confirm for destructive actions. Deleting a document also
 * destroys its vector embeddings, which is exactly the moment that deserves
 * real UI rather than an unstyleable OS dialog.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      dismissable={!busy}
      labelledBy="confirm-dialog-title"
      panelClassName="confirm-panel"
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <AlertCircle size={20} color="var(--accent-red)" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h3 id="confirm-dialog-title" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            {title}
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {body}
          </p>
        </div>
      </div>

      <div className="confirm-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
          {busy && <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />}
          <span>{confirmLabel}</span>
        </button>
      </div>
    </Modal>
  );
}
