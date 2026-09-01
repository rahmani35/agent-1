import React, { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * A dialog shell with the semantics a fixed-position div does not get for free:
 * role/aria-modal, Escape to close, a focus trap, focus restored to whatever
 * opened it, and a scroll lock so the page does not slide around underneath.
 *
 * `dismissable` gates both Escape and the backdrop, so a modal doing
 * destructive or long-running work cannot be closed out from under the user.
 */
export default function Modal({
  isOpen,
  onClose,
  labelledBy,
  panelClassName = '',
  dismissable = true,
  children,
}) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement;
    document.body.classList.add('is-modal-open');

    // Move focus into the dialog so the keyboard starts inside it.
    const focusTimer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector(FOCUSABLE);
      (first || panelRef.current)?.focus();
    }, 0);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
        return;
      }

      if (e.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.classList.remove('is-modal-open');
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, requestClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`panel-card ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
