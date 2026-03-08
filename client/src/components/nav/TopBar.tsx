import { useEditorStore } from '../../stores/editorStore';
import type { ActivePanel } from '../../stores/editorStore';
import ProjectSwitcher from './ProjectSwitcher';

interface TopBarProps {
  onCompile: () => void;
}

export default function TopBar({ onCompile }: TopBarProps) {
  const compilationStatus = useEditorStore((s) => s.compilationStatus);
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

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
      {/* Logo */}
      <div
        style={{
          fontFamily: "'Source Serif 4', serif",
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: -0.3,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            background: 'var(--accent)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 12,
            fontFamily: "'Source Code Pro', monospace",
            fontWeight: 600,
          }}
        >
          τ
        </div>
        TeXLab
      </div>

      {/* Project Switcher */}
      <ProjectSwitcher />

      {/* Nav */}
      <div style={{ display: 'flex', gap: 2 }}>
        <NavItem label="Editor" active={!activePanel} onClick={() => setActivePanel(null)} />
        <NavItem label="Symbols" active={activePanel === 'symbols'} onClick={() => togglePanel('symbols')} />
        <NavItem label="Snippets" active={activePanel === 'snippets'} onClick={() => togglePanel('snippets')} />
      </div>

      {/* Right side */}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
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
        <button
          onClick={onCompile}
          disabled={compilationStatus === 'compiling'}
          style={{
            fontSize: 12,
            color: 'white',
            background: compilationStatus === 'compiling' ? 'var(--accent-light)' : 'var(--accent)',
            border: '1px solid var(--accent)',
            padding: '5px 14px',
            borderRadius: 6,
            cursor: compilationStatus === 'compiling' ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          {compilationStatus === 'compiling' ? '⟳ Compiling' : '▶ Compile'}
        </button>
      </div>
    </div>
  );
}

function NavItem({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        fontSize: 12.5,
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        padding: '6px 12px',
        borderRadius: 5,
        cursor: 'pointer',
        fontWeight: active ? 500 : 400,
        background: active ? 'var(--accent-bg)' : 'transparent',
      }}
    >
      {label}
    </div>
  );
}
