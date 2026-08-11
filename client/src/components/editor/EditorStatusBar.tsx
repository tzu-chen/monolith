import { useCallback, useMemo, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { diagnosticsForFile } from '../../lib/diagnostics';
import { diffLines, summarise } from '../../lib/line-diff';
import { fs, font, metrics } from '../../theme/tokens';
import { Dot } from '../shared/ui';

/**
 * Editor status bar (26px in the handoff, scaled here).
 *
 * Left: outlined-circle error and warning counts — clicking one cycles the
 * editor to the next occurrence. Then the compile diff, summarised from the
 * same snapshot the gutter bars are drawn from. Right: cursor position.
 */

function CountButton({
  count,
  color,
  label,
  onClick,
}: {
  count: number;
  color: string;
  label: string;
  onClick: () => void;
}) {
  const muted = count === 0;
  return (
    <button
      onClick={count > 0 ? onClick : undefined}
      title={count > 0 ? `Go to next ${label}` : `No ${label}s`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        color: muted ? 'var(--text-faint)' : color,
        fontSize: fs.meta,
        cursor: count > 0 ? 'pointer' : 'default',
        padding: 0,
      }}
    >
      <Dot color={muted ? 'var(--text-faint)' : color} />
      {count} {label}
      {count === 1 ? '' : 's'}
    </button>
  );
}

export default function EditorStatusBar() {
  const diagnostics = useEditorStore((s) => s.diagnostics);
  const compiledFile = useEditorStore((s) => s.compiledFile);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const content = useEditorStore((s) => s.content);
  const compileSnapshot = useEditorStore((s) => s.compileSnapshot);
  const cursorLine = useEditorStore((s) => s.cursorLine);
  const cursorCol = useEditorStore((s) => s.cursorCol);
  const vimMode = useEditorStore((s) => s.vimMode);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);

  const cursor = useRef({ error: 0, warning: 0 });

  const fileDiagnostics = useMemo(
    () => diagnosticsForFile(diagnostics, activeTabPath, compiledFile),
    [diagnostics, activeTabPath, compiledFile]
  );
  const errors = fileDiagnostics.filter((d) => d.severity === 'error');
  const warnings = fileDiagnostics.filter((d) => d.severity === 'warning');

  const diff = useMemo(() => {
    const baseline = activeTabPath ? compileSnapshot[activeTabPath] : undefined;
    return baseline === undefined ? null : summarise(diffLines(baseline, content));
  }, [activeTabPath, compileSnapshot, content]);

  const cycle = useCallback(
    (severity: 'error' | 'warning') => {
      const list = severity === 'error' ? errors : warnings;
      if (list.length === 0) return;
      const idx = cursor.current[severity] % list.length;
      cursor.current[severity] = idx + 1;
      const line = list[idx].line;
      if (line != null) requestScrollToLine(line);
    },
    [errors, warnings, requestScrollToLine]
  );

  const hasDiff = diff && (diff.added > 0 || diff.modified > 0);

  return (
    <div
      style={{
        height: metrics.status,
        flexShrink: 0,
        borderTop: '1px solid var(--line)',
        background: 'var(--surface-chrome)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: `0 ${metrics.padPanel}px`,
        fontSize: fs.meta,
        color: 'var(--text-faint)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <CountButton count={errors.length} color="var(--error)" label="error" onClick={() => cycle('error')} />
      <CountButton count={warnings.length} color="var(--warn)" label="warning" onClick={() => cycle('warning')} />

      {hasDiff && (
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden' }}
          title="Lines changed since the last successful compile"
        >
          <span style={{ width: 9, height: 2, background: 'var(--ok)', flexShrink: 0 }} />
          +{diff.added}
          <span style={{ width: 9, height: 2, background: 'var(--accent)', flexShrink: 0, marginLeft: 5 }} />
          ~{diff.modified}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>since last compile</span>
        </span>
      )}

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        {vimMode && <span style={{ color: 'var(--accent)', fontWeight: 500 }}>VIM</span>}
        {activeTabPath && (
          <span style={{ fontFamily: font.mono }}>
            Ln {cursorLine}, Col {cursorCol}
          </span>
        )}
      </span>
    </div>
  );
}
