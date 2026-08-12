import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { COLOR_SCHEMES, getSchemeById, applyColorScheme, type ColorScheme } from '../../colorSchemes';
import { MinusIcon, PlusIcon, CloseIcon } from '../shared/Icons';
import { OutlinedButton, IconButton, SectionLabel } from '../shared/ui';
import {
  SHORTCUT_GROUPS,
  SHORTCUT_META,
  chordFromEvent,
  formatChord,
  isBindableChord,
  type ShortcutAction,
} from '../../lib/keybindings';
import { suspendShortcuts } from '../../hooks/useShortcuts';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';

interface SettingsModalProps {
  onClose: () => void;
}

/**
 * Settings.
 *
 * Theme choices preview live — picking a scheme applies it immediately and
 * Cancel puts the previous one back, so you judge a palette in the editor
 * rather than in a swatch.
 */

function Toggle({ on, onClick, ariaLabel }: { on: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        width: 42,
        height: 22,
        border: `1px solid ${on ? 'var(--accent)' : 'var(--line-strong)'}`,
        borderRadius: 11,
        background: on ? 'var(--accent-wash)' : 'transparent',
        flexShrink: 0,
        transition: `border-color ${motion.color}, background ${motion.color}`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 14,
          height: 14,
          background: on ? 'var(--accent)' : 'var(--text-faint)',
          borderRadius: '50%',
          transition: 'transform 160ms ease-out, background 120ms ease',
          transform: on ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

/** Miniature of the shell, painted in the scheme's own tokens. */
function SchemeCard({ scheme, active, onClick }: { scheme: ColorScheme; active: boolean; onClick: () => void }) {
  const c = scheme.colors;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 8,
        padding: 9,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        background: active ? 'var(--accent-wash)' : 'transparent',
        borderRadius: radius.card,
        cursor: 'pointer',
        transition: `border-color ${motion.color}, background ${motion.color}`,
        width: '100%',
      }}
    >
      <div
        style={{
          height: 66,
          borderRadius: radius.control,
          overflow: 'hidden',
          display: 'flex',
          background: c.surfaceChrome,
          border: `1px solid ${c.line}`,
        }}
      >
        <div style={{ width: 12, borderRight: `1px solid ${c.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, border: `1px solid ${c.accent}` }} />
          <span style={{ width: 6, height: 1, background: c.line }} />
          <span style={{ width: 7, height: 7, borderRadius: 2, border: `1px solid ${c.textFaint}` }} />
        </div>
        <div style={{ flex: 1, background: c.surfaceEditor, padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ width: '62%', height: 2, background: c.synCommand }} />
          <span style={{ width: '80%', height: 2, background: c.text, opacity: 0.55 }} />
          <span style={{ width: '45%', height: 2, background: c.synEnv }} />
          <span style={{ width: '70%', height: 2, background: c.synArg }} />
          <span style={{ width: '35%', height: 2, background: c.synMacro }} />
        </div>
        <div style={{ width: '34%', background: c.surfaceSunken, padding: 5, borderLeft: `1px solid ${c.line}` }}>
          <div style={{ height: '100%', background: c.paperSheet, border: `1px solid ${c.line}` }} />
        </div>
      </div>
      <span style={{ fontSize: fs.control, color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 500 : 400 }}>
        {scheme.name}
      </span>
    </button>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: radius.control,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: fs.control, fontWeight: 500, color: 'var(--text)' }}>{title}</span>
        {hint && <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * One shortcut, with its chord as the click target: press the button, then
 * press the keys. The chord reads in the platform's own notation, and an
 * unbound action says so rather than showing an empty box.
 */
function ShortcutRow({
  label,
  hint,
  chord,
  recording,
  onRecord,
}: {
  label: string;
  hint?: string;
  chord: string;
  recording: boolean;
  onRecord: () => void;
}) {
  const unbound = !chord;
  return (
    <Row title={label} hint={hint}>
      <button
        onClick={onRecord}
        title={recording ? 'Press the keys to bind' : 'Click, then press the keys to bind'}
        style={{
          minWidth: 128,
          padding: '5px 10px',
          fontFamily: font.mono,
          fontSize: fs.control,
          border: `1px solid ${recording ? 'var(--accent)' : 'var(--line)'}`,
          borderRadius: radius.chip,
          background: recording ? 'var(--accent-wash)' : 'transparent',
          color: recording ? 'var(--accent)' : unbound ? 'var(--text-faint)' : 'var(--text)',
          cursor: 'pointer',
          transition: `border-color ${motion.color}, color ${motion.color}, background ${motion.color}`,
        }}
        onMouseEnter={(e) => {
          if (!recording) e.currentTarget.style.borderColor = 'var(--line-strong)';
        }}
        onMouseLeave={(e) => {
          if (!recording) e.currentTarget.style.borderColor = 'var(--line)';
        }}
      >
        {recording ? 'Press keys…' : formatChord(chord)}
      </button>
    </Row>
  );
}

const FONT_OPTIONS = [
  { value: "'Source Code Pro', monospace", label: 'Source Code Pro' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: "'Cascadia Code', monospace", label: 'Cascadia Code' },
  { value: "'IBM Plex Mono', monospace", label: 'IBM Plex Mono' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'monospace', label: 'System Monospace' },
];

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
  const invertPdfInDark = useEditorStore((s) => s.invertPdfInDark);
  const toggleInvertPdfInDark = useEditorStore((s) => s.toggleInvertPdfInDark);
  const keybindings = useEditorStore((s) => s.keybindings);
  const setKeybinding = useEditorStore((s) => s.setKeybinding);
  const resetKeybindings = useEditorStore((s) => s.resetKeybindings);

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
    if (!next) return;
    // Preview the time-of-day scheme without persisting yet.
    const hour = new Date().getHours();
    const id =
      hour >= autoSwitch.dayStartHour && hour < autoSwitch.nightStartHour
        ? autoSwitch.lightSchemeId
        : autoSwitch.darkSchemeId;
    setSelectedScheme(id);
    applyColorScheme(getSchemeById(id));
  };

  const handleSave = () => {
    if (previewAutoOn) {
      setAutoSwitch({ ...autoSwitch, enabled: true });
    } else {
      if (autoSwitch.enabled) setAutoSwitch({ ...autoSwitch, enabled: false });
      setColorScheme(selectedScheme);
    }
    onClose();
  };

  const handleCancel = () => {
    applyColorScheme(getSchemeById(initialSchemeRef.current));
    setPreviewAutoOn(initialAutoRef.current.enabled);
    onClose();
  };

  // Recording a shortcut: the row waiting for keys, and why the last press was
  // turned down. Only one row records at a time.
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const recordingRef = useRef<ShortcutAction | null>(null);
  recordingRef.current = recording;

  /**
   * While recording, this listener takes the whole keyboard: it stops the press
   * before it reaches the shortcut dispatcher, so binding Mod+Shift+F does not
   * also open the Files panel behind the modal.
   */
  useEffect(() => {
    if (!recording) return;
    suspendShortcuts(true);
    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecording(null);
        setRejected(null);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setKeybinding(recording, '');
        setRecording(null);
        setRejected(null);
        return;
      }

      const chord = chordFromEvent(e);
      if (!chord) return; // a modifier on its own — keep waiting for the key
      if (!isBindableChord(chord)) {
        setRejected('Needs Ctrl or Alt — a bare key is something you type.');
        return;
      }
      setKeybinding(recording, chord);
      setRecording(null);
      setRejected(null);
    };
    window.addEventListener('keydown', handleKey, true);
    return () => {
      suspendShortcuts(false);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [recording, setKeybinding]);

  // Escape closes; bound in capture so it wins over the app-level handler that
  // would otherwise also fire on the same key. While a row is recording, Escape
  // belongs to the recorder — it cancels the binding, not the dialog.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (recordingRef.current) return;
      e.stopPropagation();
      handleCancel();
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          width: 'min(520px, 92vw)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--line-strong)',
          borderRadius: radius.card,
          background: 'var(--surface-paper)',
          boxShadow: 'var(--shadow-popover)',
          overflow: 'hidden',
          animation: 'popover-in 160ms ease-out',
        }}
      >
        <div
          style={{
            height: metrics.header,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: `0 ${metrics.padPane}px`,
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span style={{ fontSize: fs.pageTitle, fontWeight: 600, color: 'var(--text)' }}>Settings</span>
          <span style={{ marginLeft: 'auto' }}>
            <IconButton icon={<CloseIcon size={14} />} title="Close" onClick={handleCancel} />
          </span>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: metrics.padPage,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>Appearance</SectionLabel>
            <Row title="Auto switch" hint="Light by day, dark by night">
              <Toggle on={previewAutoOn} onClick={handleAutoToggle} ariaLabel="Auto theme switching" />
            </Row>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
                opacity: previewAutoOn ? 0.55 : 1,
                pointerEvents: previewAutoOn ? 'none' : 'auto',
                transition: `opacity ${motion.color}`,
              }}
            >
              {COLOR_SCHEMES.map((scheme) => (
                <SchemeCard
                  key={scheme.id}
                  scheme={scheme}
                  active={selectedScheme === scheme.id}
                  onClick={() => handleSchemeClick(scheme.id)}
                />
              ))}
            </div>
            <Row
              title="Invert PDF in dark mode"
              hint="Off — the page stays a dimmed paper sheet, as it prints"
            >
              <Toggle on={invertPdfInDark} onClick={toggleInvertPdfInDark} ariaLabel="Invert PDF in dark mode" />
            </Row>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>Editor</SectionLabel>
            <Row title="Font">
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                style={{
                  fontSize: fs.control,
                  padding: '5px 8px',
                  borderRadius: radius.chip,
                  border: '1px solid var(--line)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontFamily: font.mono,
                  cursor: 'pointer',
                }}
              >
                {FONT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
            <Row title="Font size">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconButton icon={<MinusIcon size={12} />} title="Smaller" size={24} onClick={() => setFontSize(fontSize - 0.5)} />
                <span style={{ fontFamily: font.mono, fontSize: fs.control, color: 'var(--text)', minWidth: 34, textAlign: 'center' }}>
                  {fontSize}
                </span>
                <IconButton icon={<PlusIcon size={12} />} title="Larger" size={24} onClick={() => setFontSize(fontSize + 0.5)} />
              </span>
            </Row>
            <Row title="Line numbers">
              <Toggle on={showLineNumbers} onClick={toggleShowLineNumbers} ariaLabel="Show line numbers" />
            </Row>
            <Row title="Line wrap">
              <Toggle on={lineWrap} onClick={toggleLineWrap} ariaLabel="Wrap long lines" />
            </Row>
            <Row title="Vim mode" hint="Modal editing keybindings">
              <Toggle on={vimMode} onClick={toggleVimMode} ariaLabel="Vim mode" />
            </Row>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>Compilation</SectionLabel>
            <Row
              title="Auto recompile"
              hint="Compile and render as you type. Off — use the Compile/Render button."
            >
              <Toggle on={autoRecompile} onClick={toggleAutoRecompile} ariaLabel="Auto recompile on edit" />
            </Row>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SectionLabel>Shortcuts</SectionLabel>
              <span style={{ marginLeft: 'auto' }}>
                <OutlinedButton
                  onClick={() => {
                    setRecording(null);
                    setRejected(null);
                    resetKeybindings();
                  }}
                  title="Put every shortcut back to its default chord"
                >
                  Reset
                </OutlinedButton>
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: fs.meta,
                color: rejected ? 'var(--warn)' : 'var(--text-faint)',
                lineHeight: 1.5,
              }}
            >
              {rejected ??
                'Click a chord, then press the keys. Backspace unbinds it, Escape cancels. Taking a chord that is already in use frees it from the other action.'}
            </p>
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: fs.meta, color: 'var(--text-faint)', paddingLeft: 2 }}>{group}</span>
                {SHORTCUT_META.filter((m) => m.group === group).map((m) => (
                  <ShortcutRow
                    key={m.action}
                    label={m.label}
                    hint={m.hint}
                    chord={keybindings[m.action]}
                    recording={recording === m.action}
                    onRecord={() => {
                      setRejected(null);
                      setRecording((current) => (current === m.action ? null : m.action));
                    }}
                  />
                ))}
              </div>
            ))}
          </section>
        </div>

        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `10px ${metrics.padPane}px`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <OutlinedButton onClick={handleCancel}>Cancel</OutlinedButton>
          <OutlinedButton accent onClick={handleSave}>Save</OutlinedButton>
        </div>
      </div>
    </div>
  );
}
