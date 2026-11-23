/**
 * Slash-menu commands (data-driven).
 *
 * Each command declares a group (the categories of RemNote's `/` menu), a
 * label, search keywords, an optional shortcut hint and a `run` function.
 * Commands work on the focused Rem through the services, so the same command
 * list also powers toolbars and context menus.
 */
import type { LucideIcon } from 'lucide-react';
import {
  AlignLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpToLine,
  Ban,
  Bold,
  Brackets,
  Calendar,
  CheckSquare,
  ChevronsDownUp,
  Clock,
  Code,
  Copy,
  Eraser,
  EyeOff,
  FileText,
  FileUp,
  Folder,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image,
  Indent,
  Italic,
  Keyboard,
  LayoutTemplate,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Outdent,
  PanelTop,
  Pencil,
  Quote,
  RotateCcw,
  Search,
  Sigma,
  Sparkles,
  SquareStack,
  Strikethrough,
  Table,
  Tag,
  Trash2,
  Underline,
  Video,
  ZoomIn,
  Lightbulb,
  Spline,
  Info,
  Mic,
  Square,
} from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import type { RemCraftApp } from '@data/app';
import { generateCards } from '@core/cards/generate';
import type {
  AnswerMode,
  CardDirection,
  HighlightColor,
  Rem,
  RemId,
  RemKind,
} from '@core/model/types';
import { HIGHLIGHT_COLORS } from '@core/model/types';
import { rt } from '@core/richtext/ops';
import { isoDate, DAY } from '@core/util/time';
import { insertInline, toggleMark } from './BlockEditor';
import type { EditorController } from './controller';
import { deleteRems, indent, outdent, toggleCollapsed } from './actions';
import { schema } from './schema';
import { t as tr } from '@core/i18n';

/** Services available to commands. */
export interface CommandContext {
  app: RemCraftApp;
  controller: EditorController;
  instance: string;
  remId: RemId;
  /** The ProseMirror view of the focused Rem, if any. */
  view: EditorView | null;
  navigate: (path: string) => void;
  prompt: (title: string, initial?: string) => Promise<string | null>;
  pickFile: (accept: string) => Promise<File | null>;
  toast: (message: string) => void;
  /** Opens the image-occlusion editor for a Rem. */
  openOcclusion: (remId: RemId) => void;
  /** Opens the audio recorder for a Rem. */
  openRecorder: (remId: RemId) => void;
}

/** A slash command. */
export interface SlashCommand {
  id: string;
  group: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
  hint?: string;
  /** Hidden unless this returns true. */
  available?: (ctx: CommandContext, rem: Rem) => boolean;
  run: (ctx: CommandContext, rem: Rem) => void | Promise<void>;
}

/** Category order of the slash menu (mirrors RemNote). */
export const COMMAND_GROUPS = [
  tr('Insert Flashcard'),
  tr('Flashcard Configuration'),
  'Headings & Highlights',
  tr('Text Style & Formatting'),
  'Image & Drawing',
  'References, Tags & Portals',
  'Date & Time',
  'Code, Math & Quote',
  'Tables, Divider, Columns',
  tr('Upload File or Link Source'),
  tr('Record Audio/Video'),
  tr('Hierarchy'),
  'AI Tools',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Turns the Rem into a flashcard of the given type. Multi-line types get
 * empty answer children so the user can start typing immediately.
 */
function setCard(
  ctx: CommandContext,
  rem: Rem,
  kind: RemKind,
  direction: CardDirection,
  answerMode: AnswerMode,
): void {
  const { app } = ctx;
  app.store.transact((tx) => {
    tx.update('rems', rem.id, { kind, direction, answerMode, back: rem.back ?? [] });
    if (answerMode !== 'inline' && app.store.children(rem.id).length === 0) {
      const count = answerMode === 'mc' ? 3 : 2;
      let after: RemId | null = null;
      for (let i = 0; i < count; i++) {
        const child: Rem = app.rems.createIn(
          tx,
          { parentId: rem.id, afterId: after },
          answerMode === 'mc' ? { mcCorrect: i === 0 } : {},
        );
        after = child.id;
      }
    }
  });
  const first = app.store.children(rem.id)[0];
  if (answerMode !== 'inline' && first) ctx.controller.focus(ctx.instance, first.id, 'start');
  else ctx.controller.focus(ctx.instance, rem.id, 'end');
}

/** Toggles a boolean powerup. */
function toggle(
  ctx: CommandContext,
  rem: Rem,
  key:
    | 'typeInAnswer'
    | 'extraCardDetail'
    | 'hideContextInQueue'
    | 'quote'
    | 'editLater'
    | 'pinned'
    | 'isTemplate'
    | 'tableView'
    | 'isProperty'
    | 'isDocument',
): void {
  ctx.app.rems.update(rem.id, { [key]: rem[key] ? undefined : true });
}

/** Inserts text that triggers an autocomplete popup. */
function insertTrigger(ctx: CommandContext, trigger: string): void {
  const view = ctx.view;
  if (!view) return;
  view.dispatch(view.state.tr.insertText(trigger));
  view.focus();
}

/** Inserts a reference to a daily document. */
function insertDate(ctx: CommandContext, offsetDays: number | string): void {
  const date = typeof offsetDays === 'string' ? offsetDays : isoDate(Date.now() + offsetDays * DAY);
  const id = ctx.app.rems.ensureDaily(date);
  if (ctx.view) insertInline(ctx.view, schema.nodes.ref!.create({ remId: id }));
}

/** Applies a mark to the selection of the focused editor. */
function mark(
  ctx: CommandContext,
  name: keyof typeof schema.marks,
  attrs?: Record<string, unknown>,
): void {
  if (ctx.view) {
    toggleMark(ctx.view, name, attrs);
    ctx.view.focus();
  }
}

/** True when the Rem produces at least one flashcard. */
function hasCards(ctx: CommandContext, rem: Rem): boolean {
  return generateCards(rem, ctx.app.store.children(rem.id)).length > 0;
}

/** Display names of highlight colours. */
const COLOR_NAMES: Record<HighlightColor, string> = {
  red: 'Red',
  orange: tr('Orange'),
  yellow: tr('Yellow'),
  green: tr('Green'),
  blue: tr('Blue'),
  purple: tr('Purple'),
};

// ---------------------------------------------------------------------------
// The command list
// ---------------------------------------------------------------------------

/** All slash commands. */
export const COMMANDS: SlashCommand[] = [
  // Insert Flashcard
  {
    id: 'card-basic',
    group: tr('Insert Flashcard'),
    label: tr('Single-Line Card'),
    icon: SquareStack,
    hint: '==',
    keywords: 'basic forward front back',
    run: (c, r) => setCard(c, r, 'plain', 'forward', 'inline'),
  },
  {
    id: 'card-multiline',
    group: tr('Insert Flashcard'),
    label: tr('Multi-Line Flashcard'),
    icon: AlignLeft,
    hint: '>>>',
    keywords: 'set multiline',
    run: (c, r) => setCard(c, r, 'plain', 'forward', 'set'),
  },
  {
    id: 'card-mc',
    group: tr('Insert Flashcard'),
    label: tr('Multiple-Choice Flashcard'),
    icon: ListChecks,
    hint: '>>A)',
    keywords: 'mc choice quiz',
    run: (c, r) => setCard(c, r, 'plain', 'forward', 'mc'),
  },
  {
    id: 'card-list',
    group: tr('Insert Flashcard'),
    label: tr('List-Answer Flashcard'),
    icon: ListOrdered,
    hint: '>>1.',
    keywords: 'list ordered sequence',
    run: (c, r) => setCard(c, r, 'plain', 'forward', 'list'),
  },
  {
    id: 'card-cloze',
    group: tr('Insert Flashcard'),
    label: tr('Cloze Flashcard'),
    icon: Brackets,
    hint: '{{',
    keywords: 'cloze deletion fill blank',
    run: (c) => mark(c, 'cloze'),
  },
  {
    id: 'card-occlusion',
    group: tr('Insert Flashcard'),
    label: tr('Image Occlusion Flashcard'),
    icon: Image,
    keywords: 'image occlusion mask',
    run: async (c, r) => {
      if (!r.image) {
        const file = await c.pickFile('image/*');
        if (!file) return;
        const src = await c.app.files.save(file, file.name);
        c.app.rems.update(r.id, { image: { src } });
      }
      c.openOcclusion(r.id);
    },
  },
  {
    id: 'card-concept',
    group: tr('Insert Flashcard'),
    label: tr('Concept Flashcard'),
    icon: Lightbulb,
    hint: '::',
    keywords: 'concept definition term',
    run: (c, r) => setCard(c, r, 'concept', 'both', 'inline'),
  },
  {
    id: 'card-descriptor',
    group: tr('Insert Flashcard'),
    label: tr('Descriptor Flashcard'),
    icon: Spline,
    hint: ';;',
    keywords: 'descriptor attribute property',
    run: (c, r) => setCard(c, r, 'descriptor', 'forward', 'inline'),
  },

  // Flashcard Configuration
  {
    id: 'dir-forward',
    group: tr('Flashcard Configuration'),
    label: tr('Practice forward'),
    icon: ArrowRight,
    available: (_c, r) => r.direction !== 'none',
    run: (c, r) => c.app.rems.update(r.id, { direction: 'forward' }),
  },
  {
    id: 'dir-backward',
    group: tr('Flashcard Configuration'),
    label: tr('Practice backward'),
    icon: ArrowLeftRight,
    available: (_c, r) => r.direction !== 'none' && r.answerMode !== 'mc',
    run: (c, r) => c.app.rems.update(r.id, { direction: 'backward' }),
  },
  {
    id: 'dir-both',
    group: tr('Flashcard Configuration'),
    label: tr('Practice both directions'),
    icon: ArrowLeftRight,
    available: (_c, r) => r.direction !== 'none' && r.answerMode !== 'mc',
    run: (c, r) => c.app.rems.update(r.id, { direction: 'both' }),
  },
  {
    id: 'dir-disabled',
    group: tr('Flashcard Configuration'),
    label: tr('Disable flashcard'),
    icon: Ban,
    available: (_c, r) => r.direction !== 'none',
    run: (c, r) => c.app.rems.update(r.id, { direction: 'disabled' }),
  },
  {
    id: 'card-remove',
    group: tr('Flashcard Configuration'),
    label: tr('Remove flashcard'),
    icon: Eraser,
    available: (_c, r) => r.direction !== 'none',
    run: (c, r) =>
      c.app.rems.update(r.id, {
        direction: 'none',
        kind: 'plain',
        answerMode: 'inline',
        back: null,
        text: [
          ...r.text,
          ...(r.back?.length ? [{ type: 'text' as const, text: ' ' }, ...r.back] : []),
        ],
      }),
  },
  {
    id: 'type-in',
    group: tr('Flashcard Configuration'),
    label: tr('Type in Answer'),
    icon: Keyboard,
    hint: '/tia',
    keywords: 'tia type answer input',
    run: (c, r) => toggle(c, r, 'typeInAnswer'),
  },
  {
    id: 'extra-detail',
    group: tr('Flashcard Configuration'),
    label: tr('Extra Card Detail'),
    icon: Info,
    hint: '/ecd',
    keywords: 'ecd extra detail back',
    run: (c, r) => toggle(c, r, 'extraCardDetail'),
  },
  {
    id: 'hide-context',
    group: tr('Flashcard Configuration'),
    label: tr('Hide context in queue'),
    icon: EyeOff,
    keywords: 'hide ancestors breadcrumb',
    run: (c, r) => toggle(c, r, 'hideContextInQueue'),
  },
  {
    id: 'mc-correct',
    group: tr('Flashcard Configuration'),
    label: tr('Toggle correct answer'),
    icon: CheckSquare,
    hint: '/mcr',
    keywords: 'mcr mcw correct wrong option',
    available: (c, r) => c.app.store.get(r.parentId ?? '')?.answerMode === 'mc',
    run: (c, r) => {
      // Make explicit flags for all options so "first is correct" no longer applies implicitly.
      const siblings = c.app.store.children(r.parentId!);
      const anyMarked = siblings.some((s) => s.mcCorrect !== undefined);
      c.app.rems.updateMany(
        siblings.map((s) => s.id),
        (s) => {
          const implicit = anyMarked ? s.mcCorrect === true : s.id === siblings[0]?.id;
          return { mcCorrect: s.id === r.id ? !implicit : implicit };
        },
      );
    },
  },
  {
    id: 'practice-rem',
    group: tr('Flashcard Configuration'),
    label: tr('Practice this Rem'),
    icon: SquareStack,
    available: hasCards,
    run: (c, r) => c.navigate(`/practice?scope=${r.id}&mode=all-in-order`),
  },
  {
    id: 'reset-cards',
    group: tr('Flashcard Configuration'),
    label: tr('Reset flashcard progress'),
    icon: RotateCcw,
    available: hasCards,
    run: (c, r) => {
      c.app.practice.reset(generateCards(r, c.app.store.children(r.id)).map((s) => s.id));
      c.toast(tr('Card progress reset'));
    },
  },

  // Headings & Highlights
  {
    id: 'h1',
    group: 'Headings & Highlights',
    label: tr('Heading 1'),
    icon: Heading1,
    hint: '#',
    keywords: 'title h1',
    run: (c, r) => c.app.rems.update(r.id, { heading: r.heading === 1 ? undefined : 1 }),
  },
  {
    id: 'h2',
    group: 'Headings & Highlights',
    label: tr('Heading 2'),
    icon: Heading2,
    hint: '##',
    keywords: 'h2',
    run: (c, r) => c.app.rems.update(r.id, { heading: r.heading === 2 ? undefined : 2 }),
  },
  {
    id: 'h3',
    group: 'Headings & Highlights',
    label: tr('Heading 3'),
    icon: Heading3,
    hint: '###',
    keywords: 'h3',
    run: (c, r) => c.app.rems.update(r.id, { heading: r.heading === 3 ? undefined : 3 }),
  },
  ...HIGHLIGHT_COLORS.map((color): SlashCommand => ({
    id: `hl-${color}`,
    group: 'Headings & Highlights',
    label: tr('{0} highlight', { '0': COLOR_NAMES[color] }),
    icon: Highlighter,
    keywords: `highlight color ${color}`,
    run: (c, r) => {
      if (c.view && !c.view.state.selection.empty) mark(c, 'highlight', { color });
      else c.app.rems.update(r.id, { highlight: r.highlight === color ? undefined : color });
    },
  })),
  {
    id: 'hl-none',
    group: 'Headings & Highlights',
    label: tr('Remove highlight'),
    icon: Eraser,
    available: (_c, r) => Boolean(r.highlight),
    run: (c, r) => c.app.rems.update(r.id, { highlight: undefined }),
  },

  // Text Style & Formatting
  {
    id: 'bold',
    group: tr('Text Style & Formatting'),
    label: tr('Bold'),
    icon: Bold,
    hint: '⌘B',
    run: (c) => mark(c, 'bold'),
  },
  {
    id: 'italic',
    group: tr('Text Style & Formatting'),
    label: tr('Italic'),
    icon: Italic,
    hint: '⌘I',
    run: (c) => mark(c, 'italic'),
  },
  {
    id: 'underline',
    group: tr('Text Style & Formatting'),
    label: tr('Underline'),
    icon: Underline,
    hint: '⌘U',
    run: (c) => mark(c, 'underline'),
  },
  {
    id: 'strike',
    group: tr('Text Style & Formatting'),
    label: tr('Strikethrough'),
    icon: Strikethrough,
    hint: '⌘⇧S',
    run: (c) => mark(c, 'strike'),
  },
  {
    id: 'inline-code',
    group: tr('Text Style & Formatting'),
    label: tr('Inline code'),
    icon: Code,
    hint: '`',
    run: (c) => mark(c, 'code'),
  },
  {
    id: 'link',
    group: tr('Text Style & Formatting'),
    label: tr('Link'),
    icon: Link2,
    keywords: 'url hyperlink',
    run: async (c) => {
      const href = await c.prompt(tr('Link URL'), 'https://');
      if (href && c.view) mark(c, 'link', { href });
    },
  },

  // Image & Drawing
  {
    id: 'image-upload',
    group: 'Image & Drawing',
    label: tr('Upload image'),
    icon: Image,
    keywords: 'picture photo',
    run: async (c, r) => {
      const file = await c.pickFile('image/*');
      if (!file) return;
      const src = await c.app.files.save(file, file.name);
      c.app.rems.update(r.id, { image: { src } });
    },
  },
  {
    id: 'image-url',
    group: 'Image & Drawing',
    label: tr('Image from URL'),
    icon: Image,
    run: async (c, r) => {
      const src = await c.prompt(tr('Image URL'), 'https://');
      if (src) c.app.rems.update(r.id, { image: { src } });
    },
  },
  {
    id: 'occlusion-edit',
    group: 'Image & Drawing',
    label: tr('Edit image occlusion'),
    icon: Square,
    available: (_c, r) => Boolean(r.image),
    run: (c, r) => c.openOcclusion(r.id),
  },
  {
    id: 'image-remove',
    group: 'Image & Drawing',
    label: tr('Remove image'),
    icon: Trash2,
    available: (_c, r) => Boolean(r.image),
    run: (c, r) => c.app.rems.update(r.id, { image: undefined }),
  },

  // References, Tags & Portals
  {
    id: 'reference',
    group: 'References, Tags & Portals',
    label: tr('Reference'),
    icon: Link2,
    hint: '[[',
    keywords: 'link rem',
    run: (c) => insertTrigger(c, '[['),
  },
  {
    id: 'tag',
    group: 'References, Tags & Portals',
    label: tr('Tag'),
    icon: Tag,
    hint: '#',
    run: (c) => insertTrigger(c, ' #'),
  },
  {
    id: 'portal',
    group: 'References, Tags & Portals',
    label: tr('Portal'),
    icon: PanelTop,
    hint: '((',
    keywords: 'embed transclusion',
    run: (c) => insertTrigger(c, '(('),
  },
  {
    id: 'search-portal',
    group: 'References, Tags & Portals',
    label: tr('Search Portal'),
    icon: Search,
    keywords: 'query search results',
    run: async (c, r) => {
      const q = await c.prompt(
        tr('Search query (e.g. "#Book is:unfinished")'),
        r.searchQuery ?? '',
      );
      if (q !== null) c.app.rems.update(r.id, { searchQuery: q || undefined });
    },
  },
  {
    id: 'alias',
    group: 'References, Tags & Portals',
    label: tr('Add Alias'),
    icon: Hash,
    keywords: 'alternative name synonym',
    run: async (c, r) => {
      const alias = await c.prompt(tr('Alias'));
      if (alias?.trim()) c.app.rems.update(r.id, { aliases: [...r.aliases, alias.trim()] });
    },
  },
  {
    id: 'template',
    group: 'References, Tags & Portals',
    label: tr('Toggle Template'),
    icon: LayoutTemplate,
    keywords: 'template',
    run: (c, r) => toggle(c, r, 'isTemplate'),
  },
  {
    id: 'insert-template',
    group: 'References, Tags & Portals',
    label: tr('Insert Template…'),
    icon: LayoutTemplate,
    keywords: 'apply template',
    run: async (c, r) => {
      const templates = c.app.store.all('rems').filter((x) => x.isTemplate);
      if (templates.length === 0) {
        c.toast(tr('No templates yet - mark a Rem as template first.'));
        return;
      }
      const name = await c.prompt(
        `Template name (${templates.map((t) => c.app.rems.title(t.id)).join(', ')})`,
      );
      const tpl = templates.find(
        (t) => c.app.rems.title(t.id).toLowerCase() === name?.trim().toLowerCase(),
      );
      if (tpl) c.app.rems.applyTemplate(tpl.id, r.id);
      else if (name) c.toast(tr('Template not found'));
    },
  },
  {
    id: 'property',
    group: 'References, Tags & Portals',
    label: tr('Toggle Property'),
    icon: Tag,
    keywords: 'slot column field',
    run: (c, r) => toggle(c, r, 'isProperty'),
  },

  // Date & Time
  {
    id: 'date-today',
    group: 'Date & Time',
    label: tr('Today'),
    icon: Calendar,
    keywords: 'date daily',
    run: (c) => insertDate(c, 0),
  },
  {
    id: 'date-tomorrow',
    group: 'Date & Time',
    label: tr('Tomorrow'),
    icon: Calendar,
    run: (c) => insertDate(c, 1),
  },
  {
    id: 'date-yesterday',
    group: 'Date & Time',
    label: tr('Yesterday'),
    icon: Calendar,
    run: (c) => insertDate(c, -1),
  },
  {
    id: 'date-pick',
    group: 'Date & Time',
    label: tr('Pick a date…'),
    icon: Calendar,
    run: async (c) => {
      const date = await c.prompt('Date (YYYY-MM-DD)', isoDate(Date.now()));
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) insertDate(c, date);
    },
  },
  {
    id: 'time-now',
    group: 'Date & Time',
    label: tr('Current time'),
    icon: Clock,
    run: (c) =>
      c.view?.dispatch(
        c.view.state.tr.insertText(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ),
      ),
  },

  // Code, Math & Quote
  {
    id: 'code-block',
    group: 'Code, Math & Quote',
    label: tr('Code block'),
    icon: Code,
    hint: '```',
    keywords: 'source program',
    run: (c, r) =>
      c.app.rems.update(r.id, {
        code: r.code ? undefined : { language: '' },
        back: null,
        direction: 'none',
      }),
  },
  {
    id: 'latex-inline',
    group: 'Code, Math & Quote',
    label: tr('Inline LaTeX'),
    icon: Sigma,
    hint: '$x$',
    keywords: 'math formula katex',
    run: async (c) => {
      const source = await c.prompt('LaTeX');
      if (source && c.view) insertInline(c.view, schema.nodes.latex!.create({ source }));
    },
  },
  {
    id: 'latex-block',
    group: 'Code, Math & Quote',
    label: tr('LaTeX block'),
    icon: Sigma,
    hint: '$$',
    keywords: 'math formula display equation',
    run: (c, r) =>
      c.app.rems.update(r.id, {
        latexBlock: r.latexBlock ? undefined : true,
        text: r.latexBlock ? r.text : [{ type: 'latex', source: '' }],
        back: null,
        direction: 'none',
      }),
  },
  {
    id: 'quote',
    group: 'Code, Math & Quote',
    label: tr('Quote'),
    icon: Quote,
    hint: '>',
    run: (c, r) => toggle(c, r, 'quote'),
  },

  // Tables, Divider, Columns
  {
    id: 'table',
    group: 'Tables, Divider, Columns',
    label: tr('Table (Rems tagged with this)'),
    icon: Table,
    keywords: 'table grid properties',
    run: (c, r) => toggle(c, r, 'tableView'),
  },
  {
    id: 'divider',
    group: 'Tables, Divider, Columns',
    label: tr('Divider'),
    icon: Minus,
    hint: '---',
    keywords: 'line separator hr',
    run: (c, r) => c.app.rems.update(r.id, { divider: true }),
  },

  // Upload File or Link Source
  {
    id: 'file-upload',
    group: tr('Upload File or Link Source'),
    label: tr('Upload file / PDF'),
    icon: FileUp,
    keywords: 'pdf attachment document',
    run: async (c, r) => {
      const file = await c.pickFile('*/*');
      if (!file) return;
      const src = await c.app.files.save(file, file.name);
      c.app.rems.update(r.id, {
        file: { src, name: file.name, mimeType: file.type, size: file.size },
        ...(r.text.length === 0 ? { text: rt(file.name) } : {}),
      });
    },
  },
  {
    id: 'embed',
    group: tr('Upload File or Link Source'),
    label: tr('Embed video / audio / website'),
    icon: Video,
    keywords: 'youtube vimeo iframe url link source',
    run: async (c, r) => {
      const url = await c.prompt(tr('URL to embed'), 'https://');
      if (url) c.app.rems.update(r.id, { embed: { url } });
    },
  },

  // Record Audio/Video
  {
    id: 'record-audio',
    group: tr('Record Audio/Video'),
    label: tr('Record audio'),
    icon: Mic,
    keywords: 'voice microphone',
    run: (c, r) => c.openRecorder(r.id),
  },

  // Hierarchy
  {
    id: 'todo',
    group: tr('Hierarchy'),
    label: tr('Todo'),
    icon: CheckSquare,
    hint: '[]',
    keywords: 'task checkbox',
    run: (c, r) => c.app.rems.update(r.id, { todo: r.todo ? undefined : 'unfinished' }),
  },
  {
    id: 'make-document',
    group: tr('Hierarchy'),
    label: tr('Toggle document'),
    icon: FileText,
    keywords: 'page doc',
    run: (c, r) => toggle(c, r, 'isDocument'),
  },
  {
    id: 'make-folder',
    group: tr('Hierarchy'),
    label: tr('Toggle folder'),
    icon: Folder,
    run: (c, r) =>
      c.app.rems.update(r.id, {
        isFolder: r.isFolder ? undefined : true,
        isDocument: true,
      } as Partial<Rem>),
  },
  {
    id: 'indent',
    group: tr('Hierarchy'),
    label: tr('Indent'),
    icon: Indent,
    hint: 'Tab',
    run: (c, r) =>
      indent({ app: c.app, controller: c.controller, instance: c.instance }, [r.id], 'end'),
  },
  {
    id: 'outdent',
    group: tr('Hierarchy'),
    label: tr('Outdent'),
    icon: Outdent,
    hint: '⇧Tab',
    run: (c, r) =>
      outdent({ app: c.app, controller: c.controller, instance: c.instance }, [r.id], 'end'),
  },
  {
    id: 'move-up',
    group: tr('Hierarchy'),
    label: tr('Move up'),
    icon: ArrowUpToLine,
    hint: '⌘⇧↑',
    run: (c, r) => void c.app.rems.moveUp(r.id),
  },
  {
    id: 'move-down',
    group: tr('Hierarchy'),
    label: tr('Move down'),
    icon: ArrowDownToLine,
    hint: '⌘⇧↓',
    run: (c, r) => void c.app.rems.moveDown(r.id),
  },
  {
    id: 'collapse',
    group: tr('Hierarchy'),
    label: tr('Collapse / expand'),
    icon: ChevronsDownUp,
    hint: '⌘↑/↓',
    run: (c, r) =>
      toggleCollapsed({ app: c.app, controller: c.controller, instance: c.instance }, r.id),
  },
  {
    id: 'zoom',
    group: tr('Hierarchy'),
    label: tr('Zoom in'),
    icon: ZoomIn,
    keywords: 'open focus',
    run: (c, r) => c.navigate(`/rem/${r.id}`),
  },
  {
    id: 'duplicate',
    group: tr('Hierarchy'),
    label: tr('Duplicate'),
    icon: Copy,
    hint: '⌘⇧D',
    run: (c, r) => void c.app.rems.duplicate(r.id),
  },
  {
    id: 'edit-later',
    group: tr('Hierarchy'),
    label: tr('Edit later'),
    icon: Pencil,
    keywords: 'review todo later',
    run: (c, r) => toggle(c, r, 'editLater'),
  },
  {
    id: 'pin',
    group: tr('Hierarchy'),
    label: tr('Pin to sidebar'),
    icon: List,
    run: (c, r) => toggle(c, r, 'pinned'),
  },
  {
    id: 'delete',
    group: tr('Hierarchy'),
    label: tr('Delete'),
    icon: Trash2,
    hint: '⌘⇧⌫',
    run: (c, r) =>
      deleteRems({ app: c.app, controller: c.controller, instance: c.instance }, [r.id]),
  },

  // AI Tools
  {
    id: 'ai',
    group: 'AI Tools',
    label: tr('AI tools (configure in Settings → AI)'),
    icon: Sparkles,
    keywords: 'ai gpt generate',
    run: (c) => c.navigate('/settings/ai'),
  },
];

/**
 * Filters commands by a query (label, keywords, hint and group).
 */
export function filterCommands(ctx: CommandContext, rem: Rem, query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  const available = COMMANDS.filter((c) => !c.available || c.available(ctx, rem));
  if (!q) return available;
  const scored = available
    .map((c) => {
      const label = c.label.toLowerCase();
      const hay = `${label} ${c.keywords ?? ''} ${c.hint ?? ''} ${c.group.toLowerCase()} ${c.id}`;
      let score = -1;
      if (label.startsWith(q)) score = 3;
      else if (label.split(/\s+/).some((w) => w.startsWith(q))) score = 2;
      else if (hay.includes(q)) score = 1;
      else if (`/${c.hint ?? ''}`.includes(q)) score = 1;
      return { c, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.c);
}
