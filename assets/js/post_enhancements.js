(function () {
  'use strict';

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
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

  function pickRecommendation(posts, currentUrl, currentCatsLower) {
    if (!Array.isArray(posts) || !posts.length) return null;

    var cleaned = posts
      .filter(function (p) {
        return p && p.url && String(p.url) !== String(currentUrl);
      })
      .slice();

    var pool = cleaned;

    if (currentCatsLower.length) {
      var matched = cleaned.filter(function (p) {
        var pc = uniqLower(p.categories || []);
        return intersects(pc, currentCatsLower);
      });
      if (matched.length) pool = matched;
    }

    pool.sort(function (x, y) {
      return new Date(y.date || 0).getTime() - new Date(x.date || 0).getTime();
    });

    var top = pool.slice(0, 25);
    if (!top.length) return null;
    return top[Math.floor(Math.random() * top.length)];
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
    var currentUrl = postArticle.getAttribute('data-post-url') || window.location.pathname;
    var catsRaw = postArticle.getAttribute('data-post-cats') || '';
    var currentCatsLower = uniqLower(catsRaw.split('||'));

    fetch('/assets/data/posts_index.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (posts) {
        function tick() {
          var rec = pickRecommendation(posts, currentUrl, currentCatsLower);
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
      if (tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'TEXTAREA') {
        return true;
      }
      p = p.parentNode;
    }
    return false;
  }

  function wikipediaHref(term) {
    var t = String(term || '').trim();
    if (!t) return '';
    // Wikipedia prefers underscores for spaces.
    var slug = t.replace(/\s+/g, '_');
    return 'https://en.wikipedia.org/wiki/' + encodeURIComponent(slug);
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
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.textContent = match;
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

  function initWikiAutoLinks(postArticle) {
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

    var chosen = candidates.slice(0, 5);
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
    var postArticle = document.querySelector('article.post');
    if (!postArticle) return;

    upgradeYouTubeEmbeds(postArticle);
    initRecommendations(postArticle);
    initWikiAutoLinks(postArticle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
