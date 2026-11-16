/**
 * Vite build + Vitest configuration.
 *
 * The app is a static single-page application; `VITE_BASE_PATH` lets the
 * same build run at the domain root (local dev, custom domains) or under a
 * sub-path such as `/RemCraft/` on GitHub Pages project sites.
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Resolves a path relative to the repository root. */
const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@data': r('./src/data'),
      '@ui': r('./src/ui'),
      '@ai': r('./src/ai'),
    },
  },
  plugins: [
    react(),
    // Installable, offline-capable PWA. Disabled in tests to keep them fast.
    mode !== 'test' &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'RemCraft',
          short_name: 'RemCraft',
          description: 'Notes and spaced-repetition flashcards',
          theme_color: '#1f2030',
          background_color: '#1f2030',
          display: 'standalone',
          icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/data/**', 'src/ai/**'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
}));
