/**
 * Promise-based confirmation and prompt dialogs.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';

/** Options of a confirmation. */
interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

/** Options of a text prompt. */
interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  confirmLabel?: string;
}

interface DialogApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  prompt: (o: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

/** Access to `confirm()` and `prompt()`. */
export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs outside DialogProvider');
  return ctx;
}

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void };

/** Renders the active dialog. */
export function DialogProvider({ children }: { children: ReactNode }): ReactNode {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ kind: 'confirm', options, resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setText(options.initial ?? '');
        setPending({ kind: 'prompt', options, resolve });
      }),
    [],
  );
  const close = (value: boolean): void => {
    if (!pending) return;
    if (pending.kind === 'confirm') pending.resolve(value);
    else pending.resolve(value ? text : null);
    setPending(null);
  };
  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending && (
        <Modal
          title={pending.options.title}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                className={`btn ${pending.kind === 'confirm' && pending.options.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {pending.options.confirmLabel ?? 'OK'}
              </button>
            </>
          }
        >
          {pending.kind === 'confirm' ? (
            <div className="muted">{pending.options.message}</div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                close(true);
              }}
              className="field"
            >
              {pending.options.label && <label>{pending.options.label}</label>}
              <input
                className="input"
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </form>
          )}
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
