import { useEditorStore } from '../../stores/editorStore';
import { latexSnippets } from '../editor/latex-snippets';

export default function SnippetPanel() {
  function insertSnippet(template: string) {
    const view = useEditorStore.getState().editorView;
    if (!view) return;

    // For panel insertion, expand the template literally (replace #{...} markers with placeholders)
    const expanded = template
      .replace(/#\{\d+:([^}]+)\}/g, '$1')
      .replace(/#\{\d*\}/g, '');

    const { head } = view.state.selection.main;
    view.dispatch({
      changes: { from: head, insert: expanded },
      selection: { anchor: head + expanded.length },
    });
    view.focus();
  }

  return (
    <div
      style={{
        height: 220,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-secondary)',
        }}
      >
        Type a trigger keyword in the editor for autocomplete, or click Insert
        below
      </div>

      {/* Snippet list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 16px',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
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
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Trigger</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>
                Description
              </th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Preview</th>
              <th style={{ padding: '4px 8px', width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {latexSnippets.map((snip) => (
              <tr
                key={snip.label}
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <td
                  style={{
                    padding: '5px 8px',
                    fontFamily: "'Source Code Pro', monospace",
                    color: 'var(--accent)',
                    fontWeight: 500,
                  }}
                >
                  {snip.label}
                </td>
                <td
                  style={{
                    padding: '5px 8px',
                    color: 'var(--text-primary)',
                  }}
                >
                  {snip.detail}
                </td>
                <td
                  style={{
                    padding: '5px 8px',
                    fontFamily: "'Source Code Pro', monospace",
                    color: 'var(--text-secondary)',
                    fontSize: 11,
                    whiteSpace: 'pre',
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {snip.preview.split('\n')[0]}
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <button
                    onClick={() => insertSnippet(snip.template)}
                    style={{
                      fontSize: 11,
                      padding: '2px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      background: 'transparent',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Insert
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
