import { useEditorStore } from '../../stores/editorStore';
import Outline from '../sidebar/Outline';
import { PanelHeader, PanelBody } from '../shared/ui';
import { fs, font } from '../../theme/tokens';

/** Outline panel (210px in the handoff, scaled here). */
export default function OutlinePanel() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);

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
      </PanelBody>
    </>
  );
}
