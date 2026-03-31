import { useEditorStore } from '../../stores/editorStore';

export default function BottomBar() {
  const { compilationStatus, errors, warnings, activeTabPath, cursorLine, cursorCol, vimMode } = useEditorStore();

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
        height: 36,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        fontSize: 16,
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
        {activeTabPath && (
          <span style={{ fontFamily: "'Source Code Pro', monospace" }}>
            Ln {cursorLine}, Col {cursorCol}
          </span>
        )}
        {vimMode && (
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>VIM</span>
        )}
        {activeTabPath && <span>{activeTabPath}</span>}
        <span>UTF-8</span>
        <span>LaTeX</span>
      </div>
    </div>
  );
}
