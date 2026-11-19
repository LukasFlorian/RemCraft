# Notes for coding agents

- Language of the UI and of answers to the owner: German (code, comments and docs in English).
- Before committing: `npm run typecheck`, `npx eslint .`, `npx vitest run`, and for UI changes
  `npx playwright test --trace off`.
- **Release notes:** every change users will notice gets a line in `src/ui/whatsnew/releases.ts`.
  One entry per deployment (merge into `main`), not per commit or turn: add items to the top
  entry while it is not on `main` yet (`git show origin/main:src/ui/whatsnew/releases.ts`);
  start a new entry (increasing id, e.g. `2026-11-18a`) only once the top one was deployed.
  Each user sees unseen entries once ("Was ist neu" popup, remembered in their synced settings).
- **Beta channel:** new user-facing features go behind a flag with `status: 'beta'`
  (`src/core/release/features.ts`, guard with `feature('<name>')`); stable and beta are both
  built from `main`. Promote to `stable` (plus release note) only when the owner says so.
  Server changes must stay additive. Details: docs/development.md → "Beta channel".
- Check new UI at phone width (390 px): nothing may overlap (sidebar button, toolbars, bottom bars).
