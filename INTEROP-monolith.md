# Monolith — INTEROP.md

Cross-app integration spec for Monolith. This documents the endpoints and data shapes that sibling apps (Navigate, Scribe, Granary) may call or reference.

**Base URL:** `http://localhost:3005/api`  
**WebSocket:** `ws://localhost:3005/ws`  
**Port:** 3005 (server), 5173 (Vite dev)  

---

## Data Available to Other Apps

### Projects

Monolith manages LaTeX projects as directories under `PROJECTS_ROOT` (default `./projects/`).

**List projects:**
```
GET /api/projects
```
Returns project directory names.

**Switch active project:**
```
POST /api/projects/switch
```
Body: `{ project: "project-name" }`.

### Files

**List files in active project:**
```
GET /api/files/
```
Returns file tree.

**Read a file:**
```
GET /api/files/:path
```
Returns file content as text.

**Write a file:**
```
PUT /api/files/:path
```
Body: `{ content: "..." }`. Creates or overwrites.

**Create a file:**
```
POST /api/files/:path
```
Body: `{ content: "..." }`.

**Delete a file:**
```
DELETE /api/files/:path
```

### Compilation

**Compile LaTeX:**
```
POST /api/compile
```
Triggers Tectonic compilation of the active project. Returns compiled PDF as base64.

### SyncTeX

**Forward search (source → PDF):**
```
POST /api/synctex/forward
```
Body: `{ file: "main.tex", line: 42, column: 0 }`. Returns PDF page and position.

**Inverse search (PDF → source):**
```
POST /api/synctex/inverse
```
Body: `{ page: 3, x: 200, y: 400 }`. Returns source file, line, column.

### Real-Time File Watching

```
WebSocket: ws://localhost:3001/ws
```
Broadcasts file change events when files are modified externally (via chokidar). Message format: `{ type: "file-changed", path: "..." }`.

---

## Cross-App Reference Keys

When other apps link to Monolith entities, use these identifiers:

| Entity | Key | Example |
|--------|-----|---------|
| Project | directory name (string) | `"mfg-paper"` |
| File | relative path within project (string) | `"sections/intro.tex"` |

---

## Integration Points for Other Apps

Monolith's API is file-system-oriented, which makes integration straightforward:

### Navigate → Monolith: BibTeX Sync
Navigate can write a `.bib` file directly to a Monolith project:
```
PUT /api/files/references.bib
Body: { content: "<bibtex string from Navigate>" }
```
Monolith's file watcher will detect the change and the editor will update.

### Scribe/Granary → Monolith: Export Notes as .tex
Write a `.tex` file to a project with notes/entries formatted as LaTeX:
```
PUT /api/files/notes-draft.tex
Body: { content: "<latex content>" }
```

### Reading Monolith State
To check what the user is currently working on:
```
GET /api/projects        → active project name
GET /api/files/          → file listing
GET /api/files/main.tex  → current document content
```

---

## Planned Endpoints for Cross-App Use (Not Yet Implemented)

| Consumer | Endpoint | Purpose |
|----------|----------|---------|
| Navigate | `PUT /api/files/references.bib` | Auto-sync BibTeX from Navigate worldline |
| Granary | `PUT /api/files/<path>.tex` | Export curated entries as a LaTeX draft section |
| Scribe | `PUT /api/files/<path>.tex` | Export notes from a flowchart subtree as LaTeX |
