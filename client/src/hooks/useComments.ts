import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { listComments } from '../lib/comments-api';

/**
 * The one place the project's comments are read from the server.
 *
 * Loaded per project and whenever the server says they changed; the editor
 * gutter, the status bar and the Comments panel all read the store. Mounted
 * once, in `App`, like `useScope`.
 */
export function useComments() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const nonce = useEditorStore((s) => s.commentsNonce);

  useEffect(() => {
    if (!currentProject) {
      useEditorStore.getState().setComments([]);
      return;
    }
    let cancelled = false;
    listComments()
      .then((comments) => {
        if (!cancelled) useEditorStore.getState().setComments(comments);
      })
      .catch((err) => console.error('Failed to load comments:', err));
    return () => {
      cancelled = true;
    };
  }, [currentProject, nonce]);
}
