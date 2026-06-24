/*
 * knowl.js — minimal, dependency-free "knowl" (inline expansion) implementation
 * for the Monolith LaTeXML HTML preview.
 *
 * A knowl is a trigger element carrying `data-knowl="<id-or-selector>"`. Clicking
 * it toggles an inline panel, just after the trigger, showing a clone of the
 * referenced element's content — so following a cross-reference, citation or
 * footnote expands the target in place instead of jumping away (PreTeXt-style).
 *
 * The panel carries two affordances:
 *   • "in-context" — a link that scrolls to the actual target in the document
 *     (and briefly highlights it) for readers who do want to go there.
 *   • a "Close <label>" button, revealed on hover, where <label> is taken from
 *     the trigger (`data-knowl-label`, e.g. "Theorem 1.2.6" or "[48]").
 *
 * This is intentionally same-document only (no network fetch): monolith-theme.js
 * tags the relevant LaTeXML elements with data-knowl pointing at in-page ids.
 */
(function () {
  'use strict';

  function resolve(sel) {
    if (!sel) return null;
    var id = sel.charAt(0) === '#' ? sel.slice(1) : sel;
    // Ids emitted by LaTeXML routinely contain '.', which a CSS selector reads
    // as a class separator; getElementById takes the literal id, so prefer it
    // and fall back to querySelector for genuine selectors.
    return (
      document.getElementById(id) ||
      (function () {
        try {
          return document.querySelector(sel);
        } catch (e) {
          return null;
        }
      })()
    );
  }

  // A sectioning target is a whole section — far too much to inline. Preview just
  // its heading. Other targets (theorems, equations, figures, bib items …) are
  // self-contained and shown whole.
  function contentSource(target) {
    if (
      target.tagName === 'SECTION' ||
      /\bltx_(sub)*section\b|\bltx_paragraph\b/.test(target.className || '')
    ) {
      var heading = target.querySelector('.ltx_title');
      if (heading) return heading;
    }
    return target;
  }

  function flash(el) {
    if (!el) return;
    el.classList.remove('monolith-target-flash');
    // Force reflow so re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add('monolith-target-flash');
    setTimeout(function () {
      el.classList.remove('monolith-target-flash');
    }, 1700);
  }

  // Jump to the real location of a knowl's target: scroll it into view, update
  // the URL hash, and flash it so the eye lands on the right place.
  function gotoTarget(target) {
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      target.scrollIntoView();
    }
    if (target.id) {
      try {
        history.replaceState(null, '', '#' + target.id);
      } catch (e) {
        /* ignore (e.g. sandboxed history) */
      }
    }
    flash(target);
  }

  function close(trigger) {
    var out = trigger.__knowlOutput;
    if (!out) return;
    out.classList.remove('knowl-open');
    trigger.classList.remove('knowl-open');
    var node = out;
    setTimeout(function () {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }, 240);
    trigger.__knowlOutput = null;
  }

  function open(trigger) {
    var target = resolve(trigger.getAttribute('data-knowl'));
    if (!target) return;

    // The inline panel supersedes any transient hover popover for the same link.
    try {
      window.dispatchEvent(new Event('monolith:knowl'));
    } catch (e) {
      /* ignore */
    }

    var output = document.createElement('div');
    output.className = 'knowl-output';

    // Close affordance — floats top-right, labelled with the reference so it
    // reads "Close Theorem 1.2.6" / "Close [48]".
    var label = (
      trigger.getAttribute('data-knowl-label') ||
      trigger.textContent ||
      ''
    ).trim();
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'knowl-close';
    closeBtn.textContent = label ? 'Close ' + label : 'Close';
    closeBtn.setAttribute('aria-label', closeBtn.textContent);
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      close(trigger);
    });
    output.appendChild(closeBtn);

    var content = document.createElement('div');
    content.className = 'knowl-content';
    // Deep-clone the whole live target rather than round-tripping innerHTML:
    // safer (no HTML re-parse) and preserves MathML / table structure / attrs
    // faithfully (a bare <tr> lifted out of its <table> would not render).
    var src = contentSource(target);
    var clone = src.cloneNode(true);
    // Drop the id so the clone doesn't duplicate the live element's id.
    if (clone.removeAttribute) clone.removeAttribute('id');
    // Remove injected chrome that's meaningless or duplicated inside the clone…
    var chrome = clone.querySelectorAll(
      '.monolith-anchor, .monolith-copy-tex, .knowl-close, .knowl-footer, .knowl-output'
    );
    for (var j = 0; j < chrome.length; j++) chrome[j].remove();
    // …and native tooltips, so they can't pop over the panel from inside it.
    if (clone.removeAttribute) clone.removeAttribute('title');
    var titled = clone.querySelectorAll('[title]');
    for (var k = 0; k < titled.length; k++) titled[k].removeAttribute('title');
    content.appendChild(clone);
    output.appendChild(content);

    // Footer carrying the "in-context" jump link.
    var footer = document.createElement('div');
    footer.className = 'knowl-footer';
    var inCtx = document.createElement('a');
    inCtx.className = 'knowl-incontext';
    inCtx.href = target.id ? '#' + target.id : '#';
    inCtx.textContent = 'in-context';
    inCtx.title = 'Jump to this in the document';
    inCtx.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      close(trigger);
      gotoTarget(target);
    });
    footer.appendChild(inCtx);
    output.appendChild(footer);

    // Insert after the nearest block-ish ancestor of the trigger so the panel
    // doesn't break inline flow awkwardly; fall back to right after the trigger.
    var anchor = trigger.closest('p, .ltx_p, li, .ltx_item, dd, .ltx_para') || trigger;
    anchor.parentNode.insertBefore(output, anchor.nextSibling);

    trigger.__knowlOutput = output;
    trigger.classList.add('knowl-open');
    // next frame so the CSS transition runs
    requestAnimationFrame(function () {
      output.classList.add('knowl-open');
    });
  }

  function toggle(trigger) {
    if (trigger.__knowlOutput) {
      close(trigger);
    } else {
      open(trigger);
    }
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest ? e.target.closest('[data-knowl]') : null;
    if (!trigger) return;
    e.preventDefault();
    toggle(trigger);
  });

  // Tiny public hook in case the theme script wants to drive it directly.
  window.Knowl = { toggle: toggle, open: open, close: close, goto: gotoTarget };
})();
