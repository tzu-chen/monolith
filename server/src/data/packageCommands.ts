/**
 * Commands provided by common packages.
 *
 * Used for one thing: telling you when a `\newcommand` in your preamble
 * silently shadows a command a package already defines. That is a real source
 * of "why does this render differently than the paper I copied it from", and it
 * is invisible without a table like this.
 *
 * Deliberately partial — it covers the packages people actually collide with.
 * A command that is not listed simply produces no badge.
 */

const PACKAGE_COMMANDS: Record<string, string[]> = {
  amsmath: [
    'text', 'dfrac', 'tfrac', 'binom', 'boxed', 'substack', 'overset', 'underset',
    'intertext', 'numberwithin', 'operatorname', 'cfrac', 'genfrac', 'smash',
  ],
  amssymb: [
    'mathbb', 'mathfrak', 'square', 'blacksquare', 'lesssim', 'gtrsim',
    'subsetneq', 'varnothing', 'therefore', 'because', 'checkmark',
  ],
  mathtools: [
    'DeclarePairedDelimiter', 'mathclap', 'shortintertext', 'prescript',
    'coloneqq', 'eqqcolon', 'vcentcolon', 'xrightarrow', 'xleftarrow',
  ],
  amsthm: ['newtheorem', 'theoremstyle', 'qedhere', 'swapnumbers'],
  physics: [
    'ket', 'bra', 'braket', 'ketbra', 'dv', 'pdv', 'abs', 'norm', 'Tr', 'tr',
    'grad', 'div', 'curl', 'laplacian', 'eval', 'order', 'commutator',
    'anticommutator', 'qty', 'expval', 'dd', 'differential', 'var',
  ],
  siunitx: ['si', 'SI', 'num', 'qty', 'unit', 'ang', 'numlist', 'numrange'],
  xcolor: ['color', 'textcolor', 'colorbox', 'definecolor', 'pagecolor', 'fcolorbox'],
  graphicx: ['includegraphics', 'scalebox', 'rotatebox', 'resizebox', 'reflectbox', 'graphicspath'],
  hyperref: ['href', 'url', 'hyperref', 'autoref', 'nameref', 'texorpdfstring', 'hypersetup', 'phantomsection'],
  cleveref: ['cref', 'Cref', 'crefname', 'Crefname', 'crefrange', 'namecref'],
  natbib: ['citep', 'citet', 'citealp', 'citealt', 'citeauthor', 'citeyear', 'citeyearpar'],
  biblatex: ['autocite', 'parencite', 'textcite', 'printbibliography', 'addbibresource'],
  booktabs: ['toprule', 'midrule', 'bottomrule', 'cmidrule', 'addlinespace', 'specialrule'],
  enumitem: ['setlist', 'setlistdepth', 'newlist', 'renewlist'],
  caption: ['captionsetup', 'captionof'],
  subcaption: ['subcaptionbox', 'phantomsubcaption'],
  tikz: ['tikz', 'tikzset', 'usetikzlibrary', 'node', 'draw'],
  listings: ['lstset', 'lstinputlisting', 'lstinline'],
  minted: ['mint', 'inputminted', 'mintinline', 'setminted'],
  algorithmicx: ['State', 'If', 'Else', 'EndIf', 'While', 'For', 'Function'],
  url: ['url', 'urlstyle'],
  csquotes: ['enquote', 'blockquote', 'textquote'],
  mhchem: ['ce', 'cee', 'cf'],
  wrapfig: ['wrapfigure'],
  setspace: ['singlespacing', 'doublespacing', 'onehalfspacing', 'setstretch'],
};

/** Reverse index, built once: command name → packages that define it. */
const COMMAND_OWNERS = new Map<string, string[]>();
for (const [pkg, commands] of Object.entries(PACKAGE_COMMANDS)) {
  for (const command of commands) {
    const owners = COMMAND_OWNERS.get(command);
    if (owners) owners.push(pkg);
    else COMMAND_OWNERS.set(command, [pkg]);
  }
}

/**
 * The package `name` would shadow, given the packages actually in scope, or
 * null when it shadows nothing that is loaded.
 */
export function shadowedPackage(name: string, loadedPackages: Set<string>): string | null {
  const owners = COMMAND_OWNERS.get(name);
  if (!owners) return null;
  return owners.find((pkg) => loadedPackages.has(pkg)) ?? null;
}
