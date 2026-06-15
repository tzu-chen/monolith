import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';
import { CloseIcon, PlusIcon, EditIcon, CopyIcon, DotIcon } from '../shared/Icons';

const TEMPLATES = [
  { value: 'blank', label: 'Empty' },
  { value: 'article', label: 'Article' },
];

function relativeTime(ms: number): string {
  if (!ms) return 'empty';
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
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

export default function ProjectManager() {
  const close = useEditorStore((s) => s.setShowProjectManager);
  const currentProject = useEditorStore((s) => s.currentProject);

  const [metas, setMetas] = useState<api.ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTemplate, setNewTemplate] = useState('blank');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [dupName, setDupName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const newInputRef = useRef<HTMLInputElement>(null);
  const closeModal = useCallback(() => close(false), [close]);

  const reload = useCallback(async () => {
    const [meta, list] = await Promise.all([api.projectsMeta(), api.listProjects()]);
    setMetas(meta);
    useEditorStore.getState().setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload().catch((e) => { setError(String(e.message || e)); setLoading(false); });
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);

  useEffect(() => {
    if (creating) newInputRef.current?.focus();
  }, [creating]);

  const resetInlineState = () => {
    setRenaming(null); setRenameName('');
    setDuplicating(null); setDupName('');
    setConfirmDelete(null); setError('');
  };

  const openProject = useCallback(async (name: string) => {
    const store = useEditorStore.getState();
    if (name === store.currentProject) { closeModal(); return; }
    try {
      const { projectRoot } = await api.switchProject(name);
      store.resetEditorState();
      store.setCurrentProject(name);
      store.setProjectRoot(projectRoot);
      store.setFileTree(await api.listFiles());
      try {
        store.openFile('main.tex', await api.readFile('main.tex'));
      } catch {
        // no main.tex
      }
      closeModal();
    } catch (err: any) {
      setError(err.message || 'Failed to open project');
    }
  }, [closeModal]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      await api.createProject(name, newTemplate);
      setCreating(false); setNewName('');
      await openProject(name);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
    setBusy(false);
  }, [newName, newTemplate, openProject]);

  const handleRename = useCallback(async (oldName: string) => {
    const next = renameName.trim();
    if (!next || next === oldName) { resetInlineState(); return; }
    setBusy(true); setError('');
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
    setBusy(true); setError('');
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
    setBusy(true); setError('');
    try {
      const result = await api.deleteProject(name);
      const store = useEditorStore.getState();
      if (result.switchedTo) {
        store.resetEditorState();
        store.setCurrentProject(result.switchedTo);
        const { projectRoot } = await api.getCurrentProject();
        store.setProjectRoot(projectRoot);
        store.setFileTree(await api.listFiles());
        try { store.openFile('main.tex', await api.readFile('main.tex')); } catch {}
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

  const filtered = metas.filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()));

  const inputStyle: React.CSSProperties = {
    fontSize: 15,
    padding: '5px 9px',
    border: '1px solid var(--border-strong)',
    borderRadius: 5,
    background: 'var(--bg-editor)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    outline: 'none',
  };
  const smallBtn = (variant: 'accent' | 'danger' | 'plain'): React.CSSProperties => ({
    fontSize: 14,
    padding: '4px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: variant === 'plain' ? '1px solid var(--border)' : 'none',
    background: variant === 'accent' ? 'var(--accent)' : variant === 'danger' ? 'var(--red)' : 'var(--bg-editor)',
    color: variant === 'plain' ? 'var(--text-primary)' : 'white',
  });
  const iconBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    color: 'var(--text-dim)',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div
      onClick={closeModal}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <style>{`.pm-row .pm-actions{opacity:0;transition:opacity .12s}.pm-row:hover .pm-actions{opacity:1}`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 'min(560px, 94vw)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Projects</h2>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, border: '1px solid var(--border)' }}
          />
          {!creating && (
            <button onClick={() => { resetInlineState(); setCreating(true); }} style={{ ...smallBtn('accent'), display: 'flex', alignItems: 'center', gap: 5 }}>
              <PlusIcon size={13} /> New
            </button>
          )}
          <button onClick={closeModal} title="Close" style={iconBtn}>
            <CloseIcon size={16} />
          </button>
        </div>

        {/* New project form */}
        {creating && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-warm)' }}>
            <input
              ref={newInputRef}
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
              placeholder="project-name"
              style={{ ...inputStyle, flex: 1 }}
            />
            <select value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button onClick={handleCreate} disabled={busy || !newName.trim()} style={smallBtn('accent')}>Create</button>
            <button onClick={() => { setCreating(false); setNewName(''); setError(''); }} style={smallBtn('plain')}>Cancel</button>
          </div>
        )}

        {error && <div style={{ fontSize: 14, color: 'var(--red)', padding: '8px 18px' }}>{error}</div>}

        {/* Project list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>
              {search ? 'No projects match your search' : 'No projects yet'}
            </div>
          ) : (
            filtered.map((m) => {
              const isCurrent = m.name === currentProject;
              if (renaming === m.name) {
                return (
                  <div key={m.name} style={{ display: 'flex', gap: 8, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
                    <input
                      autoFocus
                      value={renameName}
                      onChange={(e) => { setRenameName(e.target.value); setError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(m.name); if (e.key === 'Escape') resetInlineState(); }}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => handleRename(m.name)} disabled={busy} style={smallBtn('accent')}>Save</button>
                    <button onClick={resetInlineState} style={smallBtn('plain')}>Cancel</button>
                  </div>
                );
              }
              if (duplicating === m.name) {
                return (
                  <div key={m.name} style={{ display: 'flex', gap: 8, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
                    <input
                      autoFocus
                      value={dupName}
                      onChange={(e) => { setDupName(e.target.value); setError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleDuplicate(m.name); if (e.key === 'Escape') resetInlineState(); }}
                      placeholder={`${m.name}-copy`}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={() => handleDuplicate(m.name)} disabled={busy || !dupName.trim()} style={smallBtn('accent')}>Duplicate</button>
                    <button onClick={resetInlineState} style={smallBtn('plain')}>Cancel</button>
                  </div>
                );
              }
              if (confirmDelete === m.name) {
                return (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-warm)' }}>
                    <span style={{ flex: 1, fontSize: 15, color: 'var(--text-primary)' }}>Delete "{m.name}" and all its files?</span>
                    <button onClick={() => handleDelete(m.name)} disabled={busy} style={smallBtn('danger')}>Delete</button>
                    <button onClick={resetInlineState} style={smallBtn('plain')}>Cancel</button>
                  </div>
                );
              }
              return (
                <div
                  key={m.name}
                  className="pm-row"
                  onClick={() => openProject(m.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 18px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: isCurrent ? 'var(--accent-bg)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {isCurrent && <span style={{ color: 'var(--accent)', display: 'flex' }}><DotIcon size={9} /></span>}
                  <span style={{ fontSize: 16, color: isCurrent ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isCurrent ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {m.fileCount} file{m.fileCount === 1 ? '' : 's'} · {relativeTime(m.modified)}
                  </span>
                  <span className="pm-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <button title="Duplicate" onClick={() => { resetInlineState(); setDuplicating(m.name); setDupName(`${m.name}-copy`); }} style={iconBtn}>
                      <CopyIcon size={14} />
                    </button>
                    <button title="Rename" onClick={() => { resetInlineState(); setRenaming(m.name); setRenameName(m.name); }} style={iconBtn}>
                      <EditIcon size={14} />
                    </button>
                    <button title="Delete" onClick={() => { resetInlineState(); setConfirmDelete(m.name); }} style={{ ...iconBtn, color: 'var(--red)' }}>
                      <CloseIcon size={14} />
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
