import Rail from './Rail';
import SidePanelHost from './SidePanelHost';
import DetailPaneHost from './DetailPaneHost';
import EditorPanel from './EditorPanel';
import PreviewPane from '../preview/PreviewPane';
import SplitPane from '../shared/SplitPane';
import CommandPalette from './CommandPalette';
import SettingsModal from '../settings/SettingsModal';
import { useEditorStore } from '../../stores/editorStore';
import { motion } from '../../theme/tokens';

/**
 * Application shell.
 *
 * A single horizontal row for the full viewport: `[rail] [panel] [detail]
 * [workspace]`, each column separated by a 1px hairline. The detail column
 * appears only for the manager screens that have one (references, plots) and
 * only while something is selected in them. The workspace splits into editor
 * and preview, and each of those carries its own toolbar and status bar —
 * there is no global top or bottom bar.
 *
 * Opening the project browser dims the workspace to 55%: the current project is
 * still loaded, just no longer the focus.
 */

interface ShellProps {
  onManualSave: () => void;
  onCompile: () => void;
  onRenderHtml: () => void;
}

export default function Shell({ onManualSave, onCompile, onRenderHtml }: ShellProps) {
  const viewMode = useEditorStore((s) => s.viewMode);
  const activePanel = useEditorStore((s) => s.activePanel);
  const showSettings = useEditorStore((s) => s.showSettings);
  const setShowSettings = useEditorStore((s) => s.setShowSettings);

  const editor = <EditorPanel onManualSave={onManualSave} onCompile={onCompile} />;
  const preview = <PreviewPane onCompile={onCompile} onRenderHtml={onRenderHtml} />;

  return (
    <>
      <Rail />
      <SidePanelHost />
      <DetailPaneHost />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          overflow: 'hidden',
          opacity: activePanel === 'projects' ? 0.55 : 1,
          transition: `opacity ${motion.panel}`,
        }}
      >
        {viewMode === 'both' && <SplitPane left={editor} right={preview} defaultSplit={0.5} />}
        {viewMode === 'editor' && editor}
        {viewMode === 'pdf' && preview}
      </main>

      <CommandPalette />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
