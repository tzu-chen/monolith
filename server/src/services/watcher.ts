import { watch, type FSWatcher } from 'chokidar';
import path from 'path';

export type FileEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface FileChangeMessage {
  type: 'file_changed';
  event: FileEvent;
  path: string;
}

export function createWatcher(
  projectRoot: string,
  onEvent: (msg: FileChangeMessage) => void
): FSWatcher {
  const watcher = watch(projectRoot, {
    ignored: [
      /(^|[\/\\])\./,         // dotfiles
      '**/node_modules/**',
      '**/build/**',
      '**/*.pdf',
      '**/*.aux',
      '**/*.log',
      '**/*.synctex.gz',
    ],
    persistent: true,
    ignoreInitial: true,
  });

  const handleEvent = (event: FileEvent) => (filePath: string) => {
    const relPath = path.relative(projectRoot, filePath);
    onEvent({ type: 'file_changed', event, path: relPath });
  };

  watcher
    .on('add', handleEvent('add'))
    .on('change', handleEvent('change'))
    .on('unlink', handleEvent('unlink'))
    .on('addDir', handleEvent('addDir'))
    .on('unlinkDir', handleEvent('unlinkDir'));

  return watcher;
}
