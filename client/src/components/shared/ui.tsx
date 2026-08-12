import type { CSSProperties, ReactNode } from 'react';
import { SearchIcon } from './Icons';
import { fs, font, metrics, radius, motion, labelStyle } from '../../theme/tokens';

/**
 * Shared chrome for the shell.
 *
 * Every element here follows the handoff's one structural rule: shape is
 * carried by 1px borders, hairline dividers, and a 2px accent edge on the
 * active item. Nothing gains a solid fill — not on hover, not when selected.
 * Selection is `--accent-wash` behind a 2px `--accent` edge; hover steps the
 * border `--line` → `--line-strong` and the text `--text-muted` → `--text`.
 */

// ── Labels ──

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ ...labelStyle, ...style }}>{children}</span>;
}

// ── Bars ──

interface BarProps {
  children: ReactNode;
  height: number;
  /** Which edge carries the hairline. */
  divider?: 'top' | 'bottom' | 'none';
  padding?: number;
  gap?: number;
  style?: CSSProperties;
}

/** A single-line bar. Bars never wrap or reflow. */
export function Bar({ children, height, divider = 'bottom', padding = metrics.padPanel, gap = 8, style }: BarProps) {
  return (
    <div
      style={{
        height,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap,
        padding: `0 ${padding}px`,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        borderBottom: divider === 'bottom' ? '1px solid var(--line)' : undefined,
        borderTop: divider === 'top' ? '1px solid var(--line)' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Bar height={metrics.header}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
        {children}
      </div>
    </Bar>
  );
}

/** Vertical hairline separating groups inside a bar. */
export function BarDivider() {
  return <span style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0, margin: '0 2px' }} />;
}

// ── Buttons ──

interface ButtonProps {
  children?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  title?: string;
  accent?: boolean;
  danger?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

function toneColors(accent?: boolean, danger?: boolean) {
  if (danger) return { border: 'var(--error)', text: 'var(--error)', hoverBorder: 'var(--error)', hoverText: 'var(--error)' };
  if (accent) return { border: 'var(--accent)', text: 'var(--accent)', hoverBorder: 'var(--accent-hover)', hoverText: 'var(--accent-hover)' };
  return { border: 'var(--line)', text: 'var(--text-muted)', hoverBorder: 'var(--line-strong)', hoverText: 'var(--text)' };
}

/** 1px-outlined control. Hover moves the border and text, never a fill. */
export function OutlinedButton({ children, icon, onClick, title, accent, danger, disabled, style }: ButtonProps) {
  const tone = toneColors(accent, danger);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        border: `1px solid ${tone.border}`,
        borderRadius: radius.chip,
        background: 'transparent',
        color: tone.text,
        fontFamily: font.ui,
        fontSize: fs.control,
        fontWeight: accent ? 500 : 400,
        padding: '4px 11px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        transition: `color ${motion.color}, border-color ${motion.color}`,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = tone.hoverBorder;
        e.currentTarget.style.color = tone.hoverText;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tone.border;
        e.currentTarget.style.color = tone.text;
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/** Square outlined icon button — the 22×22 "+" in a panel header, and kin. */
export function IconButton({
  icon,
  onClick,
  title,
  size = 26,
  accent,
  active,
  bare,
}: {
  icon: ReactNode;
  onClick?: () => void;
  title?: string;
  size?: number;
  accent?: boolean;
  active?: boolean;
  /** Drop the border — for dense inline affordances like a tab's close glyph. */
  bare?: boolean;
}) {
  const on = accent || active;
  const border = bare ? 'transparent' : on ? 'var(--accent)' : 'var(--line)';
  const color = on ? 'var(--accent)' : 'var(--text-faint)';
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${border}`,
        borderRadius: radius.chip,
        background: 'transparent',
        color,
        flexShrink: 0,
        cursor: 'pointer',
        transition: `color ${motion.color}, border-color ${motion.color}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = on ? 'var(--accent-hover)' : 'var(--text)';
        if (!bare) e.currentTarget.style.borderColor = on ? 'var(--accent-hover)' : 'var(--line-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = color;
        if (!bare) e.currentTarget.style.borderColor = border;
      }}
    >
      {icon}
    </button>
  );
}

/** Pill / filter chip, `border-radius: 20`. */
export function Pill({
  children,
  active,
  onClick,
  mono = true,
  tone,
  title,
  icon,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  mono?: boolean;
  tone?: 'accent' | 'warn' | 'error' | 'ok';
  title?: string;
  icon?: ReactNode;
}) {
  const toneColor =
    tone === 'warn' ? 'var(--warn)' :
    tone === 'error' ? 'var(--error)' :
    tone === 'ok' ? 'var(--ok)' :
    tone === 'accent' || active ? 'var(--accent)' :
    null;
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${toneColor ?? 'var(--line)'}`,
        borderRadius: radius.pill,
        padding: '2px 10px',
        fontFamily: mono ? font.mono : font.ui,
        fontSize: fs.meta,
        color: toneColor ?? 'var(--text-muted)',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: `color ${motion.color}, border-color ${motion.color}`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

/** Small outlined badge sitting inside a list row. */
export function Badge({
  children,
  tone,
  mono,
}: {
  children: ReactNode;
  tone?: 'accent' | 'warn' | 'error' | 'ok' | 'neutral';
  mono?: boolean;
}) {
  const color =
    tone === 'accent' ? 'var(--accent)' :
    tone === 'warn' ? 'var(--warn)' :
    tone === 'error' ? 'var(--error)' :
    tone === 'ok' ? 'var(--ok)' :
    'var(--text-faint)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: `1px solid ${color}`,
        borderRadius: radius.chip,
        padding: '1px 7px',
        fontSize: fs.meta,
        fontFamily: mono ? font.mono : font.ui,
        color,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/** 6px status dot. Outlined by default; filled marks the live/selected state. */
export function Dot({ color = 'var(--text-faint)', filled }: { color?: string; filled?: boolean }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        border: `1px solid ${color}`,
        background: filled ? color : 'transparent',
        flexShrink: 0,
      }}
    />
  );
}

// ── Inputs ──

export function FilterInput({
  value,
  onChange,
  placeholder,
  hint,
  autoFocus,
  onKeyDown,
  strong,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Right-aligned shortcut hint, e.g. `Ctrl+P`. Format it with `formatChord()`. */
  hint?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Use the emphasised border reserved for primary inputs. */
  strong?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        border: `1px solid ${strong ? 'var(--line-strong)' : 'var(--line)'}`,
        borderRadius: radius.control,
        padding: '5px 9px',
        color: 'var(--text-faint)',
        minWidth: 0,
        flex: 1,
      }}
    >
      <SearchIcon size={14} />
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          outline: 'none',
          color: 'var(--text)',
          fontFamily: font.ui,
          fontSize: fs.control,
          padding: 0,
        }}
      />
      {hint && (
        <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-disabled)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Checkbox drawn as an outlined square with an accent check — a native input
 * would paint a solid fill, which nothing in this design does.
 */
export function Checkbox({
  checked,
  onChange,
  title,
  size = 17,
}: {
  checked: boolean;
  onChange: () => void;
  title?: string;
  size?: number;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onChange();
        }
      }}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--line-strong)'}`,
        borderRadius: 3,
        color: 'var(--accent)',
        cursor: 'pointer',
        transition: `border-color ${motion.color}`,
      }}
    >
      {checked && (
        <svg width={size - 6} height={size - 6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l5 5 9-11" />
        </svg>
      )}
    </span>
  );
}

/** Panel row that hosts a filter input plus optional trailing controls. */
export function FilterRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: `9px ${metrics.padPanel - 2}px`,
        borderBottom: '1px solid var(--line)',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

// ── List rows ──

/**
 * Selection is a 2px accent left edge plus a wash — never a fill. Unselected
 * rows keep a transparent 2px edge so nothing shifts when selection moves.
 */
export function rowStyle(active: boolean, extra?: CSSProperties): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    background: active ? 'var(--accent-wash)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: `background ${motion.color}, color ${motion.color}`,
    ...extra,
  };
}

export function hoverRow(e: React.MouseEvent<HTMLElement>, active: boolean) {
  if (!active) e.currentTarget.style.background = 'var(--accent-wash)';
}

export function leaveRow(e: React.MouseEvent<HTMLElement>, active: boolean) {
  if (!active) e.currentTarget.style.background = 'transparent';
}

// ── Panel scaffolding ──

/** Scrollable body of a panel. */
export function PanelBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ flex: 1, overflow: 'auto', minHeight: 0, ...style }}>{children}</div>;
}

/** Centred placeholder for empty / unavailable / loading panel states. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      style={{
        padding: '32px 20px',
        textAlign: 'center',
        color: 'var(--text-faint)',
        fontSize: fs.control,
        lineHeight: 1.6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}
