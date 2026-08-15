import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { actionForChord, chordFromEvent, type ShortcutAction } from '../lib/keybindings';

/**
 * The one listener that runs the shortcut registry.
 *
 * It listens on `window` in the **capture** phase, so a bound chord is claimed
 * before anything downstream sees it — CodeMirror binds Mod-Enter to "insert
 * blank line" and Mod-Shift-l to "select all occurrences", and an accelerator
 * that stops working the moment the cursor is in the document is worse than no
 * accelerator at all. Claiming a chord means `preventDefault` (the browser's own
 * use of it) plus `stopPropagation` (the editor's), so exactly one thing
 * happens per press.
 *
 * Only bound chords are claimed; every other key travels untouched. An action
 * with no handler is not a binding at all, so a chord for a pane that isn't
 * mounted falls through to the editor.
 *
 * Handlers are read through a ref: they are rebuilt on most renders, and
 * re-subscribing on every one of those would be churn for nothing.
 */
export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * While Settings is recording a new chord, the keyboard belongs to the recorder
 * — otherwise binding Mod+Shift+F would also open the Files panel behind it.
 */
let suspended = false;

export function suspendShortcuts(on: boolean): void {
  suspended = on;
}

/**
 * The live dispatcher, published so a keypress that never reached this window
 * can still be run. The HTML preview is a sandboxed iframe: once the reader
 * clicks inside it, its keydowns belong to that document and this listener
 * never fires, so the iframe forwards the chord by postMessage instead. There
 * is exactly one `useShortcuts` — in `App` — so one slot is enough.
 */
let dispatch: ((chord: string) => boolean) | null = null;

/** Run whatever `chord` is bound to. Returns whether anything fired. */
export function runChord(chord: string): boolean {
  return dispatch ? dispatch(chord) : false;
}

export function useShortcuts(handlers: ShortcutHandlers) {
  const keybindings = useEditorStore((s) => s.keybindings);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    /** `claim` runs first, and only for a chord that is really about to fire. */
    const fire = (chord: string, claim?: () => void): boolean => {
      if (suspended) return false;
      const action = actionForChord(keybindings, chord);
      if (!action) return false;
      const handler = handlersRef.current[action];
      if (!handler) return false;
      claim?.();
      handler();
      return true;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const chord = chordFromEvent(e);
      if (!chord) return;
      fire(chord, () => {
        e.preventDefault();
        e.stopPropagation();
      });
    };

    dispatch = fire;
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (dispatch === fire) dispatch = null;
    };
  }, [keybindings]);
}
