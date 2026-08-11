import type { CSSProperties } from 'react';

/**
 * Line icons.
 *
 * All icons are stroke-only: `fill: none`, `stroke: currentColor`, round caps
 * and joins. The handoff draws rail glyphs at `stroke-width: 1.6` and inline
 * glyphs at 1.8–2.2, so `strokeWidth` defaults to 1.8 and rail icons pass 1.6.
 */

interface IconProps {
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
}

function svg(props: IconProps, children: React.ReactNode, viewBox = '0 0 24 24') {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...props.style }}
    >
      {children}
    </svg>
  );
}

// ── Chevrons and arrows ──

export function ChevronDown(props: IconProps) {
  return svg({ strokeWidth: 2.2, ...props }, <path d="M5 8l7 7 7-7" />);
}

export function ChevronRight(props: IconProps) {
  return svg({ strokeWidth: 2.2, ...props }, <path d="M8 5l7 7-7 7" />);
}

export function ChevronLeft(props: IconProps) {
  return svg({ strokeWidth: 2.2, ...props }, <path d="M16 5l-7 7 7 7" />);
}

export function ChevronUp(props: IconProps) {
  return svg({ strokeWidth: 2.2, ...props }, <path d="M5 16l7-7 7 7" />);
}

export function ArrowUp(props: IconProps) {
  return svg(props, <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>);
}

export function ArrowRight(props: IconProps) {
  return svg({ strokeWidth: 2, ...props }, <path d="M4 12h16M14 6l6 6-6 6" />);
}

// ── Status glyphs ──

export function PlayIcon(props: IconProps) {
  return svg(props, <path d="M7 4l12 8-12 8z" />);
}

export function CloseIcon(props: IconProps) {
  return svg(props, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>);
}

export function ErrorIcon(props: IconProps) {
  return svg(props, <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.01" /></>);
}

export function WarningIcon(props: IconProps) {
  return svg(props, <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>);
}

export function SpinnerIcon(props: IconProps) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        animation: 'spin 1s linear infinite',
        ...props.style,
      }}
    >
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M20 11a8 8 0 1 0-.9 4.6" />
      <path d="M20 5v6h-6" />
    </>
  ));
}

// ── Editing ──

export function EditIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </>
  ));
}

export function DiamondIcon(props: IconProps) {
  return svg(props, <polygon points="12 2 22 12 12 22 2 12" />);
}

export function DotIcon(props: IconProps) {
  return svg(props, <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />);
}

export function PlusIcon(props: IconProps) {
  return svg({ strokeWidth: 2, ...props }, <path d="M12 5v14M5 12h14" />);
}

export function MinusIcon(props: IconProps) {
  return svg({ strokeWidth: 2, ...props }, <path d="M5 12h14" />);
}

export function CopyIcon(props: IconProps) {
  return svg(props, (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ));
}

export function SearchIcon(props: IconProps) {
  return svg(props, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>);
}

export function DownloadIcon(props: IconProps) {
  return svg(props, <path d="M12 3v12M8 11l4 4 4-4M4 20h16" />);
}

export function UploadIcon(props: IconProps) {
  return svg(props, <path d="M12 16V4M8 8l4-4 4 4M4 20h16" />);
}

export function NewFolderIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z" />
      <path d="M12 11v6M9 14h6" />
    </>
  ));
}

export function NewFileIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 12v5M9.5 14.5h5" />
    </>
  ));
}

export function ExternalIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4L11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ));
}

export function QuoteIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M3 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M14 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </>
  ));
}

export function ArchiveIcon(props: IconProps) {
  return svg(props, (
    <>
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </>
  ));
}

export function UnarchiveIcon(props: IconProps) {
  return svg(props, (
    <>
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <polyline points="9 15 12 12 15 15" />
      <line x1="12" y1="12" x2="12" y2="18" />
    </>
  ));
}

export function SunIcon(props: IconProps) {
  return svg(props, (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ));
}

export function MoonIcon(props: IconProps) {
  return svg(props, <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />);
}

// ── Rail tools ──

export function FilesIcon(props: IconProps) {
  return svg(props, (
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z" />
  ));
}

export function OutlineIcon(props: IconProps) {
  return svg(props, <path d="M4 6h16M7 11h13M10 16h10M4 11h.01M7 16h.01" />);
}

export function ScopeIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </>
  ));
}

export function BookIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3z" />
    </>
  ));
}

export function ChartIcon(props: IconProps) {
  return svg(props, <><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></>);
}

export function OmegaIcon(props: IconProps) {
  return svg(props, (
    <path d="M3 20h5.5M15.5 20H21M6.5 20c.6-2 1-4 1-6a5.5 5.5 0 1 1 9 0c0 2 .4 4 1 6" />
  ));
}

export function SnippetIcon(props: IconProps) {
  return svg(props, (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M8 13h8M8 17h5" />
    </>
  ));
}

export function ProjectsIcon(props: IconProps) {
  return svg(props, (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ));
}

export function SettingsIcon(props: IconProps) {
  return svg(props, (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ));
}

export function CodeIcon(props: IconProps) {
  return svg(props, <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>);
}

export function PanelIcon(props: IconProps & { side: 'left' | 'right' | 'both' }) {
  const { side, ...rest } = props;
  return svg(rest, (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {side === 'both' && <line x1="12" y1="3" x2="12" y2="21" />}
      {side === 'left' && <line x1="9" y1="3" x2="9" y2="21" />}
      {side === 'right' && <line x1="15" y1="3" x2="15" y2="21" />}
    </>
  ));
}
