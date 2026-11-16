# ADR 0001: Local-first static single-page app

- Status: accepted
- Date: 2026-11-16

## Context

The app must be free to host, usable on many devices, fast while editing large outlines and
usable offline (e.g. practicing on the train).

## Decision

Build a static SPA (Vite + React + TypeScript) that keeps the whole knowledge base in memory,
persists to IndexedDB and synchronises in the background. Use hash routing so any static host
(GitHub Pages) works without rewrite rules; ship a service worker (PWA) for offline use.

## Consequences

- Free hosting on GitHub Pages/Netlify/Cloudflare; no server code to operate.
- All reads are synchronous; editing never waits for the network.
- Memory usage grows with the knowledge base (fine for typical personal bases of
  10⁴–10⁵ Rems).
- Conflict resolution must be designed explicitly (ADR 0003).
