# Monolith — Project Specification

A local LaTeX editor web app with live PDF preview, powered by CodeMirror 6 and Tectonic.

## Architecture

```
monolith/
├── client/                  # React (Vite) frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── App.tsx
│   │   │   ├── Layout.tsx           # Main split-pane layout shell
│   │   │   ├── editor/
│   │   │   │   ├── EditorPane.tsx   # CodeMirror 6 wrapper
│   │   │   │   ├── latex-lang.ts    # CM6 LaTeX language support
│   │   │   │   └── extensions.ts    # Bracket matching, autocomplete, etc.
│   │   │   ├── preview/
│   │   │   │   ├── PreviewPane.tsx  # PDF.js renderer
│   │   │   │   └── ErrorLog.tsx     # Compilation error display
│   │   │   ├── sidebar/
│   │   │   │   ├── FileTree.tsx     # Project file browser
│   │   │   │   └── Outline.tsx      # Document structure from \section
│   │   │   ├── nav/
│   │   │   │   ├── TopBar.tsx
│   │   │   │   ├── SymbolPalette.tsx
│   │   │   │   ├── SnippetLibrary.tsx
│   │   │   │   └── TemplateGallery.tsx
│   │   │   └── shared/
│   │   │       ├── SplitPane.tsx    # Resizable split pane
│   │   │       └── ThemeToggle.tsx
│   │   ├── hooks/
│   │   │   ├── useCompilation.ts    # Trigger tectonic, poll status
│   │   │   ├── useFileSystem.ts     # CRUD via backend API
│   │   │   ├── useOutline.ts        # Parse \section from source
│   │   │   └── useSyncTeX.ts        # Source <-> PDF position mapping
│   │   ├── stores/
│   │   │   ├── editorStore.ts       # Open files, active tab, dirty state
│   │   │   └── settingsStore.ts     # Theme, keybindings, preferences
│   │   ├── themes/
│   │   │   ├── dark.ts              # CSS variables + CM6 theme
│   │   │   └── light.ts
│   │   └── lib/
│   │       ├── api.ts               # Backend HTTP client
│   │       └── synctex-parser.ts    # Parse .synctex.gz output
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── server/                  # Node/Express backend
│   ├── src/
│   │   ├── index.ts                 # Express app entry
│   │   ├── routes/
│   │   │   ├── files.ts             # GET/PUT/DELETE /api/files/:path
│   │   │   ├── compile.ts           # POST /api/compile
│   │   │   └── synctex.ts           # POST /api/synctex (forward/inverse)
│   │   ├── services/
│   │   │   ├── tectonic.ts          # Spawn tectonic, stream output
│   │   │   ├── watcher.ts           # chokidar file watcher -> WebSocket
│   │   │   └── project.ts           # Project root detection, file listing
│   │   └── ws.ts                    # WebSocket for live reload + file changes
│   ├── package.json
│   └── tsconfig.json
│
├── package.json             # Workspace root (npm workspaces)
└── README.md
```

## Tech Stack

| Layer       | Choice                  | Rationale                                       |
|-------------|-------------------------|-------------------------------------------------|
| Editor      | CodeMirror 6            | Best extension API, tree-sitter-like incremental parsing, lightweight |
| PDF render  | pdf.js                  | Standard, supports text selection + search       |
| Frontend    | React 18 + Vite         | Fast HMR, good CM6 integration                  |
| State       | Zustand                 | Minimal boilerplate, works well for editor state |
| Backend     | Express + TypeScript    | Simple, you only need file I/O + process spawn   |
| Compiler    | Tectonic                | Single binary, auto-downloads packages, generates SyncTeX |
| File watch  | chokidar                | Cross-platform fs.watch wrapper                  |
| Realtime    | ws (WebSocket)          | Push file changes + compilation status to client  |
| Styling     | CSS Modules + CSS vars  | Theme toggle via swapping CSS variables on :root  |

## API Design

### File Operations

```
GET    /api/files?root=/path/to/project    # List project files (tree)
GET    /api/files/:path                     # Read file content
PUT    /api/files/:path                     # Write file content
POST   /api/files/:path                     # Create file/directory
DELETE /api/files/:path                     # Delete file
POST   /api/files/rename                    # { from, to }
```

### Compilation

```
POST   /api/compile
  Body: { root: string, mainFile: string }
  Response: { success: bool, pdf?: base64, log: string, errors: Error[], warnings: Warning[] }
  
  Internally runs: tectonic --synctex --outdir=<root>/build <mainFile>
```

### SyncTeX

```
POST   /api/synctex/forward     # { file, line, col } -> { page, x, y }
POST   /api/synctex/inverse     # { page, x, y } -> { file, line, col }

  Internally runs: synctex view/edit on the .synctex.gz file
  (Tectonic generates this with --synctex flag)
```

### WebSocket Events

```
Server -> Client:
  { type: "file_changed", path: string }           # External edit detected
  { type: "compile_status", status: "running"|"done"|"error" }
  { type: "compile_result", log: string, errors: Error[] }

Client -> Server:
  { type: "watch", root: string }                   # Start watching project
  { type: "compile", root: string, main: string }   # Trigger compilation
```

## Implementation Phases

### Phase 1: Core Editor Loop
Priority: Get text in, PDF out, as fast as possible.

1. **Scaffold**: Vite + React + Express workspace with TypeScript
2. **Editor**: Mount CodeMirror 6 with basic LaTeX highlighting
   - Use `@codemirror/lang-javascript` structure as reference for custom LaTeX mode
   - Highlight: commands (`\cmd`), environments, math delimiters, comments, braces
3. **Backend file routes**: Read/write files from a configurable project root
4. **Tectonic compilation**: POST endpoint that shells out to `tectonic`, returns PDF
5. **PDF preview**: Render returned PDF with pdf.js in the right pane
6. **Split pane**: Resizable divider between editor and preview
7. **Auto-compile on save**: Debounced (800ms after last keystroke, or on Ctrl+S)

### Phase 2: Project Navigation
1. **File tree**: Recursive directory listing, click to open in editor
2. **Tabs**: Multiple open files with dirty-state indicators
3. **Document outline**: Regex-parse `\section`, `\subsection`, etc. from current buffer
4. **File watcher**: chokidar -> WebSocket for external changes

### Phase 3: Editing Features
1. **Auto-close environments**: Typing `\begin{theorem}` + Enter auto-inserts `\end{theorem}`
2. **Bracket matching**: Highlight matching `{}`, `[]`, `$$`
3. **Snippets**: Expandable abbreviations (configurable JSON)
   - `beq` -> `\begin{equation}\n  \n\end{equation}`
   - `bfig` -> full figure environment
   - Custom entries for your notation
4. **Symbol palette**: Searchable grid (persistent panel via top nav)
   - Categories: Greek, operators, arrows, accents, delimiters
   - Click to insert at cursor
5. **Find/replace**: CM6 built-in search with regex toggle

### Phase 4: SyncTeX + Polish
1. **SyncTeX forward**: Ctrl+Click in editor -> highlight position in PDF
2. **SyncTeX inverse**: Double-click in PDF -> jump to source line
3. **Error log panel**: Collapsible bottom panel, parse tectonic stderr
4. **Theme toggle**: Dark/light via CSS variable swap + CM6 theme reconfiguration
5. **Keybindings**: Optional vim mode via `@replit/codemirror-vim`
6. **Status bar**: Line/col, compile status, error/warning count

## Theme System

Both themes share the same CSS variable names, swap values on `:root`:

```css
:root[data-theme="dark"] {
  --bg-primary: #12121c;
  --bg-secondary: #0d0d14;
  --text-primary: #c8c8d8;
  --text-secondary: #6a6a88;
  --accent: #7c6ff0;
  --syntax-command: #5cc8cf;
  --syntax-math: #e8a855;
  --syntax-env: #5ccf8a;
  --syntax-comment: #44445a;
  --syntax-section: #d4c870;
  --paper-bg: #1a1a26;
}

:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f4ef;
  --text-primary: #2c2820;
  --text-secondary: #6b6358;
  --accent: #8b5e3c;
  --syntax-command: #3d6b8e;
  --syntax-math: #7a5a99;
  --syntax-env: #4a8c5e;
  --syntax-comment: #9e9588;
  --syntax-section: #b07830;
  --paper-bg: #fffef9;
}
```

CodeMirror 6 themes are defined as `Extension` objects — create one per theme and reconfigure on toggle.

## Key Dependencies

```json
{
  "client": {
    "@codemirror/state": "^6.x",
    "@codemirror/view": "^6.x",
    "@codemirror/language": "^6.x",
    "@codemirror/autocomplete": "^6.x",
    "@codemirror/search": "^6.x",
    "@codemirror/commands": "^6.x",
    "@lezer/lr": "^1.x",
    "@lezer/highlight": "^1.x",
    "pdfjs-dist": "^4.x",
    "zustand": "^4.x",
    "react": "^18.x",
    "react-dom": "^18.x"
  },
  "server": {
    "express": "^4.x",
    "ws": "^8.x",
    "chokidar": "^3.x",
    "cors": "^2.x"
  }
}
```

## Development Workflow

```bash
# Terminal 1: Frontend dev server
cd client && npm run dev        # Vite on :5173

# Terminal 2: Backend
cd server && npm run dev        # tsx watch on :3001

# Prerequisite: tectonic in PATH
# Install: curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh
```

## Notes for Claude Code

- Start with Phase 1 only. Get the compile loop working before adding features.
- For the LaTeX language mode, start with a simple Lezer grammar or regex-based StreamLanguage. A full Lezer grammar for LaTeX is complex — iterate on it.
- The PDF viewer should use pdf.js's `PDFPageView` for rendering individual pages. Don't try canvas rendering manually.
- Keep the WebSocket simple: one connection, JSON messages, reconnect on drop.
- Tectonic downloads packages on first use, which is slow. Warn the user or show a progress indicator.
- File paths in the API should be relative to project root. Never expose absolute paths to the client.
- For SyncTeX parsing, the `synctex` CLI tool ships with most TeX distributions but NOT with tectonic. You may need to install it separately or parse the .synctex.gz file directly (it's a simple text format when decompressed). This is a Phase 4 concern — skip it initially.
