import EditorPane from '../editor/EditorPane';
import TabBar from '../editor/TabBar';
import ScopeStrip from '../editor/ScopeStrip';
import Drawer from '../editor/Drawer';
import EditorStatusBar from '../editor/EditorStatusBar';
import { useEditorStore } from '../../stores/editorStore';
import { fs, metrics } from '../../theme/tokens';
import { mod } from '../../lib/shortcuts';
import { OutlinedButton } from '../shared/ui';

/**
 * The editor half of the workspace: tab bar / scope strip / source / drawer /
 * status bar, stacked between hairlines.
 */

interface EditorPanelProps {
  onSave: () => void;
  onManualSave: () => void;
  onCompile: () => void;
}

export default function EditorPanel({ onSave, onManualSave, onCompile }: EditorPanelProps) {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const currentProject = useEditorStore((s) => s.currentProject);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const setFinder = useEditorStore((s) => s.setFinder);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--surface-editor)',
      }}
    >
      <TabBar onCompile={onCompile} onManualSave={onManualSave} />
      <ScopeStrip />

      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {activeTabPath ? (
          <EditorPane onSave={onSave} />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              color: 'var(--text-faint)',
              fontSize: fs.title,
              padding: metrics.padPage,
              textAlign: 'center',
            }}
          >
            {currentProject ? 'No file open' : 'No project loaded'}
            <div style={{ display: 'flex', gap: 8 }}>
              {currentProject ? (
                <>
                  <OutlinedButton accent onClick={() => setFinder('files')}>
                    Find a file {mod('P')}
                  </OutlinedButton>
                  <OutlinedButton onClick={() => setActivePanel('files')}>Browse files</OutlinedButton>
                </>
              ) : (
                <OutlinedButton accent onClick={() => setActivePanel('projects')}>
                  Open a project {mod('P', { shift: true })}
                </OutlinedButton>
              )}
            </div>
          </div>
        )}
      </div>

      <Drawer />
      <EditorStatusBar />
    </div>
  );
}
