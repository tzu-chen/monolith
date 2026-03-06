import { create } from 'zustand';

export type CompilationStatus = 'idle' | 'compiling' | 'success' | 'error';

interface EditorState {
  content: string;
  filePath: string;
  dirty: boolean;
  compilationStatus: CompilationStatus;
  pdfData: string | null; // base64
  log: string;
  errors: string[];
  warnings: string[];
  lastCompileTime: number | null; // ms elapsed

  setContent: (content: string) => void;
  setFilePath: (filePath: string) => void;
  setDirty: (dirty: boolean) => void;
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
}

export const useEditorStore = create<EditorState>((set) => ({
  content: '',
  filePath: 'main.tex',
  dirty: false,
  compilationStatus: 'idle',
  pdfData: null,
  log: '',
  errors: [],
  warnings: [],
  lastCompileTime: null,

  setContent: (content) => set({ content, dirty: true }),
  setFilePath: (filePath) => set({ filePath }),
  setDirty: (dirty) => set({ dirty }),
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
      dirty: false,
    }),
}));
