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
      // Collapsing changes document height and the position of any sidenotes
      // below it; let the layout-sensitive helpers recompute.
      window.dispatchEvent(new Event('monolith:layout'));
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

  /* ---- 5. Knowls for citations and cross-references --------------------- */

  // Resolve an in-page "#id" href to its element. LaTeXML ids commonly contain
  // '.', which a CSS selector would read as a class separator, so prefer
  // getElementById (literal id) and fall back to querySelector.
  function resolveRef(href) {
    if (!href || href.charAt(0) !== '#') return null;
    var id = href.slice(1);
    return (
      document.getElementById(id) ||
      (function () {
        try {
          return document.querySelector(href);
        } catch (e) {
          return null;
        }
      })()
    );
  }

  function makeKnowl(a) {
    if (a.getAttribute('data-knowl')) return;
    var href = a.getAttribute('href');
    if (!href || href === '#' || !resolveRef(href)) return;
    a.setAttribute('data-knowl', href);
    // Label used by knowl.js for the "Close <label>" button.
    a.setAttribute('data-knowl-label', (a.textContent || '').trim());
    a.classList.add('knowl');
  }

  function setupKnowls() {
    // Bibliography citations: the link points at "#bibX", so expanding shows the
    // bib entry in place.
    document.querySelectorAll('.ltx_cite a.ltx_ref[href^="#"]').forEach(function (a) {
      makeKnowl(a);
    });

    // Other same-document cross-references (theorems, equations, figures,
    // sections …): clicking pops the referenced content inline, with an
    // "in-context" link to jump there instead (see knowl.js).
    document.querySelectorAll('a.ltx_ref[href^="#"]').forEach(function (a) {
      if (a.closest('.ltx_cite')) return; // citations handled above
      // Skip navigation chrome and a block's own number tag — those aren't
      // content cross-references.
      if (a.closest('.monolith-toc, .ltx_TOC, .ltx_page_navbar, .ltx_tag')) return;
      makeKnowl(a);
    });
  }

  /* ---- 6. QED tombstone ------------------------------------------------ */

  // LaTeXML ends a proof with a bare ∎ text node (no element), which CSS can't
  // target. Wrap that glyph in a .ltx_qed span so the stylesheet can float it
  // flush right. If a build already emits an .ltx_qed element, leave it be.
  var QED = '∎'; // ∎
  function setupQed() {
    document.querySelectorAll('.ltx_proof').forEach(function (proof) {
      if (proof.querySelector('.ltx_qed')) return;

      var walker = document.createTreeWalker(proof, NodeFilter.SHOW_TEXT);
      var node, target = null;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.indexOf(QED) !== -1) target = node; // keep the last
      }
      if (!target) return;

      var idx = target.nodeValue.lastIndexOf(QED);
      var mark = target.splitText(idx); // mark starts at the glyph
      mark.splitText(1); // mark is now exactly the glyph

      var span = document.createElement('span');
      span.className = 'ltx_qed';
      span.textContent = QED;
      mark.parentNode.replaceChild(span, mark);

      // Drop the whitespace LaTeXML leaves before the mark so the floated span
      // doesn't ride on a stray trailing space.
      target.nodeValue = target.nodeValue.replace(/\s+$/, '');
    });
  }

  /* ---- 7. Reading-progress bar ---------------------------------------- */

  function setupProgress() {
    var bar = document.createElement('div');
    bar.className = 'monolith-progress';
    document.body.appendChild(bar);

    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var st = window.pageYOffset || doc.scrollTop || document.body.scrollTop || 0;
      var sh = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
      var pct = sh > 0 ? st / sh : 0;
      bar.style.width = Math.max(0, Math.min(1, pct)) * 100 + '%';
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener('monolith:layout', onScroll);
    update();
  }

  /* ---- 8. Heading permalink anchors ----------------------------------- */

  function setupHeadingAnchors() {
    document.querySelectorAll(
      '.ltx_title_section, .ltx_title_subsection, .ltx_title_subsubsection'
    ).forEach(function (h) {
      if (h.querySelector('.monolith-anchor')) return;
      var id = ensureId(h, 'sec');
      var a = document.createElement('a');
      a.className = 'monolith-anchor';
      a.href = '#' + id;
      a.textContent = '¶'; // ¶
      a.title = 'Copy link to this section';
      a.setAttribute('aria-label', 'Link to this section');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + id);
        copyText(location.href.split('#')[0] + '#' + id).then(function () {
          a.classList.add('copied');
          setTimeout(function () { a.classList.remove('copied'); }, 1200);
        }, function () {});
      });
      h.appendChild(a);
    });
  }

  /* ---- 9. Drop-cap lead paragraph ------------------------------------- */

  function tagLeadParagraph(scope) {
    var paras = scope.querySelectorAll('.ltx_p');
    for (var i = 0; i < paras.length; i++) {
      var p = paras[i];
      var text = (p.textContent || '').trim();
      // A drop cap only reads well leading a substantial, letter-initial line.
      if (text.length < 60 || !/^[A-Za-z]/.test(text)) continue;
      if (p.closest('.ltx_theorem, .ltx_proof, .ltx_caption, .ltx_abstract, .ltx_bibliography')) {
        continue;
      }
      p.classList.add('monolith-lead');
      return;
    }
  }

  function setupDropCaps() {
    var sections = document.querySelectorAll('.ltx_section');
    if (sections.length) {
      sections.forEach(function (sec) { tagLeadParagraph(sec); });
    } else {
      tagLeadParagraph(document.querySelector('article.ltx_document') || document.body);
    }
  }

  /* ---- 10. Cross-reference hover previews ----------------------------- */

  function setupRefPreviews() {
    var links = document.querySelectorAll('a.ltx_ref[href^="#"]');
    if (!links.length) return;

    var pop = document.createElement('div');
    pop.className = 'monolith-refpop';
    document.body.appendChild(pop);

    var showTimer = null, hideTimer = null, current = null;

    function build(target) {
      while (pop.firstChild) pop.removeChild(pop.firstChild);
      var src = target;
      // Sectioning targets are whole sections — preview just their heading.
      if (target.tagName === 'SECTION' ||
          /\bltx_(sub)*section\b|\bltx_paragraph\b/.test(target.className)) {
        var heading = target.querySelector('.ltx_title');
        if (heading) src = heading;
      }
      var clone = src.cloneNode(true);
      clone.querySelectorAll('.monolith-anchor, .monolith-copy-tex')
        .forEach(function (n) { n.remove(); });
      // Drop any title="" attrs so the browser's native tooltip can't pop over
      // the preview from inside it.
      if (clone.removeAttribute) clone.removeAttribute('title');
      clone.querySelectorAll('[title]').forEach(function (n) { n.removeAttribute('title'); });
      pop.appendChild(clone);
    }

    function place(link) {
      var r = link.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
      var below = r.bottom + 8;
      var top = (below + ph <= window.innerHeight || r.top < ph + 16)
        ? below
        : r.top - 8 - ph;
      pop.style.left = left + 'px';
      pop.style.top = Math.max(8, top) + 'px';
    }

    function show(link) {
      var sel = link.getAttribute('href');
      var target = sel && document.getElementById(sel.replace(/^#/, ''));
      if (!target) return;
      current = link;
      build(target);
      pop.classList.add('open');
      place(link);
    }

    function hide() { pop.classList.remove('open'); current = null; }

    links.forEach(function (link) {
      if (link.closest('.ltx_cite') || link.closest('.monolith-toc')) return;
      // The custom preview replaces LaTeXML's title="" hint; drop the native
      // attribute so its browser tooltip doesn't obstruct the popover.
      link.removeAttribute('title');
      link.addEventListener('mouseenter', function () {
        clearTimeout(hideTimer);
        showTimer = setTimeout(function () { show(link); }, 140);
      });
      link.addEventListener('mouseleave', function () {
        clearTimeout(showTimer);
        hideTimer = setTimeout(hide, 220);
      });
    });

    pop.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    pop.addEventListener('mouseleave', function () { hideTimer = setTimeout(hide, 180); });
    window.addEventListener('scroll', function () { if (current) hide(); }, { passive: true });
    // A click opens the pinned inline knowl; dismiss the transient peek so the
    // two previews don't overlap.
    window.addEventListener('monolith:knowl', function () { clearTimeout(showTimer); hide(); });
  }

  /* ---- 11. Tufte-style sidenotes -------------------------------------- */

  function buildSidenotes() {
    var container = document.querySelector('article.ltx_document') ||
      document.querySelector('.ltx_page_content');
    if (!container) return;

    container.querySelectorAll('.monolith-sidenote').forEach(function (n) { n.remove(); });

    var notes = document.querySelectorAll('.ltx_note.ltx_role_footnote');
    if (!notes.length) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    var contRect = container.getBoundingClientRect();
    var SIDE_W = 13 * 16, GAP = 1.6 * 16;
    // Only float into the margin when there's actually room to the right of the
    // content column; otherwise leave LaTeXML's default hover popups in place.
    if (window.innerWidth - contRect.right < SIDE_W + GAP + 8) return;

    var prevBottom = -Infinity;
    notes.forEach(function (note) {
      var mark = note.querySelector('.ltx_note_mark');
      var content = note.querySelector('.ltx_note_content');
      if (!mark || !content) return;

      var aside = document.createElement('aside');
      aside.className = 'monolith-sidenote';

      var num = (mark.textContent || '').trim();
      if (num) {
        var numEl = document.createElement('span');
        numEl.className = 'monolith-sidenote-num';
        numEl.textContent = num;
        aside.appendChild(numEl);
      }
      var body = content.cloneNode(true);
      body.querySelectorAll('.ltx_note_mark, .ltx_tag_note').forEach(function (n) { n.remove(); });
      while (body.firstChild) aside.appendChild(body.firstChild);

      container.appendChild(aside);

      var top = Math.max(mark.getBoundingClientRect().top - contRect.top, prevBottom + 12);
      aside.style.top = top + 'px';
      prevBottom = top + aside.offsetHeight;
    });
  }

  function setupSidenotes() {
    var raf = null;
    function schedule() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { try { buildSidenotes(); } catch (e) {} });
    }
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(schedule, 150);
    });
    window.addEventListener('monolith:layout', schedule);
    window.addEventListener('load', schedule);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule).catch(function () {});
    }
    schedule();
  }

  /* ---- boot ------------------------------------------------------------ */

  function init() {
    try { buildToc(); } catch (e) {}
    try { setupCollapsibles(); } catch (e) {}
    try { setupCopyTex(); } catch (e) {}
    try { setupKnowls(); } catch (e) {}
    try { setupQed(); } catch (e) {}
    try { setupProgress(); } catch (e) {}
    try { setupHeadingAnchors(); } catch (e) {}
    try { setupDropCaps(); } catch (e) {}
    try { setupRefPreviews(); } catch (e) {}
    try { setupSidenotes(); } catch (e) {}
    announceReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
