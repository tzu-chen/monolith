import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * LaTeXML HTML render service. Parallels `tectonic.ts` (the PDF path) but drives
 * the standalone `latexmlc` converter: it parses LaTeX directly (no TeX engine),
 * so it lives entirely beside the PDF pipeline and never touches it.
 *
 * Output goes to a per-project, gitignored `<project>/.monolith/html/` dir,
 * analogous to where Tectonic build artifacts live. Generated files are never
 * written into the source tree.
 */

export type SplitLevel = 'none' | 'part' | 'chapter' | 'section' | 'subsection';

export interface RenderOptions {
  /** Paginate the output into linked pages at this level. 'none' = single page. */
  splitAt?: SplitLevel;
}

export interface RenderResult {
  ok: boolean;
  /** false when the `latexmlc` binary is not installed on the host. */
  available: boolean;
  /** absolute path to the generated entry HTML (index.html). */
  indexPath: string;
  /** raw stderr from latexmlc (its structured diagnostics stream). */
  log: string;
  warnings: string[];
  errors: string[];
}

const HTML_SUBDIR = path.join('.monolith', 'html');

/** Absolute path to a project's generated HTML output directory. */
export function htmlOutputDir(projectRoot: string): string {
  return path.join(projectRoot, HTML_SUBDIR);
}

/**
 * Render `mainFile` to HTML5 (MathML for math) using latexmlc.
 *
 * @param projectRoot  absolute project directory (cwd for the converter)
 * @param mainFile     project-relative path to the main .tex file
 * @param themeDir     absolute path to the bundled theme assets directory
 * @param opts         render options (pagination, …)
 */
export async function renderHtml(
  projectRoot: string,
  mainFile: string,
  themeDir: string,
  opts: RenderOptions = {}
): Promise<RenderResult> {
  const outDir = htmlOutputDir(projectRoot);
  const destPath = path.join(outDir, 'index.html');
  const mainFilePath = path.join(projectRoot, mainFile);

  // Clean stale output so removed sections / split pages don't linger, then
  // recreate the directory.
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const splitAt = opts.splitAt ?? 'none';

  const args = [
    `--dest=${destPath}`,
    '--format=html5',
    `--sourcedirectory=${projectRoot}`,
    // Extra search dir for custom *.sty.ltxml bindings (Tier-3 packages).
    `--path=${path.join(projectRoot, 'latexml')}`,
    // Permit reading raw .sty when no binding ships (Tier-2 packages).
    '--includestyles',
    // Make \iflatexml available even if the source forgets \usepackage{latexml}.
    '--preload=latexml.sty',
    // Layer our theme on top of LaTeXML's default ltx_* resources.
    `--css=${path.join(themeDir, 'monolith-latexml.css')}`,
    `--javascript=${path.join(themeDir, 'knowl.js')}`,
    `--javascript=${path.join(themeDir, 'monolith-theme.js')}`,
  ];

  if (splitAt !== 'none') {
    args.push(`--splitat=${splitAt}`);
    // Multi-page output gets LaTeXML's navigation TOC; the single-page theme
    // builds its own floating TOC client-side instead.
    args.push('--navigationtoc=context');
  } else {
    args.push('--nosplit');
  }

  args.push(mainFilePath);

  return new Promise((resolve) => {
    const proc = spawn('latexmlc', args, { cwd: projectRoot });

    let stderr = '';
    proc.stdout.on('data', () => {
      // latexmlc writes its diagnostics to stderr; stdout is normally empty.
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      const log = stderr;
      const { warnings, errors } = parseDiagnostics(log);

      // Even exit 0 can leave no file on a fatal parse; verify the entry exists.
      let produced = false;
      try {
        await fs.access(destPath);
        produced = true;
      } catch {
        produced = false;
      }

      const ok = code === 0 && produced;
      if (!ok && errors.length === 0) {
        errors.push(
          produced
            ? `latexmlc exited with code ${code}`
            : 'latexmlc did not produce index.html (see log)'
        );
      }
      resolve({ ok, available: true, indexPath: destPath, log, warnings, errors });
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        resolve({
          ok: false,
          available: false,
          indexPath: destPath,
          log: '',
          warnings: [],
          errors: [
            'LaTeXML is not installed. Install it to enable HTML rendering ' +
              '(Debian/Ubuntu: `apt install latexml`, macOS: `brew install latexml`).',
          ],
        });
      } else {
        resolve({
          ok: false,
          available: false,
          indexPath: destPath,
          log: '',
          warnings: [],
          errors: [`Failed to spawn latexmlc: ${err.message}`],
        });
      }
    });
  });
}

/**
 * Split LaTeXML's stderr into warnings/errors. LaTeXML prefixes diagnostics with
 * a severity keyword (`Warning:`, `Error:`, `Fatal:`), optionally followed by a
 * category and the source location on continuation lines. We key off the first
 * line of each record.
 */
function parseDiagnostics(log: string): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const raw of log.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(Error|Fatal)\b/i.test(line)) {
      errors.push(line);
    } else if (/^Warning\b/i.test(line)) {
      warnings.push(line);
    }
  }
  return { warnings, errors };
}
