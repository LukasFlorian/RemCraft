/**
 * Accessible modal dialog rendered in a portal.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '@core/i18n';

/** Props of {@link Modal}. */
export interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Extra elements in the header (left of the close button). */
  headerExtra?: ReactNode;
}

/** A dialog that closes on Escape and backdrop click. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  headerExtra,
}: ModalProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  // Latest close handler: callers often pass a new function on every render,
  // which must not re-run the mount effect below.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // Focus the first focusable element for keyboard users - once, when the
    // dialog opens. (Doing it on every render took the focus away from an
    // editor inside the dialog after each keystroke.)
    const first = ref.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not(.modal-close)',
    );
    first?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close.current()}
    >
      <div
        ref={ref}
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          {headerExtra}
          <button className="icon-btn modal-close" onClick={onClose} aria-label={t('Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
