import fs from 'fs/promises';
import path from 'path';
import { latexmlSupport, type LatexmlSupport } from '../data/latexmlSupport.js';
import { shadowedPackage } from '../data/packageCommands.js';

/**
 * Scope resolution.
 *
 * Answers, for one file: which packages, macros, environments and labels are
 * actually available here, counting everything inherited through `\input`,
 * `\include` and `\usepackage`, and where each of them came from.
 *
 * This runs on the server because answering it means reading an unbounded set
 * of project files, and because the use counts need a sweep over every `.tex`
 * in the project — both of which are cheap here and slow over HTTP one file at
 * a time.
 *
 * The parser is deliberately regex-and-brace-matching rather than a real TeX
 * parser: it needs to be right about the ~six declaration forms people write by
 * hand, and it must never hang on a file it does not understand.
 */

export interface SourceRef {
  file: string;
  line: number;
}

export interface ScopeInclude {
  path: string;
  via: string;
  line: number;
  resolved: boolean;
  depth: number;
}

export interface ScopePackage {
  name: string;
  options: string[];
  source: SourceRef;
  latexml: LatexmlSupport;
  latexmlNote: string | null;
}

export type MacroKind =
  | 'newcommand'
  | 'renewcommand'
  | 'providecommand'
  | 'DeclareMathOperator'
  | 'def';

export interface ScopeMacro {
  name: string;
  arity: number;
  hasDefault: boolean;
  body: string;
  definition: string;
  kind: MacroKind;
  source: SourceRef;
  uses: number;
  overrides: string | null;
}

export interface ScopeEnvironment {
  name: string;
  arity: number;
  source: SourceRef;
  uses: number;
}

export type LabelKind =
  | 'section'
  | 'equation'
  | 'figure'
  | 'table'
  | 'theorem'
  | 'algorithm'
  | 'listing'
  | 'item'
  | 'other';

export interface ScopeLabel {
  name: string;
  /** What the label names, read from the context it sits in — not from its prefix. */
  kind: LabelKind;
  /** Innermost enclosing environment, when there is one. */
  env: string | null;
  /** Nearest preceding sectioning title, so a label carries where it lives. */
  section: string | null;
  source: SourceRef;
  /** \ref-family uses across the project. */
  uses: number;
  /** True when the same name is declared more than once in scope. */
  duplicate: boolean;
}

/** A `\ref` that names no label anywhere in the project. */
export interface DanglingRef {
  key: string;
  uses: number;
  /** First occurrence, so the panel can jump to one. */
  source: SourceRef;
}

export interface ScopeGraph {
  root: string;
  includes: ScopeInclude[];
  packages: ScopePackage[];
  macros: ScopeMacro[];
  environments: ScopeEnvironment[];
  labels: ScopeLabel[];
  danglingRefs: DanglingRef[];
  bibKeys: string[];
  chain: string[];
  resolvedAt: number;
}

/** Guards against pathological projects; a real preamble is nowhere near these. */
const MAX_FILES = 200;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 12;
/** Files scanned when counting macro uses. */
const MAX_SCAN_FILES = 400;
/** A book-length document is a few hundred labels; past this it is a generator. */
const MAX_LABELS = 4000;
const MAX_DANGLING_REFS = 200;

const SKIP_DIRS = new Set(['build', 'node_modules', '.git', '.monolith']);

// ── Text utilities ──

/**
 * Blank out comments so declarations inside them are not picked up, keeping the
 * text the same length so every offset still maps to its original line.
 */
function stripComments(source: string): string {
  let out = '';
  for (const line of source.split('\n')) {
    let cut = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '%') continue;
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) backslashes++;
      if (backslashes % 2 === 0) {
        cut = i;
        break;
      }
    }
    out += (cut === -1 ? line : line.slice(0, cut) + ' '.repeat(line.length - cut)) + '\n';
  }
  return out.slice(0, source.length);
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Line numbers for a left-to-right scan. `lineAt` restarts from the top of the
 * file every call, which is fine for the handful of declarations in a preamble
 * and quadratic for the hundreds of labels and refs in a book.
 *
 * The returned function must be called with non-decreasing indices — which is
 * what `matchAll` hands out.
 */
function lineTracker(source: string): (index: number) => number {
  let line = 1;
  let cursor = 0;
  return (index) => {
    const stop = Math.min(index, source.length);
    while (cursor < stop) {
      if (source[cursor] === '\n') line++;
      cursor++;
    }
    return line;
  };
}

/**
 * Read a balanced `{…}` group starting at `open` (which must be the `{`).
 * Returns the contents and the index just past the closing brace, or null if
 * the group never closes.
 */
function readGroup(source: string, open: number): { body: string; end: number } | null {
  if (source[open] !== '{') return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\') {
      i++; // skip the escaped character
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { body: source.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** Read an optional `[…]` argument at `pos`, if one is there. */
function readOptional(source: string, pos: number): { value: string; end: number } | null {
  if (source[pos] !== '[') return null;
  const close = source.indexOf(']', pos);
  if (close === -1) return null;
  return { value: source.slice(pos + 1, close), end: close + 1 };
}

function skipSpace(source: string, pos: number): number {
  while (pos < source.length && /\s/.test(source[pos])) pos++;
  return pos;
}

// ── Per-file parsing ──

interface ParsedFile {
  packages: ScopePackage[];
  macros: Omit<ScopeMacro, 'uses' | 'overrides'>[];
  environments: Omit<ScopeEnvironment, 'uses'>[];
  /** Raw include targets, in source order. */
  includes: { target: string; line: number }[];
  bibResources: string[];
  labels: Omit<ScopeLabel, 'uses' | 'duplicate'>[];
  /** Environment names declared by \newtheorem, so their labels read as theorems. */
  theoremEnvs: string[];
}

/**
 * What a label names, decided by the environment it sits in rather than by the
 * `eq:` / `fig:` prefix someone typed — the prefix is a convention, the context
 * is the fact. Starred variants are folded in by stripping the `*`.
 */
const ENVS_BY_KIND: [LabelKind, Set<string>][] = [
  ['equation', new Set([
    'equation', 'align', 'alignat', 'flalign', 'gather', 'multline', 'eqnarray',
    'displaymath', 'split', 'subequations', 'xalignat', 'xxalignat', 'dmath',
    'IEEEeqnarray',
  ])],
  ['figure', new Set(['figure', 'subfigure', 'wrapfigure', 'SCfigure', 'sidewaysfigure'])],
  ['table', new Set([
    'table', 'tabular', 'tabularx', 'tabulary', 'longtable', 'supertabular',
    'threeparttable', 'sidewaystable', 'wraptable',
  ])],
  ['theorem', new Set([
    'theorem', 'lemma', 'proposition', 'corollary', 'definition', 'remark',
    'example', 'claim', 'conjecture', 'proof', 'axiom', 'thm', 'lem', 'prop',
    'cor', 'defn', 'rem',
  ])],
  ['algorithm', new Set(['algorithm', 'algorithmic', 'algorithmize', 'algo'])],
  ['listing', new Set(['lstlisting', 'listing', 'minted', 'verbatim', 'Verbatim', 'code'])],
  ['item', new Set(['enumerate', 'itemize', 'description', 'tasks'])],
];

function envKind(env: string): LabelKind | null {
  const base = env.replace(/\*$/, '');
  for (const [kind, names] of ENVS_BY_KIND) {
    if (names.has(base)) return kind;
  }
  return null;
}

const INCLUDE_RE = /\\(input|include|subfile|subfileinclude)\s*\{([^}]*)\}/g;
const PACKAGE_RE = /\\(usepackage|RequirePackage)\s*(\[[^\]]*\])?\s*\{([^}]*)\}/g;
const DOCUMENTCLASS_RE = /\\documentclass\s*(\[[^\]]*\])?\s*\{([^}]*)\}/;
const BIBRESOURCE_RE = /\\(?:addbibresource|bibliography)\s*\{([^}]*)\}/g;
const MACRO_RE = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator)(\*?)\s*/g;
const DEF_RE = /\\def\s*\\([a-zA-Z@]+)((?:#\d)*)\s*\{/g;
const ENV_RE = /\\(newenvironment|renewenvironment)(\*?)\s*\{([^}]*)\}\s*(\[\d+\])?/g;
const THEOREM_RE = /\\(?:newtheorem\*?|declaretheorem)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

/**
 * One ordered pass for everything a label's context needs: environment
 * begin/end, sectioning commands, and the labels themselves. Reading them
 * separately would lose the interleaving, which is the whole signal.
 */
const LABEL_CONTEXT_RE =
  /\\(begin|end)\s*\{([^}]*)\}|\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{|\\label\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

/** How far below a `\section{…}` a bare label still counts as naming it. */
const SECTION_LABEL_REACH = 1;

/**
 * Every way a project names a label. `\hyperref` takes its key in brackets;
 * the cleveref family takes comma-separated lists. Longer names come first so
 * `\eqref` is not read as `\ref`.
 */
const REF_USE_RE =
  /\\hyperref\s*\[([^\]]*)\]|\\(?:[eE]qref|[aA]utopageref|[aA]utoref|[nN]amecref|[nN]ameref|[cC]refrange|[cC]pageref|[cC]ref|[pP]ageref|[vV]pageref|[vV]ref|labelcref|subref|[fF]ref|ref)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

const LABEL_NAME_RE = /\\label\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

function parseFile(file: string, raw: string): ParsedFile {
  const source = stripComments(raw);
  const parsed: ParsedFile = {
    packages: [],
    macros: [],
    environments: [],
    includes: [],
    bibResources: [],
    labels: [],
    theoremEnvs: [],
  };

  const docClass = source.match(DOCUMENTCLASS_RE);
  if (docClass) {
    // The class is not a package, but its options belong to the same story;
    // record it as one so the strip and panel can show what document this is.
    const name = docClass[2].trim();
    const rating = latexmlSupport(name);
    parsed.packages.push({
      name,
      options: (docClass[1] ?? '').replace(/[[\]]/g, '').split(',').map((o) => o.trim()).filter(Boolean),
      source: { file, line: lineAt(source, docClass.index ?? 0) },
      latexml: rating.support,
      latexmlNote: rating.note ?? null,
    });
  }

  for (const m of source.matchAll(PACKAGE_RE)) {
    const options = (m[2] ?? '').replace(/[[\]]/g, '').split(',').map((o) => o.trim()).filter(Boolean);
    const line = lineAt(source, m.index ?? 0);
    // `\usepackage{a,b,c}` loads three packages from one declaration.
    for (const name of m[3].split(',').map((n) => n.trim()).filter(Boolean)) {
      const rating = latexmlSupport(name);
      parsed.packages.push({
        name,
        options,
        source: { file, line },
        latexml: rating.support,
        latexmlNote: rating.note ?? null,
      });
    }
  }

  for (const m of source.matchAll(INCLUDE_RE)) {
    const target = m[2].trim();
    if (target) parsed.includes.push({ target, line: lineAt(source, m.index ?? 0) });
  }

  for (const m of source.matchAll(BIBRESOURCE_RE)) {
    for (const name of m[1].split(',').map((n) => n.trim()).filter(Boolean)) {
      parsed.bibResources.push(name);
    }
  }

  for (const m of source.matchAll(THEOREM_RE)) {
    const name = m[1].trim();
    if (name) parsed.theoremEnvs.push(name);
  }

  // Labels, with the environment stack and last section heading they sit under.
  {
    const at = lineTracker(source);
    const envStack: string[] = [];
    let lastSection: { title: string; line: number } | null = null;

    for (const m of source.matchAll(LABEL_CONTEXT_RE)) {
      const start = m.index ?? 0;

      if (m[1] === 'begin') {
        envStack.push(m[2].trim());
        continue;
      }
      if (m[1] === 'end') {
        // Tolerate mismatched nesting: unwind to the named environment when it
        // is open, and ignore the \end when it is not.
        const name = m[2].trim();
        const at_ = envStack.lastIndexOf(name);
        if (at_ !== -1) envStack.length = at_;
        continue;
      }
      if (m[3]) {
        const title = readGroup(source, start + m[0].length - 1);
        lastSection = { title: (title?.body ?? '').replace(/\s+/g, ' ').trim(), line: at(start) };
        continue;
      }

      const name = m[4].trim();
      if (!name || parsed.labels.length >= MAX_LABELS) continue;
      const line = at(start);

      // Innermost first: a \label in a tikzpicture inside a figure names the
      // figure, but `tikzpicture` is still the environment it was written in.
      let kind: LabelKind | null = null;
      for (let i = envStack.length - 1; i >= 0; i--) {
        kind = envKind(envStack[i]);
        if (kind) break;
      }
      const innermost = [...envStack].reverse().find((e) => e !== 'document') ?? null;

      parsed.labels.push({
        name,
        kind:
          kind ??
          (lastSection && line - lastSection.line <= SECTION_LABEL_REACH ? 'section' : 'other'),
        env: innermost,
        section: lastSection?.title || null,
        source: { file, line },
      });
    }
  }

  for (const m of source.matchAll(ENV_RE)) {
    parsed.environments.push({
      name: m[3].trim(),
      arity: m[4] ? parseInt(m[4].replace(/[[\]]/g, ''), 10) || 0 : 0,
      source: { file, line: lineAt(source, m.index ?? 0) },
    });
  }

  // \newcommand and friends need brace matching: the body can hold anything.
  for (const m of source.matchAll(MACRO_RE)) {
    const kind = m[1] as MacroKind;
    const start = m.index ?? 0;
    let pos = skipSpace(source, start + m[0].length);

    // Name, either `{\foo}` or bare `\foo`.
    let name: string | null = null;
    if (source[pos] === '{') {
      const group = readGroup(source, pos);
      if (!group) continue;
      const inner = group.body.trim().match(/^\\([a-zA-Z@]+)$/);
      if (!inner) continue;
      name = inner[1];
      pos = group.end;
    } else {
      const bare = source.slice(pos).match(/^\\([a-zA-Z@]+)/);
      if (!bare) continue;
      name = bare[1];
      pos += bare[0].length;
    }

    pos = skipSpace(source, pos);

    let arity = 0;
    let hasDefault = false;
    if (kind !== 'DeclareMathOperator') {
      const arityArg = readOptional(source, pos);
      if (arityArg) {
        arity = parseInt(arityArg.value, 10) || 0;
        pos = skipSpace(source, arityArg.end);
        const defaultArg = readOptional(source, pos);
        if (defaultArg) {
          hasDefault = true;
          pos = skipSpace(source, defaultArg.end);
        }
      }
    }

    const bodyGroup = readGroup(source, pos);
    if (!bodyGroup) continue;

    parsed.macros.push({
      name,
      arity,
      hasDefault,
      body: bodyGroup.body.trim(),
      definition: raw.slice(start, bodyGroup.end).replace(/\s+/g, ' ').trim(),
      kind,
      source: { file, line: lineAt(source, start) },
    });
  }

  for (const m of source.matchAll(DEF_RE)) {
    const start = m.index ?? 0;
    const braceAt = start + m[0].length - 1;
    const bodyGroup = readGroup(source, braceAt);
    if (!bodyGroup) continue;
    parsed.macros.push({
      name: m[1],
      arity: (m[2].match(/#/g) ?? []).length,
      hasDefault: false,
      body: bodyGroup.body.trim(),
      definition: raw.slice(start, bodyGroup.end).replace(/\s+/g, ' ').trim(),
      kind: 'def',
      source: { file, line: lineAt(source, start) },
    });
  }

  return parsed;
}

// ── Filesystem helpers ──

async function readIfFile(absPath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return await fs.readFile(absPath, 'utf-8');
  } catch {
    return null;
  }
}

/** `\input{sections/model}` may or may not carry its `.tex`. */
async function resolveInclude(
  projectRoot: string,
  fromFile: string,
  target: string
): Promise<string | null> {
  const candidates = [target, `${target}.tex`];
  const bases = [path.dirname(fromFile), ''];
  for (const base of bases) {
    for (const candidate of candidates) {
      const rel = path.normalize(path.join(base, candidate));
      if (rel.startsWith('..')) continue;
      const abs = path.join(projectRoot, rel);
      if (!abs.startsWith(projectRoot + path.sep) && abs !== projectRoot) continue;
      try {
        const stat = await fs.stat(abs);
        if (stat.isFile()) return rel.split(path.sep).join('/');
      } catch {
        // Try the next candidate.
      }
    }
  }
  return null;
}

export async function listProjectFiles(projectRoot: string, extensions: string[]): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, rel: string): Promise<void> {
    if (found.length >= MAX_SCAN_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_SCAN_FILES) return;
      if (entry.name.startsWith('.') && entry.name !== '.') {
        if (SKIP_DIRS.has(entry.name)) continue;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), childRel);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        found.push(childRel);
      }
    }
  }

  await walk(projectRoot, '');
  return found;
}

/**
 * The project's root document: the `.tex` with a `\documentclass`, preferring
 * `main.tex`. A section file inherits its preamble from here — without this,
 * opening `sections/intro.tex` would report an empty scope, which is true of
 * that file alone and useless as an answer.
 */
async function findRootDocument(projectRoot: string, texFiles: string[]): Promise<string | null> {
  const ordered = [...texFiles].sort((a, b) => {
    const rank = (f: string) => (f === 'main.tex' ? 0 : f.includes('/') ? 2 : 1);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  for (const file of ordered) {
    const content = await readIfFile(path.join(projectRoot, file));
    if (content && DOCUMENTCLASS_RE.test(stripComments(content))) return file;
  }
  return null;
}

// ── Use counting ──

/** Escape a macro name for use in a regex. Names are `[a-zA-Z@]+`, so this is cheap. */
function usePattern(name: string): RegExp {
  // `\foo` must not match `\foobar`, so require a non-letter after it.
  return new RegExp(`\\\\${name}(?![a-zA-Z@])`, 'g');
}

function countMatches(haystack: string, pattern: RegExp): number {
  let count = 0;
  pattern.lastIndex = 0;
  while (pattern.exec(haystack) !== null) count++;
  return count;
}

// ── Resolution ──

export async function resolveScope(projectRoot: string, file: string): Promise<ScopeGraph> {
  const texFiles = await listProjectFiles(projectRoot, ['.tex', '.sty', '.cls']);

  // Walk from the active file, and — when it is not itself a root document —
  // from the project's root document too, so inherited preamble is included.
  const roots = [file];
  const activeSource = await readIfFile(path.join(projectRoot, file));
  const activeIsRoot = !!activeSource && DOCUMENTCLASS_RE.test(stripComments(activeSource));
  if (!activeIsRoot) {
    const rootDoc = await findRootDocument(projectRoot, texFiles);
    if (rootDoc && rootDoc !== file) roots.push(rootDoc);
  }

  const visited = new Set<string>();
  const includes: ScopeInclude[] = [];
  const packages: ScopePackage[] = [];
  const rawMacros: Omit<ScopeMacro, 'uses' | 'overrides'>[] = [];
  const rawEnvironments: Omit<ScopeEnvironment, 'uses'>[] = [];
  const rawLabels: Omit<ScopeLabel, 'uses' | 'duplicate'>[] = [];
  const theoremEnvs = new Set<string>();
  const bibResources = new Set<string>();

  const queue: { path: string; depth: number }[] = roots.map((r) => ({ path: r, depth: 0 }));

  while (queue.length > 0 && visited.size < MAX_FILES) {
    const current = queue.shift()!;
    if (visited.has(current.path) || current.depth > MAX_DEPTH) continue;
    visited.add(current.path);

    const raw = await readIfFile(path.join(projectRoot, current.path));
    if (raw === null) continue;

    const parsed = parseFile(current.path, raw);
    packages.push(...parsed.packages);
    rawMacros.push(...parsed.macros);
    rawEnvironments.push(...parsed.environments);
    rawLabels.push(...parsed.labels);
    for (const env of parsed.theoremEnvs) theoremEnvs.add(env);
    for (const bib of parsed.bibResources) bibResources.add(bib);

    for (const inc of parsed.includes) {
      const resolved = await resolveInclude(projectRoot, current.path, inc.target);
      includes.push({
        path: resolved ?? inc.target,
        via: current.path,
        line: inc.line,
        resolved: resolved !== null,
        depth: current.depth + 1,
      });
      if (resolved && !visited.has(resolved)) {
        queue.push({ path: resolved, depth: current.depth + 1 });
      }
    }
  }

  // A later \renewcommand wins over the \newcommand it replaces; keep the last
  // definition of each name, which is what the document actually uses.
  const macroByName = new Map<string, Omit<ScopeMacro, 'uses' | 'overrides'>>();
  for (const macro of rawMacros) macroByName.set(macro.name, macro);

  const envByName = new Map<string, Omit<ScopeEnvironment, 'uses'>>();
  for (const env of rawEnvironments) envByName.set(env.name, env);

  const packageByName = new Map<string, ScopePackage>();
  for (const pkg of packages) if (!packageByName.has(pkg.name)) packageByName.set(pkg.name, pkg);
  const loadedPackages = new Set(packageByName.keys());

  // One pass over the project's sources: the text every macro and environment
  // is counted against, plus every \ref and \label in the project.
  //
  // Both label questions are asked project-wide rather than chain-wide. A label
  // referenced from a sibling document is used, and a \ref answered by a file
  // this one never includes is not broken — narrowing either to the chain would
  // report problems that aren't there.
  const corpus: string[] = [];
  const refUses = new Map<string, { uses: number; source: SourceRef }>();
  const definedLabels = new Set<string>();

  for (const texFile of texFiles) {
    const content = await readIfFile(path.join(projectRoot, texFile));
    if (!content) continue;
    const stripped = stripComments(content);
    corpus.push(stripped);

    const at = lineTracker(stripped);
    for (const m of stripped.matchAll(REF_USE_RE)) {
      const line = at(m.index ?? 0);
      // \cref{a,b} references two labels in one call.
      for (const key of (m[1] ?? m[2] ?? '').split(',')) {
        const trimmed = key.trim();
        if (!trimmed) continue;
        const seen = refUses.get(trimmed);
        if (seen) seen.uses++;
        else refUses.set(trimmed, { uses: 1, source: { file: texFile, line } });
      }
    }

    for (const m of stripped.matchAll(LABEL_NAME_RE)) {
      const name = m[1].trim();
      if (name) definedLabels.add(name);
    }
  }
  const corpusText = corpus.join('\n');

  const macros: ScopeMacro[] = [...macroByName.values()].map((macro) => {
    // Every definition mentions the name once; that is not a use.
    const total = countMatches(corpusText, usePattern(macro.name));
    const definitions = rawMacros.filter((m) => m.name === macro.name).length;
    return {
      ...macro,
      uses: Math.max(0, total - definitions),
      overrides: macro.kind === 'renewcommand' || macro.kind === 'newcommand'
        ? shadowedPackage(macro.name, loadedPackages)
        : null,
    };
  });

  const environments: ScopeEnvironment[] = [...envByName.values()].map((env) => ({
    ...env,
    uses: countMatches(corpusText, new RegExp(`\\\\begin\\s*\\{${env.name}\\}`, 'g')),
  }));

  // A label declared twice is a LaTeX error the log buries; both copies are
  // marked so the panel can point at either one.
  const labelCounts = new Map<string, number>();
  for (const label of rawLabels) labelCounts.set(label.name, (labelCounts.get(label.name) ?? 0) + 1);

  const labels: ScopeLabel[] = rawLabels.map((label) => ({
    ...label,
    // \newtheorem environments are only known once every file has been read.
    kind: label.kind === 'other' && label.env && theoremEnvs.has(label.env) ? 'theorem' : label.kind,
    uses: refUses.get(label.name)?.uses ?? 0,
    duplicate: (labelCounts.get(label.name) ?? 0) > 1,
  }));

  const danglingRefs: DanglingRef[] = [...refUses.entries()]
    .filter(([key]) => !definedLabels.has(key))
    .map(([key, use]) => ({ key, uses: use.uses, source: use.source }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, MAX_DANGLING_REFS);

  // Cite keys, so the editor can flag a \cite that names nothing.
  const bibFiles = await listProjectFiles(projectRoot, ['.bib']);
  const bibKeys: string[] = [];
  for (const bibFile of bibFiles) {
    const content = await readIfFile(path.join(projectRoot, bibFile));
    if (!content) continue;
    for (const m of content.matchAll(/@\w+\s*\{\s*([^,\s}]+)/g)) bibKeys.push(m[1]);
  }

  return {
    root: file,
    includes,
    packages: [...packageByName.values()],
    macros: macros.sort((a, b) => a.name.localeCompare(b.name)),
    environments: environments.sort((a, b) => a.name.localeCompare(b.name)),
    // Left in document order — the order they were walked in, which is the one
    // order the client cannot reconstruct from the names alone.
    labels,
    danglingRefs,
    bibKeys,
    chain: [...visited],
    resolvedAt: Date.now(),
  };
}
