import EditorPane from './editor/EditorPane';
import TabBar from './editor/TabBar';
import PreviewPane from './preview/PreviewPane';
import SplitPane from './shared/SplitPane';
import Sidebar from './sidebar/Sidebar';
import { useEditorStore } from '../stores/editorStore';

interface LayoutProps {
  onSave: () => void;
}

const SIDEBAR_WIDTH = 220;

export default function Layout({ onSave }: LayoutProps) {
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      {sidebarVisible && (
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
      <SplitPane
        left={
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
                {sidebarVisible ? '◀' : '▶'}
              </button>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <TabBar />
              </div>
            </div>
            <EditorPane onSave={onSave} />
          </div>
        }
        right={<PreviewPane />}
        defaultSplit={0.5}
      />
    </div>
  );
}
