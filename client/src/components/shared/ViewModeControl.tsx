import { useEditorStore, type ViewMode } from '../../stores/editorStore';
import { formatChord, type ShortcutAction } from '../../lib/keybindings';
import { PanelIcon } from './Icons';
import { radius, motion } from '../../theme/tokens';

/**
 * Editor / split / preview layout control.
 *
 * Lives in the tab bar, and moves to the preview toolbar when the editor is
 * hidden — because hiding the editor would otherwise take the control with it,
 * leaving no way back out of preview-only. See `ownsViewModeControl`.
 */

const VIEW_MODES: {
  value: ViewMode;
  title: string;
  side: 'left' | 'both' | 'right';
  action: ShortcutAction;
}[] = [
  { value: 'editor', title: 'Editor only', side: 'left', action: 'viewEditor' },
  { value: 'both', title: 'Editor and preview', side: 'both', action: 'viewSplit' },
  { value: 'pdf', title: 'Preview only', side: 'right', action: 'viewPreview' },
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
  const keybindings = useEditorStore((s) => s.keybindings);

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
        // An icon-only button advertises its chord in the tooltip; unbound
        // actions say nothing rather than "Not set".
        const chord = keybindings[m.action];
        return (
          <button
            key={m.value}
            onClick={() => setViewMode(m.value)}
            title={chord ? `${m.title} (${formatChord(chord)})` : m.title}
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
