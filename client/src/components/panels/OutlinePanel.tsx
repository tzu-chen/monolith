import { useEffect, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import Outline from '../sidebar/Outline';
import Labels, { LabelActions } from '../sidebar/Labels';
import { PanelHeader, PanelBody } from '../shared/ui';
import type { ScopeLabel } from '../../lib/scope-api';
import { fs, font } from '../../theme/tokens';

/**
 * Outline panel (210px in the handoff, scaled here).
 *
 * Sections first, then the labels list from 1b. The selected label's actions
 * sit at the foot of the panel, outside the scroll, so they stay reachable
 * however far down the list it was found.
 */
export default function OutlinePanel() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const scope = useEditorStore((s) => s.scope);
  const [selected, setSelected] = useState<ScopeLabel | null>(null);

  // A re-resolve replaces every label object. Re-point the selection at the new
  // one — matching the line first, so picking one of a duplicated pair does not
  // snap to the other — and drop it when the label is gone.
  useEffect(() => {
    if (!selected) return;
    const mine = (l: ScopeLabel) => l.name === selected.name && l.source.file === selected.source.file;
    const next =
      scope?.labels.find((l) => mine(l) && l.source.line === selected.source.line) ??
      scope?.labels.find(mine) ??
      null;
    if (next !== selected) setSelected(next);
  }, [scope, selected]);

  return (
    <>
      <PanelHeader title="Outline">
        {activeTabPath && (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: fs.meta,
              color: 'var(--text-disabled)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 130,
            }}
            title={activeTabPath}
          >
            {activeTabPath.split('/').pop()}
          </span>
        )}
      </PanelHeader>
      <PanelBody>
        <Outline />
        {activeTabPath?.endsWith('.tex') && <Labels selected={selected} onSelect={setSelected} />}
      </PanelBody>
      {selected && <LabelActions label={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
