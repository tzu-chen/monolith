import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
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
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...props.style }}
    >
      {children}
    </svg>
  );
}

export function ChevronDown(props: IconProps) {
  return svg(props, <polyline points="6 9 12 15 18 9" />);
}

export function ChevronRight(props: IconProps) {
  return svg(props, <polyline points="9 6 15 12 9 18" />);
}

export function ChevronLeft(props: IconProps) {
  return svg(props, <polyline points="15 6 9 12 15 18" />);
}

export function ChevronUp(props: IconProps) {
  return svg(props, <polyline points="18 15 12 9 6 15" />);
}

export function PlayIcon(props: IconProps) {
  return svg(props, <polygon points="6 3 20 12 6 21" fill="currentColor" stroke="none" />);
}

export function CloseIcon(props: IconProps) {
  return svg(props, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>);
}

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

export function ArrowUp(props: IconProps) {
  return svg(props, <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>);
}

export function ArrowRight(props: IconProps) {
  return svg(props, <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>);
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
      strokeWidth={2}
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

export function SunIcon(props: IconProps) {
  return svg(props, (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </>
  ));
}

export function MoonIcon(props: IconProps) {
  return svg(props, <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />);
}

export function PlusIcon(props: IconProps) {
  return svg(props, <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
}

export function MinusIcon(props: IconProps) {
  return svg(props, <line x1="5" y1="12" x2="19" y2="12" />);
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
