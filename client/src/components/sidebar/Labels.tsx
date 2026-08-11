import { useMemo, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { goToSource } from '../../lib/navigate';
import {
  LABEL_KIND_NAME,
  LABEL_KIND_TAG,
  refCommandFor,
  type LabelKind,
  type ScopeLabel,
} from '../../lib/scope-api';
import {
  Badge,
  FilterInput,
  OutlinedButton,
  Pill,
  SectionLabel,
  hoverRow,
  leaveRow,
  rowStyle,
} from '../shared/ui';
import { ChevronDown, ChevronRight, CopyIcon } from '../shared/Icons';
import { fs, font, metrics, radius } from '../../theme/tokens';

/**
 * Labels, under the outline (handoff 1b).
 *
 * The outline answers "what is in this document"; the labels list answers "what
 * can I point at, and does anything point back". Both are the same question at
 * two granularities, which is why they share a panel and a scroll.
 *
 * Every field comes from the scope graph, so a label declared in an \input'd
 * file is here too, and the use counts are the whole project's — a label is
 * unused only when nothing anywhere references it. That also means the list
 * follows the file on disk: it catches up a moment after autosave, not on every
 * keystroke like the outline above it.
 */

type SortKey = 'order' | 'name' | 'kind' | 'uses';
type Reach = 'file' | 'scope';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'order', label: 'In order' },
  { value: 'name', label: 'By name' },
  { value: 'kind', label: 'By kind' },
  { value: 'uses', label: 'Most used' },
];

/** Kind order for the pill row and the kind sort — document order, roughly. */
const KIND_ORDER: LabelKind[] = [
  'section', 'equation', 'figure', 'table', 'theorem', 'algorithm', 'listing', 'item', 'other',
];

const hint = (text: string) => (
  <div style={{ padding: `5px ${metrics.padPanel}px`, fontSize: fs.meta, color: 'var(--text-faint)' }}>
    {text}
  </div>
);

export default function Labels({
  selected,
  onSelect,
}: {
  selected: ScopeLabel | null;
  onSelect: (label: ScopeLabel | null) => void;
}) {
  const scope = useEditorStore((s) => s.scope);
  const scopeStatus = useEditorStore((s) => s.scopeStatus);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);

  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<LabelKind | 'all'>('all');
  const [reach, setReach] = useState<Reach>('file');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('order');

  const all = scope?.labels ?? [];

  // Narrowed by reach and text, before the kind pills — the pills count what
  // choosing them would show.
  const candidates = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return all.filter(
      (l) =>
        (reach === 'scope' || l.source.file === activeTabPath) &&
        (!query || l.name.toLowerCase().includes(query) || (l.section ?? '').toLowerCase().includes(query))
    );
  }, [all, filter, reach, activeTabPath]);

  const kindCounts = useMemo(() => {
    const counts = new Map<LabelKind, number>();
    for (const l of candidates) counts.set(l.kind, (counts.get(l.kind) ?? 0) + 1);
    return KIND_ORDER.filter((k) => counts.has(k)).map((k) => ({ kind: k, count: counts.get(k)! }));
  }, [candidates]);

  const shown = useMemo(() => {
    const rows = candidates.filter((l) => (kind === 'all' || l.kind === kind) && (!unusedOnly || l.uses === 0));
    if (sort === 'order') return rows;
    return [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'uses') return b.uses - a.uses || a.name.localeCompare(b.name);
      return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name);
    });
  }, [candidates, kind, unusedOnly, sort]);

  const dangling = scope?.danglingRefs ?? [];
  const unusedCount = candidates.filter((l) => l.uses === 0).length;

  const pick = (label: ScopeLabel) => {
    const same = selected?.name === label.name && selected?.source.line === label.source.line;
    onSelect(same ? null : label);
    // Scrolling within the open file is free; opening a different file is a
    // navigation the user should ask for, so that waits for "Go to".
    if (!same && label.source.file === activeTabPath) requestScrollToLine(label.source.line);
  };

  return (
    <>
      <div
        onClick={() => setOpen(!open)}
        title={open ? 'Hide labels' : 'Show labels'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          margin: `12px ${metrics.padPanel}px 2px`,
          paddingTop: 12,
          borderTop: '1px solid var(--line)',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', color: 'var(--text-faint)' }}>
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <SectionLabel>Labels</SectionLabel>
        <span style={{ marginLeft: 'auto', fontSize: fs.meta, color: 'var(--text-disabled)' }}>
          {all.length === 0 ? '' : shown.length}
        </span>
      </div>

      {open && (
        <>
          {!scope ? (
            hint(scopeStatus === 'resolving' ? 'Resolving…' : 'No labels resolved yet')
          ) : all.length === 0 ? (
            hint('No \\label in scope')
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: `4px ${metrics.padPanel - 2}px 2px`,
                }}
              >
                <FilterInput value={filter} onChange={setFilter} placeholder="Filter labels…" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  title="Order the labels"
                  style={{
                    flexShrink: 0,
                    maxWidth: 86,
                    fontFamily: font.ui,
                    fontSize: fs.meta,
                    padding: '4px 4px',
                    borderRadius: radius.chip,
                    border: '1px solid var(--line)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 5,
                  padding: `6px ${metrics.padPanel}px`,
                }}
              >
                <Pill
                  mono={false}
                  active={reach === 'scope'}
                  onClick={() => setReach(reach === 'scope' ? 'file' : 'scope')}
                  title={
                    reach === 'scope'
                      ? 'Showing every label the scope graph reaches — click for this file only'
                      : 'Showing labels declared in this file — click for everything in scope'
                  }
                >
                  In scope {reach === 'scope' ? all.length : ''}
                </Pill>
                <Pill
                  mono={false}
                  active={unusedOnly}
                  onClick={() => setUnusedOnly(!unusedOnly)}
                  title="Only labels nothing references"
                >
                  Unused {unusedCount}
                </Pill>
              </div>

              {kindCounts.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: `0 ${metrics.padPanel}px 7px` }}>
                  <Pill mono={false} active={kind === 'all'} onClick={() => setKind('all')}>
                    All
                  </Pill>
                  {kindCounts.map(({ kind: k, count }) => (
                    <Pill
                      key={k}
                      mono={false}
                      active={kind === k}
                      onClick={() => setKind(kind === k ? 'all' : k)}
                      title={LABEL_KIND_NAME[k]}
                    >
                      {LABEL_KIND_TAG[k]} {count}
                    </Pill>
                  ))}
                </div>
              )}

              {shown.length === 0
                ? hint('No label matches')
                : shown.map((label) => (
                    <LabelRow
                      key={`${label.source.file}:${label.source.line}:${label.name}`}
                      label={label}
                      active={
                        selected?.name === label.name && selected?.source.line === label.source.line
                      }
                      elsewhere={label.source.file !== activeTabPath}
                      onClick={() => pick(label)}
                    />
                  ))}
            </>
          )}

          {dangling.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  margin: `10px ${metrics.padPanel}px 2px`,
                  paddingTop: 10,
                  borderTop: '1px solid var(--line-faint)',
                }}
              >
                <SectionLabel style={{ color: 'var(--error)' }}>Unresolved refs</SectionLabel>
                <span style={{ marginLeft: 'auto', fontSize: fs.meta, color: 'var(--text-disabled)' }}>
                  {dangling.length}
                </span>
              </div>
              {dangling.map((ref) => (
                <div
                  key={ref.key}
                  onClick={() => goToSource(ref.source.file, ref.source.line)}
                  onMouseEnter={(e) => hoverRow(e, false)}
                  onMouseLeave={(e) => leaveRow(e, false)}
                  title={`\\ref{${ref.key}} — no \\label defines it (${ref.source.file}:${ref.source.line})`}
                  style={rowStyle(false, {
                    gap: 6,
                    padding: `3px ${metrics.padPanel}px 3px ${metrics.padPanel - 2}px`,
                    fontFamily: font.mono,
                    fontSize: fs.control,
                    color: 'var(--error)',
                  })}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{ref.key}</span>
                  <span style={{ marginLeft: 'auto', fontSize: fs.label, color: 'var(--text-disabled)', flexShrink: 0 }}>
                    {ref.uses}×
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

function LabelRow({
  label,
  active,
  elsewhere,
  onClick,
}: {
  label: ScopeLabel;
  active: boolean;
  elsewhere: boolean;
  onClick: () => void;
}) {
  const where = `${label.source.file}:${label.source.line}`;
  const what = label.env ? `${LABEL_KIND_NAME[label.kind]} (${label.env})` : LABEL_KIND_NAME[label.kind];
  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => hoverRow(e, active)}
      onMouseLeave={(e) => leaveRow(e, active)}
      title={[
        label.name,
        what,
        label.section && `in ${label.section}`,
        where,
        `${label.uses} reference${label.uses === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      style={rowStyle(active, {
        gap: 6,
        padding: `3px ${metrics.padPanel}px 3px ${metrics.padPanel - 2}px`,
      })}
    >
      <span
        style={{
          width: 24,
          flexShrink: 0,
          textAlign: 'right',
          fontFamily: font.mono,
          fontSize: fs.label,
          color: 'var(--text-disabled)',
        }}
      >
        {LABEL_KIND_TAG[label.kind]}
      </span>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: fs.control,
          color: label.duplicate ? 'var(--error)' : active ? 'var(--text)' : 'var(--text-muted)',
          fontStyle: elsewhere ? 'italic' : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
        }}
      >
        {label.name}
      </span>
      {label.duplicate && <Badge tone="error">dup</Badge>}
      {label.uses === 0 ? (
        <span style={{ marginLeft: 'auto', fontSize: fs.label, color: 'var(--text-faint)', flexShrink: 0 }}>
          unused
        </span>
      ) : (
        <span style={{ marginLeft: 'auto', fontSize: fs.label, color: 'var(--text-disabled)', flexShrink: 0 }}>
          {label.uses}×
        </span>
      )}
    </div>
  );
}

/**
 * Actions for the selected label. Lives at the foot of the panel rather than in
 * the row, so a 240px list stays one line per label.
 */
export function LabelActions({ label, onClose }: { label: ScopeLabel; onClose: () => void }) {
  const command = refCommandFor(label);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(label.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--line)',
        padding: `8px ${metrics.padPanel}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: fs.meta,
            color: 'var(--accent)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
          title={label.name}
        >
          {label.name}
        </span>
        <span
          style={{ marginLeft: 'auto', fontSize: fs.label, color: 'var(--text-disabled)', flexShrink: 0 }}
          title={`${label.source.file}:${label.source.line}`}
        >
          {copied ? 'copied' : `${label.source.file.split('/').pop()}:${label.source.line}`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <OutlinedButton
          onClick={() => {
            goToSource(label.source.file, label.source.line);
            onClose();
          }}
          title={`Go to ${label.source.file}:${label.source.line}`}
        >
          Go to
        </OutlinedButton>
        <OutlinedButton
          accent
          onClick={() => useEditorStore.getState().insertAtCursor(`\\${command}{${label.name}}`)}
          title={`Insert \\${command}{${label.name}} at the cursor`}
        >
          \{command}
        </OutlinedButton>
        <OutlinedButton
          onClick={copy}
          title="Copy the label name"
          icon={<CopyIcon size={11} />}
          style={{ marginLeft: 'auto', padding: '4px 9px' }}
        />
      </div>
    </div>
  );
}
