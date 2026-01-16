(function () {
  const root = document.getElementById('ytWidget');
  if (!root) return;

  const btnPrev = root.querySelector('[data-vw-prev]');
  const btnNext = root.querySelector('[data-vw-next]');
  const statusEl = root.querySelector('[data-vw-status]');
  const listEl = root.querySelector('[data-vw-list]');

  const PAGE_SIZE = 2;
  const MAX_ITEMS = 80;
  let items = [];
  let page = 0;

  // Merge these RSS feeds (newest on top)
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
      // Jina will often bypass CORS; response may include a short header we strip later.
      return 'https://r.jina.ai/' + u;
    }
  ];

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
        const t = esc(it.title);
        const ch = esc(it.channel);
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

    if (statusEl) {
      statusEl.textContent = (page + 1) + ' / ' + totalPages;
    }
    if (btnPrev) btnPrev.disabled = page <= 0;
    if (btnNext) btnNext.disabled = page >= totalPages - 1;
  }

  function go(delta) {
    page += delta;
    render();
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
    // Try each proxy, and retry (a couple times) because proxies can be flaky.
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
          // small backoff then retry
          await sleep(300 + a * 350);
        }
      }
    }
    throw new Error('All proxies failed');
  }

  function parseRss(xmlText, channelFallback) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));

    // Try to read channel name from feed, fallback to provided handle
    let channelName = channelFallback || '';
    try {
      const author = doc.getElementsByTagName('author')[0];
      const nm = author && author.getElementsByTagName('name')[0];
      const t = nm && (nm.textContent || '').trim();
      if (t) channelName = t;
    } catch (e) {}

    return entries
      .map(function (e) {
        const title = (e.getElementsByTagName('title')[0] || {}).textContent || '';
        const link = (e.getElementsByTagName('link')[0] || {}).getAttribute
          ? e.getElementsByTagName('link')[0].getAttribute('href')
          : '';
        const vid = (e.getElementsByTagName('yt:videoId')[0] || {}).textContent || '';
        const pub = (e.getElementsByTagName('published')[0] || {}).textContent || '';

        return {
          title: (title || '').trim(),
          url: (link || '').trim(),
          videoId: (vid || '').trim(),
          published: (pub || '').trim(),
          channel: channelFallback || channelName,
          thumbnail: vid ? ytThumb(vid.trim()) : ''
        };
      })
      .filter(function (x) {
        return !!(x && x.videoId && x.url);
      });
  }

  async function load() {
    if (statusEl) statusEl.textContent = 'Loading…';
    if (listEl) listEl.innerHTML = '';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;

    try {
      // Fetch in parallel; each feed fetch already has internal retries.
      const settled = await Promise.allSettled(
        FEEDS.map(async function (f) {
          const txt = await fetchTextWithProxy(f.url);
          return parseRss(txt, f.name);
        })
      );

      let merged = [];
      settled.forEach(function (r) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) merged = merged.concat(r.value);
      });

      // Dedup by videoId
      const seen = Object.create(null);
      merged = merged.filter(function (v) {
        const id = v.videoId;
        if (!id) return false;
        if (seen[id]) return false;
        seen[id] = 1;
        return true;
      });

      // newest first
      merged.sort(function (a, b) {
        return new Date(b.published).getTime() - new Date(a.published).getTime();
      });

      items = merged.slice(0, MAX_ITEMS);
      page = 0;
      render();

      if (statusEl) {
        statusEl.textContent = items.length ? '1 / ' + pagesCount() : '0 / 0';
      }
    } catch (e) {
      if (listEl) {
        listEl.innerHTML =
          '<div class="vw-empty">Videos unavailable right now. Please refresh.</div>';
      }
      if (statusEl) statusEl.textContent = '';
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
    }
  }

  if (btnPrev) btnPrev.addEventListener('click', function () {
    go(-1);
  });
  if (btnNext) btnNext.addEventListener('click', function () {
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
