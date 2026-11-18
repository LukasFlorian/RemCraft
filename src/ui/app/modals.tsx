/**
 * Global modal host for dialogs that can be opened from anywhere (search,
 * import, image occlusion editor, audio recorder, Rem editor during practice).
 */
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { RemId } from '@core/model/types';

/** Modals that can be opened globally. */
export type GlobalModal =
  | { kind: 'search' }
  | { kind: 'replace'; rootId: RemId | null; query?: string }
  | { kind: 'ai-edit'; rootId: RemId }
  | { kind: 'import'; parentId?: RemId | null; source?: string }
  | { kind: 'occlusion'; remId: RemId }
  | { kind: 'recorder'; remId: RemId }
  | { kind: 'move'; remIds: RemId[] }
  | { kind: 'icon'; remId: RemId }
  | { kind: 'exam'; examId?: string; scope?: RemId[] };

interface ModalApi {
  modal: GlobalModal | null;
  open: (m: GlobalModal) => void;
  close: () => void;
}

const ModalContext = createContext<ModalApi | null>(null);

/** Access to the global modal host. */
export function useModals(): ModalApi {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModals outside ModalProvider');
  return ctx;
}

/** Provides the global modal state. Rendering happens in `GlobalModals`. */
export function ModalProvider({ children }: { children: ReactNode }): ReactNode {
  const [modal, setModal] = useState<GlobalModal | null>(null);
  return (
    <ModalContext.Provider value={{ modal, open: setModal, close: () => setModal(null) }}>
      {children}
    </ModalContext.Provider>
  );
}
