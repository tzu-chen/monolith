export interface ColorScheme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: {
    bgWarm: string;
    bgPanel: string;
    bgEditor: string;
    bgSidebar: string;
    bgHover: string;
    bgActive: string;
    border: string;
    borderStrong: string;
    textPrimary: string;
    textSecondary: string;
    textDim: string;
    accent: string;
    accentLight: string;
    accentBg: string;
    green: string;
    blue: string;
    red: string;
    purple: string;
    orange: string;
    teal: string;
    paper: string;
    paperShadow: string;
  };
}

const light: ColorScheme = {
  id: 'light',
  name: 'Light',
  type: 'light',
  colors: {
    bgWarm: '#ffffff',
    bgPanel: '#f8f9fa',
    bgEditor: '#ffffff',
    bgSidebar: '#f8f9fa',
    bgHover: '#f0f1f3',
    bgActive: '#e9ecef',
    border: '#dee2e6',
    borderStrong: '#ced4da',
    textPrimary: '#212529',
    textSecondary: '#6c757d',
    textDim: '#adb5bd',
    accent: '#4263eb',
    accentLight: '#5878fb',
    accentBg: 'rgba(66, 99, 235, 0.08)',
    green: '#2b8a3e',
    blue: '#4263eb',
    red: '#c92a2a',
    purple: '#862e9c',
    orange: '#e67700',
    teal: '#0c8599',
    paper: '#ffffff',
    paperShadow: 'rgba(0, 0, 0, 0.08)',
  },
};

const dark: ColorScheme = {
  id: 'dark',
  name: 'Dark',
  type: 'dark',
  colors: {
    bgWarm: '#2e3440',
    bgPanel: '#3b4252',
    bgEditor: '#2e3440',
    bgSidebar: '#3b4252',
    bgHover: '#434c5e',
    bgActive: '#4c566a',
    border: '#4c566a',
    borderStrong: '#5e6779',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textDim: '#7b88a1',
    accent: '#88c0d0',
    accentLight: '#8fbcbb',
    accentBg: 'rgba(136, 192, 208, 0.12)',
    green: '#a3be8c',
    blue: '#81a1c1',
    red: '#bf616a',
    purple: '#b48ead',
    orange: '#d08770',
    teal: '#8fbcbb',
    paper: '#3b4252',
    paperShadow: 'rgba(0, 0, 0, 0.4)',
  },
};

export const COLOR_SCHEMES: ColorScheme[] = [light, dark];

export const DEFAULT_SCHEME_ID = 'light';
export const DEFAULT_LIGHT_SCHEME_ID = 'light';
export const DEFAULT_DARK_SCHEME_ID = 'dark';

const LEGACY_MAP: Record<string, string> = {
  'default-light': DEFAULT_LIGHT_SCHEME_ID,
  'solarized-light': DEFAULT_LIGHT_SCHEME_ID,
  'github-light': DEFAULT_LIGHT_SCHEME_ID,
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

const CSS_VAR_MAP: Record<keyof ColorScheme['colors'], string> = {
  bgWarm: '--bg-warm',
  bgPanel: '--bg-panel',
  bgEditor: '--bg-editor',
  bgSidebar: '--bg-sidebar',
  bgHover: '--bg-hover',
  bgActive: '--bg-active',
  border: '--border',
  borderStrong: '--border-strong',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textDim: '--text-dim',
  accent: '--accent',
  accentLight: '--accent-light',
  accentBg: '--accent-bg',
  green: '--green',
  blue: '--blue',
  red: '--red',
  purple: '--purple',
  orange: '--orange',
  teal: '--teal',
  paper: '--paper',
  paperShadow: '--paper-shadow',
};

export function getSchemeById(id: string): ColorScheme {
  return COLOR_SCHEMES.find((s) => s.id === coerceSchemeId(id)) ?? light;
}

export function applyColorScheme(scheme: ColorScheme): void {
  const root = document.documentElement;
  root.dataset.theme = scheme.type;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    root.style.setProperty(cssVar, scheme.colors[key as keyof ColorScheme['colors']]);
  }
}
