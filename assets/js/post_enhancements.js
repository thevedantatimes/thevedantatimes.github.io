(function () {
  'use strict';

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function initDuoPan() {
    // Home: the center duo image pans slowly so readers can see more of the image
    var els = $all('.cm-duo-media');
    if (!els.length) return;

    els.forEach(function (el) {
      if (!el || el.classList.contains('is-pan')) return;
      var img = el.querySelector('img');
      if (!img) return;

      var src = img.currentSrc || img.getAttribute('src') || '';
      src = String(src || '').trim();
      if (!src) return;

      // Use a repeating background for a seamless loop
      el.style.backgroundImage = 'url(\"' + src.replace(/\"/g, '\\\"') + '\")';
      el.classList.add('is-pan');
    });
  }

  function parseVideoIdFromEmbedSrc(src) {
    try {
      var u = new URL(String(src || ''), window.location.href);
      var parts = (u.pathname || '').split('/').filter(Boolean);

      // /embed/<id>
      var i = parts.indexOf('embed');
      if (i >= 0 && parts[i + 1]) return parts[i + 1];

      // /shorts/<id>
      var j = parts.indexOf('shorts');
      if (j >= 0 && parts[j + 1]) return parts[j + 1];

      // youtu.be/<id>
      var host = String(u.hostname || '').toLowerCase();
      if (host.indexOf('youtu.be') >= 0 && parts[0]) return parts[0];

      // watch?v=<id>
      var v = u.searchParams.get('v');
      if (v) return v;

      return '';
    } catch (e) {
      return '';
    }
  }

  function buildTeaserSrc(videoId) {
    videoId = String(videoId || '').trim();
    if (!videoId) return '';
    return (
      'https://www.youtube-nocookie.com/embed/' +
      encodeURIComponent(videoId) +
      '?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=' +
      encodeURIComponent(videoId)
    );
  }

  function buildPlaySrc(videoId) {
    videoId = String(videoId || '').trim();
    if (!videoId) return '';
    return (
      'https://www.youtube-nocookie.com/embed/' +
      encodeURIComponent(videoId) +
      '?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&playsinline=1'
    );
  }

  function upgradeYouTubeEmbeds(postRoot) {
    var iframes = $all('iframe[src]', postRoot);
    if (!iframes.length) return;

    iframes.forEach(function (iframe) {
      if (iframe.getAttribute('data-vtt-upgraded') === '1') return;

      var src = String(iframe.getAttribute('src') || '');
      if (src.indexOf('youtube.com') < 0 && src.indexOf('youtube-nocookie.com') < 0 && src.indexOf('youtu.be') < 0)
        return;

      var vid = parseVideoIdFromEmbedSrc(src);
      if (!vid) return;

      var wrapper = document.createElement('div');
      wrapper.className = 'vb-yt-post vb-yt-tile';
      wrapper.setAttribute('data-video-id', vid);

      var teaser = document.createElement('div');
      teaser.className = 'vb-yt-teaser';

      var newIframe = document.createElement('iframe');
      newIframe.className = 'vb-yt-teaser-iframe';
      newIframe.setAttribute('src', buildTeaserSrc(vid));
      newIframe.setAttribute('title', iframe.getAttribute('title') || 'YouTube video player');
      newIframe.setAttribute('frameborder', '0');
      newIframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      newIframe.setAttribute('allowfullscreen', '');

      var shade = document.createElement('div');
      shade.className = 'vb-yt-teaser-shade';

      var playBtn = document.createElement('button');
      playBtn.className = 'vb-yt-teaser-play';
      playBtn.type = 'button';
      playBtn.setAttribute('aria-label', 'Play video');

      teaser.appendChild(newIframe);
      teaser.appendChild(shade);
      teaser.appendChild(playBtn);
      wrapper.appendChild(teaser);

      function startPlaying() {
        if (wrapper.classList.contains('vb-yt-playing')) return;
        wrapper.classList.add('vb-yt-playing');
        newIframe.setAttribute('src', buildPlaySrc(vid));
      }

      playBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        startPlaying();
      });

      wrapper.addEventListener('click', function () {
        startPlaying();
      });

      iframe.setAttribute('data-vtt-upgraded', '1');
      iframe.parentNode.insertBefore(wrapper, iframe);
      iframe.parentNode.removeChild(iframe);
    });
  }

  function uniqLower(arr) {
    var out = [];
    var seen = Object.create(null);
    (arr || []).forEach(function (s) {
      var k = String(s || '').trim().toLowerCase();
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(k);
    });
    return out;
  }

  function intersects(a, b) {
    var i;
    var set = Object.create(null);
    for (i = 0; i < (a || []).length; i++) set[a[i]] = 1;
    for (i = 0; i < (b || []).length; i++) {
      if (set[b[i]]) return true;
    }
    return false;
  }

  function pickRecommendation(posts, currentUrl) {
    if (!Array.isArray(posts) || !posts.length) return null;

    function norm(u) {
      var s = String(u || '').trim();
      // Strip protocol/host if present
      s = s.replace(/^https?:\/\/[^/]+/i, '');
      // Ensure leading slash
      if (s && s.charAt(0) !== '/') s = '/' + s;
      // Normalize trailing slash (keep single root slash)
      if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
      return s.toLowerCase();
    }

    var blocked = ['/donate', '/contact', '/about', '/events'];

    var cur = norm(currentUrl);

    var pool = posts
      .filter(function (p) {
        if (!p || !p.url) return false;
        var u = norm(p.url);
        if (u === cur) return false;
        for (var i = 0; i < blocked.length; i++) {
          if (u === blocked[i]) return false;
        }
        return true;
      })
      .slice();

    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function shouldDisableReadMoreOnThisPage(pathname) {
    var p = String(pathname || '').toLowerCase();
    // Disable on non-post utility pages.
    if (p === '/' || p === '') return false;
    var blocked = ['/donate', '/contact', '/about', '/events', '/upcoming', '/category', '/categories'];
    for (var i = 0; i < blocked.length; i++) {
      if (p === blocked[i] || p.indexOf(blocked[i] + '/') === 0) return true;
    }
    return false;
  }

  function ensureToast() {
    var existing = document.getElementById('vttRecToast');
    if (existing) return existing;

    var el = document.createElement('div');
    el.id = 'vttRecToast';
    el.className = 'vtt-rec-toast';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'vtt-rec-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    var kicker = document.createElement('div');
    kicker.className = 'vtt-rec-kicker';
    kicker.textContent = 'Read more';

    var link = document.createElement('a');
    link.className = 'vtt-rec-link';
    link.setAttribute('href', '#');

    var title = document.createElement('div');
    title.className = 'vtt-rec-title';
    link.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'vtt-rec-meta';

    el.appendChild(closeBtn);
    el.appendChild(kicker);
    el.appendChild(link);
    el.appendChild(meta);

    document.body.appendChild(el);

    closeBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      el.classList.remove('show');
    });

    el._parts = { link: link, title: title, meta: meta };
    return el;
  }

  function showToast(rec) {
    if (!rec || !rec.url || !rec.title) return;

    var toast = ensureToast();
    var link = toast._parts.link;
    var titleEl = toast._parts.title;
    var metaEl = toast._parts.meta;

    link.setAttribute('href', String(rec.url));
    titleEl.textContent = String(rec.title);

    var cats = (rec.categories || []).slice(0, 2).join(' · ');
    var dt = '';
    try {
      var d = new Date(rec.date || '');
      if (!isNaN(d.getTime())) {
        dt = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
    } catch (e) {
      dt = '';
    }

    var meta = [];
    if (cats) meta.push(cats);
    if (dt) meta.push(dt);
    metaEl.textContent = meta.join(' · ');

    toast.classList.add('show');

    window.clearTimeout(showToast._hideTimer);
    showToast._hideTimer = window.setTimeout(function () {
      toast.classList.remove('show');
    }, 15000);
  }

  function initRecommendations(postArticle) {
    if (shouldDisableReadMoreOnThisPage(window.location.pathname)) return;

    var currentUrl = postArticle.getAttribute('data-post-url') || window.location.pathname;

    fetch('/assets/data/posts_index.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (posts) {
        function tick() {
          var rec = pickRecommendation(posts, currentUrl);
          if (rec) showToast(rec);
        }

        // Show the first recommendation soon, then every minute.
        window.setTimeout(function () {
          tick();
          window.setInterval(tick, 60000);
        }, 15000);
      })
      .catch(function () {
        // ignore
      });
  }

  // ------------------------------------------------------------
  // Wikipedia auto-linking (up to 5 terms per post)
  // ------------------------------------------------------------
  function fnv1a(str) {
    str = String(str || '');
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      var x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  }

  function isWordishTerm(term) {
    // Only letters/numbers/spaces/hyphens/apostrophes
    return /^[A-Za-z0-9\s\-']+$/.test(String(term || '').trim());
  }

  function buildMatchRegex(term) {
    term = String(term || '').trim();
    if (!term) return null;
    var core = escapeRegExp(term);
    // Prefer word boundaries for "wordish" terms to avoid partial matches.
    // For terms with punctuation (e.g., parentheses), avoid \b and match literally.
    var pat = isWordishTerm(term) ? ('\\b' + core + '\\b') : core;
    try {
      return new RegExp(pat, 'i');
    } catch (e) {
      return null;
    }
  }

  function inForbiddenContext(node) {
  if (!node) return true;
  var p = node.parentNode;
  while (p && p.nodeType === 1) {
    var tag = (p.tagName || '').toUpperCase();

    // Never auto-link inside existing links, code, or headings/titles.
    if (
      tag === 'A' ||
      tag === 'SCRIPT' ||
      tag === 'STYLE' ||
      tag === 'CODE' ||
      tag === 'PRE' ||
      tag === 'TEXTAREA' ||
      tag === 'HEADER' ||
      tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6'
    ) {
      return true;
    }

    // Also block common title containers
    if (p.classList && (p.classList.contains('post-head') || p.classList.contains('post-title'))) {
      return true;
    }

    p = p.parentNode;
  }
  return false;
}

  // Hard-coded Wikipedia title overrides (fixes disambiguation / canonical titles)
  // Keep this list small and targeted; most terms work as-is.
  var VTT_WIKI_OVERRIDES = {
    // Disambiguation fixes / canonical titles
    'Puja': 'Puja (Hinduism)',
    'Pooja': 'Puja (Hinduism)',
    'Arati': 'Arti (Hinduism)',
    'Aarti': 'Arti (Hinduism)',
    'Dvaita': 'Dvaita_Vedanta',
    'Prasad': 'Prasada',
    'Darshan': 'Darshan (Indian religions)',
    'Tirtha': 'Tirtha (Hinduism)',
    'Yoga': 'Three_Yogas',
    'Vivekananda Vedanta Society': 'Vedanta_Society',
    'four yogas': 'Three_Yogas',
    'Atman': 'Ātman_(Hinduism)',
    'Maya': 'Maya_(religion)',
    'Lila': 'Lila_(Hinduism)',
    'Kalpataru': 'Kalpataru_Day',
    'Avidya': 'Avidyā (Hinduism)',
    'Vidya': 'Vidya (philosophy)',

    // Your dictionary items that benefit from canonical titles/diacritics
    'Kathamrita': 'Sri Sri Ramakrishna Kathamrita',
    'Ramakrishna Kathamrita': 'Sri Sri Ramakrishna Kathamrita',
    'Upadesa Sahasri': 'Upadeśasāhasrī',
    'Drig-Drishya-Viveka': 'Dṛg-Dṛśya-Viveka',
    'Swami Saradananda': 'Saradananda',
    'Drig-Drishya-Viveka': 'Dṛg-Dṛśya-Viveka'
  };

  function resolveWikiTitle(term){
    var t = String(term || '').trim();
    if (!t) return '';
    return VTT_WIKI_OVERRIDES[t] || t;
  }

function truncateWikiExtract(extract){
  var txt = String(extract || '').replace(/\s+/g, ' ').trim();
  if (!txt) return '';
  // Capture first 100 words, then extend to the first period after that.
  var m = txt.match(/^(\S+(?:\s+\S+){0,99})/);
  if (!m) return '';
  var head = m[1];
  if (head.split(/\s+/).length < 100) return txt;
  var cut = head.length;
  var dot = txt.indexOf('.', cut);
  if (dot !== -1) return txt.slice(0, dot + 1);
  return head + '…';
}


function fetchWikiPreview(term, done){
  term = normalizeWikiTerm(term);
  if (!term){
    if (typeof done === 'function') done('');
    return;
  }

  var resolved = resolveWikiTitle(term) || term;
  var key = resolved;

  // Cache per session
  if (_vttWikiCache[key]){
    if (typeof done === 'function') done(_vttWikiCache[key], resolved);
    return;
  }

  // Wikipedia REST summary endpoint (CORS-friendly)
  var slug = String(resolved || '').replace(/\s+/g, '_');
  var api = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(slug);

  fetch(api, { cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function(data){
      var extract = data && (data.extract || data.description) || '';
      var snip = truncateWikiExtract(extract);
      if (!snip) snip = 'No preview available for this topic.';
      _vttWikiCache[key] = snip;
      if (typeof done === 'function') done(snip, resolved);
    })
    .catch(function(){
      var fallback = 'Could not load the preview right now.';
      _vttWikiCache[key] = fallback;
      if (typeof done === 'function') done(fallback, resolved);
    });
}

function stripOutboundWikiUI(scope){
  try {
    var root = scope || document;
    var nodes = root.querySelectorAll('.vtt-wiki-foot, .vtt-wiki-read, .vtt-wiki-callout-kicker');
    for (var i = 0; i < nodes.length; i++){
      if (nodes[i] && nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }

    var calloutLinks = root.querySelectorAll('.vtt-wiki-callout a');
    for (var j = 0; j < calloutLinks.length; j++){
      var a = calloutLinks[j];
      var txt = a.textContent || '';
      var span = document.createElement('span');
      span.textContent = txt;
      if (a && a.parentNode) a.parentNode.replaceChild(span, a);
    }
  } catch (e) {}
}

function buildWikiOverlay(){
  if (_vttWikiOverlayBuilt) return;
  _vttWikiOverlayBuilt = true;

  var overlay = document.createElement('div');
  overlay.id = 'vttWikiOverlay';
  overlay.className = 'vtt-wiki-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.display = 'none';

  overlay.innerHTML =
    '<div class="vtt-wiki-modal" role="document">' +
      '<button class="vtt-wiki-close" type="button" aria-label="Close">×</button>' +
      '<div class="vtt-wiki-title"></div>' +
      '<div class="vtt-wiki-body"></div>' +
    '</div>';

  document.body.appendChild(overlay);

  stripOutboundWikiUI(overlay);

  function close(){
    overlay.style.display = 'none';
  }

  overlay.addEventListener('click', function(e){
    if (e.target === overlay) close();
  });

  var btn = overlay.querySelector('.vtt-wiki-close');
  if (btn) btn.addEventListener('click', close);

  document.addEventListener('keydown', function(e){
    if (overlay.style.display !== 'none' && (e.key === 'Escape' || e.keyCode === 27)) close();
  });

  overlay._vttClose = close;
}



function normalizeWikiTerm(term){
  if (term == null) return '';

  // Normalize whitespace and strip common trailing punctuation / possessives.
  term = String(term).replace(/\s+/g, ' ').trim();

  // Possessives like Ramakrishna’s / Shankaracharya's / sages’
  term = term.replace(/(?:\u2019s|'s|s\u2019|s')$/i, '');

  // Trailing punctuation that may cling to a word in prose.
  term = term.replace(/[)\]}\u201d\u2019'\".,;:!?]+$/g, '').trim();

  return term;
}
function openWikiOverlay(term){
  term = normalizeWikiTerm(term);
  if (!term) return;

  buildWikiOverlay();

  var overlay = document.getElementById('vttWikiOverlay');
  if (!overlay) return;

  var titleEl = overlay.querySelector('.vtt-wiki-title');
  var bodyEl = overlay.querySelector('.vtt-wiki-body');


  var resolved = resolveWikiTitle(term);

  if (titleEl) titleEl.textContent = resolved || term;
  if (bodyEl) bodyEl.textContent = 'Loading…';

  overlay.style.display = 'flex';

  stripOutboundWikiUI(overlay);

  
fetchWikiPreview(term, function(snip){
    if (bodyEl) bodyEl.textContent = snip || 'No preview available for this topic.';
  });
}

function bindWikiPopupClicks(){
  if (bindWikiPopupClicks._bound) return;
  bindWikiPopupClicks._bound = true;

  document.addEventListener('click', function(e){
    var a = e.target && (e.target.closest ? e.target.closest('a.vtt-wiki') : null);
    if (!a) return;
    var term = a.getAttribute('data-vtt-wiki') || (a.textContent || '');
    if (!term) return;
    e.preventDefault();
    e.stopPropagation();
    openWikiOverlay(term);
  });
}

  function linkFirstOccurrence(root, term, maxChars) {
    var rx = buildMatchRegex(term);
    if (!rx) return false;

    // If maxChars is provided, only link within the first maxChars characters
    // of the post body textContent (document order).
    var limit = (typeof maxChars === 'number' && isFinite(maxChars) && maxChars > 0) ? Math.floor(maxChars) : null;

    var walker;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n || !n.nodeValue) return NodeFilter.FILTER_REJECT;
          if (inForbiddenContext(n)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
    } catch (e) {
      return false;
    }

    var n;
    var seen = 0; // cumulative characters encountered in accepted text nodes
    while ((n = walker.nextNode())) {
      var nodeText = n.nodeValue || '';
      var nodeStart = seen;

      // If we have passed the limit, stop searching.
      if (limit !== null && nodeStart >= limit) break;

      rx.lastIndex = 0;
      var m = rx.exec(nodeText);
      if (m && m.index != null) {
        // If match starts beyond the limit, stop (later nodes will be even further).
        if (limit !== null && (nodeStart + m.index) >= limit) break;

        var before = nodeText.slice(0, m.index);
        var match = nodeText.slice(m.index, m.index + m[0].length);
        var after = nodeText.slice(m.index + m[0].length);

        var frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));

        var a = document.createElement('a');
        a.className = 'vtt-wiki';
        a.setAttribute('href', '#');
        a.setAttribute('data-vtt-wiki', term);
        a.setAttribute('aria-haspopup', 'dialog');
        a.setAttribute('rel', 'nofollow');

        // Text + small Wikipedia icon (clicking either opens the same popup)
        a.appendChild(document.createTextNode(match));

try{
        var svgNS = 'http://www.w3.org/2000/svg';
        var ico = document.createElementNS(svgNS, 'svg');
        ico.setAttribute('class', 'vtt-wiki-ico');
        ico.setAttribute('viewBox', '0 0 458.723 458.723');
        ico.setAttribute('aria-hidden', 'true');
        ico.setAttribute('focusable', 'false');

        var path = document.createElementNS(svgNS, 'path');
        // Keep icon neutral (not the link color)
        path.setAttribute('fill', '#222A30');
        path.setAttribute('d', 'M455.724,93.489H367.32h-3v3v9.613v3h3h6.143c7.145,0,13.588,3.667,17.237,9.81 c3.648,6.143,3.786,13.555,0.368,19.829l-98.3,180.432l-44.769-106.727l42.169-77.382c8.727-16.014,25.477-25.962,43.714-25.962 h1.992h3v-3v-9.613v-3h-3H247.47h-3v3v9.613v3h3h6.143c7.145,0,13.588,3.667,17.237,9.81c3.648,6.143,3.786,13.555,0.368,19.829 l-30.587,56.143L213.372,129.9c-1.976-4.71-1.487-9.852,1.341-14.105s7.38-6.693,12.488-6.693h6.988h3v-3v-9.613v-3h-3H128.46h-3v3 v9.613v3h3h1.454c20.857,0,39.546,12.428,47.615,31.661l40.277,96.018 l-44.887,82.392L93.523,129.9 c-1.976-4.71-1.487-9.852,1.341-14.105s7.38-6.693,12.488-6.693h10.737h3v-3v-9.613v-3h-3H3H0v3v9.613v3h3h7.064 c20.857,0,39.547,12.428,47.615,31.661l91.526,218.191c1.601,3.816,5.313,6.282,9.458,6.282c3.804,0,7.163-1.998,8.986-5.344 l11.939-21.91l45.582-83.646l43.884,104.617c1.601,3.816,5.313,6.282,9.458,6.282c3.804,0,7.163-1.998,8.986-5.344l11.939-21.91 l110.58-202.919c8.727-16.014,25.477-25.962,43.714-25.962h1.992h3v-3v-9.613v-3h-2.999V93.489z');
        ico.appendChild(path);
        a.appendChild(ico);
      }catch(_e){}


        frag.appendChild(a);

        if (after) frag.appendChild(document.createTextNode(after));

        if (n.parentNode) n.parentNode.replaceChild(frag, n);
        return true;
      }

      seen += nodeText.length;
    }

    return false;
  }

  
function buildWikiCallout(term){
  term = normalizeWikiTerm(term);
  if (!term) return null;

  var resolved = resolveWikiTitle(term) || term;

  var box = document.createElement('aside');
  box.className = 'vtt-wiki-callout';
  box.setAttribute('data-vtt-wiki', term);

  box.innerHTML =
    '<div class="vtt-wiki-callout-head">' +
      '<div class="vtt-wiki-callout-title"></div>' +
    '</div>' +
    '<div class="vtt-wiki-callout-body">Loading…</div>';

  var titleEl = box.querySelector('.vtt-wiki-callout-title');
  var bodyEl = box.querySelector('.vtt-wiki-callout-body');

  if (titleEl) titleEl.textContent = resolved;

  fetchWikiPreview(term, function(snip){
    if (bodyEl) bodyEl.textContent = snip || 'No preview available for this topic.';
  });

  stripOutboundWikiUI(box);

  return box;
}

function pickWikiCalloutAnchor(textNode, root){
  if (!textNode) return null;

  var el = textNode.parentNode;
  while (el && el !== root && el.nodeType === 1){
    var tag = (el.tagName || '').toUpperCase();

    // If inside a list item, anchor to the full list, not the <li>.
    if (tag === 'LI'){
      var list = el.parentNode;
      while (list && list !== root && list.nodeType === 1){
        var t = (list.tagName || '').toUpperCase();
        if (t === 'UL' || t === 'OL') return list;
        list = list.parentNode;
      }
    }

    if (tag === 'P' || tag === 'UL' || tag === 'OL' || tag === 'BLOCKQUOTE'){
      return el;
    }

    el = el.parentNode;
  }

  // Fallback: insert at end of the root.
  return root && root.nodeType === 1 ? root : null;
}

function insertWikiCalloutAfterFirstOccurrence(root, term, maxChars) {
  var rx = buildMatchRegex(term);
  if (!rx) return false;

  var limit = (typeof maxChars === 'number' && isFinite(maxChars) && maxChars > 0) ? Math.floor(maxChars) : null;

  var walker;
  try {
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n || !n.nodeValue) return NodeFilter.FILTER_REJECT;
        if (inForbiddenContext(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
  } catch (e) {
    return false;
  }

  var n;
  var seen = 0;
  while ((n = walker.nextNode())) {
    var nodeText = n.nodeValue || '';
    var nodeStart = seen;

    if (limit !== null && nodeStart >= limit) break;

    rx.lastIndex = 0;
    var m = rx.exec(nodeText);
    if (m && m.index != null) {
      if (limit !== null && (nodeStart + m.index) >= limit) break;

      var anchor = pickWikiCalloutAnchor(n, root);
      if (!anchor) return false;

      // Avoid inserting multiple callouts back-to-back.
      var nextEl = anchor.nextElementSibling;
      if (nextEl && nextEl.classList && nextEl.classList.contains('vtt-wiki-callout')){
        return false;
      }

      var callout = buildWikiCallout(term);
      if (!callout) return false;

      if (anchor === root){
        root.appendChild(callout);
      } else if (anchor.parentNode){
        anchor.parentNode.insertBefore(callout, anchor.nextSibling);
      } else {
        return false;
      }

      return true;
    }

    seen += nodeText.length;
  }

  return false;
}

var VTT_WIKI_DICTIONARY = [
    'Vedanta',
    'Vivekananda Vedanta Society',
    'Vedanta Society',
    'Advaita Vedanta',
    'Vishishtadvaita',
    'Dvaita',
    'Achintya Bheda Abheda',
    'Shuddhadvaita',
    'Yoga',
    'Raja Yoga',
    'Karma Yoga',
    'Bhakti Yoga',
    'Jnana Yoga',
    'Sanskrit',
    'Hinduism',
    'four yogas',
    'Shankaracharya',
    'Atman',
    'Brahman',
    'Ishvara',
    'Maya',
    'Shakti',
    'Lila',
    'Vyasa',
    'Valmiki',
    'Mahabharata',
    'Ramayana',
    'Kalpataru',
    'Kalpataru Day',
    'Nyaya',
    'Vaisheshika',
    'Mimamsa',
    'Nondualism',
    'Bhakti',
    'Jnana',
    'Karma',
    'Tantra',
    'Integral yoga',
    'Vedas',
    'Rigveda',
    'Samaveda',
    'Yajurveda',
    'Atharvaveda',
    'Upanishads',
    'Principal Upanishads',
    'Bhagavad Gita',
    'Brahma Sutras',
    'Bhagavata Purana',
    'Markandeya Purana',
    'Devi Mahatmya',
    'Yoga Sutras of Patanjali',
    'Narada Bhakti Sutra',
    'Vivekachudamani',
    'Upadesa Sahasri',
    'Drig-Drishya-Viveka',
    'Girish Chandra Ghosh',
    'Avidya',
    'Vidya',
    

    
    
    'Bhaja Govindam',
    'Ashtavakra Gita',
    'Avadhuta Gita',
    'Hatha Yoga Pradipika',
    'Gheranda Samhita',
    'Shiva Samhita',
    'Saundarya Lahari',
    'Shiva Sutras',
    'Ramakrishna Kathamrita',
    'The Gospel of Sri Ramakrishna',

    'Moksha',
    'Samsara',
    'Dharma',
    'Karma (concept)',
    'Yoga',
    'Meditation',
    'Dhyana',
    'Pranayama',
    'Asana',
    'Samadhi',
    'Dharana',
    'Pratyahara',
    'Yama',
    'Niyama',
    'Ahimsa',
    'Satya',
    'Asteya',
    'Brahmacharya',
    'Aparigraha',
    'Shaucha',
    'Santosha',
    'Svadhyaya',
    'Ishvarapranidhana',
    'Om',
    'Gayatri Mantra',
    'Mahamrityunjaya Mantra',
    'Japa',
    'Kirtan',
    'Bhajan',
    'Satsang',
    'Seva',
    'Tapas',
    'Vairagya',
    'Viveka',
    'Sannyasa',
    'Ashrama',
    'Guru',
    'Disciple',
    'Parampara',
    'Darshan',
    'Puja',
    'Arati',
    'Prasad',
    'Homa',
    'Yajna',
    'Tirtha',
    'Kundalini',
    'Chakra',
    'Nadi (yoga)',
    'Sushumna',
    'Adi Shankara',
    'Gaudapada',
    'Ramanuja',
    'Madhvacharya',
    'Nimbarka',
    'Vallabhacharya',
    'Chaitanya Mahaprabhu',
    'Kabir',
    'Tulsidas',
    'Mirabai',
    'Surdas',
    'Namdev',
    'Tukaram',
    'Eknath',
    'Ramananda',
    'Basava',
    'Patanjali',
    'Dattatreya',
    'Narada',
    'Ramakrishna',
    'Sarada Devi',
    'Swami Vivekananda',
    'Sister Nivedita',
    'Swami Brahmananda',
    'Swami Saradananda',
    'Swami Ranganathananda',
    'Swami Prabhavananda',
    'Swami Tapasyananda',
    'Ramana Maharshi',
    'Sri Aurobindo',
    'The Mother (Mirra Alfassa)',
    'Swami Sivananda',
    'Swami Chinmayananda',
    'Swami Dayananda Saraswati',
    'Paramahansa Yogananda',
    'Sri Yukteswar',
    'Lahiri Mahasaya',
    'Mahavatar Babaji',
    'Neem Karoli Baba',
    'Anandamayi Ma',
    'Mata Amritanandamayi',
    'Jiddu Krishnamurti',
    'Dalai Lama',
    'Thich Nhat Hanh',
    'Buddha',
    'Mahavira',
    'Nagarjuna',
    'Shantideva',
    'Ramakrishna Mission',
    'Ramakrishna Math',
    'Belur Math',
    'Dakshineswar Kali Temple',
    'Vedanta Society',
    'Vedanta Society of New York',
    'Vedanta Society of Chicago',
    'Chinmaya Mission',
    'Divine Life Society',
    'Self-Realization Fellowship',
    'Shiva',
    'Vishnu',
    'Krishna',
    'Rama',
    'Kali',
    'Durga',
    'Ganesha',
    'Saraswati',
    'Lakshmi',
    'Navaratri',
    'Durga Puja',
    'Kali Puja',
    'Diwali',
    'Holi',
    'Janmashtami',
    'Rama Navami',
    'Maha Shivaratri',
    'Guru Purnima',
    'Saraswati Puja',
    'Kumbh Mela',
    'Ganga',
    'Varanasi',
    'Rishikesh',
    'Bodh Gaya'
  ];

  
// ------------------------------------------------------------
// Category auto-linking (top menu categories; no duplicates per post)
// ------------------------------------------------------------
function normalizeKey(s){
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildFlexiblePhraseRegex(phrase){
  phrase = String(phrase || '').trim();
  if (!phrase) return null;

  // Allow flexible whitespace inside multi-word labels.
  var esc = escapeRegExp(phrase).replace(/\s+/g, '\\s+');

  // Word-ish boundary on both sides when the phrase starts/ends with a word char.
  var startsWord = /[A-Za-z0-9_]$/.test(String(phrase || '').charAt(0));
  var endsWord = /[A-Za-z0-9_]$/.test(String(phrase || '').slice(-1));

  var pre = startsWord ? '(^|[^\\w])' : '';
  var post = endsWord ? '(?![\\w])' : '';

  // Capture group 2 is the phrase.
  var pat = pre + '(' + esc + ')' + post;
  try { return new RegExp(pat, 'i'); } catch(e){ return null; }
}

function linkFirstOccurrenceCustom(root, rx, href, cls, key){
  if (!root || !rx || !href) return false;

  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  var n;
  while ((n = walker.nextNode())) {
    if (!n || !n.nodeValue) continue;
    if (inForbiddenContext(n)) continue;

    var txt = n.nodeValue;
    var m = rx.exec(txt);
    if (!m) continue;

    var leading = m[1] || '';
    var match = m[2] || m[0] || '';
    var startIdx = (m.index || 0) + leading.length;

    var before = txt.slice(0, startIdx);
    var after = txt.slice(startIdx + match.length);

    var frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));

    var a = document.createElement('a');
    a.className = cls || 'vtt-catlink';
    a.setAttribute('href', href);
    a.setAttribute('rel', 'nofollow');
    if (key) a.setAttribute('data-vtt-cat', key);
    a.textContent = match;
    frag.appendChild(a);

    if (after) frag.appendChild(document.createTextNode(after));

    if (n.parentNode) n.parentNode.replaceChild(frag, n);
    return true;
  }
  return false;
}

function collectTopMenuCategories(){
  var out = [];
  var menu = document.querySelector('.nav-dd-menu[aria-label="Categories"]') || document.querySelector('.nav-dd-menu');
  if (!menu) return out;

  var items = menu.querySelectorAll('a[role="menuitem"] .nav-dd-label');
  if (!items || !items.length) return out;

  for (var i = 0; i < items.length; i++){
    var labelEl = items[i];
    var a = labelEl && labelEl.closest ? labelEl.closest('a') : null;
    var label = labelEl ? String(labelEl.textContent || '').trim() : '';
    var href = a ? a.getAttribute('href') : '';
    if (!label || !href) continue;

    var key = normalizeKey(label);
    var rx = buildFlexiblePhraseRegex(label);
    if (!rx) continue;

    out.push({ label: label, key: key, href: href, rx: rx });
  }

  return out;
}

function initCategoryAutoLinks(postArticle){
  var body = postArticle && postArticle.querySelector ? postArticle.querySelector('.post-body') : null;
  if (!body) return;

  var cats = collectTopMenuCategories();
  if (!cats.length) return;

  var used = Object.create(null);
  var paras = body.querySelectorAll('p');
  if (!paras || !paras.length) return;

  for (var p = 0; p < paras.length; p++){
    var para = paras[p];
    if (!para) continue;

    var txt = String(para.textContent || '');
    if (!txt.trim()) continue;

    for (var c = 0; c < cats.length; c++){
      var it = cats[c];
      if (!it || used[it.key]) continue;
      if (!it.rx.test(txt)) continue;

      if (linkFirstOccurrenceCustom(para, it.rx, it.href, 'vtt-catlink', it.key)){
        used[it.key] = true;
        break; // at most 1 category link per paragraph
      }
    }
  }
}function initWikiAutoLinks(postArticle) {
    var body = postArticle.querySelector('.post-body');
    if (!body) return;

    // Full post text (used only to compute the 50% boundary).
    var fullText = String(body.textContent || '');
    if (!fullText.trim()) return;

    // Limit BOTH detection and linking scope to the first 50% of the post.
    var halfLen = Math.floor(fullText.length * 0.5);
    if (!isFinite(halfLen) || halfLen <= 0) return;
    var scopedText = fullText.slice(0, halfLen);

    // Session memory: do not re-link the same terms again in this browser tab session.
    var SEEN_KEY = 'vtt_wiki_seen_terms';
    function loadSeenMap() {
      try {
        var raw = sessionStorage.getItem(SEEN_KEY);
        if (!raw) return Object.create(null);
        var obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return Object.create(null);
        return obj;
      } catch (e) {
        return Object.create(null);
      }
    }
    function saveSeenMap(map) {
      try {
        sessionStorage.setItem(SEEN_KEY, JSON.stringify(map || {}));
      } catch (e) {}
    }
    function markSeen(term) {
      var seen = loadSeenMap();
      seen[String(term || '')] = true;
      saveSeenMap(seen);
    }
    var seenMap = loadSeenMap();

    function collectSpans(text, term) {
      var rx = buildMatchRegex(term);
      if (!rx) return [];
      var spans = [];
      try {
        var rg = new RegExp(rx.source, 'gi');
        var mm;
        while ((mm = rg.exec(text)) !== null) {
          spans.push([mm.index, mm.index + mm[0].length]);
          if (mm.index === rg.lastIndex) rg.lastIndex++;
        }
      } catch (e) {
        return [];
      }
      return spans;
    }

    function mergeSpans(spans) {
      if (!spans || !spans.length) return [];
      spans = spans.slice().sort(function (a, b) { return a[0] - b[0]; });
      var out = [spans[0].slice()];
      for (var i = 1; i < spans.length; i++) {
        var last = out[out.length - 1];
        var cur = spans[i];
        if (cur[0] <= last[1]) {
          last[1] = Math.max(last[1], cur[1]);
        } else {
          out.push(cur.slice());
        }
      }
      return out;
    }

    function isAllCovered(spans, coverSpans) {
      if (!spans || !spans.length) return true;
      if (!coverSpans || !coverSpans.length) return false;
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i];
        var covered = false;
        for (var j = 0; j < coverSpans.length; j++) {
          var c = coverSpans[j];
          if (c[0] <= s[0] && c[1] >= s[1]) {
            covered = true;
            break;
          }
          if (c[0] > s[0]) break;
        }
        if (!covered) return false;
      }
      return true;
    }

    // Collect matched dictionary terms and compute rarity (occurrence count) within the scoped text.
    var items = [];
    for (var d = 0; d < VTT_WIKI_DICTIONARY.length; d++) {
      var term = String(VTT_WIKI_DICTIONARY[d] || '').trim();
      if (!term) continue;

      // Skip terms already linked in this session.
      if (seenMap[term]) continue;

      var rx = buildMatchRegex(term);
      if (!rx) continue;

      if (!rx.test(scopedText)) continue;

      var count = 0;
      try {
        var rgCount = new RegExp(rx.source, 'gi');
        var mmCount;
        while ((mmCount = rgCount.exec(scopedText)) !== null) {
          count++;
          if (mmCount.index === rgCount.lastIndex) rgCount.lastIndex++;
        }
      } catch (e) {
        count = 1;
      }

      items.push({
        term: term,
        count: count || 1,
        isPhrase: term.indexOf(' ') >= 0,
        len: term.length
      });
    }

    if (!items.length) return;

    // Prioritize candidate ordering:
    // 1) phrases (multi-word terms)
    // 2) rarity within the scoped text (lower count first)
    // 3) longer terms (helps avoid stealing)
    // 4) stable tie-break by alphabetical order
    items.sort(function (a, b) {
      if (a.isPhrase !== b.isPhrase) return a.isPhrase ? -1 : 1;
      if (a.count !== b.count) return a.count - b.count;
      if (a.len !== b.len) return b.len - a.len;
      return String(a.term).localeCompare(String(b.term));
    });

    // Build a larger attempt list from the scoped text, avoiding "wasted slots"
    // where a shorter term appears only inside an already-selected longer match.
    var attemptTerms = [];
    var coverSpans = [];
    var maxAttempts = 40; // enough buffer to still get 5 successful links

    for (var k = 0; k < items.length; k++) {
      if (attemptTerms.length >= maxAttempts) break;
      var cand = items[k].term;

      var spans = collectSpans(scopedText, cand);
      if (!spans.length) continue;

      // If every occurrence is entirely inside already selected spans, skip and keep searching.
      if (isAllCovered(spans, coverSpans)) continue;

      attemptTerms.push(cand);
      coverSpans = mergeSpans(coverSpans.concat(spans));
    }

    if (!attemptTerms.length) return;

    // Link longer terms first to avoid a shorter term stealing a longer phrase.
    attemptTerms.sort(function (a, b) { return String(b).length - String(a).length; });

    // Track canonical Wikipedia targets so aliases do not create duplicate links.
    // This helps reach the intended max of 5 unique Wikipedia links.
    var usedWikiTargets = Object.create(null);

    var linked = 0;
    var calloutInserted = false;

    for (var t = 0; t < attemptTerms.length; t++) {
      var termToUse = attemptTerms[t];

      // Avoid duplicate Wikipedia targets (aliases mapping to the same page).
      var resolvedTitle = resolveWikiTitle(termToUse) || termToUse;
      var wikiKey = String(resolvedTitle).toLowerCase();
      if (usedWikiTargets[wikiKey]) {
        continue;
      }

      // First 5: normal wiki links
      if (linked < 5) {
        if (linkFirstOccurrence(body, termToUse, halfLen)) {
          markSeen(termToUse);
          usedWikiTargets[wikiKey] = true;
          linked++;
          continue;
        }
      }

      // 6th: inline callout instead of a link
      if (linked >= 5 && !calloutInserted) {
        if (insertWikiCalloutAfterFirstOccurrence(body, termToUse, halfLen)) {
          markSeen(termToUse);
          usedWikiTargets[wikiKey] = true;
          calloutInserted = true;
          break;
        }
      }
    }
  }

  function init() {
    initDuoPan();

    var postArticle = document.querySelector('article.post');
    if (!postArticle) return;

    bindWikiPopupClicks();
    upgradeYouTubeEmbeds(postArticle);
    initRecommendations(postArticle);
    initCategoryAutoLinks(postArticle);
    initWikiAutoLinks(postArticle);
    stripOutboundWikiUI(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
