import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { ActivePanel } from '../../stores/editorStore';
import ProjectSwitcher from './ProjectSwitcher';
import { PanelIcon, SettingsIcon, CodeIcon, OmegaIcon, SnippetIcon } from '../shared/Icons';
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
          icon={<OmegaIcon size={18} />}
          active={activePanel === 'symbols'}
          onClick={() => togglePanel('symbols')}
          title="Symbols"
        />
        <IconRailButton
          icon={<SnippetIcon size={18} />}
          active={activePanel === 'snippets'}
          onClick={() => togglePanel('snippets')}
          title="Snippets"
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
            fontSize: 10,
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
        <div
          onClick={() => setShowSettings(true)}
          title="Settings"
          style={{
            cursor: 'pointer',
            userSelect: 'none',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            background: 'var(--bg-warm)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <SettingsIcon size={14} />
        </div>

        <span
          style={{
            fontSize: 10,
            color: 'var(--text-dim)',
            background: 'var(--bg-warm)',
            padding: '2px 6px',
            borderRadius: 3,
            border: '1px solid var(--border)',
            fontFamily: "'Source Code Pro', monospace",
          }}
        >
          ⌘S
        </span>
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
