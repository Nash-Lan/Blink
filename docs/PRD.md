# Blink PRD

Blink is a private personal productivity app.

Core flows:

- Capture notes quickly from any main tab.
- Create deadlines with date and time. If no time is chosen, the app defaults to 23:59 local time.
- Show Today as a quiet focus screen with only overdue and due-today incomplete deadlines.
- Manage notes with search, tags parsed from `#tags`, delete, and Visual AI badges.
- Manage deadlines grouped by overdue, today, future, and completed.
- Save local data before any AI work starts.
- Keep the app usable without DeepSeek configuration.

Phase 1 scope:

- Expo + TypeScript + Expo Router.
- Three bottom tabs: Today, Notes, Deadlines.
- Shared quick-create sheet with draft recovery.
- Notes and deadlines CRUD baseline.
- Web IndexedDB persistence.
- Native SQLite adapter scaffold.
- Mock Visual AI icon and Mermaid classification.
- JSON backup and restore with Zod validation.

Out of scope for Phase 1:

- Real DeepSeek API calls.
- iPhone notification verification.
- Photo, OCR, account, multi-user, billing, or cloud sync.
