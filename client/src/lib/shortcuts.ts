/**
 * Keyboard shortcut labels.
 *
 * The bindings themselves accept either modifier (`e.metaKey || e.ctrlKey`,
 * CodeMirror's `Mod-`), so only the *label* is platform-specific. Rendering
 * `⌘P` on Linux or Windows is worse than useless — it names a key that is not
 * on the keyboard.
 */

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');

/**
 * Format a shortcut for display: `mod('P')` → `⌘P` on macOS, `Ctrl+P`
 * elsewhere. Pass `shift` for chords like the project switcher.
 */
export function mod(key: string, opts: { shift?: boolean } = {}): string {
  if (IS_MAC) return `${opts.shift ? '⌘⇧' : '⌘'}${key}`;
  return `Ctrl+${opts.shift ? 'Shift+' : ''}${key}`;
}

/** The modifier's own name, for prose like "Ctrl-click a macro". */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

/** Enter, spelled the way each platform's users expect to read it. */
export const ENTER = IS_MAC ? '↵' : 'Enter';

/** Shift+Enter, for the expanded-completion hint. */
export const SHIFT_ENTER = IS_MAC ? '⇧↵' : 'Shift+Enter';
