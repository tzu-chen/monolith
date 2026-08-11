import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';
import { FilterInput, SectionLabel, rowStyle } from '../shared/ui';
import { fs, font, radius, metrics } from '../../theme/tokens';
import { mod } from '../../lib/shortcuts';

/**
 * File finder and project switcher, on the platform's Mod+P / Mod+Shift+P.
 *
 * One overlay, two sources. Matching is subsequence-based so `stx` finds
 * `sections/intro.tex`, and consecutive-run scoring keeps whole-word prefixes
 * ahead of scattered hits.
 */

const MAX_RESULTS = 60;

/**
 * Subsequence match with a score, or null when `query` is not a subsequence of
 * `text`. Higher is better: runs of adjacent characters and matches right after
 * a separator both score extra.
 */
function score(text: string, query: string): number | null {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let ti = 0;
  let total = 0;
  let run = 0;
  for (const ch of needle) {
    const found = haystack.indexOf(ch, ti);
    if (found === -1) return null;
    const boundary = found === 0 || '/-_. '.includes(haystack[found - 1]);
    run = found === ti ? run + 1 : 0;
    total += 1 + run * 2 + (boundary ? 3 : 0);
    ti = found + 1;
  }
  // Prefer shorter paths when the match quality ties.
  return total - text.length * 0.01;
}

export default function CommandPalette() {
  const finder = useEditorStore((s) => s.finder);
  const setFinder = useEditorStore((s) => s.setFinder);
  const fileTree = useEditorStore((s) => s.fileTree);
  const projects = useEditorStore((s) => s.projects);
  const currentProject = useEditorStore((s) => s.currentProject);
  const openFile = useEditorStore((s) => s.openFile);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery('');
    setSelected(0);
  }, [finder]);

  const source = useMemo(() => {
    if (finder === 'projects') return projects;
    return fileTree.filter((f) => !f.endsWith('/'));
  }, [finder, fileTree, projects]);

  const results = useMemo(() => {
    if (!query) return source.slice(0, MAX_RESULTS);
    return source
      .map((item) => ({ item, s: score(item, query) }))
      .filter((r): r is { item: string; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map((r) => r.item);
  }, [source, query]);

  const choose = useCallback(
    async (item: string) => {
      setFinder(null);
      if (finder === 'projects') {
        if (item === currentProject) return;
        try {
          const { projectRoot } = await api.switchProject(item);
          const store = useEditorStore.getState();
          store.resetEditorState();
          store.setCurrentProject(item);
          store.setProjectRoot(projectRoot);
          store.setFileTree(await api.listFiles());
          try {
            store.openFile('main.tex', await api.readFile('main.tex'));
          } catch {
            // No main.tex in this project — leave the editor empty.
          }
        } catch (err) {
          console.error('Failed to switch project:', err);
        }
        return;
      }
      const existing = useEditorStore.getState().openTabs.find((t) => t.path === item);
      if (existing) {
        useEditorStore.getState().setActiveTab(item);
        return;
      }
      try {
        openFile(item, await api.readFile(item));
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    },
    [finder, currentProject, openFile, setFinder]
  );

  // Keep the selected row in view as the selection walks past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, results]);

  if (!finder) return null;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setFinder(null);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selected]) choose(results[selected]);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setFinder(null);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '12vh',
        background: 'rgba(0, 0, 0, 0.16)',
      }}
    >
      <div
        onKeyDown={handleKey}
        style={{
          width: 'min(620px, 90vw)',
          maxHeight: '64vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--line-strong)',
          borderRadius: radius.card,
          background: 'var(--surface-paper)',
          boxShadow: 'var(--shadow-popover)',
          overflow: 'hidden',
          animation: 'popover-in 160ms ease-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: `10px ${metrics.padPane}px`,
            borderBottom: '1px solid var(--line)',
          }}
        >
          <SectionLabel>{finder === 'projects' ? 'Projects' : 'Files'}</SectionLabel>
          <FilterInput
            autoFocus
            strong
            value={query}
            onChange={(v) => {
              setQuery(v);
              setSelected(0);
            }}
            placeholder={finder === 'projects' ? 'Switch to project…' : 'Find file…'}
            hint={finder === 'projects' ? mod('P', { shift: true }) : mod('P')}
          />
        </div>

        <div ref={listRef} style={{ overflow: 'auto', minHeight: 0, padding: '4px 0' }}>
          {results.length === 0 && (
            <div style={{ padding: '18px', textAlign: 'center', color: 'var(--text-faint)', fontSize: fs.control }}>
              No matches
            </div>
          )}
          {results.map((item, i) => {
            const active = i === selected;
            const dir = item.includes('/') ? item.slice(0, item.lastIndexOf('/') + 1) : '';
            const name = item.slice(dir.length);
            return (
              <div
                key={item}
                data-selected={active}
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(item)}
                style={rowStyle(active, {
                  padding: '6px 14px',
                  fontFamily: font.mono,
                  fontSize: fs.row,
                })}
              >
                <span style={{ color: 'var(--text-faint)' }}>{dir}</span>
                <span style={{ marginLeft: -8, color: active ? 'var(--text)' : 'var(--text-muted)' }}>{name}</span>
                {finder === 'projects' && item === currentProject && (
                  <span style={{ marginLeft: 'auto', fontFamily: font.ui, fontSize: fs.meta, color: 'var(--accent)' }}>
                    open
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
