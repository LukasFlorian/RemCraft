/**
 * React bindings for the data layer: the app context and store hooks.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { RemCraftApp } from '@data/app';
import type { Store } from '@data/store/store';
import type { Rem, RemId } from '@core/model/types';

/** Context holding the running app. */
export const AppContext = createContext<RemCraftApp | null>(null);

/** Returns the running app (throws outside the provider). */
export function useApp(): RemCraftApp {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used inside <AppContext.Provider>');
  return app;
}

/** Returns the store. */
export function useStore(): Store {
  return useApp().store;
}

/**
 * Subscribes to a derived value of the store. The component re-renders only
 * when the selector's result changes (`Object.is`), so selectors should
 * return memoised or primitive values.
 *
 * @param selector Pure function of the store.
 */
export function useSelector<T>(selector: (store: Store) => T): T {
  const store = useStore();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const lastRef = useRef<T | undefined>(undefined);
  // Results that are shallowly equal to the previous one keep their identity,
  // so selectors may return fresh arrays/objects without causing re-render loops.
  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store);
    if (lastRef.current !== undefined && shallowEqual(lastRef.current, next))
      return lastRef.current;
    lastRef.current = next;
    return next;
  }, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Shallow equality for primitives, arrays and plain objects. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

/** Subscribes to one Rem (re-renders only when that record changes). */
export function useRem(id: RemId | null | undefined): Rem | undefined {
  return useSelector((s) => (id ? s.get(id) : undefined));
}

/** Subscribes to the ordered children of a Rem. */
export function useChildren(id: RemId | null): readonly Rem[] {
  return useSelector((s) => s.children(id));
}

/**
 * Current time, refreshed periodically (default every 30 s) so that
 * time-dependent views (due counts, exams) stay current.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Account / sync state of the app. */
export function useAccount(): ReturnType<RemCraftApp['getAccount']> {
  const app = useApp();
  return useSyncExternalStore(app.subscribeAccount, app.getAccount, app.getAccount);
}
