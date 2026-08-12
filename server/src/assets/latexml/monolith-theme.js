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

  // LaTeXML renders every tombstone — the one \end{proof} adds, an explicit
  // \qed, \qedsymbol, \openbox — as a bare ∎ text node with no element of its
  // own, which CSS can't target. Wrap each one in a .ltx_qed span so the
  // stylesheet can colour it and float it flush right, wherever it lands: at
  // the end of a proof, inside a theorem, or in a plain paragraph. \qedhere
  // instead leaves the glyph as a trailing <mo> inside the display's MathML,
  // where it rides along centred with the formula; that one is lifted out onto
  // the equation row so it reaches the right margin like the rest.
  var QED = '∎'; // ∎
  // Verbatim/listing text is quoted source, not markup we should rewrite, and
  // the TOC is chrome. An .ltx_qed a build already emitted is left alone.
  var QED_SKIP =
    '.ltx_qed, .monolith-toc, .ltx_verbatim, .ltx_listing, .ltx_lstlisting, ' +
    'pre, code, script, style';

  function qedMark() {
    var span = document.createElement('span');
    span.className = 'ltx_qed';
    span.textContent = QED;
    return span;
  }

  // Replace every ∎ in one text node with a .ltx_qed span.
  function wrapQedIn(node) {
    var idx;
    while (node && (idx = node.nodeValue.indexOf(QED)) !== -1) {
      var mark = node.splitText(idx); // mark starts at the glyph
      var rest = mark.splitText(1); // mark is now exactly the glyph
      mark.parentNode.replaceChild(qedMark(), mark);
      // Drop the whitespace LaTeXML leaves before the mark so the floated span
      // doesn't ride on a stray trailing space.
      node.nodeValue = node.nodeValue.replace(/\s+$/, '');
      node = rest;
    }
  }

  function wrapTextQed(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (node.nodeValue.indexOf(QED) === -1) return NodeFilter.FILTER_REJECT;
        var parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Glyphs inside math are handled by hoistMathQed below.
        if (parent.closest('math') || parent.closest(QED_SKIP)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    // Collect first: wrapping splits the node the walker is standing on.
    var nodes = [], node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(wrapQedIn);
  }

  // The right-hand spacer cell of a display equation's row. LaTeXML centres a
  // display by padding it with two 50%-wide cells and parks the equation number
  // in a zero-width cell after them, so the spacer's right edge is the display's
  // right margin — exactly where \qedhere puts the mark in print.
  function eqnQedCell(math) {
    var row = math.closest('tr.ltx_eqn_row');
    return row ? row.querySelector('td.ltx_eqn_center_padright') : null;
  }

  // Drop a token from the MathML, along with any wrapper row it just emptied.
  function pruneToken(tok) {
    var parent = tok.parentNode;
    parent.removeChild(tok);
    while (
      parent &&
      parent.localName === 'mrow' &&
      parent.children.length === 0 &&
      parent.parentNode
    ) {
      var grandparent = parent.parentNode;
      grandparent.removeChild(parent);
      parent = grandparent;
    }
  }

  function hoistMathQed() {
    document.querySelectorAll('math').forEach(function (math) {
      var text = math.textContent.replace(/\s+$/, '');
      if (text.charAt(text.length - 1) !== QED) return; // only a trailing mark

      var tok = null;
      math.querySelectorAll('mo, mi, mtext').forEach(function (el) {
        if (el.textContent.replace(/\s+/g, '') === QED) tok = el; // keep the last
      });
      if (!tok) return;

      var cell = eqnQedCell(math);
      if (!cell) {
        // Inline math (or a display we can't place into): leave the glyph where
        // it sits and settle for the accent colour, upright — LaTeXML sets the
        // whole formula in italic, but the tombstone is a symbol.
        var cls = (tok.getAttribute('class') || '')
          .replace(/\bltx_mathvariant_italic\b/, '')
          .trim();
        tok.setAttribute('class', cls ? cls + ' ltx_qed' : 'ltx_qed');
        tok.setAttribute('mathvariant', 'normal');
        return;
      }
      pruneToken(tok);
      cell.appendChild(qedMark());
    });
  }

  // An equation number lives in a zero-width cell and hangs leftwards off the
  // right margin, i.e. over the very strip a hoisted mark aligns to. Reserve the
  // number's width so the mark sits just inside it, as \qedhere does in print.
  function offsetQedFromEqno() {
    document.querySelectorAll('.ltx_eqn_cell > span.ltx_qed').forEach(function (mark) {
      var row = mark.closest('tr.ltx_eqn_row');
      var tag = row && row.querySelector('.ltx_eqn_eqno .ltx_tag');
      var width = tag ? tag.offsetWidth : 0;
      // Unnumbered rows keep the mark flush with the margin.
      mark.style.marginRight = width ? 'calc(' + width + 'px + 0.5em)' : '';
    });
  }

  function setupQed() {
    wrapTextQed(document.body);
    hoistMathQed();
    offsetQedFromEqno();
    // Equation numbers are set in the body face; re-measure once it has loaded.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(function () { offsetQedFromEqno(); })
        .catch(function () {});
    }

    // A mark that doesn't fit on its paragraph's last line floats down to a line
    // of its own, where it would escape the paragraph box and collide with what
    // follows. Let the enclosing block clear it.
    document.querySelectorAll('span.ltx_qed').forEach(function (span) {
      if (span.closest('.ltx_eqn_cell')) return; // hoisted marks don't float
      var host = span.closest(
        '.ltx_para, .ltx_proof, .ltx_theorem, li, blockquote, .ltx_caption'
      );
      if (!host) return;
      host.classList.add('monolith-qed-host');
      // A list item's body is shrink-wrapped, so the float would stop at the
      // text; the stylesheet stretches an item that carries a mark.
      var item = span.closest('li.ltx_item');
      if (item) item.classList.add('monolith-qed-item');
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

  // Contexts where a cap would be decoration on something that isn't running
  // prose: a numbered statement, a caption, a list item, code, a table cell.
  var LEAD_EXCLUDE =
    '.ltx_theorem, .ltx_proof, .ltx_caption, .ltx_abstract, .ltx_bibliography, ' +
    '.ltx_item, .ltx_listing, .ltx_verbatim, .ltx_quote, .ltx_note, .ltx_tabular, ' +
    '.ltx_figure, .ltx_table, .monolith-refpop, .knowl-output';

  // The rendered cap is two lines tall, so the paragraph must be able to fill
  // two lines at the article's measure — otherwise the capital hangs past the
  // end of its own text. Roughly 90 characters set a line here.
  var LEAD_MIN_CHARS = 200;

  /**
   * First text node under `el` that carries a non-space character, or null.
   * This is the node the cap is cut from.
   */
  function firstTextNode(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (/\S/.test(node.data)) return node;
    }
    return null;
  }

  function tagLeadParagraph(scope) {
    var paras = scope.querySelectorAll('.ltx_p');
    for (var i = 0; i < paras.length; i++) {
      var p = paras[i];
      if ((p.textContent || '').trim().length < LEAD_MIN_CHARS) continue;
      if (p.closest(LEAD_EXCLUDE)) continue;
      // A cap has to be cut from a letter of prose. A paragraph opening with
      // math ("$V$ is a Banach space…") has a letter in its textContent, but
      // that letter is a variable inside <math> — enlarging it would wreck the
      // formula — so require the leading text to be real prose.
      var first = firstTextNode(p);
      if (!first || !/^\s*[A-Za-z]/.test(first.data)) continue;
      if (first.parentElement && first.parentElement.closest('math')) continue;
      p.classList.add('monolith-lead');
      return;
    }
  }

  /**
   * Distance from `el`'s content-box top down to its first line's baseline.
   *
   * A zero-sized inline-block sits with its bottom margin edge exactly on the
   * baseline of the line it joins, and being zero-sized it cannot disturb that
   * line — so it reads the baseline of whatever font actually rendered, which
   * is the only way to place a cap correctly when the family in use may be any
   * of the fallbacks in `--ml-serif`.
   */
  function baselineOffset(el) {
    var probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;';
    el.insertBefore(probe, el.firstChild);
    var cs = getComputedStyle(el);
    var top =
      el.getBoundingClientRect().top +
      parseFloat(cs.borderTopWidth || 0) +
      parseFloat(cs.paddingTop || 0);
    var base = probe.getBoundingClientRect().bottom;
    probe.parentNode.removeChild(probe);
    return base - top;
  }

  /** Cap height (as a fraction of the em) of the font `el` renders in. */
  function capHeightRatio(el) {
    try {
      var cs = getComputedStyle(el);
      var ctx = capHeightRatio._ctx;
      if (!ctx) ctx = capHeightRatio._ctx = document.createElement('canvas').getContext('2d');
      ctx.font = (cs.fontWeight || '400') + ' 100px ' + cs.fontFamily;
      // 'H' is flat-topped, so its ink height is the cap height exactly (no
      // overshoot the way round letters like 'O' have).
      var m = ctx.measureText('H');
      var ratio = m && m.actualBoundingBoxAscent / 100;
      if (ratio > 0.4 && ratio < 1) return ratio;
    } catch (e) {}
    return 0.7; // a typical serif; only reached if TextMetrics is unavailable
  }

  /**
   * Size and sink the cap so its ink spans exactly two lines: the top of the
   * capital meets the cap height of line one, its baseline rests on line two's
   * baseline, and its float box ends there too, so precisely two lines wrap
   * beside it. Everything is measured from the live layout — nothing here is
   * tuned to a particular font or line-height.
   */
  function fitDropCap(p) {
    var cap = p.querySelector('.monolith-cap');
    if (!cap) return;

    // Below the narrow-pane breakpoint the stylesheet drops the cap back to
    // body text; measuring an un-floated letter would only write nonsense over
    // the good values, so leave them for when the pane widens again.
    if (getComputedStyle(cap).cssFloat === 'none') return;

    var cs = getComputedStyle(p);
    var fontSize = parseFloat(cs.fontSize);
    var line = parseFloat(cs.lineHeight);
    if (!(line > 0)) line = fontSize * 1.72; // computed 'normal'
    if (!(fontSize > 0)) return;

    // Line one's baseline, measured without the cap in the way.
    cap.style.display = 'none';
    var firstBaseline = baselineOffset(p);
    cap.style.display = '';
    if (!(firstBaseline > 0)) return; // not laid out yet (hidden iframe, etc.)

    // Ink height wanted = line one's cap height + one line of leading below it.
    var size = fontSize + line / capHeightRatio(cap);
    cap.style.setProperty('--ml-cap-size', size + 'px');

    // Where the cap's own baseline falls inside its box, now that it is set at
    // that size, then how far to sink the box to land that baseline on line two.
    var capBaseline = baselineOffset(cap);
    if (!(capBaseline > 0)) return;
    var sink = firstBaseline + line - capBaseline;

    cap.style.setProperty('--ml-cap-sink', sink + 'px');
    // Float box bottom = sink + height = two lines, so line three clears it.
    cap.style.setProperty('--ml-cap-box', 2 * line - sink + 'px');
  }

  /**
   * Move the paragraph's first letter into its own element. A real element in
   * place of `::first-letter` is what makes the cap measurable — and it renders
   * identically everywhere, instead of splitting into a Chromium
   * `initial-letter` path and a floated fallback that drift apart.
   */
  function wrapDropCap(p) {
    var node = firstTextNode(p);
    if (!node) return false;
    var letter = node.splitText(node.data.search(/\S/)); // starts at the letter
    letter.splitText(1); // …and now holds exactly that letter
    var cap = document.createElement('span');
    cap.className = 'monolith-cap';
    letter.parentNode.replaceChild(cap, letter);
    cap.appendChild(letter);
    return true;
  }

  function setupDropCaps() {
    var sections = document.querySelectorAll('.ltx_section');
    if (sections.length) {
      sections.forEach(function (sec) { tagLeadParagraph(sec); });
    } else {
      tagLeadParagraph(document.querySelector('article.ltx_document') || document.body);
    }

    var leads = document.querySelectorAll('.monolith-lead');
    if (!leads.length) return;
    leads.forEach(function (p) {
      if (wrapDropCap(p)) fitDropCap(p);
    });

    // Metrics move when a webfont swaps in; widths don't affect them, but a
    // resize is a cheap, reliable prod that the layout has settled.
    function refit() {
      leads.forEach(function (p) { try { fitDropCap(p); } catch (e) {} });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refit).catch(function () {});
    }
    window.addEventListener('load', refit);
    var timer = null;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(refit, 150);
    });
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
