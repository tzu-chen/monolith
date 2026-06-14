import { useEditorStore, type PreviewMode } from '../../stores/editorStore';

const MODES: { value: PreviewMode; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'html', label: 'HTML' },
];

/**
 * Segmented control that switches the preview renderer between the Tectonic PDF
 * path and the LaTeXML HTML path. Shared by both preview views' toolbars.
 */
export default function PreviewModeToggle() {
  const previewMode = useEditorStore((s) => s.previewMode);
  const setPreviewMode = useEditorStore((s) => s.setPreviewMode);

  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--bg-editor)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 2,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {MODES.map((m) => {
        const active = previewMode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => setPreviewMode(m.value)}
            style={{
              fontSize: 14,
              fontFamily: 'inherit',
              cursor: 'pointer',
              border: 'none',
              padding: '2px 11px',
              borderRadius: 4,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-dim)',
              fontWeight: active ? 600 : 400,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
