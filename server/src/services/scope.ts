import fs from 'fs/promises';
import path from 'path';
import { latexmlSupport, type LatexmlSupport } from '../data/latexmlSupport.js';
import { shadowedPackage } from '../data/packageCommands.js';

/**
 * Scope resolution.
 *
 * Answers, for one file: which packages, macros and environments are actually
 * available here, counting everything inherited through `\input`, `\include`
 * and `\usepackage`, and where each of them came from.
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

export interface ScopeGraph {
  root: string;
  includes: ScopeInclude[];
  packages: ScopePackage[];
  macros: ScopeMacro[];
  environments: ScopeEnvironment[];
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
}

const INCLUDE_RE = /\\(input|include|subfile|subfileinclude)\s*\{([^}]*)\}/g;
const PACKAGE_RE = /\\(usepackage|RequirePackage)\s*(\[[^\]]*\])?\s*\{([^}]*)\}/g;
const DOCUMENTCLASS_RE = /\\documentclass\s*(\[[^\]]*\])?\s*\{([^}]*)\}/;
const BIBRESOURCE_RE = /\\(?:addbibresource|bibliography)\s*\{([^}]*)\}/g;
const MACRO_RE = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator)(\*?)\s*/g;
const DEF_RE = /\\def\s*\\([a-zA-Z@]+)((?:#\d)*)\s*\{/g;
const ENV_RE = /\\(newenvironment|renewenvironment)(\*?)\s*\{([^}]*)\}\s*(\[\d+\])?/g;

function parseFile(file: string, raw: string): ParsedFile {
  const source = stripComments(raw);
  const parsed: ParsedFile = {
    packages: [],
    macros: [],
    environments: [],
    includes: [],
    bibResources: [],
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

async function listProjectFiles(projectRoot: string, extensions: string[]): Promise<string[]> {
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

  // One pass over the project's sources, counting every macro and environment.
  const corpus: string[] = [];
  for (const texFile of texFiles) {
    const content = await readIfFile(path.join(projectRoot, texFile));
    if (content) corpus.push(stripComments(content));
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
    bibKeys,
    chain: [...visited],
    resolvedAt: Date.now(),
  };
}
