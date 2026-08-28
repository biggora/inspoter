/*
 * ui_checks.js — programmatic UI-audit signal collector.
 *
 * Run inside a rendered page via a browser tool's evaluate, e.g. (Playwright MCP):
 *   browser_evaluate: () => { <paste this whole file>; return runUIChecks(); }
 *
 * Returns a JSON report of LEADS, not verdicts. The checks are deliberately
 * conservative heuristics — verify each lead visually before reporting it, and
 * remember the script cannot see the many defects that need human judgment
 * (visual rhythm, hierarchy, style coherence, RTL correctness, brand fit).
 *
 * Pure browser JS, no dependencies. Safe to run more than once.
 */

function runUIChecks() {
  var CAP = 30; // max items per list, to keep output small

  function cap(arr) {
    return { count: arr.length, items: arr.slice(0, CAP) };
  }

  function isVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    var s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return el.tagName.toLowerCase() + '#' + el.id;
    var cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return el.tagName.toLowerCase() + cls;
  }

  function shortText(el, n) {
    var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > (n || 60) ? t.slice(0, n || 60) + '…' : t;
  }

  // ---- color / contrast helpers (WCAG relative luminance) -------------------
  function parseColor(str) {
    if (!str) return null;
    var m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance(c) {
    var ch = [c.r, c.g, c.b].map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function contrastRatio(fg, bg) {
    var l1 = luminance(fg), l2 = luminance(bg);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  // walk up to find the first opaque background color
  function effectiveBg(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) return c;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 }; // assume white page
  }

  // ---- 1. horizontal overflow ----------------------------------------------
  function horizontalOverflow() {
    var vw = window.innerWidth;
    var docOverflow = document.documentElement.scrollWidth - vw;
    var offenders = [];
    if (docOverflow > 1) {
      var all = document.body.querySelectorAll('*');
      for (var i = 0; i < all.length && offenders.length < CAP; i++) {
        var r = all[i].getBoundingClientRect();
        if (r.right > vw + 1 && r.width <= vw + 1 && isVisible(all[i])) {
          offenders.push({ el: selectorFor(all[i]), right: Math.round(r.right) });
        }
      }
    }
    return { pageHasHorizontalScroll: docOverflow > 1, overflowPx: Math.max(0, docOverflow), viewport: vw, suspects: offenders };
  }

  // ---- 2. low-contrast text -------------------------------------------------
  function lowContrastText() {
    var out = [];
    var nodes = document.body.querySelectorAll('p,span,a,li,h1,h2,h3,h4,h5,h6,button,label,td,th,div');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var txt = '';
      // only direct text, to avoid counting container wrappers
      for (var k = 0; k < el.childNodes.length; k++) {
        if (el.childNodes[k].nodeType === 3) txt += el.childNodes[k].textContent;
      }
      txt = txt.replace(/\s+/g, ' ').trim();
      if (txt.length < 2 || !isVisible(el)) continue;
      var s = getComputedStyle(el);
      var fg = parseColor(s.color);
      if (!fg) continue;
      var bg = effectiveBg(el);
      var ratio = contrastRatio(fg, bg);
      var size = parseFloat(s.fontSize);
      var bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
      var large = size >= 24 || (size >= 18.66 && bold);
      var min = large ? 3 : 4.5;
      if (ratio < min) {
        out.push({ el: selectorFor(el), text: txt.slice(0, 40), ratio: Math.round(ratio * 100) / 100, required: min, fontSize: Math.round(size) });
      }
      if (out.length >= CAP) break;
    }
    return cap(out);
  }

  // ---- 3. small tap targets -------------------------------------------------
  function smallTapTargets() {
    var out = [];
    var nodes = document.querySelectorAll('a,button,input,select,textarea,[role="button"],[onclick]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isVisible(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        out.push({ el: selectorFor(el), text: shortText(el, 30), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return cap(out);
  }

  // ---- 4. images: missing alt / broken -------------------------------------
  function imageIssues() {
    var missingAlt = [], broken = [];
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img.hasAttribute('alt') || img.getAttribute('alt').trim() === '') {
        // decorative images may legitimately have alt="" — flag for human check
        missingAlt.push({ src: (img.currentSrc || img.src || '').slice(-80), decorativeMaybe: img.getAttribute('alt') === '' });
      }
      if (img.complete && img.naturalWidth === 0 && img.src && img.src.indexOf('data:') !== 0) {
        broken.push((img.currentSrc || img.src || '').slice(-80));
      }
    }
    return { missingAlt: cap(missingAlt), broken: cap(broken) };
  }

  // ---- 5. heading hierarchy -------------------------------------------------
  function headingHierarchy() {
    var hs = [];
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (h) {
      if (isVisible(h)) hs.push({ level: parseInt(h.tagName[1], 10), text: shortText(h, 50) });
    });
    var levels = hs.map(function (h) { return h.level; });
    var h1count = levels.filter(function (l) { return l === 1; }).length;
    var skips = [];
    for (var i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) skips.push({ from: levels[i - 1], to: levels[i], at: hs[i].text });
    }
    return { sequence: levels, h1Count: h1count, missingH1: h1count === 0, multipleH1: h1count > 1, levelSkips: skips, headings: hs.slice(0, CAP) };
  }

  // ---- 6. locale detection --------------------------------------------------
  function detectLocales() {
    var htmlLang = document.documentElement.getAttribute('lang') || null;
    var dir = document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction || 'ltr';
    var hreflang = [];
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(function (l) {
      hreflang.push({ hreflang: l.getAttribute('hreflang'), href: l.getAttribute('href') });
    });
    // language-switcher heuristic: anchors whose text/href looks like a locale
    var switcherHits = [];
    var localeRe = /(^|[\/?=_-])(en|de|fr|es|it|pt|ru|uk|pl|nl|tr|ar|he|fa|zh|ja|ko|hi|sv|no|da|fi|cs|el|ro|hu|bg|lt|lv|et)([\/?=_.-]|$)/i;
    document.querySelectorAll('a[href]').forEach(function (a) {
      var t = (a.textContent || '').trim();
      if ((/^[a-z]{2}$/i.test(t) || localeRe.test(a.getAttribute('href') || '')) && switcherHits.length < CAP) {
        switcherHits.push({ text: t.slice(0, 12), href: (a.getAttribute('href') || '').slice(0, 60) });
      }
    });
    var rtlLangs = ['ar', 'he', 'fa', 'ur'];
    var isRtlLang = htmlLang ? rtlLangs.indexOf(htmlLang.slice(0, 2).toLowerCase()) >= 0 : false;
    return {
      htmlLang: htmlLang,
      dir: dir,
      hreflang: hreflang,
      hreflangCount: hreflang.length,
      switcherCandidates: switcherHits,
      multiLanguageLikely: hreflang.length > 1 || switcherHits.length > 1,
      rtlLangButLtrDir: isRtlLang && dir.toLowerCase() !== 'rtl'
    };
  }

  // ---- 7. raw i18n keys leaking to the UI -----------------------------------
  function rawI18nKeys() {
    var out = [];
    var keyRe = /^[a-z0-9]+(?:[._][a-z0-9]+){1,}$/i; // e.g. home.hero.title, cart_empty_label
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode()) && out.length < CAP) {
      var t = n.textContent.trim();
      if (!t || t.indexOf(' ') >= 0) continue;        // keys have no spaces
      if (t.length < 4 || t.length > 60) continue;
      if (/\.(js|css|png|jpg|svg|html|php|json)$/i.test(t)) continue; // filenames
      if (/^https?:|^www\.|@/.test(t)) continue;      // urls / emails
      if (keyRe.test(t) && /[._]/.test(t) && n.parentElement && isVisible(n.parentElement)) {
        out.push({ text: t, el: selectorFor(n.parentElement) });
      }
    }
    return cap(out);
  }

  // ---- 8. technical garbage surfaced ---------------------------------------
  function technicalGarbage() {
    var needles = ['undefined', 'null', 'NaN', '[object Object]', 'Invalid Date', 'NaN%', '$NaN'];
    var out = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode()) && out.length < CAP) {
      var t = n.textContent.trim();
      if (!t) continue;
      for (var i = 0; i < needles.length; i++) {
        // whole-word-ish match to avoid 'undefined' inside legit prose is rare;
        // require the needle as a standalone token or the entire content
        var re = new RegExp('(^|[^A-Za-z])' + needles[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z]|$)');
        if (re.test(t) && n.parentElement && isVisible(n.parentElement)) {
          out.push({ value: needles[i], text: t.slice(0, 50), el: selectorFor(n.parentElement) });
          break;
        }
      }
    }
    return cap(out);
  }

  // ---- 9. overflowing / clipped text nodes ----------------------------------
  function overflowingText() {
    var out = [];
    var nodes = document.querySelectorAll('button,a,span,li,td,th,div,label,h1,h2,h3,p');
    for (var i = 0; i < nodes.length && out.length < CAP; i++) {
      var el = nodes[i];
      if (!isVisible(el)) continue;
      var s = getComputedStyle(el);
      var clipsX = s.overflowX === 'hidden' || s.overflow === 'hidden' || s.textOverflow === 'ellipsis' || s.whiteSpace === 'nowrap';
      if (clipsX && el.scrollWidth - el.clientWidth > 2 && (el.textContent || '').trim().length > 1) {
        out.push({ el: selectorFor(el), text: shortText(el, 40), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
    return cap(out);
  }

  // ---- assemble -------------------------------------------------------------
  return {
    url: location.href,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    title: document.title,
    horizontalOverflow: horizontalOverflow(),
    lowContrastText: lowContrastText(),
    smallTapTargets: smallTapTargets(),
    images: imageIssues(),
    headingHierarchy: headingHierarchy(),
    detectedLocales: detectLocales(),
    rawI18nKeys: rawI18nKeys(),
    technicalGarbage: technicalGarbage(),
    overflowingText: overflowingText(),
    _note: 'Heuristic leads — verify visually before reporting. Re-run per viewport (resize) and per locale.'
  };
}

// Node/CommonJS export for reuse/testing; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = { runUIChecks: runUIChecks }; }
