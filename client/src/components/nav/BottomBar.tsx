import { useEditorStore } from '../../stores/editorStore';

export default function BottomBar() {
  const { compilationStatus, errors, warnings } = useEditorStore();

  const statusDotColor =
    compilationStatus === 'error' ? 'var(--red)' :
    compilationStatus === 'compiling' ? 'var(--orange)' :
    'var(--green)';

  const statusLabel =
    compilationStatus === 'compiling' ? 'compiling...' :
    compilationStatus === 'error' ? 'compilation failed' :
    compilationStatus === 'success' ? 'tectonic ready' :
    'idle';

  return (
    <div
      style={{
        height: 26,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        fontSize: 11,
        color: 'var(--text-dim)',
        gap: 18,
        flexShrink: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusDotColor,
          }}
        />
        {statusLabel}
      </span>
      <span>
        {errors.length} errors
        {warnings.length > 0 && (
          <span style={{ color: 'var(--orange)', fontWeight: 500 }}>
            {' · '}{warnings.length} warnings
          </span>
        )}
      </span>
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: 18,
        }}
      >
        <span>UTF-8</span>
        <span>LaTeX</span>
      </div>
    </div>
  );
}
