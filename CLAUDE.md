# CLAUDE.md

## Project Overview

Monolith is a local LaTeX editor web app with live PDF preview. It uses an npm workspaces monorepo with two packages: `client` (React/Vite) and `server` (Express/Node.js). LaTeX compilation is handled by Tectonic, an external binary.

## Commands

```bash
npm install              # Install all dependencies
npm run dev              # Start both client and server (dev mode)
npm run dev:server       # Start server only (port 3001, tsx watch)
npm run dev:client       # Start client only (port 5173, Vite HMR)
npm run build            # Build client for production
npm start                # Build + start production server
```

## Architecture

- **client/src/components/editor/** — CodeMirror 6 editor with LaTeX language mode, snippets, math preview
- **client/src/components/preview/** — pdf.js-based PDF viewer with SyncTeX support
- **client/src/stores/editorStore.ts** — Zustand store managing all editor state (tabs, files, theme, compilation)
- **client/src/hooks/** — React hooks for autosave, compilation, file watching, SyncTeX
- **client/src/lib/api.ts** — HTTP client for backend API calls
- **server/src/index.ts** — Express app setup, routing, SPA fallback
- **server/src/routes/** — API handlers (compile, files, projects, synctex)
- **server/src/services/** — Business logic (tectonic spawning, chokidar file watcher, synctex parsing)

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
- Projects are directories under `PROJECTS_ROOT` (default `./projects/`)
- Client dev server proxies `/api` and `/ws` to the backend via Vite config
