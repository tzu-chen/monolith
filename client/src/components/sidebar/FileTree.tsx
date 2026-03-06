import { useState, useCallback } from 'react';
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

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
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

  return (
    <>
      <div
        onClick={handleClick}
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
        title={node.path}
      >
        <FileIcon isDir={node.isDir} isOpen={expanded} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
      {node.isDir && expanded && node.children.map((child) => (
        <TreeItem key={child.path} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function FileTree() {
  const fileTree = useEditorStore((s) => s.fileTree);
  const tree = buildTree(fileTree);

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
        }}
      >
        Files
      </div>
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
