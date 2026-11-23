/**
 * One look for practice priorities everywhere (badge, menus, flashcard home):
 * label, icon and colour per priority, including the exam priority derived
 * from active exams.
 */
import type { ReactNode } from 'react';
import { GraduationCap, Minus, Pause, Repeat, Triangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EffectivePriority } from '@core/model/types';
import { t } from '@core/i18n';

/** Label, icon and colour of a priority. */
export interface PriorityMeta {
  label: string;
  /** Short explanation (menus). */
  hint: string;
  icon: LucideIcon;
  color: string;
  /** Filled icon (triangle of "Currently Studying"). */
  filled?: boolean;
}

/** Priority metadata (RemNote wording). */
export const PRIORITY_META: Record<EffectivePriority, PriorityMeta> = {
  exam: {
    label: t('Exam'),
    hint: t('Part of an active exam: scheduled by the exam plan'),
    icon: GraduationCap,
    color: 'var(--danger)',
  },
  active: {
    label: t('Currently Studying'),
    hint: t('New cards are introduced every day'),
    icon: Triangle,
    color: 'var(--success)',
    filled: true,
  },
  maintaining: {
    label: t('Maintaining'),
    hint: t('Only reviews, no new cards'),
    icon: Repeat,
    color: 'var(--accent)',
  },
  none: {
    label: t('No Priority'),
    hint: t('Practised when time allows'),
    icon: Minus,
    color: 'var(--text-muted)',
  },
  paused: {
    label: t('Paused'),
    hint: t('Not practised at all'),
    icon: Pause,
    color: 'var(--warning, #eab308)',
  },
};

/** Icon of a priority in its colour. */
export function PriorityIcon({
  priority,
  size = 15,
}: {
  priority: EffectivePriority;
  size?: number;
}): ReactNode {
  const m = PRIORITY_META[priority];
  const Icon = m.icon;
  return <Icon size={size} color={m.color} fill={m.filled ? m.color : 'none'} aria-hidden />;
}
