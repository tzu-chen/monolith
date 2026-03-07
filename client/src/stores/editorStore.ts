import { create } from 'zustand';

export type CompilationStatus = 'idle' | 'compiling' | 'success' | 'error';

export interface FileTab {
  path: string;
  content: string;
  dirty: boolean;
}

interface EditorState {
  // Project state
  currentProject: string | null;
  projects: string[];

  // Multi-file tab state
  openTabs: FileTab[];
  activeTabPath: string | null;

  // File tree
  fileTree: string[];

  // Compilation state (global — always compiles main.tex)
  compilationStatus: CompilationStatus;
  pdfData: string | null;
  log: string;
  errors: string[];
  warnings: string[];
  lastCompileTime: number | null;

  // Sidebar visibility
  sidebarVisible: boolean;

  // Scroll-to-line request for outline clicks
  scrollToLine: number | null;

  // Project actions
  setCurrentProject: (name: string) => void;
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

  // Sidebar
  toggleSidebar: () => void;

  // Outline
  requestScrollToLine: (line: number) => void;
  clearScrollToLine: () => void;

  // Backward compat — derived getters
  content: string;
  filePath: string;
  dirty: boolean;

  // Legacy setters
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setFilePath: (filePath: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentProject: null,
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
  sidebarVisible: true,
  scrollToLine: null,

  // Derived state (computed from active tab)
  content: '',
  filePath: 'main.tex',
  dirty: false,

  setCurrentProject: (name) => set({ currentProject: name }),
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
      content: '',
      filePath: 'main.tex',
      dirty: false,
      scrollToLine: null,
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

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  requestScrollToLine: (line) => set({ scrollToLine: line }),
  clearScrollToLine: () => set({ scrollToLine: null }),

  // Legacy setters for backward compat
  setContent: (content) => {
    get().updateContent(content);
  },
  setDirty: (dirty) => set({ dirty }),
  setFilePath: (filePath) => set({ filePath }),
}));
