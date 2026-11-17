# Notes for coding agents

- Language of the UI and of answers to the owner: German (code, comments and docs in English).
- Before committing: `npm run typecheck`, `npx eslint .`, `npx vitest run`, and for UI changes
  `npx playwright test --trace off`.
- **Release notes:** every change users will notice gets a line in the newest entry of
  `src/ui/whatsnew/releases.ts` (add a new entry at the top for a new deployment; ids increase,
  e.g. `2026-11-18a`). Users see unseen entries once in the "Was ist neu" popup.
- Check new UI at phone width (390 px): nothing may overlap (sidebar button, toolbars, bottom bars).
