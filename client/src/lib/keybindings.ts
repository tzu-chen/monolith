/**
 * The shortcut registry.
 *
 * One table owns every global keyboard shortcut: its label, the group it sits
 * in, and the chord it ships with. Settings rebinds them, `useShortcuts`
 * dispatches them, and every visible control reads its hint from the same
 * place — so a rebound shortcut is relabelled everywhere it is advertised, and
 * a keyboard shortcut is never the only way in.
 *
 * A chord is a canonical string: modifiers in the order `Mod`, `Alt`, `Shift`,
 * then the key — `Mod+Shift+F`, `Mod+Enter`, `Mod+,`. `Mod` means ⌘ on macOS
 * and Ctrl everywhere else, the same convention CodeMirror uses, so one string
 * describes the binding on every platform. An empty string means unbound.
 *
 * Defaults lean on Mod+Shift because this is a text editor: a bare letter is
 * something you type. A bound chord outranks CodeMirror's own keymap (see
 * `useShortcuts`), so the defaults stay off the editor's commands where they
 * can — Mod+Shift+L is CodeMirror's "select all occurrences", which is why
 * Plots is on G. Mod+Enter is the exception and is meant to be: it is what a
 * LaTeX editor's compile key is, and insert-blank-line loses the argument.
 * Where one collides with the browser's own chrome, the answer is to rebind it
 * in Settings — that is what the registry is for.
 *
 * The three layout modes take 1/2/3 in the order the segmented control shows
 * them (editor, split, preview), so the chord reads off the control. They carry
 * Shift like everything else, and that also keeps them clear of Mod+1..9, which
 * the browser reserves for its own tabs and will not hand to a page.
 */

export type ShortcutAction =
  | 'panelFiles'
  | 'panelOutline'
  | 'panelScope'
  | 'panelReferences'
  | 'panelPlots'
  | 'panelProjects'
  | 'drawerSymbols'
  | 'drawerSnippets'
  | 'viewEditor'
  | 'viewSplit'
  | 'viewPreview'
  | 'compile'
  | 'renderHtml'
  | 'save'
  | 'findFile'
  | 'findProject'
  | 'openSettings';

/** Section headings in the Settings list, in the order they appear there. */
export type ShortcutGroup = 'Panels' | 'Drawers' | 'View' | 'Document' | 'App';

export interface ShortcutMeta {
  action: ShortcutAction;
  label: string;
  group: ShortcutGroup;
  defaultKey: string;
  /** Shown under the label where the action is not self-evident. */
  hint?: string;
}

export const SHORTCUT_META: ShortcutMeta[] = [
  { action: 'panelFiles', label: 'Files', group: 'Panels', defaultKey: 'Mod+Shift+F' },
  { action: 'panelOutline', label: 'Outline', group: 'Panels', defaultKey: 'Mod+Shift+O' },
  { action: 'panelScope', label: 'In scope', group: 'Panels', defaultKey: 'Mod+Shift+D' },
  { action: 'panelReferences', label: 'References', group: 'Panels', defaultKey: 'Mod+Shift+B' },
  { action: 'panelPlots', label: 'Plots', group: 'Panels', defaultKey: 'Mod+Shift+G' },
  { action: 'panelProjects', label: 'Projects', group: 'Panels', defaultKey: 'Mod+Shift+J' },

  { action: 'drawerSymbols', label: 'Symbols', group: 'Drawers', defaultKey: 'Mod+Shift+M' },
  { action: 'drawerSnippets', label: 'Snippets', group: 'Drawers', defaultKey: 'Mod+Shift+S' },

  {
    action: 'viewEditor',
    label: 'Editor only',
    group: 'View',
    defaultKey: 'Mod+Shift+1',
    hint: 'Hide the preview',
  },
  {
    action: 'viewSplit',
    label: 'Editor and preview',
    group: 'View',
    defaultKey: 'Mod+Shift+2',
    hint: 'Split the workspace',
  },
  {
    action: 'viewPreview',
    label: 'Preview only',
    group: 'View',
    defaultKey: 'Mod+Shift+3',
    hint: 'Hide the editor',
  },

  {
    action: 'compile',
    label: 'Compile',
    group: 'Document',
    defaultKey: 'Mod+Enter',
    hint: 'Build the open .tex file with Tectonic',
  },
  {
    action: 'renderHtml',
    label: 'Render HTML',
    group: 'Document',
    defaultKey: 'Mod+Shift+Enter',
    hint: 'Build the LaTeXML web render',
  },
  {
    action: 'save',
    label: 'Save',
    group: 'Document',
    defaultKey: 'Mod+S',
    hint: 'Write the file to disk, then compile it',
  },

  { action: 'findFile', label: 'Find a file', group: 'App', defaultKey: 'Mod+P' },
  { action: 'findProject', label: 'Open a project', group: 'App', defaultKey: 'Mod+Shift+P' },
  { action: 'openSettings', label: 'Settings', group: 'App', defaultKey: 'Mod+,' },
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Panels', 'Drawers', 'View', 'Document', 'App'];

export type KeybindingsConfig = Record<ShortcutAction, string>;

export const DEFAULT_KEYBINDINGS: KeybindingsConfig = SHORTCUT_META.reduce(
  (acc, m) => ({ ...acc, [m.action]: m.defaultKey }),
  {} as KeybindingsConfig
);

/** Every action, in registry order — dispatch and the settings list share it. */
export const SHORTCUT_ACTIONS: ShortcutAction[] = SHORTCUT_META.map((m) => m.action);

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');

/**
 * The key half of a chord, taken from `code` where the physical key is
 * unambiguous — Shift+1 reports `!` and Shift+f reports `F`, so reading `key`
 * alone would make a chord depend on which modifiers were held when it was
 * recorded.
 */
function keyFromEvent(e: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (e.key === ' ') return 'Space';
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

/** The chord this event describes, or `null` for a bare modifier press. */
export function chordFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(keyFromEvent(e));
  return parts.join('+');
}

/**
 * Whether a chord may be bound. Anything without Ctrl/⌘ or Alt is a character
 * you type into the document, and Escape belongs to whatever is on top.
 */
export function isBindableChord(chord: string): boolean {
  const parts = chord.split('+');
  const key = parts[parts.length - 1];
  if (key === 'Escape' || key === 'Tab') return false;
  if (/^F([1-9]|1[0-2])$/.test(key)) return true;
  return parts.includes('Mod') || parts.includes('Alt');
}

const MAC_SYMBOLS: Record<string, string> = {
  Mod: '⌘',
  Alt: '⌥',
  Shift: '⇧',
  Enter: '↵',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

const PC_LABELS: Record<string, string> = { Mod: 'Ctrl' };

/**
 * A chord as the user's own keyboard spells it: `⌘⇧F` on macOS, `Ctrl+Shift+F`
 * elsewhere. Rendering `⌘P` on Linux names a key that is not on the keyboard.
 */
export function formatChord(chord: string): string {
  if (!chord) return 'Not set';
  const parts = chord.split('+');
  if (IS_MAC) return parts.map((p) => MAC_SYMBOLS[p] ?? p).join('');
  return parts.map((p) => PC_LABELS[p] ?? p).join('+');
}

/** Enter, spelled the way each platform's users expect to read it. */
export const ENTER = IS_MAC ? '↵' : 'Enter';

/** The action a chord fires, or `null`. Registry order settles duplicates. */
export function actionForChord(
  config: KeybindingsConfig,
  chord: string
): ShortcutAction | null {
  for (const action of SHORTCUT_ACTIONS) {
    if (config[action] && config[action] === chord) return action;
  }
  return null;
}

/** Drop unknown actions and non-string chords from stored config. */
export function coerceKeybindings(raw: unknown): KeybindingsConfig {
  const config = { ...DEFAULT_KEYBINDINGS };
  if (!raw || typeof raw !== 'object') return config;
  for (const action of SHORTCUT_ACTIONS) {
    const value = (raw as Record<string, unknown>)[action];
    if (typeof value !== 'string') continue;
    if (value !== '' && !isBindableChord(value)) continue;
    config[action] = value;
  }
  return config;
}
