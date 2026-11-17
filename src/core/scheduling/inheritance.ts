/**
 * Resolution of inherited flashcard settings (priority, scheduler, exams).
 *
 * Priorities and schedulers are set on documents/folders and apply to every
 * descendant unless a closer Rem overrides them. Exams add the derived *exam*
 * priority to every card inside their scope; exam wins against every other
 * priority except *paused* (RemNote semantics).
 */
import type { RemGraph } from '../model/graph';
import type { EffectivePriority, Exam, Priority, RemId, Timestamp } from '../model/types';

/** Settings inherited by a Rem from itself and its ancestors. */
export interface InheritedInfo {
  /** Priority after applying exams. */
  priority: EffectivePriority;
  /** Nearest explicitly set priority (or `none`). */
  explicitPriority: Priority;
  /** Nearest explicitly assigned scheduler id, if any. */
  schedulerId: string | undefined;
  /** Active exams whose scope contains this Rem. */
  examIds: readonly string[];
}

/** An exam counts until its date has passed and it is not archived. */
export function isExamActive(exam: Exam, now: Timestamp): boolean {
  return !exam.archived && exam.date > now;
}

/**
 * Computes {@link InheritedInfo} for every Rem with one top-down traversal
 * (O(number of Rems)).
 *
 * @param graph Rem graph.
 * @param exams All exams (inactive ones are ignored).
 * @param now Current time (decides which exams are active).
 */
export function resolveInheritance(
  graph: RemGraph,
  exams: readonly Exam[],
  now: Timestamp,
): Map<RemId, InheritedInfo> {
  // Index active exam scopes: rem id -> exam ids rooted there.
  const scopeRoots = new Map<RemId, string[]>();
  for (const exam of exams) {
    if (!isExamActive(exam, now)) continue;
    for (const id of exam.scope) scopeRoots.set(id, [...(scopeRoots.get(id) ?? []), exam.id]);
  }

  const result = new Map<RemId, InheritedInfo>();
  type Frame = {
    id: RemId;
    priority: Priority;
    schedulerId: string | undefined;
    examIds: readonly string[];
  };
  const stack: Frame[] = graph.children(null).map((r) => ({
    id: r.id,
    priority: 'none' as Priority,
    schedulerId: undefined,
    examIds: [] as readonly string[],
  }));
  // Reverse so that traversal happens in document order (not required, but deterministic).
  stack.reverse();

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (result.has(frame.id)) continue; // cycle guard
    const rem = graph.get(frame.id);
    if (!rem) continue;
    const priority = rem.priority ?? frame.priority;
    const schedulerId = rem.schedulerId ?? frame.schedulerId;
    const roots = scopeRoots.get(rem.id);
    const examIds = roots
      ? [...frame.examIds, ...roots.filter((e) => !frame.examIds.includes(e))]
      : frame.examIds;
    const effective: EffectivePriority =
      priority === 'paused' ? 'paused' : examIds.length > 0 ? 'exam' : priority;
    result.set(rem.id, { priority: effective, explicitPriority: priority, schedulerId, examIds });
    const children = graph.children(rem.id);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ id: children[i]!.id, priority, schedulerId, examIds });
    }
  }
  return result;
}
