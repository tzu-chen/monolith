import { keymap, EditorView } from '@codemirror/view';

export const autoCloseEnv = keymap.of([
  {
    key: 'Enter',
    run(view: EditorView): boolean {
      const { state } = view;
      const { head } = state.selection.main;
      const line = state.doc.lineAt(head);
      const textBefore = line.text.slice(0, head - line.from);
      const match = textBefore.match(/\\begin\{([^}]+)\}\s*$/);
      if (!match) return false;

      const envName = match[1];
      const indent = textBefore.match(/^(\s*)/)?.[1] ?? '';
      const insert = `\n${indent}  \n${indent}\\end{${envName}}`;
      const cursorPos = head + 1 + indent.length + 2; // newline + indent + 2 spaces

      view.dispatch({
        changes: { from: head, insert },
        selection: { anchor: cursorPos },
      });
      return true;
    },
  },
]);
