import { useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';
import { ChevronDown, ChevronRight, DiamondIcon, ArrowUp, ArrowRight, PlusIcon, CloseIcon } from '../shared/Icons';

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
      <span style={{ width: 16, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
    );
  }
  return (
    <span
      style={{
        width: 16,
        textAlign: 'center',
        flexShrink: 0,
        color: 'var(--text-dim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <DiamondIcon size={10} />
    </span>
  );
}

// ── Context Menu ──

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode | null; // null = background right-click
}

function ContextMenu({
  menu,
  onClose,
  onAction,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const items: { label: string; action: string }[] = [];
  if (!menu.node || menu.node.isDir) {
    items.push({ label: 'New File', action: 'newFile' });
    items.push({ label: 'New Folder', action: 'newFolder' });
  }
  if (menu.node) {
    items.push({ label: 'Rename', action: 'rename' });
    items.push({ label: 'Delete', action: 'delete' });
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-strong)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 1000,
        minWidth: 130,
        padding: '4px 0',
      }}
    >
      {items.map((item) => (
        <div
          key={item.action}
          onClick={() => onAction(item.action)}
          style={{
            padding: '5px 14px',
            fontSize: 17,
            cursor: 'pointer',
            color: item.action === 'delete' ? 'var(--error, #e06c75)' : 'var(--text-primary)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

// ── Inline inputs ──

function InlineInput({
  icon,
  initialValue,
  placeholder,
  onSubmit,
  onCancel,
  style: extraStyle,
}: {
  icon: ReactNode;
  initialValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  style?: React.CSSProperties;
}) {
  const [value, setValue] = useState(initialValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    if (initialValue) inputRef.current?.select();
  }, [initialValue]);

  const doSubmit = () => {
    if (submitted.current) return;
    submitted.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialValue) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <div style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4, ...extraStyle }}>
      <span
        style={{
          fontSize: 16,
          width: 16,
          textAlign: 'center',
          flexShrink: 0,
          color: 'var(--text-dim)',
        }}
      >
        {icon}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') doSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={doSubmit}
        placeholder={placeholder}
        style={{
          flex: 1,
          fontSize: 17,
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

// ── Helpers ──

async function refreshFileTree() {
  const files = await api.listFiles();
  useEditorStore.getState().setFileTree(files);
}

function closeTabsUnderPath(path: string) {
  const state = useEditorStore.getState();
  for (const tab of state.openTabs) {
    if (tab.path === path || tab.path.startsWith(path + '/')) {
      state.closeTab(tab.path);
    }
  }
}

// ── TreeItem ──

function TreeItem({
  node,
  depth,
  onNavigateInto,
  onContextMenu,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
}: {
  node: TreeNode;
  depth: number;
  onNavigateInto: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  renamingPath: string | null;
  onRenameSubmit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const openFile = useEditorStore((s) => s.openFile);
  const isActive = node.path === activeTabPath;
  const isRenaming = renamingPath === node.path;

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

  if (isRenaming) {
    return (
      <InlineInput
        icon={node.isDir ? <ChevronRight size={11} /> : <DiamondIcon size={10} />}
        initialValue={node.name}
        onSubmit={(newName) => onRenameSubmit(node.path, newName)}
        onCancel={onRenameCancel}
        style={{ paddingLeft: 8 + depth * 14 }}
      />
    );
  }

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
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
          fontSize: 17,
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
              fontSize: 16,
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
            <ArrowRight size={11} />
          </span>
        )}
      </div>
      {node.isDir && expanded && node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          onNavigateInto={onNavigateInto}
          onContextMenu={onContextMenu}
          renamingPath={renamingPath}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </>
  );
}

// ── FileTree (main component) ──

export default function FileTree() {
  const fileTree = useEditorStore((s) => s.fileTree);
  const projectRoot = useEditorStore((s) => s.projectRoot);
  const [currentDir, setCurrentDir] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    // Only if the click target is the container itself (not a tree item)
    if (e.target === e.currentTarget) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, node: null });
    }
  }, []);

  const handleDelete = useCallback(async (node: TreeNode) => {
    const message = node.isDir
      ? `Delete folder "${node.name}" and all its contents?`
      : `Delete "${node.name}"?`;
    if (!window.confirm(message)) return;
    try {
      await api.deleteFile(node.path);
      closeTabsUnderPath(node.path);
      await refreshFileTree();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, []);

  const handleRenameSubmit = useCallback(async (oldPath: string, newName: string) => {
    const parentDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
    const newPath = parentDir ? `${parentDir}/${newName}` : newName;
    try {
      await api.renameFile(oldPath, newPath);
      // Update open tabs that reference the old path
      const state = useEditorStore.getState();
      for (const tab of state.openTabs) {
        if (tab.path === oldPath || tab.path.startsWith(oldPath + '/')) {
          const updatedPath = newPath + tab.path.substring(oldPath.length);
          state.closeTab(tab.path);
          try {
            const content = await api.readFile(updatedPath);
            state.openFile(updatedPath, content);
          } catch {
            // File might not be readable after rename (e.g., binary)
          }
        }
      }
      await refreshFileTree();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
    setRenamingPath(null);
  }, []);

  const handleNewFileSubmit = useCallback(async (name: string) => {
    const fullPath = currentDir ? `${currentDir}/${name}` : name;
    try {
      await api.createFile(fullPath);
      await refreshFileTree();
      const content = await api.readFile(fullPath);
      useEditorStore.getState().openFile(fullPath, content);
    } catch (err) {
      console.error('Failed to create file:', err);
    }
    setCreatingFile(false);
  }, [currentDir]);

  const handleNewFolderSubmit = useCallback(async (name: string) => {
    const fullPath = currentDir ? `${currentDir}/${name}` : name;
    try {
      await api.createDirectory(fullPath);
      await refreshFileTree();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
    setCreatingFolder(false);
  }, [currentDir]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const result = await api.uploadFile(file, currentDir);
        await refreshFileTree();
        // Try to open text-based files in the editor
        try {
          const content = await api.readFile(result.path);
          useEditorStore.getState().openFile(result.path, content);
        } catch {
          // Binary file — just refresh the tree, don't open
        }
      } catch (err) {
        console.error('Failed to upload file:', err);
      }
    }
    // Reset the input so the same file can be uploaded again
    e.target.value = '';
  }, [currentDir]);

  // Context menu action: may target a directory (for "new file"/"new folder" inside it)
  const handleContextAction = useCallback((action: string) => {
    const node = contextMenu?.node ?? null;
    setContextMenu(null);

    if (action === 'delete' && node) {
      handleDelete(node);
    } else if (action === 'rename' && node) {
      setRenamingPath(node.path);
    } else if (action === 'newFile') {
      // If right-clicked a directory, create inside it; otherwise use currentDir
      if (node?.isDir) {
        setCurrentDir(node.path);
      }
      setCreatingFile(true);
    } else if (action === 'newFolder') {
      if (node?.isDir) {
        setCurrentDir(node.path);
      }
      setCreatingFolder(true);
    }
  }, [contextMenu, handleDelete]);

  // Build breadcrumb segments from currentDir
  const breadcrumbs = currentDir ? currentDir.split('/') : [];

  return (
    <div
      style={{ flex: 1, overflow: 'auto' }}
      onContextMenu={handleBackgroundContextMenu}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px 4px',
          fontSize: 15,
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Upload file"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 17,
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
          <PlusIcon size={12} />
        </button>
      </div>

      {/* Project path */}
      {projectRoot && (
        <div
          style={{
            padding: '0 12px 4px',
            fontSize: 15,
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
            fontSize: 16,
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
            fontSize: 17,
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
          <span style={{ width: 16, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowUp size={12} /></span>
          <span>..</span>
        </div>
      )}

      {/* New file input */}
      {creatingFile && (
        <InlineInput
          icon={<DiamondIcon size={10} />}
          placeholder="filename.tex"
          onSubmit={handleNewFileSubmit}
          onCancel={() => setCreatingFile(false)}
        />
      )}

      {/* New folder input */}
      {creatingFolder && (
        <InlineInput
          icon={<ChevronRight size={11} />}
          placeholder="folder name"
          onSubmit={handleNewFolderSubmit}
          onCancel={() => setCreatingFolder(false)}
        />
      )}

      {/* File tree items */}
      {visibleNodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          onNavigateInto={handleNavigateInto}
          onContextMenu={handleContextMenu}
          renamingPath={renamingPath}
          onRenameSubmit={handleRenameSubmit}
          onRenameCancel={() => setRenamingPath(null)}
        />
      ))}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}
    </div>
  );
}
