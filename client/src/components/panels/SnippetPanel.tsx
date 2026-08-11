import { useState, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CloseIcon } from '../shared/Icons';
import { Pill, OutlinedButton, Badge } from '../shared/ui';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';
import {
  latexSnippets,
  loadCustomSnippets,
  saveCustomSnippets,
  loadRecentSnippets,
  saveRecentSnippets,
  type LatexSnippet,
} from '../editor/latex-snippets';

/**
 * Snippet list — the `Snippets` pane of the editor drawer.
 *
 * Same insertion model as the symbol palette: click inserts at the cursor. Each
 * card shows the trigger, what it expands to, and its rendered preview.
 */

const MAX_RECENT = 10;

interface SnippetPanelProps {
  search: string;
  onFocusEntry: (snippet: LatexSnippet | null) => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

export default function SnippetPanel({ search, onFocusEntry, editing, onEditingChange }: SnippetPanelProps) {
  const [tab, setTab] = useState<'All' | 'Recent'>(() =>
    loadRecentSnippets().length > 0 ? 'Recent' : 'All'
  );
  const [customSnippets, setCustomSnippets] = useState(loadCustomSnippets);
  const [recentLabels, setRecentLabels] = useState(loadRecentSnippets);
  const [newTrigger, setNewTrigger] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newTemplate, setNewTemplate] = useState('');

  const allSnippets = useMemo(
    () => [...latexSnippets, ...customSnippets],
    [customSnippets]
  );

  const displayedSnippets = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (query) {
      return allSnippets.filter(
        (s) =>
          s.label.toLowerCase().includes(query) ||
          s.detail.toLowerCase().includes(query) ||
          s.template.toLowerCase().includes(query)
      );
    }
    if (tab === 'Recent') {
      const results: LatexSnippet[] = [];
      for (const label of recentLabels) {
        const found = allSnippets.find((s) => s.label === label);
        if (found) results.push(found);
      }
      return results;
    }
    return allSnippets;
  }, [search, tab, recentLabels, allSnippets]);

  const recordRecent = useCallback(
    (label: string) => {
      const updated = [label, ...recentLabels.filter((l) => l !== label)].slice(0, MAX_RECENT);
      setRecentLabels(updated);
      saveRecentSnippets(updated);
    },
    [recentLabels]
  );

  function insertSnippet(snip: LatexSnippet) {
    const expanded = snip.template
      .replace(/#\{\d+:([^}]+)\}/g, '$1')
      .replace(/#\{\d*\}/g, '');
    useEditorStore.getState().insertAtCursor(expanded);
    recordRecent(snip.label);
  }

  function handleAddCustom() {
    const trigger = newTrigger.trim();
    const template = newTemplate.trim();
    if (!trigger || !template) return;
    const entry: LatexSnippet = {
      label: trigger,
      detail: newDetail.trim() || trigger,
      template,
      preview: template.replace(/#\{\d+:([^}]+)\}/g, '$1').replace(/#\{\d*\}/g, '...'),
    };
    const updated = [...customSnippets, entry];
    setCustomSnippets(updated);
    saveCustomSnippets(updated);
    setNewTrigger('');
    setNewDetail('');
    setNewTemplate('');
    onEditingChange(false);
  }

  function deleteCustom(label: string) {
    const updated = customSnippets.filter((s) => s.label !== label);
    setCustomSnippets(updated);
    saveCustomSnippets(updated);
  }

  const isCustom = (label: string) => customSnippets.some((s) => s.label === label);

  const inputStyle: React.CSSProperties = {
    fontSize: fs.control,
    padding: '4px 8px',
    border: '1px solid var(--line)',
    borderRadius: radius.chip,
    background: 'var(--surface-editor)',
    color: 'var(--text)',
    fontFamily: font.mono,
    outline: 'none',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {!search && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: `8px ${metrics.padPane}px`,
            borderBottom: '1px solid var(--line-faint)',
            flexShrink: 0,
          }}
        >
          {(['All', 'Recent'] as const).map((t) => (
            <Pill key={t} mono={false} active={tab === t} onClick={() => setTab(t)}>
              {t}
            </Pill>
          ))}
        </div>
      )}

      {editing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: `7px ${metrics.padPane}px`,
            borderBottom: '1px solid var(--line-faint)',
            flexShrink: 0,
          }}
        >
          <input
            placeholder="trigger"
            value={newTrigger}
            onChange={(e) => setNewTrigger(e.target.value)}
            style={{ ...inputStyle, width: 100 }}
          />
          <input
            placeholder="description"
            value={newDetail}
            onChange={(e) => setNewDetail(e.target.value)}
            style={{ ...inputStyle, width: 150, fontFamily: font.ui }}
          />
          <input
            placeholder="\begin{env}#{1:body}\end{env}"
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
            style={{ ...inputStyle, flex: 1, minWidth: 120 }}
          />
          <OutlinedButton accent onClick={handleAddCustom}>Add</OutlinedButton>
          <OutlinedButton onClick={() => onEditingChange(false)}>Cancel</OutlinedButton>
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: `10px ${metrics.padPane}px`,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
          alignContent: 'flex-start',
        }}
      >
        {displayedSnippets.map((snip) => (
          <div
            key={snip.label}
            onClick={() => insertSnippet(snip)}
            onMouseEnter={(e) => {
              onFocusEntry(snip);
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)';
            }}
            title={snip.template}
            style={{
              border: '1px solid var(--line)',
              borderRadius: radius.card,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              cursor: 'pointer',
              minWidth: 0,
              position: 'relative',
              transition: `border-color ${motion.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span style={{ fontFamily: font.mono, fontSize: fs.row, color: 'var(--accent)' }}>
                {snip.label}
              </span>
              {isCustom(snip.label) && <Badge>custom</Badge>}
              {isCustom(snip.label) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCustom(snip.label);
                  }}
                  title="Remove custom snippet"
                  style={{ marginLeft: 'auto', display: 'flex', color: 'var(--text-faint)' }}
                >
                  <CloseIcon size={11} />
                </button>
              )}
            </div>
            <div
              style={{
                fontSize: fs.control,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {snip.detail}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: fs.meta,
                color: 'var(--text-faint)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {snip.preview}
            </div>
          </div>
        ))}
        {displayedSnippets.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              color: 'var(--text-faint)',
              fontSize: fs.control,
              padding: '18px 0',
              textAlign: 'center',
            }}
          >
            {tab === 'Recent' ? 'No recently used snippets yet' : 'No snippets found'}
          </div>
        )}
      </div>
    </div>
  );
}
