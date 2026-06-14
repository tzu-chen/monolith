/*
 * monolith-theme.js — progressive enhancement for the LaTeXML HTML preview.
 *
 * Runs inside the preview iframe. It never depends on a build step and degrades
 * gracefully: if the LaTeXML markup differs from what a helper expects, that
 * helper simply no-ops. Responsibilities:
 *
 *   1. Theme sync   — apply CSS variables forwarded by the Monolith app so the
 *                     HTML preview tracks the editor's active colour scheme.
 *   2. Floating TOC — build a sticky sidebar from section headings.
 *   3. Collapsibles — make theorem/proof blocks expand/collapse (state saved).
 *   4. Copy-LaTeX   — a button on each display equation copies its TeX source.
 *   5. Knowls       — turn citations into inline-expandable references.
 */
(function () {
  'use strict';

  /* ---- 1. Theme sync --------------------------------------------------- */

  function applyTheme(msg) {
    if (!msg || typeof msg !== 'object') return;
    var root = document.documentElement;
    if (msg.theme) root.setAttribute('data-theme', msg.theme);
    if (msg.vars && typeof msg.vars === 'object') {
      for (var key in msg.vars) {
        if (Object.prototype.hasOwnProperty.call(msg.vars, key)) {
          root.style.setProperty(key, msg.vars[key]);
        }
      }
    }
  }

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (data && data.type === 'monolith-theme') applyTheme(data);
  });

  function announceReady() {
    // Ask the parent for the current theme (covers the case where the parent's
    // initial post landed before this listener was attached).
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'monolith-ready' }, '*');
      } catch (e) {
        /* cross-origin — ignore */
      }
    }
  }

  /* ---- helpers --------------------------------------------------------- */

  var slugCount = 0;
  function ensureId(el, prefix) {
    if (!el.id) el.id = (prefix || 'ml') + '-' + ++slugCount;
    return el.id;
  }

  /* ---- 2. Floating table of contents ----------------------------------- */

  function buildToc() {
    // Multi-page (split) output already has LaTeXML's own navigation bar.
    if (document.querySelector('.ltx_page_navbar')) return;

    var headings = document.querySelectorAll(
      '.ltx_title_section, .ltx_title_subsection'
    );
    if (headings.length < 2) return;

    var nav = document.createElement('nav');
    nav.className = 'monolith-toc';
    var title = document.createElement('div');
    title.className = 'monolith-toc-title';
    title.textContent = 'Contents';
    nav.appendChild(title);

    var links = [];
    headings.forEach(function (h) {
      var id = ensureId(h, 'sec');
      var a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = (h.textContent || '').trim();
      a.className = h.classList.contains('ltx_title_subsection') ? 'lvl-2' : 'lvl-1';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + id);
      });
      nav.appendChild(a);
      links.push({ id: id, el: a });
    });

    document.body.appendChild(nav);

    // Highlight the heading nearest the top of the viewport.
    if ('IntersectionObserver' in window) {
      var visible = {};
      var byId = {};
      links.forEach(function (l) { byId[l.id] = l.el; });
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            visible[entry.target.id] = entry.isIntersecting;
          });
          var current = null;
          headings.forEach(function (h) {
            if (visible[h.id] && !current) current = h.id;
          });
          links.forEach(function (l) {
            l.el.classList.toggle('active', l.id === current);
          });
        },
        { rootMargin: '0px 0px -75% 0px', threshold: 0 }
      );
      headings.forEach(function (h) { observer.observe(h); });
    }
  }

  /* ---- 3. Collapsible theorem / proof blocks --------------------------- */

  function storageKey(id) {
    return 'ml-collapse:' + location.pathname + ':' + id;
  }

  function makeCollapsible(block, defaultOpen) {
    if (block.dataset.mlCollapse) return;

    var titleEl = block.querySelector(':scope > .ltx_title');
    if (!titleEl) return; // nothing to use as a clickable handle
    block.dataset.mlCollapse = '1';

    var id = ensureId(block, 'blk');

    var head = document.createElement('div');
    head.className = 'monolith-collapse-head';
    var chevron = document.createElement('span');
    chevron.className = 'monolith-chevron';
    chevron.textContent = '▾'; // ▾
    var label = document.createElement('span');
    label.className = 'monolith-collapse-label';
    for (var i = 0; i < titleEl.childNodes.length; i++) {
      label.appendChild(titleEl.childNodes[i].cloneNode(true));
    }
    head.appendChild(chevron);
    head.appendChild(label);

    var body = document.createElement('div');
    body.className = 'monolith-collapse-body';
    while (block.firstChild) body.appendChild(block.firstChild);
    if (titleEl) titleEl.style.display = 'none'; // it's now first inside body

    block.appendChild(head);
    block.appendChild(body);

    var stored = null;
    try { stored = localStorage.getItem(storageKey(id)); } catch (e) {}
    var open = stored === null ? defaultOpen !== false : stored === 'open';
    block.classList.toggle('monolith-collapsed', !open);

    head.addEventListener('click', function () {
      var nowCollapsed = block.classList.toggle('monolith-collapsed');
      try {
        localStorage.setItem(storageKey(id), nowCollapsed ? 'closed' : 'open');
      } catch (e) {}
    });
  }

  function setupCollapsibles() {
    document.querySelectorAll('.ltx_theorem').forEach(function (b) {
      makeCollapsible(b, true);
    });
    document.querySelectorAll('.ltx_proof').forEach(function (b) {
      makeCollapsible(b, true);
    });
  }

  /* ---- 4. Copy-LaTeX on display equations ------------------------------ */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  function setupCopyTex() {
    document.querySelectorAll('.ltx_equation').forEach(function (eq) {
      if (eq.dataset.mlCopy) return;
      // LaTeXML keeps the original TeX in the MathML annotation.
      var annotation = eq.querySelector('annotation[encoding="application/x-tex"]');
      var tex = annotation && annotation.textContent ? annotation.textContent.trim() : '';
      if (!tex) return;
      eq.dataset.mlCopy = '1';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'monolith-copy-tex';
      btn.textContent = 'copy TeX';
      btn.title = 'Copy LaTeX source';
      btn.addEventListener('click', function () {
        copyText(tex).then(function () {
          btn.textContent = 'copied';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = 'copy TeX';
            btn.classList.remove('copied');
          }, 1400);
        });
      });
      eq.appendChild(btn);
    });
  }

  /* ---- 5. Knowls for citations ----------------------------------------- */

  function setupKnowls() {
    // Turn bibliography citations into inline-expandable references: the link
    // already points at "#bibX", so expanding shows the bib entry in place.
    document.querySelectorAll('.ltx_cite a.ltx_ref[href^="#"]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || !document.querySelector(href)) return;
      a.setAttribute('data-knowl', href);
      a.classList.add('knowl');
    });
  }

  /* ---- boot ------------------------------------------------------------ */

  function init() {
    try { buildToc(); } catch (e) {}
    try { setupCollapsibles(); } catch (e) {}
    try { setupCopyTex(); } catch (e) {}
    try { setupKnowls(); } catch (e) {}
    announceReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
