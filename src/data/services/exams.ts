/**
 * Application service for exams.
 */
import { createExam } from '@core/model/factories';
import type { Exam } from '@core/model/types';
import type { Store } from '../store/store';

/** CRUD for exams. */
export class ExamService {
  constructor(private readonly store: Store) {}

  /** Creates an exam. */
  create(partial: Partial<Exam>): Exam {
    return this.store.transact((tx) => tx.put('exams', createExam(partial, this.store.clock.now())));
  }

  /** Updates an exam. */
  update(id: string, patch: Partial<Exam>): void {
    this.store.transact((tx) => void tx.update('exams', id, patch));
  }

  /** Deletes an exam (review history is kept). */
  delete(id: string): void {
    this.store.transact((tx) => tx.delete('exams', id));
  }

  /** Archives (or restores) an exam. */
  archive(id: string, archived = true): void {
    this.update(id, { archived: archived || undefined });
  }
}
