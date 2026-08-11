import { useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { Pill, SectionLabel, BarDivider } from '../shared/ui';
import { ArrowRight } from '../shared/Icons';
import { fs, metrics } from '../../theme/tokens';
import { useElementWidth } from '../../hooks/useElementWidth';

/**
 * Scope strip, between the tab bar and the editor.
 *
 * Answers "what is in scope here" at a glance: first the files this one
 * inherits from, then — past a hairline — the packages they bring with them,
 * and a count of the macros now available. The accent count on the right opens
 * the In-scope panel, where the same graph is browsable in full.
 *
 * The strip is a single line that never wraps, so packages that do not fit
 * collapse into a `+N` chip rather than pushing the count off the end.
 */

/** Rough width of a pill, from its label length — enough to decide what fits. */
function pillWidth(label: string): number {
  return label.length * 8.2 + 28;
}

export default function ScopeStrip() {
  const scope = useEditorStore((s) => s.scope);
  const scopeStatus = useEditorStore((s) => s.scopeStatus);
  const activePanel = useEditorStore((s) => s.activePanel);
  const toggleActivePanel = useEditorStore((s) => s.toggleActivePanel);
  const [stripRef, stripWidth] = useElementWidth<HTMLDivElement>();

  const includes = scope?.includes ?? [];
  const packages = scope?.packages ?? [];
  const macroCount = scope?.macros.length ?? 0;

  // Budget: total width minus the SCOPE label, the divider, and the macro count.
  const visiblePackages = useMemo(() => {
    if (!stripWidth) return packages.slice(0, 4);
    let budget =
      stripWidth - 90 - 130 - includes.reduce((sum, i) => sum + pillWidth(i.path.split('/').pop() ?? i.path), 0);
    const shown: typeof packages = [];
    for (const pkg of packages) {
      const w = pillWidth(pkg.name);
      if (budget - w < 60) break;
      budget -= w;
      shown.push(pkg);
    }
    return shown;
  }, [packages, includes, stripWidth]);

  const overflow = packages.length - visiblePackages.length;

  if (scopeStatus === 'idle' && !scope) return null;

  return (
    <div
      ref={stripRef}
      style={{
        minHeight: metrics.strip,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: `7px ${metrics.padPanel}px`,
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface-chrome)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <SectionLabel style={{ fontSize: fs.label - 0.5 }}>Scope</SectionLabel>

      {scopeStatus === 'resolving' && !scope && (
        <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>resolving…</span>
      )}

      {scopeStatus === 'error' && (
        <span style={{ fontSize: fs.meta, color: 'var(--error)' }}>scope unavailable</span>
      )}

      {includes.map((inc) => (
        <Pill
          key={inc.path}
          title={`Inherited via \\input in ${inc.via}:${inc.line}`}
          icon={<ArrowRight size={11} style={{ color: 'var(--accent)' }} />}
        >
          {inc.path.split('/').pop()}
        </Pill>
      ))}

      {includes.length > 0 && packages.length > 0 && <BarDivider />}

      {visiblePackages.map((pkg) => (
        <Pill
          key={`${pkg.source.file}:${pkg.name}`}
          title={`${pkg.name}${pkg.options.length ? ` [${pkg.options.join(', ')}]` : ''} — ${pkg.source.file}:${pkg.source.line}`}
          tone={pkg.latexml === 'caution' ? 'warn' : undefined}
        >
          {pkg.name}
        </Pill>
      ))}

      {overflow > 0 && (
        <Pill
          title={`${overflow} more: ${packages.slice(visiblePackages.length).map((p) => p.name).join(', ')}`}
          onClick={() => toggleActivePanel('scope')}
        >
          +{overflow}
        </Pill>
      )}

      {scope && (
        <span style={{ marginLeft: 'auto', display: 'flex', flexShrink: 0 }}>
          <Pill
            mono={false}
            active={activePanel === 'scope'}
            tone="accent"
            onClick={() => toggleActivePanel('scope')}
            title="Open the In-scope panel"
          >
            {macroCount} macro{macroCount === 1 ? '' : 's'}
          </Pill>
        </span>
      )}
    </div>
  );
}
