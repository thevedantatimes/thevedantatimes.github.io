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
  // Start fetching more when user is within the last 3 pages (incl current).
  const PREFETCH_THRESHOLD_REMAINING = 2; // last-3 pages => remaining pages <= 2

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

  function maybePrefetchMore() {
    if (!items.length) return;
    if (isFetchingMore) return;
    const totalPages = pagesCount();
    const remaining = (totalPages - 1) - page;
    if (remaining <= PREFETCH_THRESHOLD_REMAINING) {
      // Silent background prefetch (no loading text / no button flicker).
      ensureMore(true);
    }
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

  async function ensureMore(silent) {
    if (isFetchingMore) return false;

    // Nothing to expand in All-mode after first expansion.
    if (mode === 'all' && allPerFeedShown >= ALL_EXPANDED_TOTAL_PER_FEED) return false;

    isFetchingMore = true;
    try {
      if (!silent && btnNext) btnNext.disabled = true;

      if (mode === 'all') {
        // Expand from 2 -> 12 per feed (2 + 10).
        await ensureAll(ALL_EXPANDED_TOTAL_PER_FEED);
        allPerFeedShown = ALL_EXPANDED_TOTAL_PER_FEED;
        rebuildItems();
      } else {
        const cur = channelShown[mode] || CH_INITIAL;
        const next = cur + CH_STEP;
        await ensureChannel(mode, next);
        channelShown[mode] = next;
        rebuildItems();
      }

      // Update UI silently; no loading messages.
      render();
      return true;
    } catch (e) {
      // Keep current items visible.
      return false;
    } finally {
      isFetchingMore = false;
      if (!silent && btnNext) btnNext.disabled = page >= pagesCount() - 1;
    }
  }

  async function go(delta) {
    if (!delta) return;

    if (delta > 0) {
      const totalPages = pagesCount();
      const remaining = (totalPages - 1) - page;

      // Kick prefetch early (last-3 pages).
      if (remaining <= PREFETCH_THRESHOLD_REMAINING) ensureMore(true);

      // If user tries to move beyond the last page, expand first (await).
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

    sel.addEventListener('change', function () {
      const v = sel.value || 'all';
      mode = v;
      page = 0;

      // Instant UI: render from whatever is already in cache (0-lag).
      if (mode === 'all') {
        allPerFeedShown = ALL_INITIAL_PER_FEED;
        rebuildItems();
        render();

        // Background refresh (no UI blocking).
        ensureAll(ALL_INITIAL_PER_FEED)
          .then(function () {
            rebuildItems();
            render();
          })
          .catch(function () {});
        return;
      }

      const cachedLen = feedCache[mode] && Array.isArray(feedCache[mode].items) ? feedCache[mode].items.length : 0;
      // Use the already-fetched 2 items (from All-mode load) so the dropdown feels instant.
      channelShown[mode] = Math.max(2, Math.min(CH_INITIAL, cachedLen || 2));
      rebuildItems();
      render();

      // Then silently expand to 10 in the background.
      ensureChannel(mode, CH_INITIAL)
        .then(function () {
          channelShown[mode] = CH_INITIAL;
          rebuildItems();
          render();
        })
        .catch(function () {});
    });
  }

  async function load() {
    if (listEl) listEl.innerHTML = '<div class="vw-empty">Loading…</div>';
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

    // 2) After the first render, keep silently enriching as feeds finish.
    //    (No loading messages; users just see the list refine/expand.)
    const pollMs = 700;
    const maxPollMs = 8000;
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

    settleAll
      .then(function () {
        clearInterval(poll);
        const k = cacheKey();
        if (k !== renderedKey) {
          rebuildItems();
          render();
          renderedKey = k;
        }
      })
      .catch(function () {
        clearInterval(poll);
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
