import { useEffect } from 'react';
import TopBar from './nav/TopBar';
import BottomBar from './nav/BottomBar';
import Layout from './Layout';
import { useEditorStore } from '../stores/editorStore';
import { useCompilation } from '../hooks/useCompilation';
import * as api from '../lib/api';

export default function App() {
  const { setContent, filePath } = useEditorStore();
  const { doCompile } = useCompilation();

  // Load initial file on mount
  useEffect(() => {
    api
      .readFile(filePath)
      .then((content) => {
        useEditorStore.getState().setContent(content);
        // Reset dirty since this is initial load
        useEditorStore.getState().setDirty(false);
      })
      .catch((err) => {
        console.error('Failed to load initial file:', err);
        // Set some default content if file doesn't exist
        setContent(
          '\\documentclass{article}\n\\begin{document}\nHello, TeXLab!\n\\end{document}\n'
        );
        useEditorStore.getState().setDirty(false);
      });
  }, [filePath, setContent]);

  return (
    <>
      <TopBar onCompile={doCompile} />
      <Layout onSave={doCompile} />
      <BottomBar />
    </>
  );
}
