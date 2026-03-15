# Monolith

A local LaTeX editor with live PDF preview, built as a full-stack web application. Edit LaTeX documents in a modern code editor and see compiled output instantly.

## Features

- **CodeMirror 6 editor** with LaTeX syntax highlighting, bracket matching, and autocomplete
- **Live PDF preview** powered by pdf.js with dark mode and zoom controls
- **SyncTeX** forward/inverse search between source and PDF
- **Multi-file projects** with tabbed editing and a file tree sidebar
- **Symbol palette and snippet library** for quick LaTeX input
- **Math preview** floating display while editing
- **Vim mode** via @replit/codemirror-vim
- **Light/dark themes** with CSS variable-based theming
- **Real-time file watching** via WebSocket — external changes appear instantly

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5 |
| Editor | CodeMirror 6 |
| PDF Viewer | pdf.js 4.4 |
| State | Zustand 4 |
| Math Rendering | KaTeX 0.16 |
| Backend | Node.js, Express 4, TypeScript |
| Real-time | WebSocket (ws) |
| File Watching | chokidar 5 |
| LaTeX Compiler | Tectonic (external) |
| Package Management | npm workspaces |

## Prerequisites

- **Node.js** 18+
- **Tectonic** — install with:
  ```bash
  curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh
  ```

## Getting Started

```bash
# Install dependencies
npm install

# Start both client and server in development mode
npm run dev
```

- Client dev server: http://localhost:5173
- Backend API server: http://localhost:3001

You can also start them separately:

```bash
npm run dev:server   # Backend only (port 3001)
npm run dev:client   # Frontend only (port 5173, proxies API to 3001)
```

## Production Build

```bash
npm run build   # Build the client (output: client/dist)
npm start       # Build client + start server (serves from client/dist)
```

## Project Structure

```
├── client/              # React/Vite frontend
│   └── src/
│       ├── components/  # UI components (editor, preview, sidebar, nav)
│       ├── hooks/       # Custom React hooks (autosave, compilation, SyncTeX)
│       ├── stores/      # Zustand state management
│       ├── themes/      # Light/dark theme definitions
│       └── lib/         # API client
├── server/              # Express backend
│   └── src/
│       ├── routes/      # API route handlers (compile, files, projects, synctex)
│       └── services/    # Business logic (tectonic, watcher, synctex)
├── package.json         # npm workspace root
└── monolith-spec.md     # Architecture specification
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects/switch` | Switch active project |
| GET | `/api/files/` | List files in project |
| GET/PUT/POST/DELETE | `/api/files/:path` | File CRUD |
| POST | `/api/compile` | Compile LaTeX via Tectonic |
| POST | `/api/synctex/forward` | Source → PDF position |
| POST | `/api/synctex/inverse` | PDF position → source |
| GET | `/api/health` | Server health check |
| WS | `/ws` | Real-time file change notifications |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `PROJECTS_ROOT` | `./projects/` | Root directory for LaTeX projects |

## License

MIT
