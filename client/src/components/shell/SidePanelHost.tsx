import { useEditorStore, type SidePanel } from '../../stores/editorStore';
import { metrics, motion } from '../../theme/tokens';
import FilesPanel from '../panels/FilesPanel';
import OutlinePanel from '../panels/OutlinePanel';
import ScopePanel from '../panels/ScopePanel';
import ReferencesPanel from '../panels/ReferencesPanel';
import PlotsPanel from '../panels/PlotsPanel';
import ProjectsPanel from '../panels/ProjectsPanel';

/**
 * Hosts whichever rail tool is open. One panel at a time — clicking the active
 * rail tool collapses it and the editor and preview expand to fill.
 */

const WIDTHS: Record<SidePanel, number> = {
  files: metrics.panelFiles,
  outline: metrics.panelOutline,
  scope: metrics.panelScope,
  references: metrics.panelReferences,
  plots: metrics.panelPlots,
  projects: metrics.panelProjects,
};

export default function SidePanelHost() {
  const activePanel = useEditorStore((s) => s.activePanel);
  if (!activePanel) return null;

  return (
    <aside
      style={{
        width: WIDTHS[activePanel],
        flexShrink: 0,
        borderRight: '1px solid var(--line)',
        background: 'var(--surface-chrome)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: `panel-in ${motion.panel}`,
      }}
    >
      {activePanel === 'files' && <FilesPanel />}
      {activePanel === 'outline' && <OutlinePanel />}
      {activePanel === 'scope' && <ScopePanel />}
      {activePanel === 'references' && <ReferencesPanel />}
      {activePanel === 'plots' && <PlotsPanel />}
      {activePanel === 'projects' && <ProjectsPanel />}
    </aside>
  );
}
