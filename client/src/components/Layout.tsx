import { useState } from 'react';
import EditorPane from './editor/EditorPane';
import TabBar from './editor/TabBar';
import PreviewPane from './preview/PreviewPane';
import SplitPane from './shared/SplitPane';
import Sidebar from './sidebar/Sidebar';

interface LayoutProps {
  onSave: () => void;
}

export default function Layout({ onSave }: LayoutProps) {
  const [sidebarWidth] = useState(220);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div
        style={{
          width: sidebarWidth,
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

      {/* Editor + Preview */}
      <SplitPane
        left={
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <TabBar />
            <EditorPane onSave={onSave} />
          </div>
        }
        right={<PreviewPane />}
        defaultSplit={0.5}
      />
    </div>
  );
}
