/**
 * Design tokens for the Monolith shell.
 *
 * Sizes come from the resolved design handoff, shifted by `UI_SCALE` px. The
 * handoff specifies a 10.5–15px UI type scale; this app runs +5px on top of it
 * (a deliberate choice made in f5200f3), so every spec value is written here as
 * `spec + UI_SCALE` and the design's *relative* hierarchy is what carries over.
 * Bar heights and panel widths are scaled alongside so the leading and gutter
 * space around the larger text stay in the spec's proportion.
 *
 * Colours live in `colorSchemes.ts` and are consumed as CSS variables; this
 * module holds only the geometry and type scale, which inline styles need as
 * numbers.
 */

/** Type scale. Comments give the handoff's original value, before the +5px. */
export const fs = {
  /** 10.5 — uppercase section labels (with `labelStyle`) */
  label: 15.5,
  /** 11 — status bars, metadata, badges */
  meta: 16,
  /** 11.5 — secondary controls, panel metadata */
  control: 16.5,
  /** 12 — toolbar controls, tree rows */
  toolbar: 17,
  /** 12.5 — list rows, body controls, editor */
  row: 17.5,
  /** 13 — file and reference titles */
  title: 18,
  /** 15 — page/view titles */
  pageTitle: 20,
} as const;

/** Uppercase section-label treatment (10.5px 600 / .09em in the handoff). */
export const labelStyle = {
  fontSize: fs.label,
  fontWeight: 600,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
} as const;

export const font = {
  ui: "'DM Sans', system-ui, sans-serif",
  mono: "'Source Code Pro', monospace",
  serif: "Georgia, 'Times New Roman', serif",
} as const;

/** Geometry. Comments give the handoff's original value. */
export const metrics = {
  /** rail 52 */
  rail: 60,
  /** icon button 34 */
  railBtn: 40,
  /** rail glyph 18 */
  railGlyph: 20,
  /** panel / top header 44 */
  header: 50,
  /** tab bar and preview toolbar 34 */
  bar: 40,
  /** scope strip ~30 */
  strip: 36,
  /** status bar 26 */
  status: 32,
  /** editor gutter 44–52 */
  gutter: 58,

  /** panel widths: 238 / 210 / 296 / 264 / 250 / 430 */
  panelFiles: 268,
  panelOutline: 240,
  panelScope: 330,
  panelProjects: 296,
  /** 1f's plot list */
  panelPlots: 290,
  /** 1c's .bib list */
  panelReferences: 470,

  /** Detail columns beside a manager list — 1c's entry editor, 1f's preview. */
  detailReference: 460,
  detailPlot: 560,

  /** bottom symbol/snippet drawer */
  drawer: 288,

  /** padding: 12 panel / 14 pane / 18 page */
  padPanel: 12,
  padPane: 14,
  padPage: 18,
} as const;

/** 5 chip · 6 control · 7–8 card · 20 pill */
export const radius = {
  chip: 5,
  control: 6,
  card: 8,
  pill: 20,
} as const;

/** Transitions: 120ms for colour/border, 160ms ease-out for panels/popovers. */
export const motion = {
  color: '120ms ease',
  panel: '160ms ease-out',
} as const;

