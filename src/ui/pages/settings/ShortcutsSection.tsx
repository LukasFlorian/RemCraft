/**
 * Keyboard shortcut reference.
 */
import type { ReactNode } from 'react';
import { Kbd } from '../../components/Controls';
import { MOD_LABEL } from '../../hooks/useHotkeys';

const M = MOD_LABEL;
const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'Global', items: [[`${M} K`, 'Search'], [`${M} \\`, 'Toggle sidebar'], ['Alt N', 'New document'], ['Alt F', 'Practice flashcards'], [`${M} Z / ${M} ⇧ Z`, 'Undo / redo']] },
  {
    title: 'Editing',
    items: [
      ['Enter', 'New Rem (split)'],
      ['⇧ Enter', 'Line break'],
      ['Tab / ⇧ Tab', 'Indent / outdent'],
      [`${M} ⇧ ↑ / ↓`, 'Move Rem up / down'],
      [`${M} ↑ / ↓`, 'Collapse / expand'],
      [`${M} Enter`, 'Toggle todo'],
      [`${M} B / I / U / E`, 'Bold / italic / underline / code'],
      [`${M} ⇧ S / H / C`, 'Strikethrough / highlight / cloze'],
      [`${M} ⇧ D`, 'Duplicate'],
      ['Esc', 'Select block (then ↑↓, ⇧↑↓, Tab, ⌫, ⌘C)'],
      ['/', 'Command menu'],
      ['[[ · # · ((', 'Reference · tag · portal'],
      ['>> == :: ;; {{', 'Create flashcards (see docs)'],
    ],
  },
  { title: 'Practice', items: [['Space / Enter', 'Show answer · accept suggestion'], ['1 2 3 4', 'Forgot · Partially · With effort · Easily'], ['S', 'Skip'], ['U', 'Undo'], ['E', 'Edit card'], ['Esc', 'Exit']] },
];

/** The shortcut list. */
export function ShortcutsSection(): ReactNode {
  return (
    <div className="col" style={{ gap: 16 }}>
      {GROUPS.map((g) => (
        <div key={g.title} className="card">
          <h2 className="card-title">{g.title}</h2>
          <table className="table compact">
            <tbody>
              {g.items.map(([k, d]) => (
                <tr key={k}>
                  <td style={{ width: 240 }}>
                    <Kbd>{k}</Kbd>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
