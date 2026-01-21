(function () {
  const root = document.querySelector('.rail-flickr');
  if (!root) return;

  const imgEl = root.querySelector('[data-flickr-img]');
  const titleEl = root.querySelector('[data-flickr-title]');
  const dateEl = root.querySelector('[data-flickr-date]');
  const statusEl = root.querySelector('[data-flickr-status]');

  if (!imgEl || !titleEl || !dateEl) return;

  const USER_ID = '112254964@N05';
  const MAX_PER_FETCH = 20;
  const BATCH_SIZE = 10;
  const INTERVAL_MS = 6200;

  let all = [];
  let seen = new Set();
  let cursor = 0;
  let windowEnd = 0;
  let timer = null;
  let reqId = 0;

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toBigger(url) {
    if (!url) return url;
    return url.replace('_m.', '_b.');
  }

  function uniqAppend(items) {
    let added = 0;
    items.forEach((it) => {
      const key = it.link || it.thumb || it.big || it.title;
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      all.push(it);
      added += 1;
    });
    return added;
  }

  function parseFeed(json) {
    const list = (json && json.items ? json.items : []).slice(0, MAX_PER_FETCH);
    return list
      .map((x) => {
        const thumb = x && x.media && x.media.m ? x.media.m : '';
        return {
          title: (x && x.title) ? String(x.title) : '',
          published: x && x.published ? String(x.published) : '',
          link: x && x.link ? String(x.link) : '',
          thumb: thumb,
          big: toBigger(thumb)
        };
      })
      .filter((x) => !!x.thumb);
  }

  function show(i) {
    if (!all.length) return;
    const it = all[i % all.length];
    if (!it) return;

    statusEl && (statusEl.textContent = '');
    titleEl.textContent = it.title || '';
    dateEl.textContent = fmtDate(it.published);

    const myReq = ++reqId;

    imgEl.classList.remove('is-ready');
    void imgEl.offsetWidth; // restart CSS animation reliably

    imgEl.onload = function () {
      if (myReq !== reqId) return; // ignore late loads
      imgEl.classList.add('is-ready');
    };

    imgEl.onerror = function () {
      if (myReq !== reqId) return;
      imgEl.onerror = null;
      imgEl.src = it.thumb; // fallback; onload above will add is-ready
    };

    imgEl.src = it.big;
  }

  
  function ensureWindow() {
    if (!all.length) return;

    if (windowEnd === 0) {
      windowEnd = Math.min(BATCH_SIZE, all.length);
      cursor = 0;
      return;
    }

    if (cursor < windowEnd) return;

    if (windowEnd < all.length) {
      windowEnd = Math.min(windowEnd + BATCH_SIZE, all.length);
      return;
    }

    // No more cached items. Refresh feed and continue.
    fetchFeed(true);
  }

  function tick() {
    if (!all.length) return;
    ensureWindow();

    // If we still cannot extend, loop.
    if (cursor >= windowEnd) {
      cursor = 0;
      windowEnd = Math.min(BATCH_SIZE, all.length);
    }

    show(cursor);
    cursor += 1;
  }

  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, INTERVAL_MS);
  }

  function cleanupJsonp(tagId) {
    const el = document.getElementById(tagId);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function fetchFeed(isRefresh) {
    const cbName = 'vttFlickrCb_' + Math.random().toString(36).slice(2);
    const tagId = 'vttFlickrJsonp_' + cbName;

    window[cbName] = function (json) {
      try {
        const items = parseFeed(json);
        const before = all.length;
        const added = uniqAppend(items);

        if (!before) {
          windowEnd = 0;
          cursor = 0;
          ensureWindow();
          tick();
          start();
        }

        if (isRefresh && added === 0 && all.length) {
          // Keep going even if nothing new arrived.
          if (!timer) start();
        }

        statusEl && (statusEl.textContent = all.length ? '' : 'No public photos returned.');
      } catch (e) {
        statusEl && (statusEl.textContent = 'Could not load photos.');
      } finally {
        cleanupJsonp(tagId);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      }
    };

    const url =
      'https://www.flickr.com/services/feeds/photos_public.gne' +
      '?id=' + encodeURIComponent(USER_ID) +
      '&format=json' +
      '&jsoncallback=' + encodeURIComponent(cbName) +
      '&_ts=' + Date.now();

    const s = document.createElement('script');
    s.id = tagId;
    s.src = url;
    s.async = true;
    s.onerror = function () {
      statusEl && (statusEl.textContent = 'Could not load photos.');
      cleanupJsonp(tagId);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    };
    document.head.appendChild(s);

    if (!isRefresh) {
      statusEl && (statusEl.textContent = 'Loading photos...');
    }
  }

  fetchFeed(false);
})();
