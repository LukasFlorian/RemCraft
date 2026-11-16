/**
 * Lightweight toast notifications.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

/** Shows a toast. */
export type ToastFn = (message: string, kind?: 'info' | 'error') => void;

const ToastContext = createContext<ToastFn>(() => undefined);

/** Returns the toast function. */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

/** Provides toasts to the tree. */
export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: 'info' | 'error' }[]>(
    [],
  );
  const show = useCallback<ToastFn>((message, kind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === 'error' ? 6000 : 3000,
    );
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
