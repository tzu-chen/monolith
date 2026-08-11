/**
 * Scope graph API.
 *
 * "What packages and macros does this file actually have, including everything
 * it inherits from preamble.tex / macros.sty?" — resolved server-side by
 * walking the transitive \input/\include/\usepackage graph, because answering
 * it needs to read arbitrarily many project files.
 *
 * Consumed by the scope strip under the tab bar, the In-scope panel, and the
 * macro definition popover.
 */

export interface SourceRef {
  file: string;
  line: number;
}

export interface ScopeInclude {
  /** Project-relative path of the included file. */
  path: string;
  /** File that pulled it in. */
  via: string;
  line: number;
  /** False when the path could not be found on disk. */
  resolved: boolean;
  /** Hops from the root file — 1 for a direct \input. */
  depth: number;
}

export type LatexmlSupport = 'good' | 'partial' | 'caution' | 'unknown';

export interface ScopePackage {
  name: string;
  /** Bracketed options, e.g. `['colorlinks']`. */
  options: string[];
  source: SourceRef;
  latexml: LatexmlSupport;
  /** Why LaTeXML struggles, when it does. */
  latexmlNote: string | null;
}

export type MacroKind =
  | 'newcommand'
  | 'renewcommand'
  | 'providecommand'
  | 'DeclareMathOperator'
  | 'def';

export interface ScopeMacro {
  /** Without the leading backslash. */
  name: string;
  arity: number;
  /** Whether the macro declares an optional first argument. */
  hasDefault: boolean;
  /** The replacement text. */
  body: string;
  /** The definition line, verbatim. */
  definition: string;
  kind: MacroKind;
  source: SourceRef;
  /** Uses across the whole project, excluding the definition itself. */
  uses: number;
  /** Package whose command this definition shadows, when it shadows one. */
  overrides: string | null;
}

export interface ScopeEnvironment {
  name: string;
  arity: number;
  source: SourceRef;
  uses: number;
}

export interface ScopeGraph {
  /** File the graph was resolved for. */
  root: string;
  includes: ScopeInclude[];
  packages: ScopePackage[];
  macros: ScopeMacro[];
  environments: ScopeEnvironment[];
  /** Cite keys defined in the project's .bib files — used to flag broken cites. */
  bibKeys: string[];
  /** Files read while resolving; a change to any of them invalidates the graph. */
  chain: string[];
  resolvedAt: number;
}

export async function resolveScope(file: string): Promise<ScopeGraph> {
  const res = await fetch(`/api/scope?file=${encodeURIComponent(file)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to resolve scope: ${detail || res.statusText}`);
  }
  return res.json();
}

/** Macros with no use anywhere in the project. */
export function unusedMacros(scope: ScopeGraph): ScopeMacro[] {
  return scope.macros.filter((m) => m.uses === 0);
}

/** Packages LaTeXML handles badly — what makes the dual-output promise honest. */
export function unsupportedPackages(scope: ScopeGraph): ScopePackage[] {
  return scope.packages.filter((p) => p.latexml === 'caution');
}

export function findMacro(scope: ScopeGraph | null, name: string): ScopeMacro | null {
  return scope?.macros.find((m) => m.name === name) ?? null;
}
