/*
 * knowl.js — minimal, dependency-free "knowl" (inline expansion) implementation
 * for the Monolith LaTeXML HTML preview.
 *
 * A knowl is a trigger element carrying `data-knowl="<css-selector>"`. Clicking
 * it toggles an inline panel, just after the trigger, showing a clone of the
 * referenced element's content — so following a cross-reference, citation or
 * footnote expands the target in place instead of jumping away.
 *
 * This is intentionally same-document only (no network fetch): monolith-theme.js
 * tags the relevant LaTeXML elements with data-knowl pointing at in-page ids.
 */
(function () {
  'use strict';

  function resolve(sel) {
    if (!sel) return null;
    try {
      // Allow either "#id" / selector, or a bare id.
      return document.querySelector(sel) || document.getElementById(sel.replace(/^#/, ''));
    } catch (e) {
      return null;
    }
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

    var output = document.createElement('div');
    output.className = 'knowl-output';
    var content = document.createElement('div');
    content.className = 'knowl-content';
    // Deep-clone the live target node rather than round-tripping innerHTML:
    // safer (no HTML re-parse) and preserves MathML / attributes faithfully.
    for (var i = 0; i < target.childNodes.length; i++) {
      content.appendChild(target.childNodes[i].cloneNode(true));
    }
    output.appendChild(content);

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
  window.Knowl = { toggle: toggle, open: open, close: close };
})();
