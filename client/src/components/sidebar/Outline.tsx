import { useEditorStore } from '../../stores/editorStore';
import { useOutline } from '../../hooks/useOutline';

const INDENT_PER_LEVEL: Record<number, number> = {
  0: 0,   // \part
  1: 0,   // \chapter
  2: 0,   // \section
  3: 14,  // \subsection
  4: 28,  // \subsubsection
  5: 42,  // \paragraph
};

export default function Outline() {
  const content = useEditorStore((s) => s.content);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);
  const entries = useOutline(content);

  // Only show outline for .tex files
  if (!activeTabPath?.endsWith('.tex') || entries.length === 0) {
    return null;
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: '40%' }}>
      <div
        style={{
          padding: '8px 12px 4px',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          color: 'var(--text-dim)',
        }}
      >
        Outline
      </div>
      {entries.map((entry, i) => (
        <div
          key={`${entry.line}-${i}`}
          onClick={() => requestScrollToLine(entry.line)}
          style={{
            padding: '3px 8px',
            paddingLeft: 8 + (INDENT_PER_LEVEL[entry.level] ?? 0),
            fontSize: 12,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: entry.level <= 1 ? 500 : 400,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          title={`Line ${entry.line}: ${entry.title}`}
        >
          {entry.title}
        </div>
      ))}
    </div>
  );
}
