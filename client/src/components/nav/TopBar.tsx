import { useState } from 'react';
import { useEditorStore, type ViewMode } from '../../stores/editorStore';
import ProjectSwitcher from './ProjectSwitcher';
import { PanelIcon, SettingsIcon, CodeIcon, BookIcon, ChartIcon } from '../shared/Icons';
import SettingsModal from '../settings/SettingsModal';

const VIEW_MODES: { value: ViewMode; title: string; side: 'left' | 'both' | 'right' }[] = [
  { value: 'editor', title: 'Editor only', side: 'left' },
  { value: 'both', title: 'Editor and preview', side: 'both' },
  { value: 'pdf', title: 'Preview only', side: 'right' },
];

export default function TopBar() {
  const showReferences = useEditorStore((s) => s.showReferences);
  const setShowReferences = useEditorStore((s) => s.setShowReferences);
  const showPyramidPlots = useEditorStore((s) => s.showPyramidPlots);
  const setShowPyramidPlots = useEditorStore((s) => s.setShowPyramidPlots);
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      style={{
        height: 44,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 20,
        flexShrink: 0,
      }}
    >
      {/* Icon Rail */}
      <nav style={{ display: 'flex', gap: 2 }}>
        <IconRailButton icon={<CodeIcon size={18} />} active title="Editor" />
        <IconRailButton
          icon={<BookIcon size={18} />}
          active={showReferences}
          onClick={() => setShowReferences(true)}
          title="References"
        />
        <IconRailButton
          icon={<ChartIcon size={18} />}
          active={showPyramidPlots}
          onClick={() => setShowPyramidPlots(true)}
          title="Pyramid plots"
        />
      </nav>

      {/* Project Switcher */}
      <ProjectSwitcher />

      {/* Right side */}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* View mode segmented control */}
        <div
          style={{
            display: 'inline-flex',
            background: 'var(--bg-warm)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 2,
            gap: 2,
            flexShrink: 0,
          }}
        >
          {VIEW_MODES.map((m) => {
            const active = viewMode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setViewMode(m.value)}
                title={m.title}
                style={{
                  cursor: 'pointer',
                  border: 'none',
                  padding: '3px 9px',
                  borderRadius: 4,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'white' : 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.12s, color 0.12s',
                }}
              >
                <PanelIcon size={13} side={m.side} />
              </button>
            );
          })}
        </div>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          title="Settings"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 20,
            padding: '4px 8px',
            borderRadius: 4,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-warm)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLElement).style.background = 'none';
          }}
        >
          <SettingsIcon size={18} />
        </button>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function IconRailButton({ icon, active, onClick, title }: {
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 5,
        cursor: 'pointer',
        border: 'none',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'white' : 'var(--text-secondary)',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      {icon}
    </button>
  );
}
