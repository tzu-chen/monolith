import { useEditorStore } from '../../stores/editorStore';
import { metrics, motion } from '../../theme/tokens';
import ReferenceDetail from '../panels/ReferenceDetail';
import PlotDetail from '../panels/PlotDetail';

/**
 * The detail column of a manager screen.
 *
 * The handoff's reference (1c) and plot (1f) managers read left to right —
 * rail, list, then the thing you selected — so the detail pane is its own
 * column between the panel and the workspace rather than a section stacked
 * under the list. It exists only while something is selected; closing it
 * returns the width to the editor and preview.
 */

const WIDTHS = {
  reference: metrics.detailReference,
  plot: metrics.detailPlot,
} as const;

export default function DetailPaneHost() {
  const detail = useEditorStore((s) => s.managerDetail);
  if (!detail) return null;

  return (
    <section
      style={{
        width: WIDTHS[detail.kind],
        flexShrink: 0,
        minWidth: 0,
        borderRight: '1px solid var(--line)',
        background: 'var(--surface-chrome)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: `panel-in ${motion.panel}`,
      }}
    >
      {detail.kind === 'reference' && <ReferenceDetail entryKey={detail.key} />}
      {detail.kind === 'plot' && <PlotDetail detail={detail} />}
    </section>
  );
}
