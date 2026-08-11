import { useEditorStore, type PreviewMode } from '../../stores/editorStore';
import { fs, radius, motion } from '../../theme/tokens';

const MODES: { value: PreviewMode; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'html', label: 'HTML' },
];

/**
 * Segmented control switching the preview between the Tectonic PDF path and the
 * LaTeXML HTML path. Shared by both preview toolbars.
 *
 * The active segment is accent text on a wash, inside a shared 1px border with
 * a hairline between the segments — no solid fill, matching every other control
 * in the shell. `compact` tightens it for a narrow pane; see `toolbarLayout`.
 */
export default function PreviewModeToggle({ compact = false }: { compact?: boolean }) {
  const previewMode = useEditorStore((s) => s.previewMode);
  const setPreviewMode = useEditorStore((s) => s.setPreviewMode);

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
      {MODES.map((m, i) => {
        const active = previewMode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => setPreviewMode(m.value)}
            title={m.value === 'pdf' ? 'Tectonic PDF preview' : 'LaTeXML HTML preview'}
            style={{
              fontSize: compact ? fs.meta : fs.toolbar,
              padding: compact ? '3px 8px' : '3px 12px',
              borderRight: i < MODES.length - 1 ? '1px solid var(--line-strong)' : undefined,
              background: active ? 'var(--accent-wash-strong)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-faint)',
              fontWeight: active ? 600 : 400,
              transition: `background ${motion.color}, color ${motion.color}`,
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
