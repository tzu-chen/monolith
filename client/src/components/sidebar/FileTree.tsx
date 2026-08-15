import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { ReactNode } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';
import { ChevronDown, ChevronRight, ArrowUp, ArrowRight } from '../shared/Icons';
import { rowStyle, hoverRow, leaveRow } from '../shared/ui';
import { fs, font, metrics, radius } from '../../theme/tokens';

/**
 * Project file tree.
 *
 * Folders expand in place; the arrow on a hovered folder scopes the tree to it
 * instead, which is how deep projects stay legible in a 268px panel. The active
 * file carries the 2px accent left edge and a 5px dot when it has unsaved
 * changes.
 *
 * The panel chrome (header, find row) lives in `FilesPanel`; this renders the
 * tree body and owns the file operations reachable from it.
 */

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export interface FileTreeHandle {
  startNewFile: () => void;
  startNewFolder: () => void;
  upload: () => void;
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

    const node: TreeNode = { name, path: cleanPath, isDir, children: [] };
    if (isDir) dirMap.set(cleanPath, node);

    if (parentPath && dirMap.has(parentPath)) {
      dirMap.get(parentPath)!.children.push(node);
    } else {
      // No parent listed — surface it at the root rather than dropping it.
      root.push(node);
    }
  }

  return root;
}

/**
 * Keep only `.tex`, and only the folders that lead to one. Pruning empty
 * branches is the point: filtering the leaves alone would leave a tree of
 * folders that open onto nothing.
 */
function pruneToTex(nodes: TreeNode[]): TreeNode[] {
  const kept: TreeNode[] = [];
  for (const node of nodes) {
    if (!node.isDir) {
      if (node.name.toLowerCase().endsWith('.tex')) kept.push(node);
      continue;
    }
    const children = pruneToTex(node.children);
    if (children.length > 0) kept.push({ ...node, children });
  }
  return kept;
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

// ── Context menu ──

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode | null; // null = background right-click
}

function ContextMenu({
  menu,
  projects,
  currentProject,
  onClose,
  onAction,
  onTransfer,
}: {
  menu: ContextMenuState;
  projects: string[];
  currentProject: string | null;
  onClose: () => void;
  onAction: (action: string) => void;
  onTransfer: (toProject: string, mode: 'copy' | 'move') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<'copy' | 'move' | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (submenu) setSubmenu(null);
      else onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose, submenu]);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    left: menu.x,
    top: menu.y,
    background: 'var(--surface-paper)',
    border: '1px solid var(--line-strong)',
    borderRadius: 7,
    boxShadow: 'var(--shadow-popover)',
    zIndex: 1000,
    minWidth: 190,
    padding: '4px 0',
    overflow: 'hidden',
  };

  const item = (label: string, onClick: () => void, tone?: 'danger' | 'muted') => (
    <div
      key={label}
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: fs.control,
        cursor: 'pointer',
        color: tone === 'danger' ? 'var(--error)' : tone === 'muted' ? 'var(--text-faint)' : 'var(--text)',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-wash)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </div>
  );

  if (submenu) {
    const others = projects.filter((p) => p !== currentProject);
    return (
      <div ref={ref} style={containerStyle}>
        <div style={{ borderBottom: '1px solid var(--line)', marginBottom: 2 }}>
          {item(`← ${submenu === 'copy' ? 'Copy to project' : 'Move to project'}`, () => setSubmenu(null), 'muted')}
        </div>
        {others.length === 0
          ? item('No other projects', () => {}, 'muted')
          : others.map((p) => item(p, () => onTransfer(p, submenu)))}
      </div>
    );
  }

  const items: ReactNode[] = [];
  if (!menu.node || menu.node.isDir) {
    items.push(item('New file', () => onAction('newFile')));
    items.push(item('New folder', () => onAction('newFolder')));
  }
  if (menu.node) {
    items.push(item('Rename', () => onAction('rename')));
    items.push(item('Copy to project…', () => setSubmenu('copy')));
    items.push(item('Move to project…', () => setSubmenu('move')));
    items.push(item('Delete', () => onAction('delete'), 'danger'));
  }

  return <div ref={ref} style={containerStyle}>{items}</div>;
}

// ── Inline input ──

function InlineInput({
  icon,
  initialValue,
  placeholder,
  onSubmit,
  onCancel,
  indent = 0,
}: {
  icon: ReactNode;
  initialValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  indent?: number;
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
    if (trimmed && trimmed !== initialValue) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <div style={{ padding: `2px ${metrics.padPanel}px 2px ${metrics.padPanel + indent}px`, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, display: 'flex', justifyContent: 'center', color: 'var(--text-faint)', flexShrink: 0 }}>
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
          minWidth: 0,
          fontSize: fs.toolbar,
          fontFamily: font.mono,
          padding: '2px 6px',
          border: '1px solid var(--accent)',
          borderRadius: radius.chip,
          background: 'var(--surface-editor)',
          color: 'var(--text)',
          outline: 'none',
        }}
      />
    </div>
  );
}

// ── Helpers ──

async function refreshFileTree() {
  useEditorStore.getState().setFileTree(await api.listFiles());
}

function closeTabsUnderPath(path: string) {
  const state = useEditorStore.getState();
  for (const tab of state.openTabs) {
    if (tab.path === path || tab.path.startsWith(path + '/')) {
      state.closeTab(tab.path);
    }
  }
}

// ── Tree item ──

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
  const dirtyPaths = useEditorStore((s) => s.openTabs);
  const openFile = useEditorStore((s) => s.openFile);
  const isActive = node.path === activeTabPath;
  const isDirty = dirtyPaths.some((t) => t.path === node.path && t.dirty);

  const handleClick = useCallback(async () => {
    if (node.isDir) {
      setExpanded((e) => !e);
      return;
    }
    const state = useEditorStore.getState();
    if (state.openTabs.some((t) => t.path === node.path)) {
      state.setActiveTab(node.path);
      return;
    }
    try {
      openFile(node.path, await api.readFile(node.path));
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, [node.path, node.isDir, openFile]);

  if (renamingPath === node.path) {
    return (
      <InlineInput
        icon={node.isDir ? <ChevronRight size={11} /> : null}
        initialValue={node.name}
        onSubmit={(newName) => onRenameSubmit(node.path, newName)}
        onCancel={onRenameCancel}
        indent={depth * 16}
      />
    );
  }

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        onMouseEnter={(e) => { setHovered(true); hoverRow(e, isActive); }}
        onMouseLeave={(e) => { setHovered(false); leaveRow(e, isActive); }}
        title={node.path}
        style={rowStyle(isActive, {
          gap: 6,
          padding: `4px ${metrics.padPanel}px 4px ${metrics.padPanel - 2 + depth * 16}px`,
          fontFamily: node.isDir ? font.ui : font.mono,
          fontSize: node.isDir ? fs.toolbar : fs.row,
          overflow: 'hidden',
        })}
      >
        <span style={{ width: 12, display: 'flex', justifyContent: 'center', flexShrink: 0, color: 'var(--text-faint)' }}>
          {node.isDir && (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {node.name}
          {node.isDir && '/'}
        </span>
        {isDirty && (
          <span
            title="Unsaved changes"
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
          />
        )}
        {node.isDir && hovered && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onNavigateInto(node.path);
            }}
            title={`Scope tree to ${node.path}`}
            style={{ marginLeft: 'auto', display: 'flex', color: 'var(--text-faint)', flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
          >
            <ArrowRight size={12} />
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

// ── FileTree ──

const FileTree = forwardRef<FileTreeHandle>(function FileTree(_props, ref) {
  const fileTree = useEditorStore((s) => s.fileTree);
  const projects = useEditorStore((s) => s.projects);
  const currentProject = useEditorStore((s) => s.currentProject);
  const hideNonTexFiles = useEditorStore((s) => s.hideNonTexFiles);
  const [currentDir, setCurrentDir] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    startNewFile: () => setCreatingFile(true),
    startNewFolder: () => setCreatingFolder(true),
    upload: () => fileInputRef.current?.click(),
  }));

  const tree = buildTree(fileTree);
  // Scope first, filter second: the folder the tree is scoped to has to be
  // findable even when the filter would have pruned it away.
  const scopedNodes = currentDir ? findNode(tree, currentDir)?.children ?? tree : tree;
  const visibleNodes = hideNonTexFiles ? pruneToTex(scopedNodes) : scopedNodes;

  const handleNavigateUp = useCallback(() => {
    setCurrentDir((dir) => {
      const lastSlash = dir.lastIndexOf('/');
      return lastSlash === -1 ? '' : dir.substring(0, lastSlash);
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node: null });
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
      const state = useEditorStore.getState();
      for (const tab of state.openTabs) {
        if (tab.path === oldPath || tab.path.startsWith(oldPath + '/')) {
          const updatedPath = newPath + tab.path.substring(oldPath.length);
          state.closeTab(tab.path);
          try {
            state.openFile(updatedPath, await api.readFile(updatedPath));
          } catch {
            // Not readable after rename (e.g. binary) — leave it closed.
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
      useEditorStore.getState().openFile(fullPath, await api.readFile(fullPath));
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
        try {
          useEditorStore.getState().openFile(result.path, await api.readFile(result.path));
        } catch {
          // Binary upload — it lands in the tree without opening.
        }
      } catch (err) {
        console.error('Failed to upload file:', err);
      }
    }
    e.target.value = '';
  }, [currentDir]);

  const handleTransfer = useCallback(async (toProject: string, mode: 'copy' | 'move') => {
    const node = contextMenu?.node;
    setContextMenu(null);
    if (!node) return;
    try {
      try {
        await api.transferFile(node.path, toProject, { mode });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('Destination already exists') || msg.includes('409')) {
          if (!window.confirm(`"${node.path}" already exists in "${toProject}". Overwrite?`)) return;
          await api.transferFile(node.path, toProject, { mode, overwrite: true });
        } else {
          throw err;
        }
      }
      if (mode === 'move') {
        closeTabsUnderPath(node.path);
        await refreshFileTree();
      }
    } catch (err) {
      console.error(`Failed to ${mode} to project:`, err);
      window.alert(`Failed to ${mode} to "${toProject}": ${err}`);
    }
  }, [contextMenu]);

  const handleContextAction = useCallback((action: string) => {
    const node = contextMenu?.node ?? null;
    setContextMenu(null);

    if (action === 'delete' && node) {
      handleDelete(node);
    } else if (action === 'rename' && node) {
      setRenamingPath(node.path);
    } else if (action === 'newFile' || action === 'newFolder') {
      if (node?.isDir) setCurrentDir(node.path);
      if (action === 'newFile') setCreatingFile(true);
      else setCreatingFolder(true);
    }
  }, [contextMenu, handleDelete]);

  const breadcrumbs = currentDir ? currentDir.split('/') : [];

  return (
    <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '6px 0' }} onContextMenu={handleBackgroundContextMenu}>
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} />

      {currentDir && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: `4px ${metrics.padPanel}px`,
              fontSize: fs.meta,
              fontFamily: font.mono,
              color: 'var(--text-faint)',
              borderBottom: '1px solid var(--line-faint)',
              flexWrap: 'wrap',
            }}
          >
            <span onClick={() => setCurrentDir('')} style={{ cursor: 'pointer', color: 'var(--accent)' }} title="Go to project root">
              ~
            </span>
            {breadcrumbs.map((segment, i) => {
              const segmentPath = breadcrumbs.slice(0, i + 1).join('/');
              const isLast = i === breadcrumbs.length - 1;
              return (
                <span key={segmentPath} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span>/</span>
                  <span
                    onClick={isLast ? undefined : () => setCurrentDir(segmentPath)}
                    style={{
                      cursor: isLast ? 'default' : 'pointer',
                      color: isLast ? 'var(--text)' : 'var(--accent)',
                    }}
                  >
                    {segment}
                  </span>
                </span>
              );
            })}
          </div>
          <div
            onClick={handleNavigateUp}
            title="Go up one level"
            style={rowStyle(false, {
              gap: 6,
              padding: `4px ${metrics.padPanel}px`,
              fontSize: fs.toolbar,
            })}
            onMouseEnter={(e) => hoverRow(e, false)}
            onMouseLeave={(e) => leaveRow(e, false)}
          >
            <span style={{ width: 12, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowUp size={11} />
            </span>
            ..
          </div>
        </>
      )}

      {creatingFile && (
        <InlineInput placeholder="filename.tex" icon={null} onSubmit={handleNewFileSubmit} onCancel={() => setCreatingFile(false)} />
      )}
      {creatingFolder && (
        <InlineInput
          placeholder="folder name"
          icon={<ChevronRight size={11} />}
          onSubmit={handleNewFolderSubmit}
          onCancel={() => setCreatingFolder(false)}
        />
      )}

      {visibleNodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          onNavigateInto={setCurrentDir}
          onContextMenu={handleContextMenu}
          renamingPath={renamingPath}
          onRenameSubmit={handleRenameSubmit}
          onRenameCancel={() => setRenamingPath(null)}
        />
      ))}

      {visibleNodes.length === 0 && (
        <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text-faint)', fontSize: fs.control }}>
          {!currentProject
            ? 'No project loaded'
            : scopedNodes.length > 0
              ? 'No .tex files here — Settings shows the rest'
              : 'No files here yet'}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          projects={projects}
          currentProject={currentProject}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
          onTransfer={handleTransfer}
        />
      )}
    </div>
  );
});

export default FileTree;
