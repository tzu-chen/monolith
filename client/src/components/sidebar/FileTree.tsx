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

function findNode(tree: TreeNode[], path: string): TreeNode | null {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.isDir) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
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
  const [hovered, setHovered] = useState(false);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const openFile = useEditorStore((s) => s.openFile);
  const isActive = node.path === activeTabPath;

  const handleClick = useCallback(async () => {
    if (node.isDir) {
      setExpanded((e) => !e);
      return;
    }
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
        onMouseEnter={(e) => {
          setHovered(true);
          if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          setHovered(false);
          if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
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
          position: 'relative',
        }}
        title={node.path}
      >
        <FileIcon isDir={node.isDir} isOpen={expanded} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{node.name}</span>
        {node.isDir && hovered && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onNavigateInto(node.path);
            }}
            title="Open folder"
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              flexShrink: 0,
              padding: '0 2px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)';
            }}
          >
            →
          </span>
        )}
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
      const files = await api.listFiles();
      useEditorStore.getState().setFileTree(files);
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
  const projectRoot = useEditorStore((s) => s.projectRoot);
  const [currentDir, setCurrentDir] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);

  const tree = buildTree(fileTree);

  // Get visible nodes for the current directory
  let visibleNodes: TreeNode[];
  if (!currentDir) {
    visibleNodes = tree;
  } else {
    const dirNode = findNode(tree, currentDir);
    visibleNodes = dirNode ? dirNode.children : tree;
  }

  const handleNavigateUp = useCallback(() => {
    setCurrentDir((dir) => {
      if (!dir) return '';
      const lastSlash = dir.lastIndexOf('/');
      return lastSlash === -1 ? '' : dir.substring(0, lastSlash);
    });
  }, []);

  const handleNavigateInto = useCallback((path: string) => {
    setCurrentDir(path);
  }, []);

  // Build breadcrumb segments from currentDir
  const breadcrumbs = currentDir ? currentDir.split('/') : [];

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Header */}
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

      {/* Project path */}
      {projectRoot && (
        <div
          style={{
            padding: '0 12px 4px',
            fontSize: 10,
            color: 'var(--text-dim)',
            fontFamily: "'Source Code Pro', monospace",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={projectRoot}
        >
          {projectRoot}
        </div>
      )}

      {/* Current directory breadcrumb bar */}
      {currentDir && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '3px 8px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 2,
            flexWrap: 'wrap',
          }}
        >
          <span
            onClick={() => setCurrentDir('')}
            style={{
              cursor: 'pointer',
              color: 'var(--accent-light)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.textDecoration = 'none';
            }}
            title="Go to root"
          >
            ~
          </span>
          {breadcrumbs.map((segment, i) => {
            const segmentPath = breadcrumbs.slice(0, i + 1).join('/');
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={segmentPath} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ color: 'var(--text-dim)' }}>/</span>
                {isLast ? (
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{segment}</span>
                ) : (
                  <span
                    onClick={() => setCurrentDir(segmentPath)}
                    style={{
                      cursor: 'pointer',
                      color: 'var(--accent-light)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.textDecoration = 'none';
                    }}
                    title={`Go to ${segmentPath}`}
                  >
                    {segment}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Go up row */}
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
          <span>..</span>
        </div>
      )}

      {/* New file input */}
      {creatingFile && (
        <NewFileInput currentDir={currentDir} onDone={() => setCreatingFile(false)} />
      )}

      {/* File tree items */}
      {visibleNodes.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} onNavigateInto={handleNavigateInto} />
      ))}
    </div>
  );
}
