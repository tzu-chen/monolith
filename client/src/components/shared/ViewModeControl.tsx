import { useEditorStore, type ViewMode } from '../../stores/editorStore';
import { PanelIcon } from './Icons';
import { radius, motion } from '../../theme/tokens';

/**
 * Editor / split / preview layout control.
 *
 * Lives in the tab bar, and moves to the preview toolbar when the editor is
 * hidden — because hiding the editor would otherwise take the control with it,
 * leaving no way back out of preview-only. See `ownsViewModeControl`.
 */

const VIEW_MODES: { value: ViewMode; title: string; side: 'left' | 'both' | 'right' }[] = [
  { value: 'editor', title: 'Editor only', side: 'left' },
  { value: 'both', title: 'Editor and preview', side: 'both' },
  { value: 'pdf', title: 'Preview only', side: 'right' },
];

/**
 * Which bar renders the control for a given mode. Exactly one is true for every
 * mode, so the control is always present and never duplicated.
 */
export function ownsViewModeControl(viewMode: ViewMode, bar: 'tabs' | 'preview'): boolean {
  return bar === 'tabs' ? viewMode !== 'pdf' : viewMode === 'pdf';
}

export default function ViewModeControl() {
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);

  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid var(--line-strong)',
        borderRadius: radius.control,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {VIEW_MODES.map((m, i) => {
        const active = viewMode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => setViewMode(m.value)}
            title={m.title}
            aria-label={m.title}
            aria-pressed={active}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              borderRight: i < VIEW_MODES.length - 1 ? '1px solid var(--line-strong)' : undefined,
              background: active ? 'var(--accent-wash-strong)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-faint)',
              transition: `color ${motion.color}, background ${motion.color}`,
            }}
          >
            <PanelIcon size={14} side={m.side} />
          </button>
        );
      })}
    </div>
  );
}
