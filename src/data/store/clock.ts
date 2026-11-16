/**
 * Hybrid logical clock for record timestamps.
 *
 * Synchronisation resolves conflicts with "last writer wins" on `updatedAt`.
 * Device clocks can drift, so the clock never goes backwards and is pushed
 * forward whenever a newer remote timestamp is observed. A local edit made
 * after seeing a remote edit therefore always wins against it.
 */
export class Clock {
  private last = 0;

  /**
   * @param wallClock Source of physical time (injectable for tests).
   */
  constructor(private readonly wallClock: () => number = Date.now) {}

  /** Returns a strictly increasing timestamp (ms). */
  now(): number {
    const t = Math.max(this.wallClock(), this.last + 1);
    this.last = t;
    return t;
  }

  /** Advances the clock past a timestamp seen on another device. */
  observe(timestamp: number): void {
    if (timestamp > this.last) this.last = timestamp;
  }
}
