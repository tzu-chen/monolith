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

- **client/src/components/shell/** — the app shell: `Rail.tsx` (full-height icon rail), `SidePanelHost.tsx` (one panel at a time), `EditorPanel.tsx`, `Shell.tsx`, `CommandPalette.tsx` (Mod+P files / Mod+Shift+P projects). There is no global top or bottom bar — the editor and preview each carry their own toolbar and status bar.
- **client/src/components/panels/** — rail panels: Files, Outline, Scope (In-scope), References, Plots, Projects, plus the symbol/snippet drawer content
- **client/src/components/editor/** — CodeMirror 6 editor with LaTeX language mode, snippets, math preview, scope strip, compile-diff and diagnostics gutters, path completion, macro decorations + definition popover
- **client/src/components/preview/** — pdf.js-based PDF viewer with SyncTeX support; `HtmlPreview.tsx` + `PreviewModeToggle.tsx` add the LaTeXML HTML render mode (PDF | HTML toggle)
- **client/src/components/shared/ui.tsx** — shared chrome primitives (bars, panel headers, outlined buttons, pills, badges, rows). Use these rather than restyling inline.
- **client/src/theme/tokens.ts** — type scale, metrics, radii, motion. `colorSchemes.ts` owns colour.
- **client/src/stores/editorStore.ts** — Zustand store managing all editor state (tabs, files, theme, compilation, panels, scope)
- **client/src/hooks/** — React hooks for autosave, compilation, file watching, SyncTeX, scope resolution
- **client/src/lib/api.ts** — HTTP client for backend API calls
- **server/src/index.ts** — Express app setup, routing, SPA fallback
- **server/src/routes/** — API handlers (compile, files, projects, synctex, scope)
- **server/src/services/** — Business logic (tectonic spawning, latexml HTML rendering, chokidar file watcher, synctex parsing, scope resolution)
- **server/src/data/** — static tables: LaTeXML support ratings per package, package→command ownership for shadowing detection
- **server/src/assets/latexml/** — bundled HTML theme assets (`monolith-latexml.css`, `monolith-theme.js`, `knowl.js`) injected into LaTeXML output, plus `monolith-bib.sty.ltxml`, a preloaded LaTeXML binding that fixes bibliography field mappings

## Code Conventions

- TypeScript strict mode in both client and server
- React functional components with hooks
- Zustand for state management (single store pattern)
- Inline styles reading CSS variables for colour; `theme/tokens.ts` for geometry and type
- Express routes are modular, mounted under `/api/`
- WebSocket (ws) for real-time file change broadcasts

## Design language

The UI follows the resolved design handoff (Claude Design project `f80b4d02-8ce3-4916-b0c2-6b4beb0759d6`). One rule governs everything:

**Minimal lines and shapes over solid colour.** Structure is carried by 1px borders, hairline dividers, and a **2px accent edge** on the active item (left edge in lists, bottom edge on tabs) plus an `--accent-wash` background. Solid fills appear only on paper surfaces and 6px status dots — never on a button, a segmented control, or a hover state. Hover steps the border `--line` → `--line-strong` and the text `--text-muted` → `--text`.

Two schemes, "Parchment" (light) and "Graphite" (dark), and switching between them is a **pure token swap** — no layout, weight, radius, or border-width differs between them, so components read colour through CSS variables and never branch on theme. The rendered PDF page is the one exception to theming: it stays a light paper sheet in dark mode because it stands for print.

Type sizes are the handoff's values **plus 5px** (see the comment in `theme/tokens.ts`); bar heights and panel widths are scaled to match. Almost every function is a visible single-click target with its shortcut shown beside it — no hidden menus, and a keyboard shortcut is never the only way in.

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
- **Scope resolution** (`server/src/services/scope.ts`, `GET /api/scope?file=`) walks the transitive `\input`/`\include`/`\usepackage` graph for one file and returns its packages (with LaTeXML support ratings), macros (arity, use count across the project, whether they shadow a package command), environments, include chain and `.bib` keys. It runs server-side because it reads an unbounded set of files. The client holds one resolver — `useScope` in `App` — and everything else invalidates via `invalidateScope()`; re-resolution fires on save and on any watcher event touching a file in the returned `chain`.
- The scope graph also feeds the editor: user macros get the macro colour and a Mod-click target, and `\cite` keys absent from the project's `.bib` files render as broken.
