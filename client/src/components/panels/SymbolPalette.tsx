import { useState, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { symbolCategories } from './symbol-data';

export default function SymbolPalette() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(symbolCategories[0].name);

  const filteredSymbols = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (query) {
      return symbolCategories.flatMap((cat) =>
        cat.symbols.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.command.toLowerCase().includes(query)
        )
      );
    }
    const cat = symbolCategories.find((c) => c.name === activeCategory);
    return cat ? cat.symbols : [];
  }, [search, activeCategory]);

  function insertSymbol(command: string) {
    const view = useEditorStore.getState().editorView;
    if (!view) return;
    const { head } = view.state.selection.main;
    view.dispatch({
      changes: { from: head, insert: command },
      selection: { anchor: head + command.length },
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
      {/* Header row: search + category tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <input
          type="text"
          placeholder="Search symbols..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 180,
            fontSize: 12,
            padding: '4px 8px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--bg-editor)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {!search && (
          <div style={{ display: 'flex', gap: 2 }}>
            {symbolCategories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background:
                    activeCategory === cat.name
                      ? 'var(--accent)'
                      : 'transparent',
                  color:
                    activeCategory === cat.name
                      ? 'white'
                      : 'var(--text-secondary)',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Symbol grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          alignContent: 'flex-start',
        }}
      >
        {filteredSymbols.map((sym) => (
          <button
            key={sym.command}
            onClick={() => insertSymbol(sym.command)}
            title={`${sym.command} — ${sym.name}`}
            style={{
              width: 40,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg-editor)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: "'Source Code Pro', monospace",
            }}
          >
            {sym.display}
          </button>
        ))}
        {filteredSymbols.length === 0 && (
          <div
            style={{
              color: 'var(--text-dim)',
              fontSize: 12,
              padding: 16,
            }}
          >
            No symbols found
          </div>
        )}
      </div>
    </div>
  );
}
