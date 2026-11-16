/**
 * A tiny typed registry: the extension mechanism of RemCraft.
 *
 * Schedulers, importers, integrations and AI providers are registered here
 * instead of being hard-wired in `switch` statements. Adding a feature
 * borrowed from Anki or another app therefore means writing one module that
 * calls `register(...)` - no changes in the code that uses the registry.
 */

/** Something that can be registered. */
export interface Registrable {
  /** Unique, stable id (persisted in user data, never rename). */
  readonly id: string;
  /** Human-readable name for menus. */
  readonly label: string;
}

/** Ordered collection of plugins of one kind. */
export class Registry<T extends Registrable> {
  private readonly items = new Map<string, T>();

  /**
   * @param kind Name of the registry (used in error messages).
   */
  constructor(private readonly kind: string) {}

  /**
   * Registers a plugin.
   *
   * @param item The plugin.
   * @param options `replace` allows overriding an existing id (e.g. in tests).
   * @throws Error when the id is taken and `replace` is not set.
   */
  register(item: T, options: { replace?: boolean } = {}): T {
    if (this.items.has(item.id) && !options.replace) throw new Error(`${this.kind} "${item.id}" is already registered`);
    this.items.set(item.id, item);
    return item;
  }

  /** Returns the plugin with the given id. */
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  /** Returns the plugin or throws. */
  require(id: string): T {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown ${this.kind} "${id}"`);
    return item;
  }

  /** True when an id is registered. */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /** All plugins in registration order. */
  list(): T[] {
    return [...this.items.values()];
  }
}
