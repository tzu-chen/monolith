import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';
import {
  PanelHeader,
  FilterRow,
  FilterInput,
  PanelBody,
  OutlinedButton,
  IconButton,
  Badge,
  SectionLabel,
  rowStyle,
  hoverRow,
  leaveRow,
} from '../shared/ui';
import {
  EditIcon,
  CopyIcon,
  ArchiveIcon,
  UnarchiveIcon,
  CloseIcon,
  ChevronDown,
  ChevronRight,
} from '../shared/Icons';
import { fs, font, metrics, radius } from '../../theme/tokens';

/**
 * Project browser (handoff S2).
 *
 * Switching a project is a **navigation, not a filter** — that is why this is a
 * destination panel rather than a dropdown, and why the workspace behind it
 * dims (see `Shell`) instead of staying fully lit: the current project is still
 * loaded, it is simply no longer what you are looking at.
 *
 * The handoff's metadata line lists page count, dirty count and last-compile
 * time. Only two of those are knowable without opening every project, so rows
 * show what the server actually tracks — file count and last modification —
 * plus the dirty count for the project that *is* open.
 */

const TEMPLATES = [
  { value: 'blank', label: 'Empty' },
  { value: 'article', label: 'Article' },
];

function relativeTime(ms: number): string {
  if (!ms) return 'empty';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export default function ProjectsPanel() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const openTabs = useEditorStore((s) => s.openTabs);
  const errors = useEditorStore((s) => s.errors);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  const [metas, setMetas] = useState<api.ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTemplate, setNewTemplate] = useState('blank');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [dupName, setDupName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const newInputRef = useRef<HTMLInputElement>(null);

  const dirtyCount = useMemo(() => openTabs.filter((t) => t.dirty).length, [openTabs]);

  const reload = useCallback(async () => {
    const [meta, list] = await Promise.all([api.projectsMeta(), api.listProjects()]);
    setMetas(meta);
    useEditorStore.getState().setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload().catch((e) => {
      setError(String(e.message || e));
      setLoading(false);
    });
  }, [reload]);

  useEffect(() => {
    if (creating) newInputRef.current?.focus();
  }, [creating]);

  const resetInlineState = () => {
    setRenaming(null);
    setRenameName('');
    setDuplicating(null);
    setDupName('');
    setConfirmDelete(null);
    setError('');
  };

  const openProject = useCallback(async (name: string) => {
    const store = useEditorStore.getState();
    if (name === store.currentProject) {
      setActivePanel('files');
      return;
    }
    try {
      const { projectRoot } = await api.switchProject(name);
      store.resetEditorState();
      store.setCurrentProject(name);
      store.setProjectRoot(projectRoot);
      store.setFileTree(await api.listFiles());
      try {
        store.openFile('main.tex', await api.readFile('main.tex'));
      } catch {
        // No main.tex in this project.
      }
      setActivePanel('files');
    } catch (err: any) {
      setError(err.message || 'Failed to open project');
    }
  }, [setActivePanel]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      await api.createProject(name, newTemplate);
      setCreating(false);
      setNewName('');
      await openProject(name);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
    setBusy(false);
  }, [newName, newTemplate, openProject]);

  const handleRename = useCallback(async (oldName: string) => {
    const next = renameName.trim();
    if (!next || next === oldName) {
      resetInlineState();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.renameProject(oldName, next);
      const store = useEditorStore.getState();
      if (store.currentProject === oldName) {
        store.setCurrentProject(next);
        store.setProjectRoot(result.projectRoot);
      }
      resetInlineState();
      await reload();
    } catch (err: any) {
      setError(err.message || 'Failed to rename project');
    }
    setBusy(false);
  }, [renameName, reload]);

  const handleDuplicate = useCallback(async (name: string) => {
    const next = dupName.trim();
    if (!next) return;
    setBusy(true);
    setError('');
    try {
      await api.duplicateProject(name, next);
      resetInlineState();
      await reload();
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate project');
    }
    setBusy(false);
  }, [dupName, reload]);

  const handleDelete = useCallback(async (name: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await api.deleteProject(name);
      const store = useEditorStore.getState();
      if (result.switchedTo) {
        store.resetEditorState();
        store.setCurrentProject(result.switchedTo);
        const { projectRoot } = await api.getCurrentProject();
        store.setProjectRoot(projectRoot);
        store.setFileTree(await api.listFiles());
        try {
          store.openFile('main.tex', await api.readFile('main.tex'));
        } catch {
          // No main.tex in the project we fell back to.
        }
      } else if (store.currentProject === name) {
        store.resetEditorState();
        store.setCurrentProject(null);
        store.setProjectRoot(null);
      }
      resetInlineState();
      await reload();
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    }
    setBusy(false);
  }, [reload]);

  const handleArchive = useCallback(async (name: string, archived: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api.setProjectArchived(name, archived);
      resetInlineState();
      await reload();
    } catch (err: any) {
      setError(err.message || `Failed to ${archived ? 'archive' : 'unarchive'} project`);
    }
    setBusy(false);
  }, [reload]);

  const matches = (m: api.ProjectMeta) => m.name.toLowerCase().includes(search.toLowerCase());
  const active = metas.filter((m) => !m.archived && matches(m));
  const archived = metas.filter((m) => m.archived && matches(m));

  const inlineInputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    fontSize: fs.control,
    fontFamily: font.ui,
    padding: '4px 8px',
    border: '1px solid var(--accent)',
    borderRadius: radius.chip,
    background: 'var(--surface-editor)',
    color: 'var(--text)',
    outline: 'none',
  };

  function ProjectRow({ meta }: { meta: api.ProjectMeta }) {
    const isOpen = meta.name === currentProject;
    const [hovered, setHovered] = useState(false);

    if (renaming === meta.name) {
      return (
        <div style={{ display: 'flex', gap: 6, padding: `6px ${metrics.padPanel}px` }}>
          <input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename(meta.name);
              if (e.key === 'Escape') resetInlineState();
            }}
            style={inlineInputStyle}
          />
          <OutlinedButton accent onClick={() => handleRename(meta.name)} disabled={busy}>Save</OutlinedButton>
        </div>
      );
    }

    if (duplicating === meta.name) {
      return (
        <div style={{ display: 'flex', gap: 6, padding: `6px ${metrics.padPanel}px` }}>
          <input
            autoFocus
            value={dupName}
            onChange={(e) => setDupName(e.target.value)}
            placeholder={`${meta.name}-copy`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDuplicate(meta.name);
              if (e.key === 'Escape') resetInlineState();
            }}
            style={inlineInputStyle}
          />
          <OutlinedButton accent onClick={() => handleDuplicate(meta.name)} disabled={busy}>Copy</OutlinedButton>
        </div>
      );
    }

    if (confirmDelete === meta.name) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: `8px ${metrics.padPanel}px`,
            borderLeft: '2px solid var(--error)',
            fontSize: fs.control,
            color: 'var(--error)',
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Delete “{meta.name}” and all its files?
          </span>
          <OutlinedButton danger onClick={() => handleDelete(meta.name)} disabled={busy}>Delete</OutlinedButton>
          <OutlinedButton onClick={resetInlineState}>Cancel</OutlinedButton>
        </div>
      );
    }

    return (
      <div
        onClick={() => openProject(meta.name)}
        onMouseEnter={(e) => { setHovered(true); hoverRow(e, isOpen); }}
        onMouseLeave={(e) => { setHovered(false); leaveRow(e, isOpen); }}
        style={rowStyle(isOpen, {
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 2,
          padding: `7px ${metrics.padPanel}px`,
        })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span
            style={{
              fontSize: fs.title,
              fontWeight: isOpen ? 600 : 400,
              color: isOpen ? 'var(--text)' : 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {meta.name}
          </span>
          {isOpen && <Badge tone="accent">open</Badge>}
          {isOpen && errors.length > 0 && <Badge tone="warn">errors</Badge>}
          {hovered && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <IconButton
                bare
                size={20}
                icon={<EditIcon size={12} />}
                title="Rename"
                onClick={() => { resetInlineState(); setRenaming(meta.name); setRenameName(meta.name); }}
              />
              <IconButton
                bare
                size={20}
                icon={<CopyIcon size={12} />}
                title="Duplicate"
                onClick={() => { resetInlineState(); setDuplicating(meta.name); setDupName(`${meta.name}-copy`); }}
              />
              <IconButton
                bare
                size={20}
                icon={meta.archived ? <UnarchiveIcon size={12} /> : <ArchiveIcon size={12} />}
                title={meta.archived ? 'Unarchive' : 'Archive'}
                onClick={() => handleArchive(meta.name, !meta.archived)}
              />
              <IconButton
                bare
                size={20}
                icon={<CloseIcon size={12} />}
                title="Delete"
                onClick={() => { resetInlineState(); setConfirmDelete(meta.name); }}
              />
            </span>
          )}
        </div>
        <div style={{ fontSize: fs.meta, color: 'var(--text-faint)', display: 'flex', gap: 8, minWidth: 0 }}>
          <span>{meta.fileCount} file{meta.fileCount === 1 ? '' : 's'}</span>
          {isOpen && dirtyCount > 0 && <span style={{ color: 'var(--accent)' }}>{dirtyCount} unsaved</span>}
          <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{relativeTime(meta.modified)}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <PanelHeader title="Projects">
        <OutlinedButton accent onClick={() => { resetInlineState(); setCreating(true); }}>New</OutlinedButton>
      </PanelHeader>

      {creating && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            padding: `9px ${metrics.padPanel}px`,
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}
        >
          <input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="project-name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            style={inlineInputStyle}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              style={{
                fontSize: fs.control,
                padding: '4px 6px',
                borderRadius: radius.chip,
                border: '1px solid var(--line)',
                background: 'var(--surface-editor)',
                color: 'var(--text)',
              }}
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <OutlinedButton accent onClick={handleCreate} disabled={busy}>Create</OutlinedButton>
              <OutlinedButton onClick={() => setCreating(false)}>Cancel</OutlinedButton>
            </span>
          </div>
        </div>
      )}

      <FilterRow>
        <FilterInput value={search} onChange={setSearch} placeholder="Filter projects…" />
      </FilterRow>

      {error && (
        <div
          style={{
            padding: `7px ${metrics.padPanel}px`,
            borderBottom: '1px solid var(--line)',
            borderLeft: '2px solid var(--error)',
            color: 'var(--error)',
            fontSize: fs.meta,
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      <PanelBody>
        {loading ? (
          <div style={{ padding: '18px 14px', color: 'var(--text-faint)', fontSize: fs.control, textAlign: 'center' }}>
            Loading projects…
          </div>
        ) : (
          <>
            {active.map((m) => <ProjectRow key={m.name} meta={m} />)}
            {active.length === 0 && (
              <div style={{ padding: '18px 14px', color: 'var(--text-faint)', fontSize: fs.control, textAlign: 'center' }}>
                No projects match
              </div>
            )}

            {archived.length > 0 && (
              <>
                <div
                  onClick={() => setShowArchived(!showArchived)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    marginTop: 8,
                    padding: `9px ${metrics.padPanel}px`,
                    borderTop: '1px solid var(--line)',
                    cursor: 'pointer',
                    color: 'var(--text-faint)',
                  }}
                >
                  {showArchived ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <SectionLabel>Archived ({archived.length})</SectionLabel>
                </div>
                {showArchived && archived.map((m) => <ProjectRow key={m.name} meta={m} />)}
              </>
            )}
          </>
        )}
      </PanelBody>
    </>
  );
}
