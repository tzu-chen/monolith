import { useState, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import {
  latexSnippets,
  loadCustomSnippets,
  saveCustomSnippets,
  loadRecentSnippets,
  saveRecentSnippets,
  type LatexSnippet,
} from '../editor/latex-snippets';

const MAX_RECENT = 10;

export default function SnippetPanel() {
  const [tab, setTab] = useState<'All' | 'Recent'>(() => {
    const recent = loadRecentSnippets();
    return recent.length > 0 ? 'Recent' : 'All';
  });
  const [customSnippets, setCustomSnippets] = useState(loadCustomSnippets);
  const [recentLabels, setRecentLabels] = useState(loadRecentSnippets);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTrigger, setNewTrigger] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newTemplate, setNewTemplate] = useState('');

  const allSnippets = useMemo(
    () => [...latexSnippets, ...customSnippets],
    [customSnippets]
  );

  const displayedSnippets = useMemo(() => {
    if (tab === 'Recent') {
      const results: LatexSnippet[] = [];
      for (const label of recentLabels) {
        const found = allSnippets.find((s) => s.label === label);
        if (found) results.push(found);
      }
      return results;
    }
    return allSnippets;
  }, [tab, recentLabels, allSnippets]);

  const recordRecent = useCallback(
    (label: string) => {
      const updated = [label, ...recentLabels.filter((l) => l !== label)].slice(
        0,
        MAX_RECENT
      );
      setRecentLabels(updated);
      saveRecentSnippets(updated);
    },
    [recentLabels]
  );

  function insertSnippet(snip: LatexSnippet) {
    const view = useEditorStore.getState().editorView;
    if (!view) return;

    const expanded = snip.template
      .replace(/#\{\d+:([^}]+)\}/g, '$1')
      .replace(/#\{\d*\}/g, '');

    const { head } = view.state.selection.main;
    view.dispatch({
      changes: { from: head, insert: expanded },
      selection: { anchor: head + expanded.length },
    });
    view.focus();
    recordRecent(snip.label);
  }

  function handleAddCustom() {
    const trigger = newTrigger.trim();
    const detail = newDetail.trim();
    const template = newTemplate.trim();
    if (!trigger || !template) return;
    const entry: LatexSnippet = {
      label: trigger,
      detail: detail || trigger,
      template,
      preview: template.replace(/#\{\d+:([^}]+)\}/g, '$1').replace(/#\{\d*\}/g, '...'),
    };
    const updated = [...customSnippets, entry];
    setCustomSnippets(updated);
    saveCustomSnippets(updated);
    setNewTrigger('');
    setNewDetail('');
    setNewTemplate('');
    setShowAddForm(false);
  }

  function deleteCustom(label: string) {
    const updated = customSnippets.filter((s) => s.label !== label);
    setCustomSnippets(updated);
    saveCustomSnippets(updated);
  }

  const isCustom = (label: string) =>
    customSnippets.some((s) => s.label === label);

  const inputStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '2px 6px',
    border: '1px solid var(--border)',
    borderRadius: 3,
    background: 'var(--bg-editor)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <div
      style={{
        height: 180,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header with tabs and add button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', gap: 1 }}>
          {(['All', 'Recent'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 3,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? 'white' : 'var(--text-secondary)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--text-dim)', flex: 1 }}>
          Type trigger in editor or click Insert
        </span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          title="Add custom snippet"
          style={{
            fontSize: 14,
            width: 24,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border)',
            borderRadius: 3,
            background: showAddForm ? 'var(--accent)' : 'transparent',
            color: showAddForm ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          +
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
          }}
        >
          <input
            type="text"
            placeholder="Trigger"
            value={newTrigger}
            onChange={(e) => setNewTrigger(e.target.value)}
            style={{ ...inputStyle, width: 60 }}
          />
          <input
            type="text"
            placeholder="Description"
            value={newDetail}
            onChange={(e) => setNewDetail(e.target.value)}
            style={{ ...inputStyle, width: 100 }}
          />
          <input
            type="text"
            placeholder="Template (use #{} for cursor)"
            value={newTemplate}
            onChange={(e) => setNewTemplate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleAddCustom}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              border: '1px solid var(--border)',
              borderRadius: 3,
              background: 'var(--accent)',
              color: 'white',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Save
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              border: '1px solid var(--border)',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Snippet list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2px 10px',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
          }}
        >
          <thead>
            <tr
              style={{
                color: 'var(--text-dim)',
                textAlign: 'left',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <th style={{ padding: '3px 6px', fontWeight: 500 }}>Trigger</th>
              <th style={{ padding: '3px 6px', fontWeight: 500 }}>
                Description
              </th>
              <th style={{ padding: '3px 6px', fontWeight: 500 }}>Preview</th>
              <th style={{ padding: '3px 6px', width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayedSnippets.map((snip) => (
              <tr
                key={snip.label}
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <td
                  style={{
                    padding: '3px 6px',
                    fontFamily: "'Source Code Pro', monospace",
                    color: 'var(--accent)',
                    fontWeight: 500,
                  }}
                >
                  {snip.label}
                </td>
                <td
                  style={{
                    padding: '3px 6px',
                    color: 'var(--text-primary)',
                  }}
                >
                  {snip.detail}
                </td>
                <td
                  style={{
                    padding: '3px 6px',
                    fontFamily: "'Source Code Pro', monospace",
                    color: 'var(--text-secondary)',
                    fontSize: 10,
                    whiteSpace: 'pre',
                    maxWidth: 260,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {snip.preview.split('\n')[0]}
                </td>
                <td
                  style={{
                    padding: '3px 6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <button
                    onClick={() => insertSnippet(snip)}
                    style={{
                      fontSize: 10,
                      padding: '1px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      background: 'transparent',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Insert
                  </button>
                  {isCustom(snip.label) && (
                    <button
                      onClick={() => deleteCustom(snip.label)}
                      title="Remove custom snippet"
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        marginLeft: 2,
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        background: 'transparent',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {displayedSnippets.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: 10,
                    color: 'var(--text-dim)',
                    fontSize: 11,
                  }}
                >
                  {tab === 'Recent'
                    ? 'No recently used snippets yet'
                    : 'No snippets available'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
