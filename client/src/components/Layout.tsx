import { useState } from 'react';
import EditorPane from './editor/EditorPane';
import TabBar from './editor/TabBar';
import PreviewPane from './preview/PreviewPane';
import SplitPane from './shared/SplitPane';
import Sidebar from './sidebar/Sidebar';
import SymbolPalette from './panels/SymbolPalette';
import SnippetPanel from './panels/SnippetPanel';
import { ChevronLeft, ChevronRight, OmegaIcon, SnippetIcon } from './shared/Icons';
import { useEditorStore } from '../stores/editorStore';

interface LayoutProps {
  onSave: () => void;
  onManualSave: () => void;
  onCompile: () => void;
}

const SIDEBAR_WIDTH = 220;

type EditorDropdown = 'symbols' | 'snippets' | null;

function EditorPanel({ onSave, onManualSave }: { onSave: () => void; onManualSave: () => void }) {
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const dirty = useEditorStore((s) => s.dirty);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const [dropdown, setDropdown] = useState<EditorDropdown>(null);

  const toggleDropdown = (d: EditorDropdown) => {
    setDropdown(dropdown === d ? null : d);
  };

  const toolbarBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--accent)' : 'none',
    border: 'none',
    padding: '4px 6px',
    cursor: 'pointer',
    color: active ? 'white' : 'var(--text-dim)',
    lineHeight: 1,
    flexShrink: 0,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          onClick={toggleSidebar}
          title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          style={{
            background: 'none',
            border: 'none',
            padding: '6px 8px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 17,
            fontFamily: 'inherit',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {sidebarVisible ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TabBar />
        </div>
        <button
          onClick={() => toggleDropdown('symbols')}
          title="Symbols"
          style={toolbarBtnStyle(dropdown === 'symbols')}
        >
          <OmegaIcon size={16} />
        </button>
        <button
          onClick={() => toggleDropdown('snippets')}
          title="Snippets"
          style={toolbarBtnStyle(dropdown === 'snippets')}
        >
          <SnippetIcon size={16} />
        </button>
        {activeTabPath && (
          <button
            onClick={onManualSave}
            title="Save file (Ctrl+S)"
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 10px',
              cursor: 'pointer',
              color: dirty ? 'var(--accent)' : 'var(--text-dim)',
              fontSize: 17,
              fontFamily: 'inherit',
              lineHeight: 1,
              flexShrink: 0,
              opacity: dirty ? 1 : 0.6,
              transition: 'color 0.15s, opacity 0.15s',
            }}
          >
            Save
          </button>
        )}
      </div>
      {/* Editor area with optional dropdown overlay */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <EditorPane onSave={onSave} />
        {dropdown && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              background: 'var(--bg-panel)',
              overflow: 'auto',
            }}
          >
            {dropdown === 'symbols' && <SymbolPalette />}
            {dropdown === 'snippets' && <SnippetPanel />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Layout({ onSave, onManualSave, onCompile }: LayoutProps) {
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible);
  const viewMode = useEditorStore((s) => s.viewMode);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      {sidebarVisible && viewMode !== 'pdf' && (
        <div
          style={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Sidebar />
        </div>
      )}

      {/* Editor + Preview */}
      {viewMode === 'both' && (
        <SplitPane
          left={<EditorPanel onSave={onSave} onManualSave={onManualSave} />}
          right={<PreviewPane onCompile={onCompile} />}
          defaultSplit={0.5}
        />
      )}

      {viewMode === 'editor' && (
        <EditorPanel onSave={onSave} onManualSave={onManualSave} />
      )}

      {viewMode === 'pdf' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <PreviewPane onCompile={onCompile} />
        </div>
      )}
    </div>
  );
}
