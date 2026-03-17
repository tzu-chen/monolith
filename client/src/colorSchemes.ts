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

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'default-light',
    name: 'Default Light',
    type: 'light',
    colors: {
      bgWarm: '#faf8f4',
      bgPanel: '#f3f0ea',
      bgEditor: '#ffffff',
      bgSidebar: '#f6f4ef',
      bgHover: '#eeeae2',
      bgActive: '#e8e3d9',
      border: '#e2ddd3',
      borderStrong: '#cdc6b8',
      textPrimary: '#2c2820',
      textSecondary: '#6b6358',
      textDim: '#9e9588',
      accent: '#8b5e3c',
      accentLight: '#b07d56',
      accentBg: 'rgba(139, 94, 60, 0.06)',
      green: '#4a8c5e',
      blue: '#3d6b8e',
      red: '#b04a4a',
      purple: '#7a5a99',
      orange: '#b07830',
      teal: '#3d8080',
      paper: '#fffef9',
      paperShadow: 'rgba(45, 40, 30, 0.08)',
    },
  },
  {
    id: 'default-dark',
    name: 'Default Dark',
    type: 'dark',
    colors: {
      bgWarm: '#12121c',
      bgPanel: '#0d0d14',
      bgEditor: '#1a1a26',
      bgSidebar: '#10101a',
      bgHover: '#1e1e2e',
      bgActive: '#252538',
      border: '#2a2a3e',
      borderStrong: '#3a3a52',
      textPrimary: '#c8c8d8',
      textSecondary: '#6a6a88',
      textDim: '#44445a',
      accent: '#7c6ff0',
      accentLight: '#9a8ff5',
      accentBg: 'rgba(124, 111, 240, 0.08)',
      green: '#5ccf8a',
      blue: '#5cc8cf',
      red: '#e06060',
      purple: '#b088e0',
      orange: '#e8a855',
      teal: '#5cc8cf',
      paper: '#1a1a26',
      paperShadow: 'rgba(0, 0, 0, 0.3)',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    type: 'light',
    colors: {
      bgWarm: '#fdf6e3',
      bgPanel: '#eee8d5',
      bgEditor: '#fdf6e3',
      bgSidebar: '#f5efdc',
      bgHover: '#e8e1cc',
      bgActive: '#ddd6c1',
      border: '#d3cbb7',
      borderStrong: '#c9bea5',
      textPrimary: '#586e75',
      textSecondary: '#657b83',
      textDim: '#93a1a1',
      accent: '#268bd2',
      accentLight: '#4a9fdc',
      accentBg: 'rgba(38, 139, 210, 0.08)',
      green: '#859900',
      blue: '#268bd2',
      red: '#dc322f',
      purple: '#6c71c4',
      orange: '#cb4b16',
      teal: '#2aa198',
      paper: '#fdf6e3',
      paperShadow: 'rgba(88, 110, 117, 0.08)',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    type: 'dark',
    colors: {
      bgWarm: '#002b36',
      bgPanel: '#001e26',
      bgEditor: '#073642',
      bgSidebar: '#002029',
      bgHover: '#0a4050',
      bgActive: '#0d4f60',
      border: '#1a5c6b',
      borderStrong: '#2a6d7a',
      textPrimary: '#839496',
      textSecondary: '#657b83',
      textDim: '#4e6266',
      accent: '#268bd2',
      accentLight: '#4a9fdc',
      accentBg: 'rgba(38, 139, 210, 0.1)',
      green: '#859900',
      blue: '#268bd2',
      red: '#dc322f',
      purple: '#6c71c4',
      orange: '#cb4b16',
      teal: '#2aa198',
      paper: '#073642',
      paperShadow: 'rgba(0, 0, 0, 0.3)',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    type: 'dark',
    colors: {
      bgWarm: '#2e3440',
      bgPanel: '#272c36',
      bgEditor: '#3b4252',
      bgSidebar: '#2a2f3b',
      bgHover: '#434c5e',
      bgActive: '#4c566a',
      border: '#3e4555',
      borderStrong: '#4c566a',
      textPrimary: '#d8dee9',
      textSecondary: '#a0aab8',
      textDim: '#616e82',
      accent: '#88c0d0',
      accentLight: '#8fbcbb',
      accentBg: 'rgba(136, 192, 208, 0.1)',
      green: '#a3be8c',
      blue: '#81a1c1',
      red: '#bf616a',
      purple: '#b48ead',
      orange: '#d08770',
      teal: '#8fbcbb',
      paper: '#3b4252',
      paperShadow: 'rgba(0, 0, 0, 0.25)',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    type: 'dark',
    colors: {
      bgWarm: '#282a36',
      bgPanel: '#21222c',
      bgEditor: '#282a36',
      bgSidebar: '#232530',
      bgHover: '#343746',
      bgActive: '#3e4154',
      border: '#3a3d4e',
      borderStrong: '#4d5066',
      textPrimary: '#f8f8f2',
      textSecondary: '#bfbfb6',
      textDim: '#6272a4',
      accent: '#bd93f9',
      accentLight: '#caa6fc',
      accentBg: 'rgba(189, 147, 249, 0.1)',
      green: '#50fa7b',
      blue: '#8be9fd',
      red: '#ff5555',
      purple: '#bd93f9',
      orange: '#ffb86c',
      teal: '#8be9fd',
      paper: '#282a36',
      paperShadow: 'rgba(0, 0, 0, 0.3)',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    type: 'light',
    colors: {
      bgWarm: '#ffffff',
      bgPanel: '#f6f8fa',
      bgEditor: '#ffffff',
      bgSidebar: '#f6f8fa',
      bgHover: '#eef1f4',
      bgActive: '#e4e8ec',
      border: '#d1d9e0',
      borderStrong: '#b8c1cc',
      textPrimary: '#1f2328',
      textSecondary: '#59636e',
      textDim: '#8b949e',
      accent: '#0969da',
      accentLight: '#368cf9',
      accentBg: 'rgba(9, 105, 218, 0.06)',
      green: '#1a7f37',
      blue: '#0969da',
      red: '#cf222e',
      purple: '#8250df',
      orange: '#bc4c00',
      teal: '#0e7c86',
      paper: '#ffffff',
      paperShadow: 'rgba(31, 35, 40, 0.06)',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    type: 'dark',
    colors: {
      bgWarm: '#272822',
      bgPanel: '#1e1f1a',
      bgEditor: '#272822',
      bgSidebar: '#222318',
      bgHover: '#3e3d32',
      bgActive: '#49483e',
      border: '#3b3a32',
      borderStrong: '#525046',
      textPrimary: '#f8f8f2',
      textSecondary: '#c0bfab',
      textDim: '#75715e',
      accent: '#a6e22e',
      accentLight: '#b8f040',
      accentBg: 'rgba(166, 226, 46, 0.08)',
      green: '#a6e22e',
      blue: '#66d9ef',
      red: '#f92672',
      purple: '#ae81ff',
      orange: '#fd971f',
      teal: '#66d9ef',
      paper: '#272822',
      paperShadow: 'rgba(0, 0, 0, 0.3)',
    },
  },
];

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
  return COLOR_SCHEMES.find((s) => s.id === id) ?? COLOR_SCHEMES[0];
}

export function applyColorScheme(scheme: ColorScheme): void {
  const root = document.documentElement;
  root.dataset.theme = scheme.type;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    root.style.setProperty(cssVar, scheme.colors[key as keyof ColorScheme['colors']]);
  }
}
