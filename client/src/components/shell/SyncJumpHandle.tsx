import { useEditorStore } from '../../stores/editorStore';
import { ArrowRightIcon, ArrowLeftIcon } from '../shared/Icons';
import { formatChord } from '../../lib/keybindings';
import { jumpToPdfFromCursor, jumpToSourceFromPreview } from '../../lib/syncJump';
import { radius } from '../../theme/tokens';

/**
 * The two SyncTeX jumps, sitting on the splitter between the editor and the
 * preview: a small pill with an arrow pointing at each pane. Right carries the
 * cursor line into the PDF, left brings the middle of the preview back to its
 * source. The editor's Mod-click and the preview's double-click do the same
 * for a chosen spot.
 */
export default function SyncJumpHandle() {
  const keybindings = useEditorStore((s) => s.keybindings);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--line)',
        borderRadius: radius.chip,
        background: 'var(--surface-chrome)',
        overflow: 'hidden',
      }}
    >
      <JumpButton
        title={`Jump to PDF — show where the cursor line landed (${formatChord(keybindings.jumpToPdf)})`}
        onClick={jumpToPdfFromCursor}
      >
        <ArrowRightIcon size={9} strokeWidth={2.2} />
      </JumpButton>
      <div style={{ height: 1, background: 'var(--line)' }} />
      <JumpButton
        title={`Jump to source — open the .tex behind the middle of the preview (${formatChord(keybindings.jumpToSource)})`}
        onClick={jumpToSourceFromPreview}
      >
        <ArrowLeftIcon size={9} strokeWidth={2.2} />
      </JumpButton>
    </div>
  );
}

function JumpButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 16,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {children}
    </button>
  );
}
