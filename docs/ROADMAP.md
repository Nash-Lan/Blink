# Roadmap

## Phase 1 - Runnable Base

- [x] Create Expo TypeScript app.
- [x] Add Expo Router tabs.
- [x] Add Today, Notes, and Deadlines screens.
- [x] Add shared quick-create sheet.
- [x] Add local persistence adapter.
- [x] Add basic search, tags, draft recovery.
- [x] Add JSON backup and restore.
- [x] Add Mock Visual AI schema and jobs.
- [ ] Verify iOS native SQLite on device.
- [ ] Add richer edit/detail screens.

## Phase 2 - Visual AI

- [x] Add local DeepSeek proxy.
- [x] Add separate Web and future iOS AI request adapters.
- [x] Implement JSON Output request and Zod validation for semantic icons.
- [x] Add pending job retry, cache, and stale response protection.
- [x] Add AI graph decision for icon vs Mermaid.
- [x] Render safe Mermaid diagrams on web with edit, preview, save, regenerate, hide, zoom, refresh, and offline support.
- [ ] Store native API keys with secure storage UI.
- [ ] Add rate limits and usage logs.
- [ ] Complete and device-test native Mermaid rendering with Expo DOM Components or WebView.

## Phase 3 - Completeness

- [ ] Reminder scheduling abstraction.
- [x] Undo UI for completed deadlines.
- [x] Add automated tests for save, Visual AI, Mermaid validation, editing, stale results, refresh, and offline behavior.
- [ ] Accessibility and reduced-motion pass on devices.

## Phase 4 - Extensions

- [ ] Chart visual schema renderer.
- [ ] Restricted math expression renderer.
- [ ] Record linking and richer content blocks.
