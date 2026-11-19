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

/** Beta build (`VITE_CHANNEL=beta`), deployed to `<base>/beta/` next to the stable app. */
const beta = process.env.VITE_CHANNEL === 'beta';

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
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: beta ? 'RemCraft Beta' : 'RemCraft',
          short_name: beta ? 'RemCraft β' : 'RemCraft',
          // Separate app identity, so both can be installed side by side.
          id: beta ? 'remcraft-beta' : 'remcraft',
          description: 'Notes and spaced-repetition flashcards',
          theme_color: '#1f2030',
          background_color: '#1f2030',
          display: 'standalone',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // Full-bleed artwork: also usable as a maskable (Android) icon.
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Opens the app at the habit when a reminder notification is tapped.
          importScripts: ['sw-notifications.js'],
          // Only app routes fall back to index.html; files such as the skill
          // download (remcraft-flashcards.zip) must come from the network.
          // The stable app's service worker also covers `beta/` (same origin,
          // parent scope): never answer beta navigations with the stable app.
          navigateFallbackDenylist: [
            /\/[^/?]+\.[a-z0-9]+(\?.*)?$/i,
            ...(beta ? [] : [/\/beta(\/|$)/]),
          ],
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
