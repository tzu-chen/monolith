import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import {
  COLOR_SCHEMES,
  getSchemeById,
  applyColorScheme,
  type ColorScheme,
} from '../../colorSchemes';
import { MinusIcon, PlusIcon, CloseIcon } from '../shared/Icons';

interface SettingsModalProps {
  onClose: () => void;
}

interface ToggleProps {
  on: boolean;
  onClick: () => void;
  ariaLabel: string;
  accent: string;
  off: string;
}

function Toggle({ on, onClick, ariaLabel, accent, off }: ToggleProps) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        background: on ? accent : off,
        border: 'none',
        borderRadius: 11,
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 18,
          height: 18,
          background: '#fff',
          borderRadius: '50%',
          transition: 'transform 0.2s',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  );
}

interface CardProps {
  scheme: ColorScheme;
  active: boolean;
  onClick: () => void;
  currentScheme: ColorScheme;
}

function SchemeCard({ scheme, active, onClick, currentScheme }: CardProps) {
  const c = scheme.colors;
  const ring = currentScheme.colors.accent;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        background: active ? currentScheme.colors.accentBg : currentScheme.colors.bgEditor,
        border: `2px solid ${active ? ring : currentScheme.colors.border}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: active ? `0 0 0 1px ${ring}` : 'none',
        width: '100%',
        fontFamily: 'inherit',
      }}
    >
      {/* Preview */}
      <div
        style={{
          width: '100%',
          height: 64,
          borderRadius: 6,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: c.bgWarm,
          border: `1px solid ${c.border}`,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: 14,
            background: c.bgPanel,
            borderBottom: `1px solid ${c.border}`,
            flexShrink: 0,
          }}
        />
        {/* Body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 6,
            padding: 6,
            alignItems: 'center',
          }}
        >
          {/* "Editor" card */}
          <div
            style={{
              flex: 1,
              height: '100%',
              background: c.bgEditor,
              border: `1px solid ${c.border}`,
              borderRadius: 3,
              padding: '5px 6px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              justifyContent: 'center',
            }}
          >
            <div style={{ height: 3, width: '80%', borderRadius: 1, background: c.textPrimary }} />
            <div style={{ height: 3, width: '55%', borderRadius: 1, background: c.textSecondary }} />
          </div>
          {/* Accent stripe */}
          <div
            style={{
              width: 8,
              height: 26,
              borderRadius: 2,
              background: c.accent,
              flexShrink: 0,
            }}
          />
        </div>
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: currentScheme.colors.textPrimary,
          letterSpacing: 0.2,
        }}
      >
        {scheme.name}
      </span>
    </button>
  );
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const colorScheme = useEditorStore((s) => s.colorScheme);
  const setColorScheme = useEditorStore((s) => s.setColorScheme);
  const autoSwitch = useEditorStore((s) => s.autoSwitch);
  const setAutoSwitch = useEditorStore((s) => s.setAutoSwitch);
  const fontSize = useEditorStore((s) => s.fontSize);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const setFontFamily = useEditorStore((s) => s.setFontFamily);
  const vimMode = useEditorStore((s) => s.vimMode);
  const toggleVimMode = useEditorStore((s) => s.toggleVimMode);
  const lineWrap = useEditorStore((s) => s.lineWrap);
  const toggleLineWrap = useEditorStore((s) => s.toggleLineWrap);
  const showLineNumbers = useEditorStore((s) => s.showLineNumbers);
  const toggleShowLineNumbers = useEditorStore((s) => s.toggleShowLineNumbers);
  const autoRecompile = useEditorStore((s) => s.autoRecompile);
  const toggleAutoRecompile = useEditorStore((s) => s.toggleAutoRecompile);

  // Snapshot to revert on cancel
  const initialSchemeRef = useRef(colorScheme);
  const initialAutoRef = useRef(autoSwitch);
  const [selectedScheme, setSelectedScheme] = useState(colorScheme);
  const [previewAutoOn, setPreviewAutoOn] = useState(autoSwitch.enabled);

  const handleSchemeClick = (id: string) => {
    setSelectedScheme(id);
    setPreviewAutoOn(false);
    applyColorScheme(getSchemeById(id));
  };

  const handleAutoToggle = () => {
    const next = !previewAutoOn;
    setPreviewAutoOn(next);
    if (next) {
      // Preview the time-of-day scheme without persisting yet
      const hour = new Date().getHours();
      const id =
        hour >= autoSwitch.dayStartHour && hour < autoSwitch.nightStartHour
          ? autoSwitch.lightSchemeId
          : autoSwitch.darkSchemeId;
      setSelectedScheme(id);
      applyColorScheme(getSchemeById(id));
    }
  };

  const handleSave = () => {
    if (previewAutoOn) {
      setAutoSwitch({ ...autoSwitch, enabled: true });
    } else {
      if (autoSwitch.enabled) {
        setAutoSwitch({ ...autoSwitch, enabled: false });
      }
      setColorScheme(selectedScheme);
    }
    onClose();
  };

  const handleCancel = () => {
    applyColorScheme(getSchemeById(initialSchemeRef.current));
    setPreviewAutoOn(initialAutoRef.current.enabled);
    onClose();
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentScheme = getSchemeById(selectedScheme);
  const labelStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: currentScheme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };
  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: currentScheme.colors.bgEditor,
    border: `1px solid ${currentScheme.colors.border}`,
    borderRadius: 8,
  };

  return (
    <div
      onClick={handleCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: currentScheme.colors.bgPanel,
          border: `1px solid ${currentScheme.colors.border}`,
          borderRadius: 12,
          padding: 28,
          width: 480,
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: currentScheme.colors.textPrimary, margin: 0 }}>
            Settings
          </h2>
          <div
            onClick={handleCancel}
            style={{ cursor: 'pointer', color: currentScheme.colors.textDim, padding: 4 }}
          >
            <CloseIcon size={16} />
          </div>
        </div>

        {/* Appearance Section */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Appearance</label>

          {/* Auto switch row */}
          <div style={{ ...rowStyle, marginTop: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: currentScheme.colors.textPrimary }}>
                Auto switch
              </span>
              <span style={{ fontSize: 12, color: currentScheme.colors.textSecondary }}>
                Light by day, dark by night
              </span>
            </div>
            <Toggle
              on={previewAutoOn}
              onClick={handleAutoToggle}
              ariaLabel="Auto theme switching"
              accent={currentScheme.colors.accent}
              off={currentScheme.colors.border}
            />
          </div>

          {/* Theme cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
              marginTop: 12,
              opacity: previewAutoOn ? 0.55 : 1,
              pointerEvents: previewAutoOn ? 'none' : 'auto',
              transition: 'opacity 0.15s',
            }}
          >
            {COLOR_SCHEMES.map((scheme) => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                active={selectedScheme === scheme.id}
                onClick={() => handleSchemeClick(scheme.id)}
                currentScheme={currentScheme}
              />
            ))}
          </div>
        </div>

        {/* Font Family Section */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Editor Font</label>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 8,
              fontSize: 15,
              padding: '6px 8px',
              borderRadius: 6,
              border: `1px solid ${currentScheme.colors.border}`,
              background: currentScheme.colors.bgEditor,
              color: currentScheme.colors.textPrimary,
              cursor: 'pointer',
              outline: 'none',
              fontFamily: "'Source Code Pro', monospace",
            }}
          >
            <option value="'Source Code Pro', monospace">Source Code Pro</option>
            <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
            <option value="'Fira Code', monospace">Fira Code</option>
            <option value="'Cascadia Code', monospace">Cascadia Code</option>
            <option value="'IBM Plex Mono', monospace">IBM Plex Mono</option>
            <option value="'Courier New', monospace">Courier New</option>
            <option value="monospace">System Monospace</option>
          </select>
        </div>

        {/* Font Size Section */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Font Size</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div
              onClick={() => setFontSize(fontSize - 0.5)}
              style={{
                background: currentScheme.colors.bgEditor,
                border: `1px solid ${currentScheme.colors.border}`,
                borderRadius: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                color: currentScheme.colors.textSecondary,
              }}
            >
              <MinusIcon size={12} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: currentScheme.colors.textPrimary, minWidth: 36, textAlign: 'center', fontFamily: "'Source Code Pro', monospace" }}>
              {fontSize}
            </span>
            <div
              onClick={() => setFontSize(fontSize + 0.5)}
              style={{
                background: currentScheme.colors.bgEditor,
                border: `1px solid ${currentScheme.colors.border}`,
                borderRadius: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                color: currentScheme.colors.textSecondary,
              }}
            >
              <PlusIcon size={12} />
            </div>
          </div>
        </div>

        {/* Compilation Section */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Compilation</label>
          <div style={{ ...rowStyle, marginTop: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: currentScheme.colors.textPrimary }}>
                Auto recompile
              </span>
              <span style={{ fontSize: 12, color: currentScheme.colors.textSecondary }}>
                Compile &amp; render as you type. Off — use the Compile/Render button.
              </span>
            </div>
            <Toggle
              on={autoRecompile}
              onClick={toggleAutoRecompile}
              ariaLabel="Auto recompile on edit"
              accent={currentScheme.colors.accent}
              off={currentScheme.colors.border}
            />
          </div>
        </div>

        {/* Vim Mode Toggle */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Vim Mode</label>
          <div
            onClick={toggleVimMode}
            style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${vimMode ? currentScheme.colors.accent : currentScheme.colors.border}`,
              background: vimMode ? currentScheme.colors.accentBg : currentScheme.colors.bgEditor,
              color: vimMode ? currentScheme.colors.accent : currentScheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 500,
              fontFamily: "'Source Code Pro', monospace",
            }}
          >
            VIM
            <span style={{ fontSize: 13, opacity: 0.7 }}>{vimMode ? 'ON' : 'OFF'}</span>
          </div>
        </div>

        {/* Line Wrap Toggle */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Line Wrap</label>
          <div
            onClick={toggleLineWrap}
            style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${lineWrap ? currentScheme.colors.accent : currentScheme.colors.border}`,
              background: lineWrap ? currentScheme.colors.accentBg : currentScheme.colors.bgEditor,
              color: lineWrap ? currentScheme.colors.accent : currentScheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 500,
              fontFamily: "'Source Code Pro', monospace",
            }}
          >
            WRAP
            <span style={{ fontSize: 13, opacity: 0.7 }}>{lineWrap ? 'ON' : 'OFF'}</span>
          </div>
        </div>

        {/* Line Numbers Toggle */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Line Numbers</label>
          <div
            onClick={toggleShowLineNumbers}
            style={{
              marginTop: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${showLineNumbers ? currentScheme.colors.accent : currentScheme.colors.border}`,
              background: showLineNumbers ? currentScheme.colors.accentBg : currentScheme.colors.bgEditor,
              color: showLineNumbers ? currentScheme.colors.accent : currentScheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 500,
              fontFamily: "'Source Code Pro', monospace",
            }}
          >
            123
            <span style={{ fontSize: 13, opacity: 0.7 }}>{showLineNumbers ? 'ON' : 'OFF'}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={handleCancel}
            style={{
              fontSize: 15,
              padding: '6px 16px',
              borderRadius: 6,
              border: `1px solid ${currentScheme.colors.border}`,
              background: currentScheme.colors.bgEditor,
              color: currentScheme.colors.textSecondary,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              fontSize: 15,
              padding: '6px 16px',
              borderRadius: 6,
              border: `1px solid ${currentScheme.colors.accent}`,
              background: currentScheme.colors.accent,
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
