import { Facet, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  hoverTooltip,
  type Tooltip,
} from '@codemirror/view';
import katex from 'katex';
import type { ScopeGraph, ScopeMacro } from '../../lib/scope-api';

/**
 * Scope-driven editor decorations.
 *
 * Two things the tokenizer cannot know on its own, because both depend on the
 * resolved scope graph rather than on the text in front of it:
 *
 *   - user-defined macros, drawn in the macro colour with a dotted underline
 *     that marks them as Mod-clickable;
 *   - citation keys that name nothing in the project's .bib files, drawn in the
 *     error colour with a dotted underline.
 *
 * Hovering a macro (or Mod-clicking it) opens the definition popover: what it
 * expands to, what that renders as, and where it came from.
 */

export const scopeFacet = Facet.define<ScopeGraph | null, ScopeGraph | null>({
  combine: (values) => values[0] ?? null,
});

/** Called when the user asks to jump to a definition. */
export const goToDefinitionFacet = Facet.define<
  (file: string, line: number) => void,
  (file: string, line: number) => void
>({
  combine: (values) => values[0] ?? (() => {}),
});

const macroMark = Decoration.mark({ class: 'cm-macro-token' });
const brokenCiteMark = Decoration.mark({ class: 'cm-broken-cite' });

const MACRO_TOKEN = /\\([a-zA-Z@]+)/g;
const CITE_CALL = /\\(?:cite|citep|citet|citealp|citealt|citeauthor|citeyear|autocite|parencite|textcite)\s*(?:\[[^\]]*\])*\s*\{([^}]*)\}/g;

function buildDecorations(view: EditorView): DecorationSet {
  const scope = view.state.facet(scopeFacet);
  const builder = new RangeSetBuilder<Decoration>();
  if (!scope) return builder.finish();

  const macroNames = new Set(scope.macros.map((m) => m.name));
  const bibKeys = new Set(scope.bibKeys);
  // With no .bib in the project there is nothing to be missing from — flagging
  // every key would be noise, not information.
  const checkCites = bibKeys.size > 0;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    // Collect first, emit in order: RangeSetBuilder requires sorted input and
    // the two scans interleave.
    const marks: { from: number; to: number; deco: Decoration }[] = [];

    MACRO_TOKEN.lastIndex = 0;
    for (const m of text.matchAll(MACRO_TOKEN)) {
      if (!macroNames.has(m[1])) continue;
      const start = from + (m.index ?? 0);
      marks.push({ from: start, to: start + m[0].length, deco: macroMark });
    }

    if (checkCites) {
      CITE_CALL.lastIndex = 0;
      for (const m of text.matchAll(CITE_CALL)) {
        const keyList = m[1];
        const listStart = from + (m.index ?? 0) + m[0].indexOf(keyList, m[0].lastIndexOf('{'));
        let offset = 0;
        for (const part of keyList.split(',')) {
          const key = part.trim();
          if (key && !bibKeys.has(key)) {
            const keyStart = listStart + offset + part.indexOf(key);
            marks.push({ from: keyStart, to: keyStart + key.length, deco: brokenCiteMark });
          }
          offset += part.length + 1;
        }
      }
    }

    marks.sort((a, b) => a.from - b.from || a.to - b.to);
    for (const mark of marks) builder.add(mark.from, mark.to, mark.deco);
  }

  return builder.finish();
}

export const scopeDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.facet(scopeFacet) !== update.state.facet(scopeFacet)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ── Definition popover (handoff S4) ──

/** The macro token under `pos`, if there is one in scope. */
function macroAt(view: EditorView, pos: number): { macro: ScopeMacro; from: number; to: number } | null {
  const scope = view.state.facet(scopeFacet);
  if (!scope) return null;
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  MACRO_TOKEN.lastIndex = 0;
  for (const m of text.matchAll(MACRO_TOKEN)) {
    const from = line.from + (m.index ?? 0);
    const to = from + m[0].length;
    if (pos < from || pos > to) continue;
    const macro = scope.macros.find((x) => x.name === m[1]);
    if (macro) return { macro, from, to };
  }
  return null;
}

function el(tag: string, className: string, style: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.setAttribute('style', style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const ROW = 'display:flex;align-items:center;gap:8px;padding:7px 12px;white-space:nowrap';
const DIVIDER = 'border-top:1px solid var(--line)';

function buildPopover(view: EditorView, macro: ScopeMacro): HTMLElement {
  const root = el('div', 'cm-macro-popover', 'width:340px;font-family:\'DM Sans\',system-ui,sans-serif;font-size:16px;color:var(--text)');

  // 1 — name, arity, provenance
  const head = el('div', '', ROW);
  head.appendChild(el('span', '', "font-family:'Source Code Pro',monospace;color:var(--accent)", `\\${macro.name}`));
  if (macro.arity > 0) {
    head.appendChild(el('span', '', 'font-size:15.5px;color:var(--text-faint)', `${macro.arity} arg${macro.arity === 1 ? '' : 's'}`));
  }
  const provenance = el(
    'span',
    '',
    `margin-left:auto;border:1px solid ${macro.overrides ? 'var(--error)' : 'var(--line)'};border-radius:5px;padding:1px 7px;font-size:15.5px;color:${macro.overrides ? 'var(--error)' : 'var(--text-faint)'}`,
    macro.overrides ? `overrides ${macro.overrides}` : 'yours'
  );
  head.appendChild(provenance);
  root.appendChild(head);

  // 2 — the definition, verbatim
  const definition = el(
    'div',
    '',
    `${DIVIDER};padding:7px 12px;font-family:'Source Code Pro',monospace;font-size:16px;color:var(--text-muted);white-space:pre-wrap;word-break:break-word`,
    macro.definition
  );
  root.appendChild(definition);

  // 3 — what it renders as
  const rendersRow = el('div', '', `${DIVIDER};padding:7px 12px;display:flex;align-items:center;gap:10px`);
  rendersRow.appendChild(
    el('span', '', 'font-size:15.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--text-faint)', 'Renders')
  );
  const rendered = el('span', '', 'font-family:Georgia,serif;font-size:20px;color:var(--text)');
  try {
    // Expand the macro itself, feeding placeholder arguments so an n-ary macro
    // renders as its shape rather than as an error.
    const args = Array.from({ length: macro.arity }, (_, i) => `{n_{${i + 1}}}`).join('');
    katex.render(`\\${macro.name}${args}`, rendered, {
      throwOnError: false,
      displayMode: false,
      macros: { [`\\${macro.name}`]: macro.body },
    });
  } catch {
    rendered.textContent = macro.body || '—';
  }
  rendersRow.appendChild(rendered);
  root.appendChild(rendersRow);

  // 4 — where it lives, and what it costs to change
  const foot = el('div', '', `${DIVIDER};${ROW}`);
  foot.appendChild(
    el('span', '', "font-family:'Source Code Pro',monospace;font-size:15.5px;color:var(--text-faint)", `${macro.source.file}:${macro.source.line}`)
  );
  const goTo = el(
    'button',
    '',
    'margin-left:auto;border:1px solid var(--line);border-radius:5px;padding:3px 9px;font-size:16px;color:var(--text-muted);background:transparent;cursor:pointer;font-family:inherit',
    'Go to definition'
  );
  goTo.onclick = () => {
    view.state.facet(goToDefinitionFacet)(macro.source.file, macro.source.line);
  };
  foot.appendChild(goTo);
  foot.appendChild(
    el('span', '', 'font-size:15.5px;color:var(--text-faint)', `${macro.uses} use${macro.uses === 1 ? '' : 's'}`)
  );
  root.appendChild(foot);

  return root;
}

export const macroTooltip = hoverTooltip((view, pos): Tooltip | null => {
  const hit = macroAt(view, pos);
  if (!hit) return null;
  return {
    pos: hit.from,
    end: hit.to,
    above: true,
    create: () => ({ dom: buildPopover(view, hit.macro) }),
  };
});

/**
 * Mod-click (Ctrl, or Cmd on macOS) a macro to jump to its definition. Returns false for anything
 * else so the SyncTeX handler downstream still gets modifier-clicks in prose.
 *
 * Handled on mousedown, but `click` fires afterwards regardless of what we
 * return — so a handled jump is recorded and the matching click swallowed,
 * otherwise the same gesture would also forward-sync the PDF.
 */
let consumedClick = false;

/** True when the click that follows belongs to a macro jump already performed. */
export function claimMacroClick(): boolean {
  if (!consumedClick) return false;
  consumedClick = false;
  return true;
}

export const macroClickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    if (!event.metaKey && !event.ctrlKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const hit = macroAt(view, pos);
    if (!hit) return false;
    event.preventDefault();
    consumedClick = true;
    view.state.facet(goToDefinitionFacet)(hit.macro.source.file, hit.macro.source.line);
    return true;
  },
});
