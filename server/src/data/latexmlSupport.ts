/**
 * LaTeXML support ratings per package.
 *
 * Transcribed from `latexml-friendly-packages.md` at the repo root — keep the
 * two in step. The In-scope panel badges anything rated `caution`, which is what
 * keeps the dual-output promise honest: a package that looks fine in the PDF
 * but degrades in the HTML render should say so before you build a paper on it.
 */

export type LatexmlSupport = 'good' | 'partial' | 'caution' | 'unknown';

interface Rating {
  support: LatexmlSupport;
  note?: string;
}

const RATINGS: Record<string, Rating> = {
  // Math & theorems
  amsmath: { support: 'good' },
  amssymb: { support: 'good' },
  amsfonts: { support: 'good' },
  mathtools: { support: 'good', note: 'common cases' },
  amsthm: { support: 'good' },
  thmtools: { support: 'partial', note: 'declarations convert; fancy styling is CSS anyway' },
  mleftright: { support: 'good' },
  physics: { support: 'partial', note: 'verify the specific macros you use' },

  // Cross-references & links
  hyperref: { support: 'good' },
  cleveref: { support: 'good' },
  nameref: { support: 'good' },
  url: { support: 'good' },

  // Lists & layout
  enumitem: { support: 'good' },
  geometry: { support: 'good', note: 'ignored harmlessly — irrelevant to HTML' },
  microtype: { support: 'good', note: 'ignored harmlessly' },
  csquotes: { support: 'partial', note: 'basic \\enquote is fine' },
  parskip: { support: 'good', note: 'CSS handles spacing anyway' },

  // Tables
  booktabs: { support: 'good' },
  array: { support: 'good' },
  tabularx: { support: 'good' },
  longtable: { support: 'partial', note: "HTML doesn't paginate; renders as one table" },
  multirow: { support: 'partial' },

  // Graphics
  graphicx: { support: 'good', note: 'raster/SVG copied or converted' },
  xcolor: { support: 'good' },
  subcaption: { support: 'partial' },
  tikz: { support: 'caution', note: 'needs SVG generation; complex pictures fail — precompile fragile diagrams to an image' },
  'tikz-cd': { support: 'caution', note: 'image-based, fragile' },
  pgfplots: { support: 'caution', note: 'treat like TikZ' },
  pgf: { support: 'caution', note: 'treat like TikZ' },

  // Code
  verbatim: { support: 'good' },
  listings: { support: 'partial', note: 'renders as styled verbatim; fancy options vary' },
  minted: { support: 'caution', note: 'needs shell-escape + Pygments — prefer listings, or highlight client-side' },

  // Bibliography
  natbib: { support: 'good' },
  biblatex: { support: 'caution', note: "known weak spot — natbib+BibTeX converts far more reliably" },

  // Science
  siunitx: { support: 'good' },
  mhchem: { support: 'partial', note: 'common \\ce works' },

  // Algorithms
  algorithmicx: { support: 'partial' },
  algorithmic: { support: 'partial' },
  algorithm: { support: 'partial' },
  algorithm2e: { support: 'caution', note: 'heavier, less reliable' },

  // Common enough to be worth answering rather than shrugging at
  inputenc: { support: 'good' },
  fontenc: { support: 'good' },
  babel: { support: 'good' },
  caption: { support: 'partial' },
  float: { support: 'partial' },
  wrapfig: { support: 'partial' },
  tcolorbox: { support: 'caution', note: 'LaTeXML struggles — prefer an amsthm environment styled with CSS' },
  fancyhdr: { support: 'good', note: 'ignored harmlessly — no page furniture in HTML' },
  setspace: { support: 'good', note: 'ignored harmlessly' },
};

export function latexmlSupport(pkg: string): Rating {
  return RATINGS[pkg] ?? { support: 'unknown' };
}
