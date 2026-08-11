/**
 * Colour schemes.
 *
 * Two schemes, matching the resolved design handoff: "Parchment" (light) and
 * "Graphite" (dark). Theme switching is a **pure token swap** — no layout,
 * weight, radius, or border-width changes between them, so every component
 * reads colour through these variables and never branches on `type`.
 *
 * `applyColorScheme` publishes each colour twice: under the handoff's token
 * name (`--surface-chrome`, `--line`, `--text-faint`, …) and under the legacy
 * name it replaced (`--bg-panel`, `--border`, `--text-dim`, …). The legacy
 * aliases are still consumed by the bundled LaTeXML theme CSS in
 * `server/src/assets/latexml/monolith-latexml.css`, which is forwarded into the
 * HTML preview iframe — keep them in sync if that file changes.
 */

export interface ColorScheme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: {
    // Surfaces
    surfaceEditor: string;
    surfacePaper: string;
    surfaceChrome: string;
    surfaceSunken: string;
    /** The rendered document sheet. Stays light in dark mode — it is paper. */
    paperSheet: string;
    paperInk: string;

    // Lines
    line: string;
    lineStrong: string;
    lineFaint: string;

    // Text
    text: string;
    textMuted: string;
    textFaint: string;
    textDisabled: string;

    // Accent
    accent: string;
    accentHover: string;
    accentWash: string;
    accentWashStrong: string;

    // Semantic
    error: string;
    warn: string;
    ok: string;

    // Editor syntax
    synCommand: string;
    synEnv: string;
    synArg: string;
    synRef: string;
    synNumber: string;
    synMacro: string;

    // Elevation
    shadowPopover: string;
    shadowPaper: string;
    shadowCard: string;
  };
}

const parchment: ColorScheme = {
  id: 'parchment',
  name: 'Parchment',
  type: 'light',
  colors: {
    surfaceEditor: '#ffffff',
    surfacePaper: '#fffef9',
    surfaceChrome: '#faf8f4',
    surfaceSunken: '#f3f0ea',
    paperSheet: '#fffef9',
    paperInk: '#2c2820',

    line: '#e2ddd3',
    lineStrong: '#cdc6b8',
    lineFaint: '#f0ece4',

    text: '#2c2820',
    textMuted: '#6b6358',
    textFaint: '#9e9588',
    textDisabled: '#cdc6b8',

    accent: '#8b5e3c',
    accentHover: '#b07d56',
    accentWash: 'rgba(139, 94, 60, 0.05)',
    accentWashStrong: 'rgba(139, 94, 60, 0.07)',

    error: '#b04a4a',
    warn: '#b07830',
    ok: '#4a8c5e',

    synCommand: '#7a5a99',
    synEnv: '#3d8080',
    synArg: '#3d6b8e',
    synRef: '#9e9588',
    synNumber: '#b07830',
    synMacro: '#8b5e3c',

    shadowPopover: '0 8px 24px rgba(45, 40, 30, 0.13)',
    shadowPaper: '0 2px 10px rgba(45, 40, 30, 0.07)',
    shadowCard: '0 1px 3px rgba(0, 0, 0, 0.06)',
  },
};

const graphite: ColorScheme = {
  id: 'graphite',
  name: 'Graphite',
  type: 'dark',
  colors: {
    surfaceEditor: '#0f1013',
    surfacePaper: '#1c1e23',
    surfaceChrome: '#15161a',
    surfaceSunken: '#1c1e23',
    // Real paper, dimmed for a dark room rather than inverted.
    paperSheet: '#e8e6e0',
    paperInk: '#1a1a1a',

    line: '#2b2e35',
    lineStrong: '#3a3f48',
    lineFaint: '#1c1e23',

    text: '#e4e6ea',
    textMuted: '#c2c7cf',
    textFaint: '#8b929c',
    textDisabled: '#4a4f59',

    accent: '#d99a4e',
    accentHover: '#e8b06a',
    accentWash: 'rgba(217, 154, 78, 0.07)',
    accentWashStrong: 'rgba(217, 154, 78, 0.09)',

    error: '#d97b6c',
    warn: '#d99a4e',
    ok: '#5cc08a',

    synCommand: '#c58fd6',
    synEnv: '#61b3a6',
    synArg: '#6fa8d0',
    synRef: '#8b929c',
    synNumber: '#d99a4e',
    synMacro: '#d99a4e',

    shadowPopover: '0 8px 24px rgba(0, 0, 0, 0.45)',
    shadowPaper: '0 2px 10px rgba(0, 0, 0, 0.35)',
    shadowCard: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
};

export const COLOR_SCHEMES: ColorScheme[] = [parchment, graphite];

export const DEFAULT_SCHEME_ID = 'parchment';
export const DEFAULT_LIGHT_SCHEME_ID = 'parchment';
export const DEFAULT_DARK_SCHEME_ID = 'graphite';

const LEGACY_MAP: Record<string, string> = {
  light: DEFAULT_LIGHT_SCHEME_ID,
  'default-light': DEFAULT_LIGHT_SCHEME_ID,
  'solarized-light': DEFAULT_LIGHT_SCHEME_ID,
  'github-light': DEFAULT_LIGHT_SCHEME_ID,
  dark: DEFAULT_DARK_SCHEME_ID,
  'default-dark': DEFAULT_DARK_SCHEME_ID,
  'solarized-dark': DEFAULT_DARK_SCHEME_ID,
  nord: DEFAULT_DARK_SCHEME_ID,
  dracula: DEFAULT_DARK_SCHEME_ID,
  monokai: DEFAULT_DARK_SCHEME_ID,
};

export function coerceSchemeId(id: string | undefined | null, fallback: string = DEFAULT_SCHEME_ID): string {
  if (!id) return fallback;
  const mapped = LEGACY_MAP[id] ?? id;
  return COLOR_SCHEMES.some((s) => s.id === mapped) ? mapped : fallback;
}

type ColorKey = keyof ColorScheme['colors'];

/** Handoff token names. */
const CSS_VAR_MAP: Record<ColorKey, string> = {
  surfaceEditor: '--surface-editor',
  surfacePaper: '--surface-paper',
  surfaceChrome: '--surface-chrome',
  surfaceSunken: '--surface-sunken',
  paperSheet: '--paper-sheet',
  paperInk: '--paper-ink',
  line: '--line',
  lineStrong: '--line-strong',
  lineFaint: '--line-faint',
  text: '--text',
  textMuted: '--text-muted',
  textFaint: '--text-faint',
  textDisabled: '--text-disabled',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentWash: '--accent-wash',
  accentWashStrong: '--accent-wash-strong',
  error: '--error',
  warn: '--warn',
  ok: '--ok',
  synCommand: '--syn-command',
  synEnv: '--syn-env',
  synArg: '--syn-arg',
  synRef: '--syn-ref',
  synNumber: '--syn-number',
  synMacro: '--syn-macro',
  shadowPopover: '--shadow-popover',
  shadowPaper: '--shadow-paper',
  shadowCard: '--shadow-card',
};

/**
 * Pre-revamp variable names, still read by the bundled LaTeXML theme CSS that
 * the HTML preview forwards into its iframe.
 *
 * Note `--paper`: the LaTeXML CSS uses it for *raised cards* inside a themed
 * document (theorem blocks, reference popovers), so it maps to `surfacePaper`
 * and follows the theme. It must not map to `paperSheet` — that is the PDF
 * page, which stays light in dark mode and would put pale text on a pale card.
 */
const LEGACY_VAR_MAP: Partial<Record<ColorKey, string[]>> = {
  surfaceChrome: ['--bg-warm'],
  surfaceEditor: ['--bg-editor'],
  // Inset and raised blocks in the HTML render, distinct from the page behind them.
  surfaceSunken: ['--bg-sidebar', '--bg-hover', '--bg-panel'],
  surfacePaper: ['--paper'],
  line: ['--border', '--bg-active'],
  lineStrong: ['--border-strong'],
  text: ['--text-primary'],
  textMuted: ['--text-secondary'],
  textFaint: ['--text-dim'],
  accentHover: ['--accent-light'],
  accentWash: ['--accent-bg'],
  ok: ['--green'],
  error: ['--red'],
  warn: ['--orange'],
  synArg: ['--blue'],
  synCommand: ['--purple'],
  synEnv: ['--teal'],
};

/** Every variable name this module writes — forwarded into the HTML preview. */
export const THEME_VAR_NAMES: string[] = [
  ...Object.values(CSS_VAR_MAP),
  ...Object.values(LEGACY_VAR_MAP).flat(),
  '--paper-shadow',
];

export function getSchemeById(id: string): ColorScheme {
  return COLOR_SCHEMES.find((s) => s.id === coerceSchemeId(id)) ?? parchment;
}

export function applyColorScheme(scheme: ColorScheme): void {
  const root = document.documentElement;
  root.dataset.theme = scheme.type;
  root.dataset.scheme = scheme.id;
  for (const key of Object.keys(CSS_VAR_MAP) as ColorKey[]) {
    const value = scheme.colors[key];
    root.style.setProperty(CSS_VAR_MAP[key], value);
    for (const legacy of LEGACY_VAR_MAP[key] ?? []) {
      root.style.setProperty(legacy, value);
    }
  }
  // Legacy shadow colour (not a shadow list) used by the old paper styling.
  root.style.setProperty(
    '--paper-shadow',
    scheme.type === 'dark' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(45, 40, 30, 0.07)'
  );
}
