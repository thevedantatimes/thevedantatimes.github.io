(function () {
  const root = document.getElementById('ytWidget');
  if (!root) return;

  const btnPrev = root.querySelector('[data-vw-prev]');
  const btnNext = root.querySelector('[data-vw-next]');
  const statusEl = root.querySelector('[data-vw-status]');
  const listEl = root.querySelector('[data-vw-list]');
  const gateEl = root.querySelector('[data-vw-gate]');

  const PAGE_SIZE = 4;
  const MAX_ITEMS_GLOBAL = 200;
  const TITLE_MAX = 30;
  const CH_MAX = 14;

  // Cache policy
  const CACHE_TARGET = 15;           // stop fetching for a channel once it reaches this
  const RETRY_EVERY_MS = 20000;      // 20 seconds
  const RETRY_MAX = 60;             // up to 60 attempts
  const STORAGE_PREFIX = 'vtt_yt_cache_v1::';

  // Feeds
  const FEEDS = [
    { name: '@ChicagoVedanta', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC64nHa3IWptZ-KPlQxdfsbw' },
    { name: '@VedantaNY', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZOKv_xnTzyLD9RJmbBUV9Q' },
    { name: '@VedantaOrg', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCoeQClkDRaj9uABKHfHJUdw' },
    { name: '@vedantasocietyofwesternwa', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHNlxSbZiXS6oBJuJEiiIPA' },
    { name: '@VedantaDC', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4zi_tfjGdO4Gjulz-GSAvg' },
    { name: '@belurmathofficial', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCuv4AUvgAgut3zdiPmvG5Pw' }
  ];

  // Proxy chain (Try #1 allorigins, Try #2 jina)
  const PROXIES = [
    function (u) {
      return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u);
    },
    function (u) {
      return 'https://r.jina.ai/' + u;
    }
  ];

  // In-memory per-feed cache: name -> items[]
  const feedCache = Object.create(null);

  // UI state
  let mode = 'all';
  let page = 0;
  let items = [];
  let dropdownEl = null;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function trimTo(s, n) {
    const t = String(s || '').trim();
    if (!t) return '';
    if (t.length <= n) return t;
    return t.slice(0, Math.max(0, n)) + '…';
  }

  function ytThumb(videoId) {
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId || '') + '/hqdefault.jpg';
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function pagesCount() {
    return Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  }

  function setGated(on, msg) {
    if (on) root.classList.add('vw-gated');
    else root.classList.remove('vw-gated');
    if (gateEl) gateEl.textContent = msg || (on ? 'Loading videos…' : '');
  }

  function gateProgressText() {
    const counts = FEEDS.map(function (f) {
      const arr = feedCache[f.name];
      return Array.isArray(arr) ? arr.length : 0;
    });
    const ready = counts.filter(function (n) {
      return n >= CACHE_TARGET;
    }).length;
    const min = counts.length ? Math.min.apply(null, counts) : 0;
    console.log('Syncing videos… ' + ready + '/' + FEEDS.length + ' channels ready (min ' + min + '/' + CACHE_TARGET + ')');
    return '';
  }

  function validItem(v) {
    return !!(v && v.videoId && v.url);
  }

  function readCache(feedName) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + feedName);
      if (!raw) return [];
      const obj = JSON.parse(raw);
      const arr = obj && Array.isArray(obj.items) ? obj.items : [];
      return arr.filter(validItem).slice(0, CACHE_TARGET);
    } catch (e) {
      return [];
    }
  }

  function writeCache(feedName, arr) {
    try {
      localStorage.setItem(
        STORAGE_PREFIX + feedName,
        JSON.stringify({ updatedAt: new Date().toISOString(), items: (arr || []).slice(0, CACHE_TARGET) })
      );
    } catch (e) {
      // ignore (storage full / disabled)
    }
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function normalizeXmlText(txt) {
    const iFeed = txt.indexOf('<feed');
    const iXml = txt.indexOf('<?xml');
    const i = iXml >= 0 ? iXml : iFeed;
    return i >= 0 ? txt.slice(i) : txt;
  }

  async function fetchTextWithProxy(url) {
    const maxAttemptsPerProxy = 3;
    for (let p = 0; p < PROXIES.length; p++) {
      for (let a = 0; a < maxAttemptsPerProxy; a++) {
        try {
          const proxied = PROXIES[p](url);
          const res = await fetch(proxied, { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const txt = await res.text();
          return normalizeXmlText(txt);
        } catch (e) {
          await sleep(250 + a * 300);
        }
      }
    }
    throw new Error('All proxies failed');
  }

  function parseRss(xmlText, channelHandle) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));

    const parsed = entries
      .map(function (e) {
        const title = (e.getElementsByTagName('title')[0] || {}).textContent || '';
        const linkEl = e.getElementsByTagName('link')[0];
        const link = linkEl && linkEl.getAttribute ? linkEl.getAttribute('href') : '';
        const vid = (e.getElementsByTagName('yt:videoId')[0] || {}).textContent || '';
        const pub = (e.getElementsByTagName('published')[0] || {}).textContent || '';

        return {
          title: (title || '').trim(),
          url: (link || '').trim(),
          videoId: (vid || '').trim(),
          published: (pub || '').trim(),
          channel: channelHandle || '',
          thumbnail: vid ? ytThumb(String(vid).trim()) : ''
        };
      })
      .filter(validItem);

    parsed.sort(function (a, b) {
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });

    return parsed;
  }

  function mergeUnique(existing, incoming) {
    const out = [];
    const seen = Object.create(null);

    function add(v) {
      if (!validItem(v)) return;
      const id = String(v.videoId || '');
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push(v);
    }

    (existing || []).forEach(add);
    (incoming || []).forEach(add);

    out.sort(function (a, b) {
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });

    return out.slice(0, CACHE_TARGET);
  }

  function rebuildItems() {
    if (mode === 'all') {
      let merged = [];
      FEEDS.forEach(function (f) {
        const arr = feedCache[f.name];
        if (Array.isArray(arr) && arr.length) merged = merged.concat(arr);
      });

      // Dedup by videoId
      const seen = Object.create(null);
      merged = merged.filter(function (v) {
        const id = v && v.videoId;
        if (!id) return false;
        if (seen[id]) return false;
        seen[id] = 1;
        return true;
      });

      merged.sort(function (a, b) {
        return new Date(b.published).getTime() - new Date(a.published).getTime();
      });

      items = merged.slice(0, MAX_ITEMS_GLOBAL);
      return;
    }

    const arr = feedCache[mode];
    items = Array.isArray(arr) ? arr.slice(0, MAX_ITEMS_GLOBAL) : [];
    items.sort(function (a, b) {
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });
  }

  function render() {
    if (!listEl) return;

    const totalPages = pagesCount();
    page = clamp(page, 0, totalPages - 1);

    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);

    if (!slice.length) {
      listEl.innerHTML = '';
      if (statusEl) statusEl.textContent = '';
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
      return;
    }

    const html = slice
      .map(function (it) {
        const t = esc(trimTo(it.title, TITLE_MAX));
        const ch = esc(trimTo(it.channel, CH_MAX));
        const dt = fmtDate(it.published);
        const href = esc(it.url);
        const thumb = esc(it.thumbnail);

        return (
          '<a class="vw-item" href="' +
          href +
          '" target="_blank" rel="noopener noreferrer">' +
          '  <span class="vw-thumb"><img src="' +
          thumb +
          '" alt="" loading="lazy"></span>' +
          '  <span class="vw-info">' +
          '    <span class="vw-title">' +
          t +
          '</span>' +
          '    <span class="vw-meta">' +
          (ch ? ch + ' · ' : '') +
          dt +
          '</span>' +
          '  </span>' +
          '</a>'
        );
      })
      .join('');

    listEl.innerHTML = html;
    if (statusEl) statusEl.textContent = page + 1 + ' / ' + totalPages;
    if (btnPrev) btnPrev.disabled = page <= 0;
    if (btnNext) btnNext.disabled = page >= totalPages - 1;
  }

  function go(delta) {
    if (!delta) return;
    page += delta;
    page = clamp(page, 0, pagesCount() - 1);
    render();
  }

  function installDropdown() {
    const head = root.querySelector('.vw-head');
    if (!head) return;

    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Filter video channel');

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All channels';
    sel.appendChild(optAll);

    FEEDS.forEach(function (f) {
      const o = document.createElement('option');
      o.value = f.name;
      o.textContent = f.name;
      sel.appendChild(o);
    });

    head.insertAdjacentElement('afterend', sel);
    dropdownEl = sel;

    sel.addEventListener('change', function () {
      mode = sel.value || 'all';
      page = 0;
      rebuildItems();
      render();
    });
  }

  async function fillFeedToTarget(feed) {
    let cur = feedCache[feed.name];
    if (!Array.isArray(cur)) cur = [];
    let attempts = 0;

    while (cur.length < CACHE_TARGET && attempts < RETRY_MAX) {
      attempts++;
      try {
        const txt = await fetchTextWithProxy(feed.url);
        const parsed = parseRss(txt, feed.name);
        const next = mergeUnique(cur, parsed);
        if (next.length !== cur.length) {
          cur = next;
          feedCache[feed.name] = cur;
          writeCache(feed.name, cur);
        }
      } catch (e) {
        // ignore; we'll retry
      }

      if (gateEl) gateEl.textContent = gateProgressText();

      if (cur.length >= CACHE_TARGET) break;
      if (attempts < RETRY_MAX) await sleep(RETRY_EVERY_MS);
    }

    feedCache[feed.name] = cur;
    return cur;
  }

  async function primeCaches() {
    // 1) Hydrate from localStorage (instant)
    FEEDS.forEach(function (f) {
      feedCache[f.name] = readCache(f.name);
    });

    // 2) If every channel already has 50, do not fetch at all.
    const allReady = FEEDS.every(function (f) {
      return (feedCache[f.name] || []).length >= CACHE_TARGET;
    });
    if (allReady) return;

    // 3) Otherwise, keep fetching until each channel reaches 50 (or retry cap).
    if (gateEl) gateEl.textContent = gateProgressText();

    await Promise.all(
      FEEDS.map(function (f) {
        const cur = feedCache[f.name] || [];
        if (cur.length >= CACHE_TARGET) return Promise.resolve(cur);
        return fillFeedToTarget(f);
      })
    );
  }

  async function load() {
    // Start gated: nothing in the widget chrome should show until caches are filled.
    setGated(true, 'Loading videos…');
    if (listEl) listEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;

    // Build UI chrome now (dropdown exists), but it will be hidden while gated.
    installDropdown();

    // Prefetch caches (may retry in the background for up to ~20 minutes).
    await primeCaches();

    // Now show the full widget and render from cache (no further network fetches).
    setGated(false, '');
    rebuildItems();
    page = 0;
    render();

    // Keep dropdown in sync if created
    if (dropdownEl) dropdownEl.value = mode;
  }

  if (btnPrev)
    btnPrev.addEventListener('click', function () {
      go(-1);
    });

  if (btnNext)
    btnNext.addEventListener('click', function () {
      go(1);
    });

  // Optional: mouse wheel scroll through pages
  root.addEventListener(
    'wheel',
    function (ev) {
      if (!items.length) return;
      if (Math.abs(ev.deltaY) < 5) return;
      ev.preventDefault();
      go(ev.deltaY > 0 ? 1 : -1);
    },
    { passive: false }
  );

  load();
})();
