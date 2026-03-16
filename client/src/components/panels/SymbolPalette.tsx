import { useState, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CloseIcon } from '../shared/Icons';
import {
  symbolCategories,
  findSymbolByCommand,
  loadCustomSymbols,
  saveCustomSymbols,
  loadRecentSymbols,
  saveRecentSymbols,
  type SymbolEntry,
} from './symbol-data';

const MAX_RECENT = 20;

export default function SymbolPalette() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(() => {
    const recent = loadRecentSymbols();
    return recent.length > 0 ? 'Recent' : symbolCategories[0].name;
  });
  const [customSymbols, setCustomSymbols] = useState(loadCustomSymbols);
  const [recentCommands, setRecentCommands] = useState(loadRecentSymbols);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommand, setNewCommand] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newName, setNewName] = useState('');

  const allCategories = useMemo(() => {
    const cats = [...symbolCategories];
    if (customSymbols.length > 0) {
      cats.push({ name: 'Custom', symbols: customSymbols });
    }
    return cats;
  }, [customSymbols]);

  const recentSymbols = useMemo(() => {
    const results: SymbolEntry[] = [];
    for (const cmd of recentCommands) {
      const found =
        findSymbolByCommand(cmd) ||
        customSymbols.find((s) => s.command === cmd);
      if (found) results.push(found);
    }
    return results;
  }, [recentCommands, customSymbols]);

  const filteredSymbols = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (query) {
      const all = allCategories.flatMap((cat) => cat.symbols);
      return all.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.command.toLowerCase().includes(query)
      );
    }
    if (activeCategory === 'Recent') return recentSymbols;
    const cat = allCategories.find((c) => c.name === activeCategory);
    return cat ? cat.symbols : [];
  }, [search, activeCategory, allCategories, recentSymbols]);

  const recordRecent = useCallback(
    (command: string) => {
      const updated = [command, ...recentCommands.filter((c) => c !== command)].slice(
        0,
        MAX_RECENT
      );
      setRecentCommands(updated);
      saveRecentSymbols(updated);
    },
    [recentCommands]
  );

  function insertSymbol(command: string) {
    const view = useEditorStore.getState().editorView;
    if (!view) return;
    const { head } = view.state.selection.main;
    view.dispatch({
      changes: { from: head, insert: command },
      selection: { anchor: head + command.length },
    });
    view.focus();
    recordRecent(command);
  }

  function handleAddCustom() {
    const cmd = newCommand.trim();
    const disp = newDisplay.trim();
    const nm = newName.trim();
    if (!cmd || !disp || !nm) return;
    const entry: SymbolEntry = { command: cmd, display: disp, name: nm };
    const updated = [...customSymbols, entry];
    setCustomSymbols(updated);
    saveCustomSymbols(updated);
    setNewCommand('');
    setNewDisplay('');
    setNewName('');
    setShowAddForm(false);
    if (activeCategory !== 'Custom') setActiveCategory('Custom');
  }

  function deleteCustom(command: string) {
    const updated = customSymbols.filter((s) => s.command !== command);
    setCustomSymbols(updated);
    saveCustomSymbols(updated);
  }

  // Tabs to show
  const tabs = useMemo(() => {
    const result: string[] = [];
    if (recentCommands.length > 0) result.push('Recent');
    result.push(...symbolCategories.map((c) => c.name));
    if (customSymbols.length > 0 || activeCategory === 'Custom')
      result.push('Custom');
    return result;
  }, [recentCommands.length, customSymbols.length, activeCategory]);

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
      {/* Header row: search + category tabs + add button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 120,
            fontSize: 11,
            padding: '3px 6px',
            border: '1px solid var(--border)',
            borderRadius: 3,
            background: 'var(--bg-editor)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {!search && (
          <div style={{ display: 'flex', gap: 1, flex: 1, flexWrap: 'wrap' }}>
            {tabs.map((name) => (
              <button
                key={name}
                onClick={() => setActiveCategory(name)}
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background:
                    activeCategory === name ? 'var(--accent)' : 'transparent',
                  color:
                    activeCategory === name ? 'white' : 'var(--text-secondary)',
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          title="Add custom symbol"
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

      {/* Add custom symbol form */}
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
            placeholder="\\cmd"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
          <input
            type="text"
            placeholder="Display"
            value={newDisplay}
            onChange={(e) => setNewDisplay(e.target.value)}
            style={{ ...inputStyle, width: 50 }}
          />
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
            style={{ ...inputStyle, width: 80 }}
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

      {/* Symbol grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 10px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          alignContent: 'flex-start',
        }}
      >
        {filteredSymbols.map((sym) => {
          const isCustom = customSymbols.some(
            (c) => c.command === sym.command
          );
          return (
            <div
              key={sym.command}
              style={{ position: 'relative', display: 'inline-flex' }}
            >
              <button
                onClick={() => insertSymbol(sym.command)}
                title={`${sym.command} — ${sym.name}`}
                style={{
                  width: 32,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  background: 'var(--bg-editor)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: "'Source Code Pro', monospace",
                }}
              >
                {sym.display}
              </button>
              {isCustom && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCustom(sym.command);
                  }}
                  title="Remove custom symbol"
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 14,
                    height: 14,
                    fontSize: 9,
                    lineHeight: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: '50%',
                    background: 'var(--bg-panel)',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <CloseIcon size={10} />
                </button>
              )}
            </div>
          );
        })}
        {filteredSymbols.length === 0 && (
          <div
            style={{
              color: 'var(--text-dim)',
              fontSize: 11,
              padding: 10,
            }}
          >
            {activeCategory === 'Recent'
              ? 'No recently used symbols yet'
              : activeCategory === 'Custom'
                ? 'No custom symbols yet — click + to add one'
                : 'No symbols found'}
          </div>
        )}
      </div>
    </div>
  );
}
