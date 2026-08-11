import { useEditorStore } from '../../stores/editorStore';
import { CloseIcon, PlayIcon, SpinnerIcon, OmegaIcon, SnippetIcon } from '../shared/Icons';
import { OutlinedButton, IconButton, BarDivider } from '../shared/ui';
import ViewModeControl, { ownsViewModeControl } from '../shared/ViewModeControl';
import { fs, font, metrics, motion } from '../../theme/tokens';
import { mod } from '../../lib/shortcuts';
import { useElementWidth } from '../../hooks/useElementWidth';

/**
 * Tab bar (34px in the handoff, scaled here).
 *
 * Open files as tabs — active carries a 2px accent bottom edge and, when
 * unsaved, a 5px accent dot. The right side holds the pane's actions with their
 * shortcut shown beside them, never a hidden menu; when the pane is narrow the
 * labels drop first and the actions themselves stay put.
 *
 * Compile lives in the preview toolbar, next to the output it produces, and
 * appears here only when the preview is hidden.
 */

interface TabBarProps {
  onCompile: () => void;
  onManualSave: () => void;
}

export default function TabBar({ onCompile, onManualSave }: TabBarProps) {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const dirty = useEditorStore((s) => s.dirty);
  const compilationStatus = useEditorStore((s) => s.compilationStatus);
  const activeDrawer = useEditorStore((s) => s.activeDrawer);
  const toggleDrawer = useEditorStore((s) => s.toggleDrawer);
  const viewMode = useEditorStore((s) => s.viewMode);

  const [barRef, barWidth] = useElementWidth<HTMLDivElement>();
  const w = barWidth || Infinity;
  const showLabels = w >= 560;
  const showDrawerToggles = w >= 400;

  const compiling = compilationStatus === 'compiling';
  // Without a preview pane there is no other Compile button on screen.
  const showCompile = viewMode === 'editor';

  return (
    <div
      ref={barRef}
      style={{
        height: metrics.bar,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface-chrome)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', minWidth: 0, flex: 1 }}>
        {openTabs.map((tab) => {
          const active = tab.path === activeTabPath;
          const name = tab.path.split('/').pop() || tab.path;
          return (
            <div
              key={tab.path}
              onClick={() => setActiveTab(tab.path)}
              title={tab.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: `0 ${metrics.padPanel}px`,
                fontFamily: font.mono,
                fontSize: fs.row,
                color: active ? 'var(--text)' : 'var(--text-faint)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer',
                flexShrink: 0,
                transition: `color ${motion.color}`,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = 'var(--text-muted)';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = 'var(--text-faint)';
              }}
            >
              <span>{name}</span>
              {tab.dirty && (
                <span
                  title="Unsaved changes"
                  style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
                />
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                title={`Close ${name}`}
                style={{ display: 'flex', color: 'var(--text-disabled)', padding: '0 1px' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-disabled)'; }}
              >
                <CloseIcon size={13} />
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `0 ${metrics.padPanel - 2}px`,
          flexShrink: 0,
        }}
      >
        {showCompile && (
          <OutlinedButton
            accent
            onClick={onCompile}
            disabled={compiling}
            title={compiling ? 'Compiling…' : `Compile (${mod('S')})`}
            icon={compiling ? <SpinnerIcon size={12} /> : <PlayIcon size={12} />}
          >
            {showLabels && (compiling ? 'Compiling' : 'Compile')}
          </OutlinedButton>
        )}

        {dirty && activeTabPath && (
          <OutlinedButton onClick={onManualSave} title={`Save file (${mod('S')})`}>
            {showLabels ? 'Save' : '●'}
          </OutlinedButton>
        )}

        {showDrawerToggles && (
          <>
            <IconButton
              icon={<OmegaIcon size={14} />}
              title="Symbols"
              active={activeDrawer === 'symbols'}
              onClick={() => toggleDrawer('symbols')}
            />
            <IconButton
              icon={<SnippetIcon size={14} />}
              title="Snippets"
              active={activeDrawer === 'snippets'}
              onClick={() => toggleDrawer('snippets')}
            />
          </>
        )}

        {/* Never width-gated: hiding this would strand the current layout. */}
        {ownsViewModeControl(viewMode, 'tabs') && (
          <>
            <BarDivider />
            <ViewModeControl />
          </>
        )}
      </div>
    </div>
  );
}
