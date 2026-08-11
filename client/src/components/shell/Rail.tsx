import type { ReactNode } from 'react';
import { useEditorStore, type SidePanel, type Drawer } from '../../stores/editorStore';
import { fs, font, metrics, motion, radius } from '../../theme/tokens';
import {
  FilesIcon,
  OutlineIcon,
  ScopeIcon,
  BookIcon,
  ChartIcon,
  OmegaIcon,
  SnippetIcon,
  SettingsIcon,
} from '../shared/Icons';

/**
 * The icon rail.
 *
 * Three levels, top to bottom: the project monogram (which project), a hairline
 * divider, then the tools within that project. The divider is load-bearing —
 * it is what stops the project control from reading as a filter over the tools
 * below it. Settings is pinned to the bottom.
 *
 * Active = 1px accent border + accent glyph. Inactive = no border at all, faint
 * glyph. Nothing here ever gains a fill.
 */

const TOOLS: { panel: SidePanel; icon: ReactNode; title: string }[] = [
  { panel: 'files', icon: <FilesIcon size={metrics.railGlyph} strokeWidth={1.6} />, title: 'Files' },
  { panel: 'outline', icon: <OutlineIcon size={metrics.railGlyph} strokeWidth={1.6} />, title: 'Outline' },
  { panel: 'scope', icon: <ScopeIcon size={metrics.railGlyph} strokeWidth={1.6} />, title: 'In scope' },
  { panel: 'references', icon: <BookIcon size={metrics.railGlyph} strokeWidth={1.6} />, title: 'References' },
  { panel: 'plots', icon: <ChartIcon size={metrics.railGlyph} strokeWidth={1.6} />, title: 'Plots' },
];

const DRAWERS: { drawer: Drawer; icon: ReactNode; title: string }[] = [
  { drawer: 'symbols', icon: <OmegaIcon size={metrics.railGlyph} strokeWidth={1.6} />, title: 'Symbols' },
  { drawer: 'snippets', icon: <SnippetIcon size={metrics.railGlyph} strokeWidth={1.6} />, title: 'Snippets' },
];

/** Two letters from the project name: `hofstadter-2026` → `HF`. */
export function monogram(name: string | null): string {
  if (!name) return '··';
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const letters = name.replace(/[^a-zA-Z0-9]/g, '');
  return (letters.slice(0, 2) || '··').toUpperCase();
}

function RailButton({
  icon,
  active,
  onClick,
  title,
  style,
}: {
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        width: metrics.railBtn,
        height: metrics.railBtn,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.card,
        border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
        background: 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-faint)',
        flexShrink: 0,
        cursor: 'pointer',
        transition: `color ${motion.color}, border-color ${motion.color}`,
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = active ? 'var(--accent-hover)' : 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = active ? 'var(--accent)' : 'var(--text-faint)';
      }}
    >
      {icon}
    </button>
  );
}

export default function Rail() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const activePanel = useEditorStore((s) => s.activePanel);
  const activeDrawer = useEditorStore((s) => s.activeDrawer);
  const toggleActivePanel = useEditorStore((s) => s.toggleActivePanel);
  const toggleDrawer = useEditorStore((s) => s.toggleDrawer);
  const setShowSettings = useEditorStore((s) => s.setShowSettings);

  const projectsOpen = activePanel === 'projects';

  return (
    <nav
      style={{
        width: metrics.rail,
        flexShrink: 0,
        borderRight: '1px solid var(--line)',
        background: 'var(--surface-chrome)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 0',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => toggleActivePanel('projects')}
        title={`${currentProject ?? 'No project'} — switch project`}
        aria-label="Switch project"
        style={{
          width: metrics.railBtn,
          height: metrics.railBtn,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${projectsOpen ? 'var(--accent-hover)' : 'var(--accent)'}`,
          borderRadius: radius.card,
          background: projectsOpen ? 'var(--accent-wash)' : 'transparent',
          color: 'var(--accent)',
          fontFamily: font.mono,
          fontSize: fs.control,
          fontWeight: 600,
          flexShrink: 0,
          cursor: 'pointer',
          transition: `border-color ${motion.color}, background ${motion.color}`,
        }}
      >
        {monogram(currentProject)}
      </button>

      {/* Separates "which project" from "tools within the project". */}
      <span style={{ width: 26, height: 1, background: 'var(--line)', margin: '5px 0', flexShrink: 0 }} />

      {TOOLS.map((t) => (
        <RailButton
          key={t.panel}
          icon={t.icon}
          title={t.title}
          active={activePanel === t.panel}
          onClick={() => toggleActivePanel(t.panel)}
        />
      ))}

      {DRAWERS.map((d) => (
        <RailButton
          key={d.drawer}
          icon={d.icon}
          title={d.title}
          active={activeDrawer === d.drawer}
          onClick={() => toggleDrawer(d.drawer)}
        />
      ))}

      <RailButton
        icon={<SettingsIcon size={metrics.railGlyph} strokeWidth={1.6} />}
        title="Settings"
        active={false}
        onClick={() => setShowSettings(true)}
        style={{ marginTop: 'auto' }}
      />
    </nav>
  );
}
