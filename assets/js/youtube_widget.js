(function () {
  const root = document.getElementById('ytWidget');
  if (!root) return;

  const btnPrev = root.querySelector('[data-vw-prev]');
  const btnNext = root.querySelector('[data-vw-next]');
  const statusEl = root.querySelector('[data-vw-status]');
  const listEl = root.querySelector('[data-vw-list]');

  const PAGE_SIZE = 2;
  const MAX_ITEMS = 200;
  const TITLE_MAX = 30;
  const CH_MAX = 14;

  // UX: render whatever is ready within ~2s, then silently enrich.
  const INITIAL_RENDER_BUDGET_MS = 2000;

  // Single channel mode: show 10 initially; then keep adding +10 when nearing the end.
  const CH_INITIAL = 10;
  const CH_STEP = 20;

  // All-channels mode: start with 2 per feed; when user reaches video 19-20, add +10 per feed.
  // Repeat at 39-40, 59-60, ... up to 100 per feed.
  const ALL_INITIAL_PER_FEED = 2;
  const ALL_STEP = 20;
  const ALL_MAX_PER_FEED = 400;
  const ALL_STEP_EVERY_GLOBAL_VIDEOS = 20; // 19-20, 39-40, ... (because PAGE_SIZE=2)

  // Background warm cache (so dropdown is instant): keep fetching until 100 per feed is cached.
  const WARM_CACHE_TO_MAX = true;

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
  let nextAllStepAt = ALL_STEP_EVERY_GLOBAL_VIDEOS; // next global video count where we step +10 per feed
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

  function cacheKey() {
    try {
      return FEEDS.map(function (f) {
        const c = feedCache[f.name];
        const n = c && Array.isArray(c.items) ? c.items.length : 0;
        const top = c && c.items && c.items[0] ? (c.items[0].videoId || '') : '';
        return f.name + ':' + n + ':' + top;
      }).join('|');
    } catch (e) {
      return String(Date.now());
    }
  }

  function render() {
    if (!listEl) return;

    const totalPages = pagesCount();
    page = clamp(page, 0, totalPages - 1);

    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);

    // Never show empty/error messages: if nothing yet, keep it blank.
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

    maybePrefetchMore();
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

  function maybePrefetchMore() {
    if (!items.length) return;
    if (isFetchingMore) return;

    if (mode === 'all') {
      const totalPages = pagesCount();
      const remaining = (totalPages - 1) - page;
      const visibleEnd = (page + 1) * PAGE_SIZE; // e.g. page 9 => 20

      const byIndex = visibleEnd >= nextAllStepAt;
      // If the list is too small to even reach the next (20/40/60...) step,
      // silently expand when the user is near the end, without advancing the step marker.
      const byNearEnd = remaining <= 2 && items.length < nextAllStepAt;

      if ((byIndex || byNearEnd) && allPerFeedShown < ALL_MAX_PER_FEED) {
        if (byIndex) nextAllStepAt += ALL_STEP_EVERY_GLOBAL_VIDEOS;
        ensureMore(true);
      }
      return;
    }

    // Channel-mode: prefetch when user is within the last 3 pages.
    const totalPages = pagesCount();
    const remaining = (totalPages - 1) - page;
    if (remaining <= 2) {
      ensureMore(true);
    }
  }

  async function ensureMore(silent) {
    if (isFetchingMore) return false;

    isFetchingMore = true;
    try {
      if (!silent && btnNext) btnNext.disabled = true;

      if (mode === 'all') {
        const next = Math.min(ALL_MAX_PER_FEED, allPerFeedShown + ALL_STEP);
        if (next <= allPerFeedShown) return false;
        // Immediate UX: expand using whatever is already cached.
        allPerFeedShown = next;
        rebuildItems();
        render();

        // Then try to ensure the cache actually has that many (silent).
        try {
          await ensureAll(next);
        } catch (e) {}
        rebuildItems();
      } else {
        const cur = channelShown[mode] || CH_INITIAL;
        const next = Math.min(ALL_MAX_PER_FEED, cur + CH_STEP);
        if (next <= cur) return false;

        channelShown[mode] = next;
        rebuildItems();
        render();

        try {
          await ensureChannel(mode, next);
        } catch (e) {}
        rebuildItems();
      }

      render();
      return true;
    } catch (e) {
      return false;
    } finally {
      isFetchingMore = false;
      if (!silent && btnNext) btnNext.disabled = page >= pagesCount() - 1;
    }
  }

  async function go(delta) {
    if (!delta) return;

    // For channel mode, if user tries to go beyond last page, expand first (await).
    if (delta > 0 && mode !== 'all') {
      const totalPages = pagesCount();
      if (page + delta > totalPages - 1) {
        await ensureMore(false);
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

    sel.addEventListener('change', function () {
      const v = sel.value || 'all';
      mode = v;
      page = 0;

      if (mode === 'all') {
        allPerFeedShown = ALL_INITIAL_PER_FEED;
        nextAllStepAt = ALL_STEP_EVERY_GLOBAL_VIDEOS;
        rebuildItems();
        render();
        return;
      }

      // Instant: render from cache (ideally already warmed).
      const cachedLen = feedCache[mode] && Array.isArray(feedCache[mode].items) ? feedCache[mode].items.length : 0;
      channelShown[mode] = Math.max(2, Math.min(CH_INITIAL, cachedLen || 2));
      rebuildItems();
      render();

      // Background: ensure we have at least 10 for that channel (no UI blocking).
      ensureChannel(mode, Math.min(CH_INITIAL, ALL_MAX_PER_FEED))
        .then(function () {
          channelShown[mode] = Math.min(CH_INITIAL, ALL_MAX_PER_FEED);
          rebuildItems();
          render();
        })
        .catch(function () {});
    });
  }

  async function warmCacheToMax() {
    if (!WARM_CACHE_TO_MAX) return;
    try {
      await ensureAll(ALL_MAX_PER_FEED);
    } catch (e) {
      // no messages
    }
  }

  async function load() {
    // No loading/empty messages.
    if (listEl) listEl.innerHTML = '';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;

    const tasks = FEEDS.map(function (f) {
      return fetchFeedToCache(f, ALL_INITIAL_PER_FEED);
    });

    const settleAll = Promise.allSettled(tasks);
    let renderedKey = '';

    // 1) Render whatever is ready within ~2s.
    try {
      await Promise.race([settleAll, sleep(INITIAL_RENDER_BUDGET_MS)]);
    } catch (e) {}

    rebuildItems();
    page = 0;
    render();
    renderedKey = cacheKey();

    // 2) Keep silently enriching as feeds finish (and as warm-cache pulls more).
    const pollMs = 600;
    const maxPollMs = 25000;
    const t0 = Date.now();
    const poll = setInterval(function () {
      if (Date.now() - t0 > maxPollMs) {
        clearInterval(poll);
        return;
      }
      const k = cacheKey();
      if (k !== renderedKey) {
        rebuildItems();
        render();
        renderedKey = k;
      }
    }, pollMs);

    // Start background warm-cache after initial render.
    warmCacheToMax()
      .then(function () {
        const k = cacheKey();
        if (k !== renderedKey) {
          rebuildItems();
          render();
          renderedKey = k;
        }
      })
      .catch(function () {});

    settleAll
      .then(function () {
        // don't clear poll immediately; warm-cache may still be running.
        // Let the poll finish naturally.
        const k = cacheKey();
        if (k !== renderedKey) {
          rebuildItems();
          render();
          renderedKey = k;
        }
      })
      .catch(function () {
        // no messages
      });
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
