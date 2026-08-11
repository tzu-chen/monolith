import { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import FileTree, { type FileTreeHandle } from '../sidebar/FileTree';
import { PanelHeader, FilterRow, IconButton } from '../shared/ui';
import { SearchIcon, NewFileIcon, NewFolderIcon, UploadIcon } from '../shared/Icons';
import { fs, font, metrics, radius } from '../../theme/tokens';
import { mod } from '../../lib/shortcuts';

/**
 * Files panel (238px in the handoff, scaled here).
 *
 * Header / find row / tree. The find row is a button, not an input: file
 * finding belongs to the command palette, and duplicating the matcher here
 * would give two different answers to the same question.
 */
export default function FilesPanel() {
  const projectRoot = useEditorStore((s) => s.projectRoot);
  const setFinder = useEditorStore((s) => s.setFinder);
  const treeRef = useRef<FileTreeHandle>(null);

  return (
    <>
      <PanelHeader title="Files">
        <IconButton
          icon={<NewFileIcon size={13} />}
          title="New file"
          size={24}
          onClick={() => treeRef.current?.startNewFile()}
        />
        <IconButton
          icon={<NewFolderIcon size={13} />}
          title="New folder"
          size={24}
          onClick={() => treeRef.current?.startNewFolder()}
        />
        <IconButton
          icon={<UploadIcon size={13} />}
          title="Upload file"
          size={24}
          onClick={() => treeRef.current?.upload()}
        />
      </PanelHeader>

      <FilterRow>
        <button
          onClick={() => setFinder('files')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flex: 1,
            minWidth: 0,
            border: '1px solid var(--line)',
            borderRadius: radius.control,
            padding: '5px 9px',
            color: 'var(--text-faint)',
            fontSize: fs.control,
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--line-strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
        >
          <SearchIcon size={14} />
          <span style={{ flex: 1 }}>Find file…</span>
          <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-disabled)' }}>{mod('P')}</span>
        </button>
      </FilterRow>

      <FileTree ref={treeRef} />

      {projectRoot && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `7px ${metrics.padPanel}px`,
            fontFamily: font.mono,
            fontSize: fs.meta,
            color: 'var(--text-faint)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            direction: 'rtl',
          }}
          title={projectRoot}
        >
          {projectRoot}
        </div>
      )}
    </>
  );
}
