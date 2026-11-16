/**
 * Icon of a folder or document in lists and trees. Users can pick a custom
 * icon (from a curated icon set or any emoji) and a colour per Rem
 * (`Rem.icon`, `Rem.color`); otherwise folders, slide decks and documents get
 * their default icon.
 */
import type { ReactNode } from 'react';
import {
  Atom,
  BarChart3,
  Beaker,
  Binary,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Code2,
  Cpu,
  Database,
  FileText,
  Flame,
  Folder,
  FolderOpen,
  Globe,
  GraduationCap,
  Heart,
  Landmark,
  Languages,
  Layers,
  Leaf,
  Lightbulb,
  Microscope,
  Music,
  Network,
  Palette,
  PenTool,
  Presentation,
  Rocket,
  Scale,
  Server,
  Shield,
  Sigma,
  Star,
  Target,
  Trophy,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Rem } from '@core/model/types';

/** Selectable icons (name → component). Names are stored on the Rem. */
export const REM_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  'folder-open': FolderOpen,
  file: FileText,
  slides: Presentation,
  book: BookOpen,
  graduation: GraduationCap,
  brain: Brain,
  lightbulb: Lightbulb,
  code: Code2,
  binary: Binary,
  cpu: Cpu,
  server: Server,
  database: Database,
  network: Network,
  globe: Globe,
  chart: BarChart3,
  sigma: Sigma,
  calculator: Calculator,
  atom: Atom,
  beaker: Beaker,
  microscope: Microscope,
  leaf: Leaf,
  scale: Scale,
  landmark: Landmark,
  briefcase: Briefcase,
  languages: Languages,
  palette: Palette,
  pen: PenTool,
  music: Music,
  wrench: Wrench,
  shield: Shield,
  layers: Layers,
  target: Target,
  rocket: Rocket,
  trophy: Trophy,
  star: Star,
  flame: Flame,
  heart: Heart,
};

/** Icon colours (palette key → CSS colour). */
export const REM_COLORS: Record<string, string> = {
  blue: '#5b8cff',
  purple: '#a368ff',
  pink: '#f062a6',
  red: '#ef5350',
  orange: '#f59e3b',
  yellow: '#eab308',
  green: '#3fb37f',
  teal: '#2ec4b6',
  gray: '#8b8fb8',
};

/** Default colour of a Rem's icon. */
function defaultColor(rem: Rem): string {
  if (rem.isFolder) return rem.pinned ? REM_COLORS.purple! : REM_COLORS.blue!;
  return REM_COLORS.gray!;
}

/** True when `icon` is an emoji (anything that is not a known icon name). */
export function isEmojiIcon(icon: string): boolean {
  return !(icon in REM_ICONS);
}

/** The icon of a folder or document. */
export function RemIcon({
  rem,
  size = 15,
  className,
}: {
  rem: Rem;
  size?: number;
  className?: string;
}): ReactNode {
  const color = (rem.color && REM_COLORS[rem.color]) || defaultColor(rem);
  if (rem.icon && isEmojiIcon(rem.icon)) {
    return (
      <span
        className={`rem-emoji${className ? ` ${className}` : ''}`}
        style={{ fontSize: size * 0.95, width: size, height: size }}
        aria-hidden
      >
        {rem.icon}
      </span>
    );
  }
  const Icon =
    (rem.icon && REM_ICONS[rem.icon]) ||
    (rem.isFolder ? Folder : rem.deck ? Presentation : FileText);
  return (
    <Icon
      size={size}
      className={`tree-icon${className ? ` ${className}` : ''}`}
      style={{ color }}
    />
  );
}
