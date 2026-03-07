import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';

export default function ProjectSwitcher() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const projects = useEditorStore((s) => s.projects);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
        setError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  const handleSwitch = useCallback(async (name: string) => {
    if (name === currentProject) {
      setOpen(false);
      return;
    }
    try {
      const { projectRoot } = await api.switchProject(name);
      const store = useEditorStore.getState();
      store.resetEditorState();
      store.setCurrentProject(name);
      store.setProjectRoot(projectRoot);

      const files = await api.listFiles();
      store.setFileTree(files);

      try {
        const content = await api.readFile('main.tex');
        store.openFile('main.tex', content);
      } catch {
        // No main.tex in this project
      }
    } catch (err) {
      console.error('Failed to switch project:', err);
    }
    setOpen(false);
  }, [currentProject]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setError('');
    try {
      await api.createProject(name);
      const projectList = await api.listProjects();
      useEditorStore.getState().setProjects(projectList);
      setCreating(false);
      setNewName('');
      await handleSwitch(name);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
  }, [newName, handleSwitch]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12.5,
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
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {currentProject || 'No project'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          {open ? '▴' : '▾'}
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
            minWidth: 200,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Project list */}
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {projects.map((name) => (
              <div
                key={name}
                onClick={() => handleSwitch(name)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  color: name === currentProject ? 'var(--accent)' : 'var(--text-primary)',
                  background: name === currentProject ? 'var(--accent-bg)' : 'transparent',
                  fontWeight: name === currentProject ? 500 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  if (name !== currentProject)
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (name !== currentProject)
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {name === currentProject && (
                  <span style={{ fontSize: 10 }}>●</span>
                )}
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </span>
              </div>
            ))}
          </div>

          {/* Separator + New Project */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: creating ? '6px 8px' : undefined,
            }}
          >
            {creating ? (
              <div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    ref={inputRef}
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') {
                        setCreating(false);
                        setNewName('');
                        setError('');
                      }
                    }}
                    placeholder="project-name"
                    style={{
                      flex: 1,
                      fontSize: 12,
                      padding: '4px 6px',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 4,
                      background: 'var(--bg-editor)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={handleCreate}
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      background: 'var(--accent)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Create
                  </button>
                </div>
                {error && (
                  <div style={{ fontSize: 11, color: '#c44', marginTop: 4 }}>{error}</div>
                )}
              </div>
            ) : (
              <div
                onClick={() => setCreating(true)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                + New Project...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
