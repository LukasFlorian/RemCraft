/**
 * Keyboard shortcut reference.
 */
import type { ReactNode } from 'react';
import { Kbd } from '../../components/Controls';
import { MOD_LABEL } from '../../hooks/useHotkeys';
import { t } from '@core/i18n';

const M = MOD_LABEL;
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: t('Global'),
    items: [
      [`${M} K`, t('Search')],
      [`${M} \\`, t('Toggle sidebar')],
      ['Alt N', t('New document')],
      ['Alt F', t('Practice flashcards')],
      [`${M} Z / ${M} ⇧ Z`, 'Undo / redo'],
    ],
  },
  {
    title: t('Editing'),
    items: [
      ['Enter', t('New Rem (split)')],
      ['⇧ Enter', t('Line break')],
      ['Tab / ⇧ Tab', 'Indent / outdent'],
      [`${M} ⇧ ↑ / ↓`, t('Move Rem up / down')],
      [`${M} ↑ / ↓`, 'Collapse / expand'],
      [`${M} Enter`, t('Toggle todo')],
      [`${M} B / I / U / E`, 'Bold / italic / underline / code'],
      [`${M} ⇧ S / H / C`, 'Strikethrough / highlight / cloze'],
      [`${M} ⇧ D`, t('Duplicate')],
      ['Esc', t('Select block (then ↑↓, ⇧↑↓, Tab, ⌫, ⌘C)')],
      ['/', t('Command menu')],
      ['[[ · # · ((', 'Reference · tag · portal'],
      ['>> == :: ;; {{', t('Create flashcards (see docs)')],
    ],
  },
  {
    title: t('Practice'),
    items: [
      ['Space / Enter', t('Show answer · accept suggestion')],
      ['1 2 3 4', t('Forgot · Partially · With effort · Easily')],
      ['S', t('Skip')],
      ['U', t('Undo')],
      ['E', t('Edit card')],
      ['Esc', t('Exit')],
    ],
  },
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
