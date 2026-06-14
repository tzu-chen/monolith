# CLAUDE.md

## Project Overview

Monolith is a local LaTeX editor web app with live PDF preview. It uses an npm workspaces monorepo with two packages: `client` (React/Vite) and `server` (Express/Node.js). LaTeX compilation is handled by Tectonic, an external binary. An additive **HTML render mode** (LaTeXML, an optional external binary) renders the same `.tex` source to themable web output beside the PDF — see `latexml-integration-guide.md` and `latexml-friendly-packages.md`.

## Commands

```bash
npm install              # Install all dependencies
npm run dev              # Start both client and server (dev mode)
npm run dev:server       # Start server only (port 3005, tsx watch)
npm run dev:client       # Start client only (port 5173, Vite HMR)
npm run build            # Build client for production
npm start                # Build + start production server
```

## Architecture

- **client/src/components/editor/** — CodeMirror 6 editor with LaTeX language mode, snippets, math preview
- **client/src/components/preview/** — pdf.js-based PDF viewer with SyncTeX support; `HtmlPreview.tsx` + `PreviewModeToggle.tsx` add the LaTeXML HTML render mode (PDF | HTML toggle)
- **client/src/stores/editorStore.ts** — Zustand store managing all editor state (tabs, files, theme, compilation)
- **client/src/hooks/** — React hooks for autosave, compilation, file watching, SyncTeX
- **client/src/lib/api.ts** — HTTP client for backend API calls
- **server/src/index.ts** — Express app setup, routing, SPA fallback
- **server/src/routes/** — API handlers (compile, files, projects, synctex)
- **server/src/services/** — Business logic (tectonic spawning, latexml HTML rendering, chokidar file watcher, synctex parsing)
- **server/src/assets/latexml/** — bundled HTML theme assets (`monolith-latexml.css`, `monolith-theme.js`, `knowl.js`) injected into LaTeXML output

## Code Conventions

- TypeScript strict mode in both client and server
- React functional components with hooks
- Zustand for state management (single store pattern)
- CSS Modules + CSS Variables for theming (light/dark)
- Express routes are modular, mounted under `/api/`
- WebSocket (ws) for real-time file change broadcasts

## Key Technical Details

- Tectonic is spawned as a child process for each compilation (`server/src/services/tectonic.ts`)
- PDF is returned as base64 from the compile endpoint
- File watching uses chokidar, changes broadcast via WebSocket to all clients
- SyncTeX parsing is done server-side from Tectonic's .synctex.gz output
- Projects are directories under `PROJECTS_ROOT` (resolved in `server/src/index.ts`). Precedence: explicit `PROJECTS_ROOT` env var → else `$SUITE_DATA_ROOT/monolith/projects` when `SUITE_DATA_ROOT` is set → else the legacy in-repo `./projects/` (byte-for-byte). `SUITE_DATA_ROOT` is the suite-wide data-centralization variable.
- Client dev server proxies `/api`, `/ws`, and `/html` to the backend via Vite config
- HTML render mode spawns `latexmlc` per render (`server/src/services/latexml.ts`), writing HTML5 + assets to a per-project, gitignored `<project>/.monolith/html/` dir (analogous to Tectonic's `build/`). LaTeXML is **optional**: when the binary is missing the service returns `available:false` and the UI shows an install hint — the PDF path is unaffected.
- Generated HTML is served statically at `GET /html/:project/*` (both segments sanitized against path traversal) and shown in an isolated `<iframe>`. The client triggers renders via `POST /api/render-html` (mirrors `/api/compile`); the iframe is cache-busted with a per-render nonce. The app forwards its active color-scheme CSS variables into the iframe via `postMessage` so the HTML preview tracks the editor theme.
- Math diverges across three renderers sharing the same `$…$`: KaTeX (in-editor typing preview), Tectonic (PDF), LaTeXML MathML (HTML).
