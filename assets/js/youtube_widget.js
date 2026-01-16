(function () {
  const root = document.getElementById('ytWidget');
  if (!root) return;

  const btnPrev = root.querySelector('[data-vw-prev]');
  const btnNext = root.querySelector('[data-vw-next]');
  const statusEl = root.querySelector('[data-vw-status]');
  const listEl = root.querySelector('[data-vw-list]');

  const PAGE_SIZE = 2;
  const MAX_ITEMS = 200;
  const TITLE_MAX = 20;
  const CH_MAX = 8;

  // Default (All): only 2 per channel initially; when user pages past, expand by +10 per channel (total 12).
  const ALL_INITIAL_PER_FEED = 2;
  const ALL_EXPANDED_TOTAL_PER_FEED = 12; // 2 + 10

  // Single channel mode: show 10 initially; then keep adding +10 when user pages past.
  const CH_INITIAL = 10;
  const CH_STEP = 10;

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

  // Per-feed cache: name -> { items: [], lastTotal: number }
  const feedCache = Object.create(null);

  // UI state
  let mode = 'all'; // 'all' or a feed handle
  let page = 0;
  let items = [];
  let allPerFeedShown = ALL_INITIAL_PER_FEED;
  const channelShown = Object.create(null); // feedName -> count
  let isFetchingMore = false;

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

  function render() {
    if (!listEl) return;

    const totalPages = pagesCount();
    page = clamp(page, 0, totalPages - 1);

    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);

    if (!slice.length) {
      listEl.innerHTML = '<div class="vw-empty">No videos yet.</div>';
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
          '<a class="vw-item" href="' + href + '" target="_blank" rel="noopener noreferrer">' +
          '  <span class="vw-thumb"><img src="' + thumb + '" alt="" loading="lazy"></span>' +
          '  <span class="vw-info">' +
          '    <span class="vw-title">' + t + '</span>' +
          '    <span class="vw-meta">' + (ch ? ch + ' · ' : '') + dt + '</span>' +
          '  </span>' +
          '</a>'
        );
      })
      .join('');

    listEl.innerHTML = html;

    if (statusEl) statusEl.textContent = (page + 1) + ' / ' + totalPages;
    if (btnPrev) btnPrev.disabled = page <= 0;
    if (btnNext) btnNext.disabled = page >= totalPages - 1;
  }

  function mergeAndSort(limitPerFeedMap) {
    let merged = [];

    FEEDS.forEach(function (f) {
      const c = feedCache[f.name];
      if (!c || !Array.isArray(c.items)) return;
      const lim = (limitPerFeedMap && limitPerFeedMap[f.name]) || c.items.length;
      merged = merged.concat(c.items.slice(0, lim));
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

    // Newest first
    merged.sort(function (a, b) {
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });

    return merged.slice(0, MAX_ITEMS);
  }

  function rebuildItems() {
    if (mode === 'all') {
      const map = Object.create(null);
      FEEDS.forEach(function (f) {
        map[f.name] = allPerFeedShown;
      });
      items = mergeAndSort(map);
    } else {
      const c = feedCache[mode];
      const lim = channelShown[mode] || CH_INITIAL;
      items = c && Array.isArray(c.items) ? c.items.slice(0, lim) : [];
      items.sort(function (a, b) {
        return new Date(b.published).getTime() - new Date(a.published).getTime();
      });
      items = items.slice(0, MAX_ITEMS);
    }
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function normalizeXmlText(txt) {
    // If a proxy prepends headers, strip until the first '<feed' or '<?xml'.
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
          await sleep(300 + a * 350);
        }
      }
    }
    throw new Error('All proxies failed');
  }

  function parseRss(xmlText, channelHandle, limit) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));
    const picked = typeof limit === 'number' && limit > 0 ? entries.slice(0, limit) : entries;

    return picked
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
          thumbnail: vid ? ytThumb(vid.trim()) : ''
        };
      })
      .filter(function (x) {
        return !!(x && x.videoId && x.url);
      });
  }

  async function fetchFeedToCache(feed, limit) {
    const existing = feedCache[feed.name];
    if (existing && Array.isArray(existing.items) && existing.lastTotal >= (limit || 0)) return;

    const txt = await fetchTextWithProxy(feed.url);
    const parsed = parseRss(txt, feed.name, limit);
    parsed.sort(function (a, b) {
      return new Date(b.published).getTime() - new Date(a.published).getTime();
    });
    feedCache[feed.name] = { items: parsed, lastTotal: limit || parsed.length };
  }

  async function ensureAll(minPerFeed) {
    const settled = await Promise.allSettled(
      FEEDS.map(async function (f) {
        await fetchFeedToCache(f, minPerFeed);
        return true;
      })
    );

    const ok = settled.some(function (r) {
      return r.status === 'fulfilled';
    });
    if (!ok) throw new Error('all feeds failed');
  }

  async function ensureChannel(feedName, total) {
    const f = FEEDS.find(function (x) {
      return x.name === feedName;
    });
    if (!f) throw new Error('unknown feed');
    await fetchFeedToCache(f, total);
  }

  async function ensureMore() {
    if (isFetchingMore) return;
    isFetchingMore = true;
    if (btnNext) btnNext.disabled = true;

    try {
      if (mode === 'all') {
        if (allPerFeedShown < ALL_EXPANDED_TOTAL_PER_FEED) {
          // No loading message; keep UI steady while fetching.
          await ensureAll(ALL_EXPANDED_TOTAL_PER_FEED);
          allPerFeedShown = ALL_EXPANDED_TOTAL_PER_FEED;
          rebuildItems();
        }
      } else {
        const cur = channelShown[mode] || CH_INITIAL;
        const next = cur + CH_STEP;
        await ensureChannel(mode, next);
        channelShown[mode] = next;
        rebuildItems();
      }
    } catch (e) {
      // Silently ignore; keep current items visible.
    } finally {
      isFetchingMore = false;
      if (btnNext) btnNext.disabled = page >= pagesCount() - 1;
    }
  }

  async function go(delta) {
    if (!delta) return;

    if (delta > 0) {
      const nextPage = page + delta;
      const totalPages = pagesCount();
      if (nextPage > totalPages - 1) {
        await ensureMore();
      }
    }

    page += delta;
    page = clamp(page, 0, pagesCount() - 1);
    render();
  }

  function installDropdown() {
    const head = root.querySelector('.vw-head');
    if (!head) return;

    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Filter video channel');
    // Plain dropdown, no design.

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

    sel.addEventListener('change', async function () {
      const v = sel.value || 'all';
      mode = v;
      page = 0;

      try {
        if (mode === 'all') {
          allPerFeedShown = ALL_INITIAL_PER_FEED;
          await ensureAll(ALL_INITIAL_PER_FEED);
        } else {
          channelShown[mode] = CH_INITIAL;
          await ensureChannel(mode, CH_INITIAL);
        }
        rebuildItems();
        render();
      } catch (e) {
        if (listEl) listEl.innerHTML = '<div class="vw-empty">Videos unavailable right now. Please refresh.</div>';
        if (statusEl) statusEl.textContent = '';
      }
    });
  }

  async function load() {
    if (listEl) listEl.innerHTML = '<div class="vw-empty">Loading…</div>';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;

    try {
      await ensureAll(ALL_INITIAL_PER_FEED);
      rebuildItems();
      page = 0;
      render();
    } catch (e) {
      if (listEl) listEl.innerHTML = '<div class="vw-empty">Videos unavailable right now. Please refresh.</div>';
      if (statusEl) statusEl.textContent = '';
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
    }
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

  installDropdown();
  load();
})();
