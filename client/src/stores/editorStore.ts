import { create } from 'zustand';
import type { EditorView } from '@codemirror/view';
import {
  getSchemeById,
  applyColorScheme,
  coerceSchemeId,
  DEFAULT_LIGHT_SCHEME_ID,
  DEFAULT_DARK_SCHEME_ID,
} from '../colorSchemes';

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
export type ActivePanel = 'symbols' | 'snippets' | null;
export type Theme = 'light' | 'dark';
export type ViewMode = 'both' | 'editor' | 'pdf';

// HTML render (LaTeXML) — additive web-render path alongside the Tectonic PDF.
export type PreviewMode = 'pdf' | 'html';
export type HtmlSplitLevel = 'none' | 'part' | 'chapter' | 'section' | 'subsection';
export type HtmlRenderStatus = 'idle' | 'rendering' | 'success' | 'error' | 'unavailable';

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
  lastCompileTime: number | null;

  // HTML render (LaTeXML) state — runs beside the PDF path, same .tex source
  previewMode: PreviewMode;
  htmlSplitAt: HtmlSplitLevel;
  htmlRenderStatus: HtmlRenderStatus;
  htmlLog: string;
  htmlErrors: string[];
  htmlWarnings: string[];
  htmlNonce: number; // bumped on each successful render to bust the iframe cache

  // Sidebar visibility
  sidebarVisible: boolean;

  // Panel state (symbols, snippets)
  activePanel: ActivePanel;
  editorView: EditorView | null;

  // Modal dialogs (references browser, project manager)
  showReferences: boolean;
  showProjectManager: boolean;

  // Scroll-to-line request for outline clicks
  scrollToLine: number | null;

  // Theme
  theme: Theme;
  colorScheme: string;
  autoSwitch: AutoSwitchSettings;

  // Vim mode
  vimMode: boolean;

  // Auto recompile/render on edit (off = compile/render only on explicit action)
  autoRecompile: boolean;

  // View mode
  viewMode: ViewMode;

  // Editor font settings
  fontSize: number;
  fontFamily: string;

  // Line wrap
  lineWrap: boolean;

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
  }) => void;

  // HTML render actions
  setPreviewMode: (mode: PreviewMode) => void;
  setHtmlSplitAt: (level: HtmlSplitLevel) => void;
  setHtmlRenderStatus: (status: HtmlRenderStatus) => void;
  setHtmlResult: (result: {
    ok: boolean;
    available: boolean;
    log: string;
    errors: string[];
    warnings: string[];
  }) => void;

  // Sidebar
  toggleSidebar: () => void;

  // Panels
  setActivePanel: (panel: ActivePanel) => void;
  setEditorView: (view: EditorView | null) => void;

  // Modal dialogs
  setShowReferences: (show: boolean) => void;
  setShowProjectManager: (show: boolean) => void;

  // Outline
  requestScrollToLine: (line: number) => void;
  clearScrollToLine: () => void;

  // Theme
  setColorScheme: (id: string) => void;
  setAutoSwitch: (settings: AutoSwitchSettings) => void;
  applyAutoSwitchScheme: () => void;

  // Vim mode
  toggleVimMode: () => void;

  // Auto recompile
  toggleAutoRecompile: () => void;

  // Line wrap
  toggleLineWrap: () => void;

  // View mode
  cycleViewMode: () => void;

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

function getInitialVimMode(): boolean {
  try {
    return localStorage.getItem('monolith-vim') === 'true';
  } catch {}
  return false;
}

function getInitialLineWrap(): boolean {
  try {
    return localStorage.getItem('monolith-line-wrap') === 'true';
  } catch {}
  return false;
}

function getInitialAutoRecompile(): boolean {
  try {
    return localStorage.getItem('monolith-auto-recompile') === 'true';
  } catch {}
  return false;
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
  previewMode: getInitialPreviewMode(),
  htmlSplitAt: getInitialHtmlSplit(),
  htmlRenderStatus: 'idle',
  htmlLog: '',
  htmlErrors: [],
  htmlWarnings: [],
  htmlNonce: 0,
  sidebarVisible: true,
  activePanel: null,
  editorView: null,
  showReferences: false,
  showProjectManager: false,
  scrollToLine: null,
  theme: getInitialTheme(),
  colorScheme: getInitialColorScheme(),
  autoSwitch: getInitialAutoSwitch(),
  vimMode: getInitialVimMode(),
  autoRecompile: getInitialAutoRecompile(),
  viewMode: 'both' as ViewMode,
  fontSize: getInitialFontSize(),
  fontFamily: getInitialFontFamily(),
  lineWrap: getInitialLineWrap(),
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
      htmlRenderStatus: 'idle',
      htmlLog: '',
      htmlErrors: [],
      htmlWarnings: [],
      htmlNonce: 0,
      content: '',
      filePath: 'main.tex',
      dirty: false,
      scrollToLine: null,
      projectRoot: null,
      syncTexHighlight: null,
      preambleMacros: '',
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
    set({
      compilationStatus: result.success ? 'success' : 'error',
      pdfData: result.pdf ?? null,
      log: result.log,
      errors: result.errors,
      warnings: result.warnings,
      lastCompileTime: result.elapsed,
    }),

  setPreviewMode: (previewMode) => {
    try { localStorage.setItem('monolith-preview-mode', previewMode); } catch {}
    set({ previewMode });
  },

  setHtmlSplitAt: (htmlSplitAt) => {
    try { localStorage.setItem('monolith-html-split', htmlSplitAt); } catch {}
    set({ htmlSplitAt });
  },

  setHtmlRenderStatus: (htmlRenderStatus) => set({ htmlRenderStatus }),

  setHtmlResult: (result) =>
    set((state) => ({
      htmlRenderStatus: !result.available ? 'unavailable' : result.ok ? 'success' : 'error',
      htmlLog: result.log,
      htmlErrors: result.errors,
      htmlWarnings: result.warnings,
      htmlNonce: result.ok ? state.htmlNonce + 1 : state.htmlNonce,
    })),

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  setActivePanel: (activePanel) => set({ activePanel }),
  setEditorView: (editorView) => set({ editorView }),
  setShowReferences: (showReferences) => set({ showReferences }),
  setShowProjectManager: (showProjectManager) => set({ showProjectManager }),

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

  toggleVimMode: () => {
    const newVim = !get().vimMode;
    try { localStorage.setItem('monolith-vim', String(newVim)); } catch {}
    set({ vimMode: newVim });
  },

  toggleAutoRecompile: () => {
    const next = !get().autoRecompile;
    try { localStorage.setItem('monolith-auto-recompile', String(next)); } catch {}
    set({ autoRecompile: next });
  },

  toggleLineWrap: () => {
    const newWrap = !get().lineWrap;
    try { localStorage.setItem('monolith-line-wrap', String(newWrap)); } catch {}
    set({ lineWrap: newWrap });
  },

  cycleViewMode: () => {
    const current = get().viewMode;
    const next = current === 'both' ? 'editor' : current === 'editor' ? 'pdf' : 'both';
    set({ viewMode: next });
  },

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
