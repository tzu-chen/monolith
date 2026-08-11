import { useMemo, useState, type ReactNode } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { goToSource } from '../../lib/navigate';
import type { ScopeMacro, ScopePackage } from '../../lib/scope-api';
import {
  PanelHeader,
  FilterRow,
  FilterInput,
  PanelBody,
  OutlinedButton,
  Pill,
  Badge,
  SectionLabel,
  EmptyState,
  rowStyle,
  hoverRow,
  leaveRow,
} from '../shared/ui';
import { ChevronDown, ChevronRight, SpinnerIcon } from '../shared/Icons';
import { fs, font, metrics } from '../../theme/tokens';

/**
 * In-scope panel (handoff S3).
 *
 * Answers "what does this file actually have, counting everything it inherits
 * from preamble.tex and macros.sty?" — packages with their source location and
 * LaTeXML support, macros with their arity, use count and whether they shadow a
 * package command, plus the environments and the include chain that carried
 * them here.
 */

type SourceFilter = 'all' | 'this-file' | 'unused';

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'this-file', label: 'This file' },
  { value: 'unused', label: 'Unused' },
];

function Section({
  label,
  count,
  children,
  defaultOpen = true,
}: {
  label: string;
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: `8px ${metrics.padPanel}px`,
          borderTop: '1px solid var(--line-faint)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{ display: 'flex', color: 'var(--text-faint)' }}>
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <SectionLabel>{label}</SectionLabel>
        <span style={{ fontSize: fs.meta, color: 'var(--text-disabled)' }}>{count}</span>
      </div>
      {open && children}
    </>
  );
}

/** `preamble.tex:3` — where a declaration actually lives. */
function SourceLocation({ file, line }: { file: string; line: number }) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        goToSource(file, line);
      }}
      title={`Go to ${file}:${line}`}
      style={{
        marginLeft: 'auto',
        flexShrink: 0,
        fontFamily: font.mono,
        fontSize: fs.label,
        color: 'var(--text-disabled)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-disabled)'; }}
    >
      {file.split('/').pop()}:{line}
    </span>
  );
}

function PackageRow({ pkg }: { pkg: ScopePackage }) {
  return (
    <div
      style={rowStyle(false, {
        gap: 7,
        padding: `4px ${metrics.padPanel}px 4px ${metrics.padPanel + 12}px`,
        cursor: 'default',
        flexWrap: 'wrap',
      })}
    >
      <span style={{ fontFamily: font.mono, fontSize: fs.toolbar, color: 'var(--text)' }}>{pkg.name}</span>
      {pkg.options.length > 0 && (
        <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-faint)' }}>
          [{pkg.options.join(', ')}]
        </span>
      )}
      {pkg.latexml === 'caution' && (
        <Badge tone="warn">
          <span title={pkg.latexmlNote ?? undefined}>no latexml support</span>
        </Badge>
      )}
      {pkg.latexml === 'partial' && (
        <Badge>
          <span title={pkg.latexmlNote ?? undefined}>partial latexml</span>
        </Badge>
      )}
      <SourceLocation file={pkg.source.file} line={pkg.source.line} />
    </div>
  );
}

function MacroRow({ macro, selected, onSelect }: { macro: ScopeMacro; selected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      onMouseEnter={(e) => hoverRow(e, selected)}
      onMouseLeave={(e) => leaveRow(e, selected)}
      title={macro.definition}
      style={rowStyle(selected, {
        gap: 7,
        padding: `4px ${metrics.padPanel}px 4px ${metrics.padPanel + 12}px`,
        flexWrap: 'wrap',
      })}
    >
      <span
        style={{
          fontFamily: font.mono,
          fontSize: fs.toolbar,
          color: selected ? 'var(--accent)' : 'var(--text)',
        }}
      >
        \{macro.name}
      </span>
      {macro.body && (
        <span
          style={{
            fontFamily: font.serif,
            fontStyle: 'italic',
            fontSize: fs.control,
            color: 'var(--text-muted)',
            maxWidth: 110,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {macro.body}
        </span>
      )}
      {macro.arity > 0 && (
        <span style={{ fontSize: fs.label, color: 'var(--text-faint)' }}>
          {macro.arity} arg{macro.arity === 1 ? '' : 's'}
        </span>
      )}
      {macro.uses === 0 && <Badge>unused</Badge>}
      {macro.overrides && <Badge tone="error">overrides {macro.overrides}</Badge>}
      <SourceLocation file={macro.source.file} line={macro.source.line} />
      <span style={{ fontSize: fs.label, color: 'var(--text-disabled)', flexShrink: 0 }}>
        · {macro.uses}×
      </span>
    </div>
  );
}

export default function ScopePanel() {
  const scope = useEditorStore((s) => s.scope);
  const scopeStatus = useEditorStore((s) => s.scopeStatus);
  const scopeError = useEditorStore((s) => s.scopeError);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  // Resolution itself is owned by the single `useScope` in App — Rescan just
  // invalidates, so opening this panel never issues a competing request.
  const refresh = useEditorStore((s) => s.invalidateScope);

  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);

  const query = filter.toLowerCase();

  const matchesSource = (file: string, uses: number) => {
    if (source === 'this-file') return file === activeTabPath;
    if (source === 'unused') return uses === 0;
    return true;
  };

  const packages = useMemo(
    () =>
      (scope?.packages ?? []).filter(
        (p) =>
          p.name.toLowerCase().includes(query) &&
          (source !== 'this-file' || p.source.file === activeTabPath) &&
          source !== 'unused'
      ),
    [scope, query, source, activeTabPath]
  );

  const macros = useMemo(
    () =>
      (scope?.macros ?? []).filter(
        (m) => m.name.toLowerCase().includes(query) && matchesSource(m.source.file, m.uses)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, query, source, activeTabPath]
  );

  const environments = useMemo(
    () =>
      (scope?.environments ?? []).filter(
        (e) => e.name.toLowerCase().includes(query) && matchesSource(e.source.file, e.uses)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, query, source, activeTabPath]
  );

  const selected = macros.find((m) => m.name === selectedMacro) ?? null;

  return (
    <>
      <PanelHeader title="In scope">
        {activeTabPath && (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: fs.meta,
              color: 'var(--text-disabled)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 120,
            }}
            title={activeTabPath}
          >
            {activeTabPath.split('/').pop()}
          </span>
        )}
        <OutlinedButton onClick={refresh} title="Re-resolve the scope graph">Rescan</OutlinedButton>
      </PanelHeader>

      <FilterRow>
        <FilterInput value={filter} onChange={setFilter} placeholder="Filter packages and macros…" />
      </FilterRow>

      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: `8px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        {SOURCE_FILTERS.map((f) => (
          <Pill key={f.value} mono={false} active={source === f.value} onClick={() => setSource(f.value)}>
            {f.label}
          </Pill>
        ))}
      </div>

      <PanelBody>
        {scopeStatus === 'error' ? (
          <EmptyState action={<OutlinedButton onClick={refresh}>Retry</OutlinedButton>}>
            {scopeError ?? 'Could not resolve the scope graph'}
          </EmptyState>
        ) : !scope ? (
          <EmptyState>
            {scopeStatus === 'resolving' ? <SpinnerIcon size={16} /> : 'Open a .tex file to resolve its scope'}
          </EmptyState>
        ) : (
          <>
            <Section label="Packages" count={packages.length}>
              {packages.length === 0 ? (
                <div style={{ padding: `6px ${metrics.padPanel + 12}px`, fontSize: fs.meta, color: 'var(--text-faint)' }}>
                  none
                </div>
              ) : (
                packages.map((p) => <PackageRow key={`${p.source.file}:${p.name}`} pkg={p} />)
              )}
            </Section>

            <Section label="Macros" count={macros.length}>
              {macros.length === 0 ? (
                <div style={{ padding: `6px ${metrics.padPanel + 12}px`, fontSize: fs.meta, color: 'var(--text-faint)' }}>
                  none
                </div>
              ) : (
                macros.map((m) => (
                  <MacroRow
                    key={m.name}
                    macro={m}
                    selected={selectedMacro === m.name}
                    onSelect={() => setSelectedMacro(selectedMacro === m.name ? null : m.name)}
                  />
                ))
              )}
            </Section>

            <Section label="Environments" count={environments.length} defaultOpen={false}>
              {environments.map((e) => (
                <div
                  key={e.name}
                  style={rowStyle(false, {
                    gap: 7,
                    padding: `4px ${metrics.padPanel}px 4px ${metrics.padPanel + 12}px`,
                    cursor: 'default',
                  })}
                >
                  <span style={{ fontFamily: font.mono, fontSize: fs.toolbar, color: 'var(--text)' }}>{e.name}</span>
                  {e.uses === 0 && <Badge>unused</Badge>}
                  <SourceLocation file={e.source.file} line={e.source.line} />
                  <span style={{ fontSize: fs.label, color: 'var(--text-disabled)' }}>· {e.uses}×</span>
                </div>
              ))}
            </Section>

            <Section label={`Include chain`} count={scope.includes.length} defaultOpen={false}>
              {scope.includes.map((inc, i) => (
                <div
                  key={`${inc.via}:${inc.line}:${i}`}
                  style={rowStyle(false, {
                    gap: 7,
                    padding: `4px ${metrics.padPanel}px 4px ${metrics.padPanel + 12 + (inc.depth - 1) * 12}px`,
                    cursor: 'default',
                    fontFamily: font.mono,
                    fontSize: fs.meta,
                  })}
                >
                  <span
                    style={{
                      color: inc.resolved ? 'var(--text)' : 'var(--error)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}
                  >
                    {inc.path}
                  </span>
                  {!inc.resolved && <Badge tone="error">missing</Badge>}
                  <SourceLocation file={inc.via} line={inc.line} />
                </div>
              ))}
            </Section>
          </>
        )}
      </PanelBody>

      {selected && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `9px ${metrics.padPanel}px`,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontFamily: font.mono,
              fontSize: fs.meta,
              color: 'var(--accent)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            \{selected.name}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexShrink: 0 }}>
            <OutlinedButton onClick={() => goToSource(selected.source.file, selected.source.line)}>
              Go to definition
            </OutlinedButton>
            <OutlinedButton
              accent
              onClick={() => useEditorStore.getState().insertAtCursor(`\\${selected.name}`)}
            >
              Insert
            </OutlinedButton>
          </span>
        </div>
      )}
    </>
  );
}
