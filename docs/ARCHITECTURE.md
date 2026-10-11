# Architecture

## App Shell

Routes live in `src/app` and use Expo Router:

- `src/app/(tabs)/index.tsx` - Today
- `src/app/(tabs)/notes.tsx` - Notes
- `src/app/(tabs)/deadlines.tsx` - Deadlines
- `src/app/note/[id].tsx` - Note detail and AI graph editing
- `src/app/settings.tsx` - Settings modal

`BlinkProvider` is the application service layer. UI screens call provider methods instead of touching persistence directly.

## Data

Schemas are defined in `src/domain/schema.ts` with Zod. The current data format is version `1`.

Primary records:

- `Note`
- `Deadline`
- `VisualAsset`
- `AIJob`
- `Settings`

## Persistence

The storage adapter boundary is `src/storage/types.ts`.

- Web: `src/storage/index.web.ts` stores the app snapshot in IndexedDB.
- Native: `src/storage/index.native.ts` stores the app snapshot in SQLite.

This keeps business logic independent from the platform database.

## Visual AI

`src/domain/ai.ts` defines the AI response schema and job behavior.

Mock AI uses deterministic local responses:

- Deadlines get compact semantic icons.
- Notes can get icons or a safe Mermaid flowchart sample.
- Results are ignored if the record version changed.
- Failed or invalid Mermaid output is recorded as a failed job.

Phase 2 implementation:

- Local Windows development proxy for DeepSeek. Implemented in `scripts/deepseek-proxy.mjs`; it binds to `127.0.0.1`, enforces allowed origins, and forwards to `https://api.deepseek.com`.
- Web request adapter. Implemented in `src/ai/request.web.ts`; browser code calls only the local proxy and never sees the API key.
- Native request adapter. Implemented in `src/ai/request.native.ts`; future iOS builds read a user API key from `expo-secure-store` and call DeepSeek directly.
- Pending job retry, cache, and stale response protection. Implemented in `BlinkProvider` and `src/domain/ai.ts`.
- Icon vs Mermaid graph decision in a single structured AI response. DDLs only accept icons; process-like notes may receive Mermaid.
- Safe Mermaid validation in `src/domain/ai.ts`. It allows only basic `flowchart`/`graph` syntax, limits source length, nodes, edges, and lines, and blocks links, click callbacks, HTML, scripts, style blocks, and init directives.
- Web Mermaid rendering in `src/components/MermaidRenderer.web.tsx`. It uses Mermaid strict security mode and a safe SVG fallback for browser environments where Mermaid rendering stalls.
- Native Mermaid adapter in `src/components/MermaidRenderer.native.tsx`. It keeps native source display working while the final iOS renderer is evaluated with Expo DOM Components or WebView.

Still planned:

- Secure key storage UI on native.
- Request throttling and usage logs.
- Device-test native Mermaid rendering.
