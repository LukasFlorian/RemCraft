/**
 * Bottom toolbar while editing (like RemNote's): flashcard types, heading,
 * todo, image, table, all commands and undo. Especially useful on touch
 * devices without a keyboard.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CheckSquare,
  Heading,
  Image,
  Layers,
  MoreHorizontal,
  Table,
  Undo2,
  IndentIncrease,
  IndentDecrease,
} from 'lucide-react';
import { useApp } from '../app/context';
import { Menu } from '../components/Menu';
import type { MenuEntry } from '../components/Menu';
import { COMMAND_GROUPS, COMMANDS } from './commands';
import { useController, useControllerState } from './controller';
import { useCommandContextFactory } from './useCommandContext';

/** The editing toolbar (visible while a Rem is focused). */
export function EditToolbar(): ReactNode {
  const app = useApp();
  const controller = useController();
  const focus = useControllerState((s) => s.focus);
  const makeCtx = useCommandContextFactory();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; entries: MenuEntry[] } | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  if (!focus) return null;
  const rem = app.store.get(focus.remId);
  if (!rem) return null;

  /** Runs a command by id on the focused Rem. */
  const run = (id: string): void => {
    const cmd = COMMANDS.find((c) => c.id === id);
    const current = app.store.get(focus.remId);
    if (cmd && current) void cmd.run(makeCtx(focus.remId, focus.instance), current);
  };
  /** Menu entries of all commands in some groups. */
  const entries = (groups: readonly string[]): MenuEntry[] => {
    const ctx = makeCtx(focus.remId, focus.instance);
    const out: MenuEntry[] = [];
    for (const g of groups) {
      const cmds = COMMANDS.filter((c) => c.group === g && (!c.available || c.available(ctx, rem)));
      if (cmds.length === 0) continue;
      out.push({ heading: g });
      for (const c of cmds)
        out.push({
          label: c.label,
          icon: <c.icon size={15} />,
          ...(c.hint ? { hint: c.hint } : {}),
          onSelect: () => run(c.id),
        });
    }
    return out;
  };

  const button = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    ref?: React.RefObject<HTMLButtonElement | null>,
  ): ReactNode => (
    <button ref={ref} onMouseDown={(e) => e.preventDefault()} onClick={onClick} aria-label={label}>
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="edit-toolbar" role="toolbar" aria-label="Editing tools">
      {button(
        'Flashcard',
        <Layers size={17} />,
        () =>
          setMenu({
            anchor: cardRef.current!,
            entries: entries(['Insert Flashcard', 'Flashcard Configuration']),
          }),
        cardRef,
      )}
      {button('Heading', <Heading size={17} />, () =>
        app.rems.update(rem.id, {
          heading:
            rem.heading === 1 ? 2 : rem.heading === 2 ? 3 : rem.heading === 3 ? undefined : 1,
        }),
      )}
      {button('Todo', <CheckSquare size={17} />, () => run('todo'))}
      {button('Image', <Image size={17} />, () => run('image-upload'))}
      {button('Table', <Table size={17} />, () => run('table'))}
      {button('Indent', <IndentIncrease size={17} />, () => run('indent'))}
      {button('Outdent', <IndentDecrease size={17} />, () => run('outdent'))}
      {button(
        'More',
        <MoreHorizontal size={17} />,
        () => setMenu({ anchor: moreRef.current!, entries: entries(COMMAND_GROUPS) }),
        moreRef,
      )}
      {button('Undo', <Undo2 size={17} />, () => {
        app.store.undo();
        controller.focus(focus.instance, focus.remId, 'end');
      })}
      {menu && <Menu anchor={menu.anchor} entries={menu.entries} onClose={() => setMenu(null)} />}
    </div>
  );
}
