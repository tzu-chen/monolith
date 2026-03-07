import { useEffect } from 'react';
import TopBar from './nav/TopBar';
import BottomBar from './nav/BottomBar';
import Layout from './Layout';
import { useEditorStore } from '../stores/editorStore';
import { useCompilation } from '../hooks/useCompilation';
import { useFileWatcher } from '../hooks/useFileWatcher';
import * as api from '../lib/api';

export default function App() {
  const { doCompile } = useCompilation();

  // Load projects, file tree, and open main.tex on mount
  useEffect(() => {
    const init = async () => {
      try {
        const store = useEditorStore.getState();

        // Fetch project list and current project
        const [projects, currentInfo] = await Promise.all([
          api.listProjects(),
          api.getCurrentProject(),
        ]);
        store.setProjects(projects);
        store.setCurrentProject(currentInfo.project ?? '');
        store.setProjectRoot(currentInfo.projectRoot);

        // Only load files if a project is selected
        if (!currentInfo.project) return;

        // Fetch file tree
        const files = await api.listFiles();
        store.setFileTree(files);

        // Open main.tex as the default file
        const content = await api.readFile('main.tex');
        store.openFile('main.tex', content);
      } catch (err) {
        console.error('Failed to initialize:', err);
        // Open with default content if main.tex doesn't exist
        const defaultContent =
          '\\documentclass[12pt]{article}\n\\usepackage{amsmath, amssymb, amsthm}\n\\usepackage{graphicx}\n\n\\title{My Document}\n\\author{Author}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\nStart writing here.\n\n\\end{document}\n';
        useEditorStore.getState().openFile('main.tex', defaultContent);
      }
    };
    init();
  }, []);

  // Connect file watcher
  useFileWatcher();

  return (
    <>
      <TopBar onCompile={doCompile} />
      <Layout onSave={doCompile} />
      <BottomBar />
    </>
  );
}
