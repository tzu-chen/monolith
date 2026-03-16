import EditorPane from './editor/EditorPane';
import TabBar from './editor/TabBar';
import PreviewPane from './preview/PreviewPane';
import SplitPane from './shared/SplitPane';
import Sidebar from './sidebar/Sidebar';
import { ChevronLeft, ChevronRight } from './shared/Icons';
import { useEditorStore } from '../stores/editorStore';

interface LayoutProps {
  onSave: () => void;
  onManualSave: () => void;
}

const SIDEBAR_WIDTH = 220;

function EditorPanel({ onSave, onManualSave }: { onSave: () => void; onManualSave: () => void }) {
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const dirty = useEditorStore((s) => s.dirty);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            fontSize: 13,
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
              fontSize: 12,
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
      <EditorPane onSave={onSave} />
    </div>
  );
}

export default function Layout({ onSave, onManualSave }: LayoutProps) {
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
          right={<PreviewPane />}
          defaultSplit={0.5}
        />
      )}

      {viewMode === 'editor' && (
        <EditorPanel onSave={onSave} onManualSave={onManualSave} />
      )}

      {viewMode === 'pdf' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <PreviewPane />
        </div>
      )}
    </div>
  );
}
