/**
 * Global test setup: DOM matchers and an in-memory IndexedDB implementation
 * so persistence adapters can be exercised in Node.
 */
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
