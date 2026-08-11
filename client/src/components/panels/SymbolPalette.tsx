import { useState, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CloseIcon } from '../shared/Icons';
import { Pill, OutlinedButton } from '../shared/ui';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';
import {
  symbolCategories,
  findSymbolByCommand,
  loadCustomSymbols,
  saveCustomSymbols,
  loadRecentSymbols,
  saveRecentSymbols,
  type SymbolEntry,
} from './symbol-data';

/**
 * Symbol palette — the `Symbols` pane of the editor drawer.
 *
 * Category pills over a key grid. Each key is a square outlined cell with the
 * glyph set in serif italic, the way it will read once typeset; hovering or
 * selecting one moves its border and glyph to accent rather than filling it.
 */

const MAX_RECENT = 20;
/** Keys per row in the handoff's grid. */
const COLUMNS = 14;

interface SymbolPaletteProps {
  search: string;
  /** Reports the key under the cursor so the drawer footer can describe it. */
  onFocusEntry: (entry: SymbolEntry | null) => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

export default function SymbolPalette({ search, onFocusEntry, editing, onEditingChange }: SymbolPaletteProps) {
  const [activeCategory, setActiveCategory] = useState(() => {
    const recent = loadRecentSymbols();
    return recent.length > 0 ? 'Recent' : symbolCategories[0].name;
  });
  const [customSymbols, setCustomSymbols] = useState(loadCustomSymbols);
  const [recentCommands, setRecentCommands] = useState(loadRecentSymbols);
  const [newCommand, setNewCommand] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newName, setNewName] = useState('');

  const allCategories = useMemo(() => {
    const cats = [...symbolCategories];
    if (customSymbols.length > 0) cats.push({ name: 'Custom', symbols: customSymbols });
    return cats;
  }, [customSymbols]);

  const recentSymbols = useMemo(() => {
    const results: SymbolEntry[] = [];
    for (const cmd of recentCommands) {
      const found = findSymbolByCommand(cmd) || customSymbols.find((s) => s.command === cmd);
      if (found) results.push(found);
    }
    return results;
  }, [recentCommands, customSymbols]);

  const filteredSymbols = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (query) {
      const all = allCategories.flatMap((cat) => cat.symbols);
      return all.filter(
        (s) => s.name.toLowerCase().includes(query) || s.command.toLowerCase().includes(query)
      );
    }
    if (activeCategory === 'Recent') return recentSymbols;
    return allCategories.find((c) => c.name === activeCategory)?.symbols ?? [];
  }, [search, activeCategory, allCategories, recentSymbols]);

  const recordRecent = useCallback(
    (command: string) => {
      const updated = [command, ...recentCommands.filter((c) => c !== command)].slice(0, MAX_RECENT);
      setRecentCommands(updated);
      saveRecentSymbols(updated);
    },
    [recentCommands]
  );

  const insertSymbol = useCallback(
    (command: string) => {
      useEditorStore.getState().insertAtCursor(command);
      recordRecent(command);
    },
    [recordRecent]
  );

  function handleAddCustom() {
    const cmd = newCommand.trim();
    const disp = newDisplay.trim();
    const nm = newName.trim();
    if (!cmd || !disp || !nm) return;
    const updated = [...customSymbols, { command: cmd, display: disp, name: nm }];
    setCustomSymbols(updated);
    saveCustomSymbols(updated);
    setNewCommand('');
    setNewDisplay('');
    setNewName('');
    onEditingChange(false);
    setActiveCategory('Custom');
  }

  function deleteCustom(command: string) {
    const updated = customSymbols.filter((s) => s.command !== command);
    setCustomSymbols(updated);
    saveCustomSymbols(updated);
  }

  const categories = useMemo(() => {
    const result: string[] = [];
    if (recentCommands.length > 0) result.push('Recent');
    result.push(...symbolCategories.map((c) => c.name));
    if (customSymbols.length > 0 || activeCategory === 'Custom') result.push('Custom');
    return result;
  }, [recentCommands.length, customSymbols.length, activeCategory]);

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
            flexWrap: 'wrap',
            padding: `8px ${metrics.padPane}px`,
            borderBottom: '1px solid var(--line-faint)',
            flexShrink: 0,
          }}
        >
          {categories.map((name) => (
            <Pill
              key={name}
              mono={false}
              active={activeCategory === name}
              onClick={() => setActiveCategory(name)}
            >
              {name}
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
            placeholder="\cmd"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
          />
          <input
            placeholder="Glyph"
            value={newDisplay}
            onChange={(e) => setNewDisplay(e.target.value)}
            style={{ ...inputStyle, width: 70, fontFamily: font.serif }}
          />
          <input
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
            style={{ ...inputStyle, width: 120, fontFamily: font.ui }}
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
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          gap: 5,
          alignContent: 'flex-start',
        }}
      >
        {filteredSymbols.map((sym) => {
          const isCustom = customSymbols.some((c) => c.command === sym.command);
          return (
            <div key={sym.command} style={{ position: 'relative' }}>
              <button
                onClick={() => insertSymbol(sym.command)}
                onMouseEnter={(e) => {
                  onFocusEntry(sym);
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--line)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onFocus={() => onFocusEntry(sym)}
                title={`${sym.command} — ${sym.name}`}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--line)',
                  borderRadius: radius.control,
                  background: 'transparent',
                  color: 'var(--text)',
                  fontFamily: font.serif,
                  fontStyle: 'italic',
                  fontSize: 21,
                  cursor: 'pointer',
                  transition: `color ${motion.color}, border-color ${motion.color}`,
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
                    top: -5,
                    right: -5,
                    width: 15,
                    height: 15,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--line)',
                    borderRadius: '50%',
                    background: 'var(--surface-chrome)',
                    color: 'var(--text-faint)',
                    cursor: 'pointer',
                  }}
                >
                  <CloseIcon size={9} />
                </button>
              )}
            </div>
          );
        })}
        {filteredSymbols.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              color: 'var(--text-faint)',
              fontSize: fs.control,
              padding: '18px 0',
              textAlign: 'center',
            }}
          >
            {activeCategory === 'Recent'
              ? 'No recently used symbols yet'
              : activeCategory === 'Custom'
                ? 'No custom symbols yet — use Edit palette… to add one'
                : 'No symbols found'}
          </div>
        )}
      </div>
    </div>
  );
}
