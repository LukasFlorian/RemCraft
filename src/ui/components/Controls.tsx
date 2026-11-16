/**
 * Small form and display controls.
 */
import type { ReactNode } from 'react';

/** Toggle switch with label. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }): ReactNode {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
      {label && <span>{label}</span>}
    </label>
  );
}

/** Horizontal progress bar (0..1). */
export function ProgressBar({ value, color }: { value: number; color?: string }): ReactNode {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

/**
 * Labelled form field. By default the wrapper is a `<label>` so the text
 * labels the contained input; use `group` for composite controls (button
 * groups, trees) where a label element would swallow clicks.
 */
export function Field({ label, hint, children, group }: { label: ReactNode; hint?: ReactNode | undefined; children: ReactNode; group?: boolean }): ReactNode {
  const body = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </>
  );
  return group ? (
    <div className="field" role="group">
      {body}
    </div>
  ) : (
    <label className="field">{body}</label>
  );
}

/** Keyboard key label. */
export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return <kbd className="kbd">{children}</kbd>;
}
