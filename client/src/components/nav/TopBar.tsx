import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { ActivePanel } from '../../stores/editorStore';
import ProjectSwitcher from './ProjectSwitcher';
import { PanelIcon, SettingsIcon, CodeIcon, BookIcon } from '../shared/Icons';
import SettingsModal from '../settings/SettingsModal';

export default function TopBar() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const viewMode = useEditorStore((s) => s.viewMode);
  const cycleViewMode = useEditorStore((s) => s.cycleViewMode);
  const [showSettings, setShowSettings] = useState(false);

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

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
        <IconRailButton
          icon={<CodeIcon size={18} />}
          active={!activePanel}
          onClick={() => setActivePanel(null)}
          title="Editor"
        />
        <IconRailButton
          icon={<BookIcon size={18} />}
          active={activePanel === 'references'}
          onClick={() => togglePanel('references')}
          title="References"
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
        {/* View toggle */}
        <div
          onClick={cycleViewMode}
          title={
            viewMode === 'both'
              ? 'Show editor only'
              : viewMode === 'editor'
                ? 'Show PDF only'
                : 'Show both'
          }
          style={{
            fontSize: 15,
            color: 'var(--text-secondary)',
            background: 'var(--bg-warm)',
            padding: '2px 6px',
            borderRadius: 3,
            border: '1px solid var(--border)',
            fontFamily: "'Source Code Pro', monospace",
            fontWeight: 600,
            cursor: 'pointer',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <span style={{ opacity: viewMode === 'pdf' ? 0.3 : 1 }}><PanelIcon size={10} side="left" /></span>
          <span style={{ opacity: viewMode !== 'both' ? 0.3 : 1 }}>|</span>
          <span style={{ opacity: viewMode === 'editor' ? 0.3 : 1 }}><PanelIcon size={10} side="right" /></span>
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
