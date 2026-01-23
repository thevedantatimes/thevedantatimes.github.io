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
    'Prasad': 'Prasada',
    'Darshan': 'Darshan (Indian religions)',
    'Tirtha': 'Tirtha (Hinduism)',

    // Your dictionary items that benefit from canonical titles/diacritics
    'Ramakrishna Kathamrita': 'Sri Sri Ramakrishna Kathamrita',
    'Upadesa Sahasri': 'Upadeśasāhasrī',
    'Drig-Drishya-Viveka': 'Dṛg-Dṛśya-Viveka',
    'Sri Yukteswar': 'Swami Sri Yukteswar Giri',
    'Swami Saradananda': 'Saradananda',
    'Swami Dayananda Saraswati': 'Dayananda Saraswati (Arsha Vidya)'
  };

  function resolveWikiTitle(term){
    var t = String(term || '').trim();
    if (!t) return '';
    return VTT_WIKI_OVERRIDES[t] || t;
  }


  function wikipediaHref(term) {
    var t = resolveWikiTitle(term);
    if (!t) return '';
    // Wikipedia prefers underscores for spaces.
    var slug = t.replace(/\s+/g, '_');
    return 'https://en.wikipedia.org/wiki/' + encodeURIComponent(slug);
  }
// ------------------------------------------------------------
// Wikipedia popup (inline overlay with first ~100 words)
// ------------------------------------------------------------
var _vttWikiCache = Object.create(null);
var _vttWikiOverlayBuilt = false;

function normalizeWikiTerm(term){
  return String(term || '').trim();
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
      '<div class="vtt-wiki-foot"><a class="vtt-wiki-read" href="#" rel="nofollow">Read on Wikipedia</a></div>' +
    '</div>';

  document.body.appendChild(overlay);

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

function openWikiOverlay(term){
  term = normalizeWikiTerm(term);
  if (!term) return;

  buildWikiOverlay();

  var overlay = document.getElementById('vttWikiOverlay');
  if (!overlay) return;

  var titleEl = overlay.querySelector('.vtt-wiki-title');
  var bodyEl = overlay.querySelector('.vtt-wiki-body');
  var readEl = overlay.querySelector('.vtt-wiki-read');


  var resolved = resolveWikiTitle(term);
  var href = wikipediaHref(resolved);

  if (titleEl) titleEl.textContent = resolved || term;
  if (bodyEl) bodyEl.textContent = 'Loading…';
  if (readEl){
    readEl.setAttribute('href', href);
  }

  overlay.style.display = 'flex';

  // Cache per session
  if (_vttWikiCache[resolved || term]){
    if (bodyEl) bodyEl.textContent = _vttWikiCache[resolved || term];
    return;
  }

  // Wikipedia REST summary endpoint (CORS-friendly)
  var slug = String(resolved || term || '').replace(/\s+/g, '_');
  var api = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(slug);

  fetch(api, { cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function(data){
      var extract = data && (data.extract || data.description) || '';
      var snip = truncateWikiExtract(extract);
      if (!snip) snip = 'No preview available for this topic.';
      _vttWikiCache[resolved || term] = snip;
      if (bodyEl) bodyEl.textContent = snip;
    })
    .catch(function(){
      var fallback = 'Could not load the preview right now.';
      _vttWikiCache[resolved || term] = fallback;
      if (bodyEl) bodyEl.textContent = fallback;
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

  function linkFirstOccurrence(root, term) {
    var rx = buildMatchRegex(term);
    if (!rx) return false;

    var walker;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n || !n.nodeValue) return NodeFilter.FILTER_REJECT;
          if (inForbiddenContext(n)) return NodeFilter.FILTER_REJECT;
          if (!rx.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
    } catch (e) {
      return false;
    }

    var n;
    while ((n = walker.nextNode())) {
      var txt = n.nodeValue;
      rx.lastIndex = 0;
      var m = rx.exec(txt);
      if (!m || m.index == null) continue;

      var before = txt.slice(0, m.index);
      var match = txt.slice(m.index, m.index + m[0].length);
      var after = txt.slice(m.index + m[0].length);

      var frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));

      var a = document.createElement('a');
      a.className = 'vtt-wiki';
      a.setAttribute('href', wikipediaHref(term));
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

    return false;
  }

  var VTT_WIKI_DICTIONARY = [
    'Vedanta',
    'Advaita Vedanta',
    'Vishishtadvaita',
    'Dvaita',
    'Bhedabheda',
    'Achintya Bheda Abheda',
    'Shuddhadvaita',
    'Kashmir Shaivism',
    'Shaivism',
    'Vaishnavism',
    'Shaktism',
    'Smartism',
    'Samkhya',
    'Yoga (philosophy)',
    'Nyaya',
    'Vaisheshika',
    'Mimamsa',
    'Nondualism',
    'Bhakti',
    'Jnana',
    'Karma',
    'Tantra',
    'Integral yoga',
    'Kriya Yoga',
    'Mantra yoga',
    'Vedas',
    'Rigveda',
    'Samaveda',
    'Yajurveda',
    'Atharvaveda',
    'Upanishads',
    'Principal Upanishads',
    'Bhagavad Gita',
    'Brahma Sutras',
    'Mahabharata',
    'Ramayana',
    'Bhagavata Purana',
    'Markandeya Purana',
    'Devi Mahatmya',
    'Yoga Sutras of Patanjali',
    'Narada Bhakti Sutra',
    'Vivekachudamani',
    'Upadesa Sahasri',
    'Mandukya Karika',
    'Panchadasi',
    'Drig-Drishya-Viveka',
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
    'Raja Yoga (book)',
    'Karma Yoga (book)',
    'Bhakti Yoga (book)',
    'Jnana Yoga (book)',
    'Atman',
    'Brahman',
    'Ishvara',
    'Maya',
    'Avidya',
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
    'Vyasa',
    'Valmiki',
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
    'Kalpataru Day',
    'Kumbh Mela',
    'Ganga',
    'Varanasi',
    'Rishikesh',
    'Bodh Gaya',
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

    // Build candidate set based on actual content.
    var contentText = String(body.textContent || '');
    if (!contentText.trim()) return;
    var candidates = [];

    for (var i = 0; i < VTT_WIKI_DICTIONARY.length; i++) {
      var term = String(VTT_WIKI_DICTIONARY[i] || '').trim();
      if (!term) continue;
      var rx = buildMatchRegex(term);
      if (!rx) continue;
      if (rx.test(contentText)) candidates.push(term);
    }

    if (!candidates.length) return;

    // Stable randomness per post.
    var seedStr =
      (postArticle.getAttribute('data-post-url') || '') +
      '|' +
      (postArticle.getAttribute('data-post-title') || document.title || '') +
      '|' +
      (document.querySelector('meta[name="date"]') ? document.querySelector('meta[name="date"]').getAttribute('content') : '');
    var rnd = mulberry32(fnv1a(seedStr));

    // Shuffle candidates.
    for (var j = candidates.length - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var tmp = candidates[j];
      candidates[j] = candidates[k];
      candidates[k] = tmp;
    }

    // Prioritize phrases (multi-word terms) so items like "Karma Yoga" are not
    // skipped just because they did not land in a shuffled top-5.
    var phrases = [];
    var singles = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      var tt = String(candidates[ci] || '').trim();
      if (!tt) continue;
      if (tt.indexOf(' ') >= 0) phrases.push(tt);
      else singles.push(tt);
    }

    // Shuffle each group using the same stable PRNG.
    for (var jp = phrases.length - 1; jp > 0; jp--) {
      var kp = Math.floor(rnd() * (jp + 1));
      var tmpP = phrases[jp];
      phrases[jp] = phrases[kp];
      phrases[kp] = tmpP;
    }
    for (var js = singles.length - 1; js > 0; js--) {
      var ks = Math.floor(rnd() * (js + 1));
      var tmpS = singles[js];
      singles[js] = singles[ks];
      singles[ks] = tmpS;
    }

    var chosen = phrases.concat(singles).slice(0, 5);
    // Prefer longer terms first to avoid a shorter term stealing a longer phrase.
    chosen.sort(function (a, b) {
      return String(b).length - String(a).length;
    });

    var linked = 0;
    for (var t = 0; t < chosen.length; t++) {
      if (linkFirstOccurrence(body, chosen[t])) {
        linked++;
        if (linked >= 5) break;
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
