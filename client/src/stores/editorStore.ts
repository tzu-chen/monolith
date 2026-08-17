import { create } from 'zustand';
import type { EditorView } from '@codemirror/view';
import {
  getSchemeById,
  applyColorScheme,
  coerceSchemeId,
  DEFAULT_LIGHT_SCHEME_ID,
  DEFAULT_DARK_SCHEME_ID,
} from '../colorSchemes';
import { parseDiagnostics, type Diagnostic } from '../lib/diagnostics';
import type { ScopeGraph } from '../lib/scope-api';
import {
  DEFAULT_KEYBINDINGS,
  SHORTCUT_ACTIONS,
  coerceKeybindings,
  type KeybindingsConfig,
  type ShortcutAction,
} from '../lib/keybindings';

export interface AutoSwitchSettings {
  enabled: boolean;
  lightSchemeId: string;
  darkSchemeId: string;
  dayStartHour: number;
  nightStartHour: number;
}

const DEFAULT_AUTO_SWITCH: AutoSwitchSettings = {
  enabled: false,
  lightSchemeId: DEFAULT_LIGHT_SCHEME_ID,
  darkSchemeId: DEFAULT_DARK_SCHEME_ID,
  dayStartHour: 7,
  nightStartHour: 19,
};

export function getSchemeForCurrentTime(s: AutoSwitchSettings): string {
  const hour = new Date().getHours();
  return hour >= s.dayStartHour && hour < s.nightStartHour
    ? s.lightSchemeId
    : s.darkSchemeId;
}

export type CompilationStatus = 'idle' | 'compiling' | 'success' | 'error';
export type Theme = 'light' | 'dark';
export type ViewMode = 'both' | 'editor' | 'pdf';

/**
 * Rail tools that open a side panel. Only one is open at a time; clicking the
 * active tool collapses it and the editor/preview expand to fill.
 */
export type SidePanel =
  | 'files'
  | 'outline'
  | 'scope'
  | 'references'
  | 'plots'
  | 'projects';

/** Rail tools that open the drawer docked at the bottom of the editor pane. */
export type Drawer = 'symbols' | 'snippets';

/**
 * The item a manager panel has open in its detail pane.
 *
 * The reference and plot managers are list-plus-detail screens: the rail panel
 * holds the list, and the thing you selected opens in its own column beside it
 * (handoff 1c and 1f). Selection lives in the store because the two components
 * sit in different branches of the shell.
 */
export type ManagerDetail =
  | { kind: 'reference'; key: string }
  | {
      kind: 'plot';
      sessionId: string;
      sessionTitle: string;
      fileId: string;
      filename: string;
      updatedAt?: string | null;
    };

/** The panel each detail kind belongs to — closing that panel closes the pane. */
export const DETAIL_OWNER: Record<ManagerDetail['kind'], SidePanel> = {
  reference: 'references',
  plot: 'plots',
};

/** Overlay finders: Mod+P files, Mod+Shift+P projects. */
export type Finder = 'files' | 'projects';

// HTML render (LaTeXML) — additive web-render path alongside the Tectonic PDF.
export type PreviewMode = 'pdf' | 'html';
export type HtmlSplitLevel = 'none' | 'part' | 'chapter' | 'section' | 'subsection';
export type HtmlRenderStatus = 'idle' | 'rendering' | 'success' | 'error' | 'unavailable';

export type ScopeStatus = 'idle' | 'resolving' | 'ready' | 'error';

export interface SyncTexHighlight {
  page: number;
  x: number;
  y: number;
  h: number;
  w: number;
}

export interface FileTab {
  path: string;
  content: string;
  dirty: boolean;
}

interface EditorState {
  // Project state
  currentProject: string | null;
  projectRoot: string | null;
  projects: string[];

  // Multi-file tab state
  openTabs: FileTab[];
  activeTabPath: string | null;

  // File tree
  fileTree: string[];

  // Compilation state
  compilationStatus: CompilationStatus;
  pdfData: string | null;
  log: string;
  errors: string[];
  warnings: string[];
  /** Elapsed compile duration in ms. */
  lastCompileTime: number | null;
  /** Wall-clock time of the last compile, for the freshness label. */
  lastCompileAt: number | null;
  diagnostics: Diagnostic[];
  /**
   * File the last compile ran on. Diagnostics that name no file belong to it,
   * so the gutter puts them on the right document.
   */
  compiledFile: string | null;
  /**
   * Content of each file as of the last successful compile, keyed by path.
   * Drives the gutter diff bars and the `+N ~M since last compile` summary.
   */
  compileSnapshot: Record<string, string>;

  // HTML render (LaTeXML) state — runs beside the PDF path, same .tex source
  previewMode: PreviewMode;
  htmlSplitAt: HtmlSplitLevel;
  /** Environment names whose blocks start collapsed in the HTML preview. */
  htmlCollapsedEnvs: string[];
  htmlRenderStatus: HtmlRenderStatus;
  htmlLog: string;
  htmlErrors: string[];
  htmlWarnings: string[];
  htmlNonce: number; // bumped on each successful render to bust the iframe cache
  htmlRenderedAt: number | null;

  // Shell state
  activePanel: SidePanel | null;
  activeDrawer: Drawer | null;
  finder: Finder | null;
  showSettings: boolean;
  /** What the open manager panel is showing in its detail column, if anything. */
  managerDetail: ManagerDetail | null;
  /** Bumped when a `.bib` or `.tex` changes — the reference library re-reads. */
  libraryNonce: number;

  editorView: EditorView | null;

  // Scope graph (packages/macros/environments in scope for the active file)
  scope: ScopeGraph | null;
  scopeStatus: ScopeStatus;
  scopeError: string | null;
  /** Bumped to force a re-resolve — on save, and on a watcher event in the chain. */
  scopeNonce: number;

  // Scroll-to-line request for outline clicks
  scrollToLine: number | null;

  // Theme
  theme: Theme;
  colorScheme: string;
  autoSwitch: AutoSwitchSettings;
  /**
   * Invert the PDF canvas in dark mode. The design treats the rendered page as
   * real paper (a dimmed light sheet), so this is off by default; the older
   * inverted rendering stays available for low-light work.
   */
  invertPdfInDark: boolean;

  // Vim mode
  vimMode: boolean;

  /** Chord bound to each global shortcut — see `lib/keybindings.ts`. */
  keybindings: KeybindingsConfig;

  // Auto recompile/render on edit (off = compile/render only on explicit action)
  autoRecompile: boolean;

  // View mode
  viewMode: ViewMode;

  // Editor font settings
  fontSize: number;
  fontFamily: string;

  // Line wrap
  lineWrap: boolean;

  // Show line numbers in the editor gutter
  showLineNumbers: boolean;

  /**
   * Hide everything but `.tex` in the Files panel. Folders with no `.tex`
   * anywhere below them go with them, so the filter does not leave empty
   * branches behind. Only the tree is filtered — the file finder still
   * searches the whole project.
   */
  hideNonTexFiles: boolean;

  // Cursor position
  cursorLine: number;
  cursorCol: number;

  // SyncTeX highlight
  syncTexHighlight: SyncTexHighlight | null;

  // Preamble macros for math preview
  preambleMacros: string;

  // Project actions
  setCurrentProject: (name: string | null) => void;
  setProjectRoot: (path: string | null) => void;
  setProjects: (projects: string[]) => void;
  resetEditorState: () => void;

  // Tab actions
  openFile: (path: string, content: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateContent: (content: string) => void;
  markSaved: (path: string) => void;

  // File tree actions
  setFileTree: (files: string[]) => void;

  // Compilation actions
  setCompilationStatus: (status: CompilationStatus) => void;
  setPdfData: (pdf: string | null) => void;
  setCompileResult: (result: {
    success: boolean;
    pdf?: string;
    log: string;
    errors: string[];
    warnings: string[];
    elapsed: number;
    /** File the compile ran on, for attributing file-less diagnostics. */
    file: string | null;
  }) => void;

  // HTML render actions
  setPreviewMode: (mode: PreviewMode) => void;
  setHtmlSplitAt: (level: HtmlSplitLevel) => void;
  toggleHtmlCollapsedEnv: (env: string) => void;
  setHtmlRenderStatus: (status: HtmlRenderStatus) => void;
  setHtmlResult: (result: {
    ok: boolean;
    available: boolean;
    log: string;
    errors: string[];
    warnings: string[];
  }) => void;

  // Shell
  setActivePanel: (panel: SidePanel | null) => void;
  toggleActivePanel: (panel: SidePanel) => void;
  setManagerDetail: (detail: ManagerDetail | null) => void;
  invalidateLibrary: () => void;
  setActiveDrawer: (drawer: Drawer | null) => void;
  toggleDrawer: (drawer: Drawer) => void;
  setFinder: (finder: Finder | null) => void;
  setShowSettings: (show: boolean) => void;

  setEditorView: (view: EditorView | null) => void;
  /** Insert text at the active editor's cursor and focus it. */
  insertAtCursor: (text: string) => void;

  // Scope
  setScope: (scope: ScopeGraph | null) => void;
  setScopeStatus: (status: ScopeStatus, error?: string | null) => void;
  invalidateScope: () => void;
  /** True when `path` is part of the resolved chain, so a change to it matters. */
  scopeChainIncludes: (path: string) => boolean;

  // Outline
  requestScrollToLine: (line: number) => void;
  clearScrollToLine: () => void;

  // Theme
  setColorScheme: (id: string) => void;
  setAutoSwitch: (settings: AutoSwitchSettings) => void;
  applyAutoSwitchScheme: () => void;
  toggleInvertPdfInDark: () => void;

  // Vim mode
  toggleVimMode: () => void;

  // Shortcuts
  /** Bind `chord` to `action`, taking it from whichever action held it. */
  setKeybinding: (action: ShortcutAction, chord: string) => void;
  resetKeybindings: () => void;

  // Auto recompile
  toggleAutoRecompile: () => void;

  // Line wrap
  toggleLineWrap: () => void;

  // Line numbers
  toggleShowLineNumbers: () => void;

  // Files panel filter
  toggleHideNonTexFiles: () => void;

  // View mode
  setViewMode: (mode: ViewMode) => void;

  // Font settings
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;

  // Cursor
  setCursorPosition: (line: number, col: number) => void;

  // SyncTeX
  setSyncTexHighlight: (highlight: SyncTexHighlight | null) => void;

  // Preamble macros
  setPreambleMacros: (macros: string) => void;

  // Backward compat — derived getters
  content: string;
  filePath: string;
  dirty: boolean;

  // Legacy setters
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setFilePath: (filePath: string) => void;
}

function getInitialAutoSwitch(): AutoSwitchSettings {
  try {
    const raw = localStorage.getItem('monolith-theme-auto');
    if (!raw) return DEFAULT_AUTO_SWITCH;
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_AUTO_SWITCH, ...parsed };
    return {
      ...merged,
      lightSchemeId: coerceSchemeId(merged.lightSchemeId, DEFAULT_LIGHT_SCHEME_ID),
      darkSchemeId: coerceSchemeId(merged.darkSchemeId, DEFAULT_DARK_SCHEME_ID),
    };
  } catch {
    return DEFAULT_AUTO_SWITCH;
  }
}

function getInitialColorScheme(): string {
  const auto = getInitialAutoSwitch();
  if (auto.enabled) return getSchemeForCurrentTime(auto);
  try {
    const stored = localStorage.getItem('monolith-color-scheme');
    if (stored) return coerceSchemeId(stored);
  } catch {}
  return DEFAULT_LIGHT_SCHEME_ID;
}

function getInitialTheme(): Theme {
  return getSchemeById(getInitialColorScheme()).type;
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {}
  return fallback;
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

function getInitialKeybindings(): KeybindingsConfig {
  try {
    const raw = localStorage.getItem('monolith-keybindings');
    if (raw) return coerceKeybindings(JSON.parse(raw));
  } catch {}
  return { ...DEFAULT_KEYBINDINGS };
}

function writeKeybindings(config: KeybindingsConfig): void {
  try {
    localStorage.setItem('monolith-keybindings', JSON.stringify(config));
  } catch {}
}

function getInitialFontSize(): number {
  try {
    const stored = localStorage.getItem('monolith-font-size');
    if (stored) {
      const size = parseFloat(stored);
      if (size >= 8 && size <= 32) return size;
    }
  } catch {}
  return 13.5;
}

function getInitialFontFamily(): string {
  try {
    const stored = localStorage.getItem('monolith-font-family');
    if (stored) return stored;
  } catch {}
  return "'Source Code Pro', monospace";
}

function getInitialPreviewMode(): PreviewMode {
  try {
    const stored = localStorage.getItem('monolith-preview-mode');
    if (stored === 'html' || stored === 'pdf') return stored;
  } catch {}
  return 'pdf';
}

const HTML_SPLIT_LEVELS: HtmlSplitLevel[] = ['none', 'part', 'chapter', 'section', 'subsection'];

function getInitialHtmlSplit(): HtmlSplitLevel {
  try {
    const stored = localStorage.getItem('monolith-html-split');
    if (stored && (HTML_SPLIT_LEVELS as string[]).includes(stored)) {
      return stored as HtmlSplitLevel;
    }
  } catch {}
  return 'none';
}

/**
 * Theorem-like environment names whose blocks start collapsed in the HTML
 * preview — `proof`, or any \newtheorem name (LaTeXML's `ltx_theorem_<name>`).
 * A block can override this from the source with \mlCollapsed / \mlExpanded.
 */
function getInitialHtmlCollapsedEnvs(): string[] {
  try {
    const stored = localStorage.getItem('monolith-html-collapsed-envs');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.filter((e): e is string => typeof e === 'string');
    }
  } catch {}
  return [];
}

const SIDE_PANELS: SidePanel[] = ['files', 'outline', 'scope', 'references', 'plots', 'projects'];

function getInitialPanel(): SidePanel | null {
  try {
    const stored = localStorage.getItem('monolith-panel');
    if (stored === 'none') return null;
    if (stored && (SIDE_PANELS as string[]).includes(stored)) return stored as SidePanel;
  } catch {}
  return 'files';
}

/** Keep a detail pane only while its own list panel is the one open. */
function detailFor(panel: SidePanel | null, detail: ManagerDetail | null): ManagerDetail | null {
  if (!detail || panel === null) return null;
  return DETAIL_OWNER[detail.kind] === panel ? detail : null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentProject: null,
  projectRoot: null,
  projects: [],
  openTabs: [],
  activeTabPath: null,
  fileTree: [],
  compilationStatus: 'idle',
  pdfData: null,
  log: '',
  errors: [],
  warnings: [],
  lastCompileTime: null,
  lastCompileAt: null,
  compiledFile: null,
  diagnostics: [],
  compileSnapshot: {},
  previewMode: getInitialPreviewMode(),
  htmlSplitAt: getInitialHtmlSplit(),
  htmlCollapsedEnvs: getInitialHtmlCollapsedEnvs(),
  htmlRenderStatus: 'idle',
  htmlLog: '',
  htmlErrors: [],
  htmlWarnings: [],
  htmlNonce: 0,
  htmlRenderedAt: null,
  activePanel: getInitialPanel(),
  activeDrawer: null,
  finder: null,
  showSettings: false,
  managerDetail: null,
  libraryNonce: 0,
  editorView: null,
  scope: null,
  scopeStatus: 'idle',
  scopeError: null,
  scopeNonce: 0,
  scrollToLine: null,
  theme: getInitialTheme(),
  colorScheme: getInitialColorScheme(),
  autoSwitch: getInitialAutoSwitch(),
  invertPdfInDark: readFlag('monolith-invert-pdf-dark', false),
  vimMode: readFlag('monolith-vim', false),
  keybindings: getInitialKeybindings(),
  autoRecompile: readFlag('monolith-auto-recompile', false),
  viewMode: 'both' as ViewMode,
  fontSize: getInitialFontSize(),
  fontFamily: getInitialFontFamily(),
  lineWrap: readFlag('monolith-line-wrap', false),
  showLineNumbers: readFlag('monolith-line-numbers', true),
  hideNonTexFiles: readFlag('monolith-tex-only-tree', false),
  cursorLine: 1,
  cursorCol: 1,
  syncTexHighlight: null,
  preambleMacros: '',

  // Derived state (computed from active tab)
  content: '',
  filePath: 'main.tex',
  dirty: false,

  setCurrentProject: (name) => set({ currentProject: name }),
  setProjectRoot: (path) => set({ projectRoot: path }),
  setProjects: (projects) => set({ projects }),
  resetEditorState: () =>
    set({
      openTabs: [],
      activeTabPath: null,
      fileTree: [],
      pdfData: null,
      compilationStatus: 'idle',
      log: '',
      errors: [],
      warnings: [],
      lastCompileTime: null,
      lastCompileAt: null,
      compiledFile: null,
      diagnostics: [],
      compileSnapshot: {},
      htmlRenderStatus: 'idle',
      htmlLog: '',
      htmlErrors: [],
      htmlWarnings: [],
      htmlNonce: 0,
      htmlRenderedAt: null,
      content: '',
      filePath: 'main.tex',
      dirty: false,
      scrollToLine: null,
      projectRoot: null,
      syncTexHighlight: null,
      preambleMacros: '',
      // The open reference/plot belonged to the project being left.
      managerDetail: null,
      scope: null,
      scopeStatus: 'idle',
      scopeError: null,
    }),

  openFile: (path, content) => {
    const state = get();
    const existing = state.openTabs.find((t) => t.path === path);
    if (existing) {
      set({
        activeTabPath: path,
        content: existing.content,
        filePath: path,
        dirty: existing.dirty,
      });
    } else {
      const newTab: FileTab = { path, content, dirty: false };
      set({
        openTabs: [...state.openTabs, newTab],
        activeTabPath: path,
        content,
        filePath: path,
        dirty: false,
      });
    }
  },

  closeTab: (path) => {
    const state = get();
    const newTabs = state.openTabs.filter((t) => t.path !== path);
    let newActive = state.activeTabPath;

    if (state.activeTabPath === path) {
      const idx = state.openTabs.findIndex((t) => t.path === path);
      if (newTabs.length > 0) {
        const newIdx = Math.min(idx, newTabs.length - 1);
        newActive = newTabs[newIdx].path;
      } else {
        newActive = null;
      }
    }

    const activeTab = newTabs.find((t) => t.path === newActive);
    set({
      openTabs: newTabs,
      activeTabPath: newActive,
      content: activeTab?.content ?? '',
      filePath: newActive ?? 'main.tex',
      dirty: activeTab?.dirty ?? false,
    });
  },

  setActiveTab: (path) => {
    const tab = get().openTabs.find((t) => t.path === path);
    if (tab) {
      set({
        activeTabPath: path,
        content: tab.content,
        filePath: path,
        dirty: tab.dirty,
      });
    }
  },

  updateContent: (content) => {
    const state = get();
    const path = state.activeTabPath;
    if (!path) return;
    set({
      openTabs: state.openTabs.map((t) =>
        t.path === path ? { ...t, content, dirty: true } : t
      ),
      content,
      dirty: true,
    });
  },

  markSaved: (path) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.path === path ? { ...t, dirty: false } : t
      ),
      dirty: state.activeTabPath === path ? false : state.dirty,
    }));
  },

  setFileTree: (files) => set({ fileTree: files }),

  setCompilationStatus: (compilationStatus) => set({ compilationStatus }),
  setPdfData: (pdfData) => set({ pdfData }),
  setCompileResult: (result) =>
    set((state) => ({
      compilationStatus: result.success ? 'success' : 'error',
      pdfData: result.pdf ?? state.pdfData,
      log: result.log,
      errors: result.errors,
      warnings: result.warnings,
      lastCompileTime: result.elapsed,
      lastCompileAt: Date.now(),
      compiledFile: result.file,
      diagnostics: parseDiagnostics(result.errors, result.warnings),
      // Only a successful compile establishes a new diff baseline — after a
      // failed one, the bars should still point at what the user has changed
      // since the last version that actually built.
      compileSnapshot: result.success
        ? Object.fromEntries(state.openTabs.map((t) => [t.path, t.content]))
        : state.compileSnapshot,
    })),

  setPreviewMode: (previewMode) => {
    try { localStorage.setItem('monolith-preview-mode', previewMode); } catch {}
    set({ previewMode });
  },

  setHtmlSplitAt: (htmlSplitAt) => {
    try { localStorage.setItem('monolith-html-split', htmlSplitAt); } catch {}
    set({ htmlSplitAt });
  },

  toggleHtmlCollapsedEnv: (env) =>
    set((state) => {
      const htmlCollapsedEnvs = state.htmlCollapsedEnvs.includes(env)
        ? state.htmlCollapsedEnvs.filter((e) => e !== env)
        : [...state.htmlCollapsedEnvs, env].sort((a, b) => a.localeCompare(b));
      try {
        localStorage.setItem('monolith-html-collapsed-envs', JSON.stringify(htmlCollapsedEnvs));
      } catch {}
      return { htmlCollapsedEnvs };
    }),

  setHtmlRenderStatus: (htmlRenderStatus) => set({ htmlRenderStatus }),

  setHtmlResult: (result) =>
    set((state) => ({
      htmlRenderStatus: !result.available ? 'unavailable' : result.ok ? 'success' : 'error',
      htmlLog: result.log,
      htmlErrors: result.errors,
      htmlWarnings: result.warnings,
      htmlNonce: result.ok ? state.htmlNonce + 1 : state.htmlNonce,
      htmlRenderedAt: result.ok ? Date.now() : state.htmlRenderedAt,
    })),

  /** A detail pane belongs to its list — it closes when you leave that panel. */
  setActivePanel: (activePanel) => {
    try { localStorage.setItem('monolith-panel', activePanel ?? 'none'); } catch {}
    set((state) => ({ activePanel, managerDetail: detailFor(activePanel, state.managerDetail) }));
  },

  toggleActivePanel: (panel) => {
    const next = get().activePanel === panel ? null : panel;
    try { localStorage.setItem('monolith-panel', next ?? 'none'); } catch {}
    set((state) => ({ activePanel: next, managerDetail: detailFor(next, state.managerDetail) }));
  },

  setManagerDetail: (managerDetail) => set({ managerDetail }),
  invalidateLibrary: () => set((state) => ({ libraryNonce: state.libraryNonce + 1 })),

  setActiveDrawer: (activeDrawer) => set({ activeDrawer }),
  toggleDrawer: (drawer) =>
    set((state) => ({ activeDrawer: state.activeDrawer === drawer ? null : drawer })),

  setFinder: (finder) => set({ finder }),
  setShowSettings: (showSettings) => set({ showSettings }),

  setEditorView: (editorView) => set({ editorView }),
  insertAtCursor: (text) => {
    const view = get().editorView;
    if (!view) return;
    const { head } = view.state.selection.main;
    view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length } });
    view.focus();
  },

  setScope: (scope) => set({ scope, scopeStatus: 'ready', scopeError: null }),
  setScopeStatus: (scopeStatus, scopeError = null) => set({ scopeStatus, scopeError }),
  invalidateScope: () => set((state) => ({ scopeNonce: state.scopeNonce + 1 })),
  scopeChainIncludes: (path) => {
    const { scope } = get();
    return !!scope && (scope.root === path || scope.chain.includes(path));
  },

  requestScrollToLine: (line) => set({ scrollToLine: line }),
  clearScrollToLine: () => set({ scrollToLine: null }),

  setColorScheme: (id: string) => {
    const scheme = getSchemeById(id);
    applyColorScheme(scheme);
    try { localStorage.setItem('monolith-color-scheme', scheme.id); } catch {}
    const state = get();
    if (state.autoSwitch.enabled) {
      const next = { ...state.autoSwitch, enabled: false };
      try { localStorage.setItem('monolith-theme-auto', JSON.stringify(next)); } catch {}
      set({ colorScheme: scheme.id, theme: scheme.type, autoSwitch: next });
    } else {
      set({ colorScheme: scheme.id, theme: scheme.type });
    }
  },

  setAutoSwitch: (settings: AutoSwitchSettings) => {
    try { localStorage.setItem('monolith-theme-auto', JSON.stringify(settings)); } catch {}
    if (settings.enabled) {
      const id = getSchemeForCurrentTime(settings);
      const scheme = getSchemeById(id);
      applyColorScheme(scheme);
      try { localStorage.setItem('monolith-color-scheme', scheme.id); } catch {}
      set({ autoSwitch: settings, colorScheme: scheme.id, theme: scheme.type });
    } else {
      set({ autoSwitch: settings });
    }
  },

  applyAutoSwitchScheme: () => {
    const state = get();
    if (!state.autoSwitch.enabled) return;
    const id = getSchemeForCurrentTime(state.autoSwitch);
    if (id === state.colorScheme) return;
    const scheme = getSchemeById(id);
    applyColorScheme(scheme);
    try { localStorage.setItem('monolith-color-scheme', scheme.id); } catch {}
    set({ colorScheme: scheme.id, theme: scheme.type });
  },

  toggleInvertPdfInDark: () => {
    const next = !get().invertPdfInDark;
    writeFlag('monolith-invert-pdf-dark', next);
    set({ invertPdfInDark: next });
  },

  toggleVimMode: () => {
    const next = !get().vimMode;
    writeFlag('monolith-vim', next);
    set({ vimMode: next });
  },

  /**
   * One chord drives one action: binding a chord that is already spoken for
   * unbinds it there rather than leaving two rows claiming the same keys. The
   * settings list shows both rows at once, so the row it was taken from shows
   * "Not set" the moment it happens.
   */
  setKeybinding: (action, chord) => {
    const next = { ...get().keybindings };
    if (chord) {
      for (const other of SHORTCUT_ACTIONS) {
        if (other !== action && next[other] === chord) next[other] = '';
      }
    }
    next[action] = chord;
    writeKeybindings(next);
    set({ keybindings: next });
  },

  resetKeybindings: () => {
    const next = { ...DEFAULT_KEYBINDINGS };
    writeKeybindings(next);
    set({ keybindings: next });
  },

  toggleAutoRecompile: () => {
    const next = !get().autoRecompile;
    writeFlag('monolith-auto-recompile', next);
    set({ autoRecompile: next });
  },

  toggleLineWrap: () => {
    const next = !get().lineWrap;
    writeFlag('monolith-line-wrap', next);
    set({ lineWrap: next });
  },

  toggleShowLineNumbers: () => {
    const next = !get().showLineNumbers;
    writeFlag('monolith-line-numbers', next);
    set({ showLineNumbers: next });
  },

  toggleHideNonTexFiles: () => {
    const next = !get().hideNonTexFiles;
    writeFlag('monolith-tex-only-tree', next);
    set({ hideNonTexFiles: next });
  },

  setViewMode: (viewMode) => set({ viewMode }),

  setFontSize: (size) => {
    const clamped = Math.min(32, Math.max(8, size));
    try { localStorage.setItem('monolith-font-size', String(clamped)); } catch {}
    set({ fontSize: clamped });
  },

  setFontFamily: (family) => {
    try { localStorage.setItem('monolith-font-family', family); } catch {}
    set({ fontFamily: family });
  },

  setCursorPosition: (cursorLine, cursorCol) => set({ cursorLine, cursorCol }),

  setSyncTexHighlight: (syncTexHighlight) => set({ syncTexHighlight }),

  setPreambleMacros: (preambleMacros) => set({ preambleMacros }),

  // Legacy setters for backward compat
  setContent: (content) => {
    get().updateContent(content);
  },
  setDirty: (dirty) => set({ dirty }),
  setFilePath: (filePath) => set({ filePath }),
}));
