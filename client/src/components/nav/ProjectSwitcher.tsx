import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';
import { ChevronUp, ChevronDown, DotIcon, SettingsIcon } from '../shared/Icons';

export default function ProjectSwitcher() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const projects = useEditorStore((s) => s.projects);
  const setShowProjectManager = useEditorStore((s) => s.setShowProjectManager);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showSearch = projects.length > 6;

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus();
  }, [open, showSearch]);

  const handleSwitch = useCallback(async (name: string) => {
    setOpen(false);
    setSearch('');
    if (name === currentProject) return;
    try {
      const { projectRoot } = await api.switchProject(name);
      const store = useEditorStore.getState();
      store.resetEditorState();
      store.setCurrentProject(name);
      store.setProjectRoot(projectRoot);
      store.setFileTree(await api.listFiles());
      try {
        store.openFile('main.tex', await api.readFile('main.tex'));
      } catch {
        // No main.tex in this project
      }
    } catch (err) {
      console.error('Failed to switch project:', err);
    }
  }, [currentProject]);

  const openManager = useCallback(() => {
    setOpen(false);
    setSearch('');
    setShowProjectManager(true);
  }, [setShowProjectManager]);

  const filtered = useMemo(
    () => (search ? projects.filter((p) => p.toLowerCase().includes(search.toLowerCase())) : projects),
    [projects, search]
  );

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 17,
          color: 'var(--text-primary)',
          background: open ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid var(--border)',
          padding: '4px 10px',
          borderRadius: 5,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 500,
          maxWidth: 180,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentProject || 'No project'}
        </span>
        <span style={{ fontSize: 15, color: 'var(--text-dim)', flexShrink: 0 }}>
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            minWidth: 220,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {showSearch && (
            <div style={{ padding: 6, borderBottom: '1px solid var(--border)' }}>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                style={{
                  width: '100%',
                  fontSize: 15,
                  padding: '5px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'var(--bg-editor)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Project list (switch only) */}
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 12px', fontSize: 15, color: 'var(--text-dim)' }}>No matches</div>
            ) : (
              filtered.map((name) => (
                <div
                  key={name}
                  onClick={() => handleSwitch(name)}
                  style={{
                    padding: '7px 12px',
                    fontSize: 17,
                    cursor: 'pointer',
                    color: name === currentProject ? 'var(--accent)' : 'var(--text-primary)',
                    background: name === currentProject ? 'var(--accent-bg)' : 'transparent',
                    fontWeight: name === currentProject ? 500 : 400,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onMouseEnter={(e) => {
                    if (name !== currentProject) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (name !== currentProject) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {name === currentProject && <DotIcon size={10} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {name}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Manage projects */}
          <div
            onClick={openManager}
            style={{
              borderTop: '1px solid var(--border)',
              padding: '8px 12px',
              fontSize: 15,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <SettingsIcon size={13} /> Manage projects…
          </div>
        </div>
      )}
    </div>
  );
}
