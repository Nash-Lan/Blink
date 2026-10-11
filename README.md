# Blink

Blink is a private, local-first Expo app for quickly capturing notes and deadlines. The current v0.1.0 release focuses on reliable local capture, web persistence, and a safe Visual AI prototype.

## Current Features

- Create, edit, delete, search, and persist notes.
- Create, edit, complete, undo completion, delete, and group deadlines.
- Today screen for overdue and due-today incomplete deadlines.
- Draft recovery while composing a new note or deadline.
- JSON backup and restore with Zod validation.
- Web persistence through IndexedDB and a native SQLite adapter boundary.
- Visual AI job pipeline with mock mode, local DeepSeek proxy mode, retries, cache, stale-result protection, semantic icons, and safe Mermaid diagrams.
- Web Mermaid rendering with view, zoom, edit, preview, save, regenerate, hide, refresh, and offline support.

## Development Stage

Blink is at v0.1.0. The app is usable for Expo Web development and automated tests. Native iOS behavior is structured but not fully verified on a device yet.

## Tech Stack

- Expo SDK 57, React Native 0.86, React 19, Expo Router.
- TypeScript, Zod, Vitest, Playwright.
- IndexedDB on web through `idb`.
- `expo-sqlite` for native persistence.
- `expo-secure-store` as the planned native key-storage boundary.
- Mermaid for web graph rendering.

## Windows Setup

```powershell
npm install
npm run web
```

Open the Expo web URL shown in the terminal. Web records are stored in IndexedDB.

Useful commands:

```powershell
npm run lint
npm run typecheck
npm test
npx expo-doctor
npm run test:e2e
```

The Playwright suite starts its own Expo web server on `127.0.0.1:8170`. If that port is already in use, tests fail fast instead of reusing or killing another development server. Test teardown closes only the process tree started by the current test run.

## DeepSeek Local Proxy

Mock AI works without any API key. For real DeepSeek testing on Expo Web, keep the key outside browser code and run the local proxy from a separate PowerShell:

```powershell
$env:DEEPSEEK_API_KEY = "your-key"
npm run proxy:deepseek
```

The proxy reads `process.env.DEEPSEEK_API_KEY` at startup, binds to `127.0.0.1`, checks allowed browser origins, and forwards requests to DeepSeek. It does not print the key. Do not commit real keys, put keys in `.env`, store keys in browser storage, or expose keys to frontend bundles.

In Blink Settings, turn off Mock AI mode, enable Visual AI, accept the privacy notice, and keep the proxy URL as `http://127.0.0.1:8787/v1/analyze-icon` unless you changed the proxy port.

## Known Limitations

- iOS native SQLite persistence still needs device verification.
- Native DeepSeek key entry UI is not implemented yet.
- Native Mermaid rendering is a placeholder pending Expo DOM Components or WebView validation.
- Reminder scheduling, rate limits, usage logs, and accessibility/reduced-motion passes are still planned.
- This repository does not declare a project license yet.

## Roadmap

Near-term work is tracked in `docs/ROADMAP.md`. The most important next steps are native iOS persistence verification, secure native key entry, reminder scheduling, and native Mermaid rendering validation.

## License

No project license has been selected yet. Do not assume reuse rights until a license is explicitly added.
