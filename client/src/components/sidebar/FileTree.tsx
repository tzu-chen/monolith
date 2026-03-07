import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  for (const file of files) {
    const isDir = file.endsWith('/');
    const cleanPath = isDir ? file.slice(0, -1) : file;
    const parts = cleanPath.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');

    const node: TreeNode = {
      name,
      path: cleanPath,
      isDir,
      children: [],
    };

    if (isDir) {
      dirMap.set(cleanPath, node);
    }

    if (parentPath && dirMap.has(parentPath)) {
      dirMap.get(parentPath)!.children.push(node);
    } else if (!parentPath) {
      root.push(node);
    } else {
      // Parent directory wasn't listed — add to root
      root.push(node);
    }
  }

  return root;
}

function getSubtree(tree: TreeNode[], currentDir: string): TreeNode[] {
  if (!currentDir) return tree;
  const parts = currentDir.split('/').filter(Boolean);
  let nodes = tree;
  for (const part of parts) {
    const found = nodes.find((n) => n.isDir && n.name === part);
    if (found) {
      nodes = found.children;
    } else {
      return [];
    }
  }
  return nodes;
}

function FileIcon({ isDir, isOpen }: { isDir: boolean; isOpen?: boolean }) {
  if (isDir) {
    return (
      <span style={{ fontSize: 12, width: 16, textAlign: 'center', flexShrink: 0 }}>
        {isOpen ? '▾' : '▸'}
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 11,
        width: 16,
        textAlign: 'center',
        flexShrink: 0,
        color: 'var(--text-dim)',
      }}
    >
      ◇
    </span>
  );
}

function TreeItem({
  node,
  depth,
  onNavigateInto,
}: {
  node: TreeNode;
  depth: number;
  onNavigateInto: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const openFile = useEditorStore((s) => s.openFile);
  const isActive = node.path === activeTabPath;

  const handleClick = useCallback(async () => {
    if (node.isDir) {
      setExpanded((e) => !e);
      return;
    }
    // Check if file is already open
    const state = useEditorStore.getState();
    const existing = state.openTabs.find((t) => t.path === node.path);
    if (existing) {
      state.setActiveTab(node.path);
      return;
    }
    try {
      const content = await api.readFile(node.path);
      openFile(node.path, content);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, [node.path, node.isDir, openFile]);

  const handleDoubleClick = useCallback(() => {
    if (node.isDir) {
      onNavigateInto(node.path);
    }
  }, [node.isDir, node.path, onNavigateInto]);

  return (
    <>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          paddingLeft: 8 + depth * 14,
          fontSize: 12,
          cursor: 'pointer',
          color: isActive ? 'var(--accent)' : 'var(--text-primary)',
          background: isActive ? 'var(--accent-bg)' : 'transparent',
          fontWeight: isActive ? 500 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
        title={node.isDir ? `Double-click to navigate into ${node.path}` : node.path}
      >
        <FileIcon isDir={node.isDir} isOpen={expanded} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
      {node.isDir && expanded && node.children.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth + 1} onNavigateInto={onNavigateInto} />
      ))}
    </>
  );
}

function NewFileInput({
  currentDir,
  onDone,
}: {
  currentDir: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const name = value.trim();
    if (!name) {
      onDone();
      return;
    }
    const fullPath = currentDir ? `${currentDir}/${name}` : name;
    try {
      await api.createFile(fullPath);
      // Refresh file tree
      const files = await api.listFiles();
      useEditorStore.getState().setFileTree(files);
      // Open the new file
      const content = await api.readFile(fullPath);
      useEditorStore.getState().openFile(fullPath, content);
    } catch (err) {
      console.error('Failed to create file:', err);
    }
    onDone();
  };

  return (
    <div style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          width: 16,
          textAlign: 'center',
          flexShrink: 0,
          color: 'var(--text-dim)',
        }}
      >
        ◇
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') onDone();
        }}
        onBlur={handleSubmit}
        placeholder="filename.tex"
        style={{
          flex: 1,
          fontSize: 12,
          padding: '2px 4px',
          border: '1px solid var(--border-strong)',
          borderRadius: 3,
          background: 'var(--bg-editor)',
          color: 'var(--text-primary)',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

export default function FileTree() {
  const fileTree = useEditorStore((s) => s.fileTree);
  const [currentDir, setCurrentDir] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);

  const tree = buildTree(fileTree);
  const visibleNodes = getSubtree(tree, currentDir);

  const handleNavigateUp = useCallback(() => {
    setCurrentDir((dir) => {
      const parts = dir.split('/').filter(Boolean);
      parts.pop();
      return parts.join('/');
    });
  }, []);

  const handleNavigateInto = useCallback((path: string) => {
    setCurrentDir(path);
  }, []);

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div
        style={{
          padding: '8px 12px 4px',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          color: 'var(--text-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Files</span>
        <button
          onClick={() => setCreatingFile(true)}
          title="New file"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            color: 'var(--text-dim)',
            padding: '0 2px',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)';
          }}
        >
          +
        </button>
      </div>
      {currentDir && (
        <div
          onClick={handleNavigateUp}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            fontSize: 12,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          title="Go up one level"
        >
          <span style={{ fontSize: 12, width: 16, textAlign: 'center', flexShrink: 0 }}>↑</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>../{currentDir.split('/').pop()}</span>
        </div>
      )}
      {creatingFile && (
        <NewFileInput currentDir={currentDir} onDone={() => setCreatingFile(false)} />
      )}
      {visibleNodes.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} onNavigateInto={handleNavigateInto} />
      ))}
    </div>
  );
}
