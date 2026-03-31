import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface CompileResult {
  success: boolean;
  pdf?: string; // base64
  log: string;
  errors: string[];
  warnings: string[];
}

export async function compileTex(
  projectRoot: string,
  mainFile: string
): Promise<CompileResult> {
  const buildDir = path.join(projectRoot, 'build');

  // Ensure build dir exists
  await fs.mkdir(buildDir, { recursive: true });

  const mainFilePath = path.join(projectRoot, mainFile);

  return new Promise((resolve) => {
    const proc = spawn('tectonic', [
      '-X', 'compile',
      '--synctex',
      '--keep-intermediates',
      mainFilePath,
    ], {
      cwd: projectRoot,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      const log = stderr;
      const errors: string[] = [];
      const warnings: string[] = [];

      for (const line of log.split('\n')) {
        if (/error/i.test(line) && line.trim()) {
          errors.push(line.trim());
        } else if (/warning/i.test(line) && line.trim()) {
          warnings.push(line.trim());
        }
      }

      if (code === 0) {
        try {
          const baseName = path.basename(mainFile, path.extname(mainFile));
          const srcDir = path.dirname(mainFilePath);
          const pdfSrc = path.join(srcDir, `${baseName}.pdf`);
          const synctexSrc = path.join(srcDir, `${baseName}.synctex.gz`);

          // Move outputs to build dir
          const pdfDest = path.join(buildDir, `${baseName}.pdf`);
          const synctexDest = path.join(buildDir, `${baseName}.synctex.gz`);
          await fs.rename(pdfSrc, pdfDest).catch(() => {});
          await fs.rename(synctexSrc, synctexDest).catch(() => {});

          // Clean up intermediate files from source dir
          const intermediates = ['.aux', '.bbl', '.blg', '.log', '.out', '.toc', '.lof', '.lot'];
          for (const ext of intermediates) {
            await fs.unlink(path.join(srcDir, `${baseName}${ext}`)).catch(() => {});
          }

          const pdfBuffer = await fs.readFile(pdfDest);
          const pdf = pdfBuffer.toString('base64');
          resolve({ success: true, pdf, log, errors, warnings });
        } catch (err) {
          resolve({
            success: false,
            log,
            errors: [...errors, `Failed to read output PDF: ${err}`],
            warnings,
          });
        }
      } else {
        resolve({ success: false, log, errors, warnings });
      }
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        log: '',
        errors: [`Failed to spawn tectonic: ${err.message}`],
        warnings: [],
      });
    });
  });
}
