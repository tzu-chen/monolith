import { useEditorStore } from '../../stores/editorStore';
import { useOutline } from '../../hooks/useOutline';
import { rowStyle, hoverRow, leaveRow } from '../shared/ui';
import { fs, metrics } from '../../theme/tokens';

/**
 * Document outline. Sections carry their number; subsections and below indent,
 * matching the handoff's 26px step. Clicking an entry scrolls the editor to it.
 */

const INDENT_PER_LEVEL: Record<number, number> = {
  0: 0,  // \part
  1: 0,  // \chapter
  2: 0,  // \section
  3: 14, // \subsection
  4: 28, // \subsubsection
  5: 42, // \paragraph
};

export default function Outline() {
  const content = useEditorStore((s) => s.content);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const cursorLine = useEditorStore((s) => s.cursorLine);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);
  const entries = useOutline(content);

  if (!activeTabPath?.endsWith('.tex') || entries.length === 0) {
    return (
      <div style={{ padding: '18px 14px', color: 'var(--text-faint)', fontSize: fs.control, textAlign: 'center' }}>
        {activeTabPath?.endsWith('.tex') ? 'No sections in this file' : 'Open a .tex file to see its outline'}
      </div>
    );
  }

  // The entry the cursor currently sits under.
  let currentIndex = -1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].line <= cursorLine) currentIndex = i;
    else break;
  }

  return (
    <div style={{ padding: '6px 0' }}>
      {entries.map((entry, i) => {
        const active = i === currentIndex;
        return (
          <div
            key={`${entry.line}-${i}`}
            onClick={() => requestScrollToLine(entry.line)}
            title={`Line ${entry.line}: ${entry.title}`}
            style={rowStyle(active, {
              padding: `3px ${metrics.padPanel}px 3px ${metrics.padPanel - 2 + (INDENT_PER_LEVEL[entry.level] ?? 0)}px`,
              fontSize: fs.row,
              fontWeight: entry.level <= 2 ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
              whiteSpace: 'nowrap',
            })}
            onMouseEnter={(e) => hoverRow(e, active)}
            onMouseLeave={(e) => leaveRow(e, active)}
          >
            {entry.title}
          </div>
        );
      })}
    </div>
  );
}
