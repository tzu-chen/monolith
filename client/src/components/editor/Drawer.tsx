import { useState } from 'react';
import { useEditorStore, type Drawer as DrawerTab } from '../../stores/editorStore';
import SymbolPalette from '../panels/SymbolPalette';
import SnippetPanel from '../panels/SnippetPanel';
import type { SymbolEntry } from '../panels/symbol-data';
import type { LatexSnippet } from './latex-snippets';
import { CloseIcon } from '../shared/Icons';
import { FilterInput, IconButton, OutlinedButton } from '../shared/ui';
import { fs, font, metrics, motion } from '../../theme/tokens';

/**
 * The insertion drawer, docked at the bottom of the editor pane behind a
 * hairline. Tabs switch between the symbol grid and the snippet list; the
 * footer names whatever the cursor is over, in the LaTeX you would have typed.
 */

const TABS: { value: DrawerTab; label: string }[] = [
  { value: 'symbols', label: 'Symbols' },
  { value: 'snippets', label: 'Snippets' },
];

export default function Drawer() {
  const activeDrawer = useEditorStore((s) => s.activeDrawer);
  const setActiveDrawer = useEditorStore((s) => s.setActiveDrawer);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [symbolFocus, setSymbolFocus] = useState<SymbolEntry | null>(null);
  const [snippetFocus, setSnippetFocus] = useState<LatexSnippet | null>(null);

  if (!activeDrawer) return null;

  const isSymbols = activeDrawer === 'symbols';
  const focusCommand = isSymbols ? symbolFocus?.command : snippetFocus?.label;
  const focusName = isSymbols ? symbolFocus?.name : snippetFocus?.detail;

  return (
    <div
      style={{
        height: metrics.drawer,
        flexShrink: 0,
        borderTop: '1px solid var(--line)',
        background: 'var(--surface-chrome)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: `panel-in ${motion.panel}`,
      }}
    >
      <div
        style={{
          height: metrics.bar,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: 8,
          padding: `0 ${metrics.padPane}px`,
          borderBottom: '1px solid var(--line)',
          whiteSpace: 'nowrap',
        }}
      >
        {TABS.map((t) => {
          const active = activeDrawer === t.value;
          return (
            <button
              key={t.value}
              onClick={() => {
                setActiveDrawer(t.value);
                setSearch('');
                setEditing(false);
              }}
              style={{
                padding: '0 4px',
                fontSize: fs.row,
                color: active ? 'var(--text)' : 'var(--text-faint)',
                fontWeight: active ? 500 : 400,
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                transition: `color ${motion.color}`,
              }}
            >
              {t.label}
            </button>
          );
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 220 }}>
            <FilterInput
              value={search}
              onChange={setSearch}
              placeholder={isSymbols ? 'filter symbols…' : 'filter snippets…'}
            />
          </div>
          <IconButton
            icon={<CloseIcon size={13} />}
            title="Close drawer"
            onClick={() => setActiveDrawer(null)}
          />
        </div>
      </div>

      {isSymbols ? (
        <SymbolPalette
          search={search}
          onFocusEntry={setSymbolFocus}
          editing={editing}
          onEditingChange={setEditing}
        />
      ) : (
        <SnippetPanel
          search={search}
          onFocusEntry={setSnippetFocus}
          editing={editing}
          onEditingChange={setEditing}
        />
      )}

      <div
        style={{
          height: metrics.status,
          flexShrink: 0,
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: `0 ${metrics.padPane}px`,
          fontSize: fs.meta,
          color: 'var(--text-faint)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {focusCommand ? (
          <>
            <span style={{ fontFamily: font.mono, color: 'var(--text)' }}>{focusCommand}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{focusName}</span>
          </>
        ) : (
          <span>inserts at cursor</span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <OutlinedButton onClick={() => setEditing(!editing)}>
            {editing ? 'Done' : 'Edit palette…'}
          </OutlinedButton>
        </span>
      </div>
    </div>
  );
}
