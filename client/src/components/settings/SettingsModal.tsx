import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { COLOR_SCHEMES, getSchemeById, applyColorScheme } from '../../colorSchemes';
import { MinusIcon, PlusIcon, CloseIcon } from '../shared/Icons';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const colorScheme = useEditorStore((s) => s.colorScheme);
  const setColorScheme = useEditorStore((s) => s.setColorScheme);
  const fontSize = useEditorStore((s) => s.fontSize);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const setFontFamily = useEditorStore((s) => s.setFontFamily);
  const vimMode = useEditorStore((s) => s.vimMode);
  const toggleVimMode = useEditorStore((s) => s.toggleVimMode);

  // Track the scheme when modal opened so we can revert on cancel
  const initialSchemeRef = useRef(colorScheme);
  const [selectedScheme, setSelectedScheme] = useState(colorScheme);

  // Preview scheme instantly when clicked
  const handleSchemeClick = (id: string) => {
    setSelectedScheme(id);
    const scheme = getSchemeById(id);
    applyColorScheme(scheme);
  };

  const handleSave = () => {
    setColorScheme(selectedScheme);
    onClose();
  };

  const handleCancel = () => {
    // Revert to the scheme that was active when modal opened
    const original = getSchemeById(initialSchemeRef.current);
    applyColorScheme(original);
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentScheme = getSchemeById(selectedScheme);

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
          width: 540,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
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

        {/* Color Scheme Section */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: currentScheme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Color Scheme
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            {COLOR_SCHEMES.map((scheme) => {
              const isActive = selectedScheme === scheme.id;
              return (
                <div
                  key={scheme.id}
                  onClick={() => handleSchemeClick(scheme.id)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: `2px solid ${isActive ? currentScheme.colors.accent : currentScheme.colors.border}`,
                    background: scheme.colors.bgWarm,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                >
                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: scheme.colors.bgEditor, border: `1px solid ${scheme.colors.border}` }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: scheme.colors.bgPanel }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: scheme.colors.accent }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: scheme.colors.textPrimary }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: scheme.colors.green }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: scheme.colors.purple }} />
                  </div>
                  {/* Name and type */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: scheme.colors.textPrimary }}>
                      {scheme.name}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: scheme.colors.bgActive,
                        color: scheme.colors.textSecondary,
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        letterSpacing: 0.3,
                      }}
                    >
                      {scheme.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Font Family Section */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: currentScheme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Editor Font
          </label>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 8,
              fontSize: 13,
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
          <label style={{ fontSize: 12, fontWeight: 600, color: currentScheme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Font Size
          </label>
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

        {/* Vim Mode Toggle */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: currentScheme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Vim Mode
          </label>
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
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'Source Code Pro', monospace",
            }}
          >
            VIM
            <span style={{ fontSize: 11, opacity: 0.7 }}>{vimMode ? 'ON' : 'OFF'}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={handleCancel}
            style={{
              fontSize: 13,
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
              fontSize: 13,
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
