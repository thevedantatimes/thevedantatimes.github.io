(function () {
  const root = document.getElementById('ytWidget');
  if (!root) return;

  const btnPrev = root.querySelector('[data-vw-prev]');
  const btnNext = root.querySelector('[data-vw-next]');
  const statusEl = root.querySelector('[data-vw-status]');
  const listEl = root.querySelector('[data-vw-list]');
  const gateEl = root.querySelector('[data-vw-gate]');

  const PAGE_SIZE = 5;
  const MAX_ITEMS_GLOBAL = 200;
  const TITLE_MAX = 30;
  const CH_MAX = 14;

  // Cache policy
  const CACHE_TARGET = 15;           // stop fetching for a channel once it reaches this
  const RETRY_EVERY_MS = 20000;      // 20 seconds
  const RETRY_MAX = 60;             // up to 60 attempts
  const STORAGE_PREFIX = 'vtt_yt_cache_v1::';
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours max age for cached feeds

  // Feeds
  const FEEDS = [
    { name: '@ChicagoVedanta', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC64nHa3IWptZ-KPlQxdfsbw' },
    { name: '@VedantaNY', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZOKv_xnTzyLD9RJmbBUV9Q' },
    { name: '@VedantaOrg', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCoeQClkDRaj9uABKHfHJUdw' },
    { name: '@vedantasocietyofwesternwa', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHNlxSbZiXS6oBJuJEiiIPA' },
    { name: '@VedantaDC', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4zi_tfjGdO4Gjulz-GSAvg' },
    { name: '@belurmathofficial', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCuv4AUvgAgut3zdiPmvG5Pw' },
    { name: '@chicagokalibari409', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCcuwf7Azn8cU1oHT2-if-hg' },
    { name: '@vedantasocietyofprovidence5481', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCFof5116HcBYIpUFvKet1Uw' },
    { name: '@VSGHHouston', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCrns-wvaTNhREStmcs96CyQ' },
    { name: '@SanDiegoVedantaMonastery', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCPt5Xl5Iu7D1pt7XMGxuYgQ' }
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


  // -------------------------
  // In-tab video overlay player
  // -------------------------
  let _vttOverlayReady = false;
  let _vttScrollLockY = 0;

  function _vttLockScroll() {
    try {
      _vttScrollLockY = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = (-_vttScrollLockY) + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    } catch (e) {
      // ignore
    }
  }

  function _vttUnlockScroll() {
    try {
      const y = _vttScrollLockY || 0;
      if (document.body && document.body.style && document.body.style.position === 'fixed') {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, y);
      }
    } catch (e) {
      // ignore
    }
  }

  function _vttEnsureOverlay() {
    if (_vttOverlayReady) return;
    _vttOverlayReady = true;

    const el = document.createElement('div');
    el.id = 'vttVideoOverlay';
    el.className = 'vtt-vo';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="vtt-vo-backdrop" data-vo-close></div>' +
      '<div class="vtt-vo-panel" role="dialog" aria-modal="true" aria-label="Video player">' +
      '  <button class="vtt-vo-close" type="button" aria-label="Close" data-vo-close>×</button>' +
      '  <div class="vtt-vo-frame" data-vo-frame></div>' +
      '</div>';

    document.body.appendChild(el);

    el.addEventListener('click', function (ev) {
      const c = ev.target && ev.target.closest ? ev.target.closest('[data-vo-close]') : null;
      if (c) _vttCloseOverlay();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') _vttCloseOverlay();
    });
  }

  function _vttOpenOverlay(videoId) {
    videoId = String(videoId || '').trim();
    if (!videoId) return;
    _vttEnsureOverlay();

    const el = document.getElementById('vttVideoOverlay');
    if (!el) return;

    const frame = el.querySelector('[data-vo-frame]');
    if (frame) {
      // Use nocookie embed for privacy + keep viewer inside the site.
      const src =
        'https://www.youtube-nocookie.com/embed/' +
        encodeURIComponent(videoId) +
        '?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1';

      frame.innerHTML =
        '<iframe class="vtt-vo-iframe" ' +
        'src="' +
        src +
        '" title="YouTube video player" frameborder="0" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
        'allowfullscreen></iframe>';
    }

    _vttLockScroll();

    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('vtt-vo-open');
  }

  function _vttCloseOverlay() {
    const el = document.getElementById('vttVideoOverlay');
    if (!el) return;
    const frame = el.querySelector('[data-vo-frame]');
    if (frame) frame.innerHTML = '';
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('vtt-vo-open');

    _vttUnlockScroll();
  }

  function _vttExtractVideoIdFromUrl(href) {
    try {
      const u = new URL(href, window.location.href);
      const host = (u.hostname || '').toLowerCase();
      if (host.endsWith('youtu.be')) {
        const id = (u.pathname || '').replace(/^\/+/, '').split('/')[0];
        return id || '';
      }
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = (u.pathname || '').split('/').filter(Boolean);
      // /shorts/<id>
      const i = parts.indexOf('shorts');
      if (i >= 0 && parts[i + 1]) return parts[i + 1];
      // /embed/<id>
      const j = parts.indexOf('embed');
      if (j >= 0 && parts[j + 1]) return parts[j + 1];
      return '';
    } catch (e) {
      return '';
    }
  }

  // -------------------------
  // Home page autoplay tiles (2 channels)
  // -------------------------
  const HOME_TILE_PREFIX = 'vtt_home_tile_v1::';
  const HOME_TILE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  function _vttChannelIdFromFeedUrl(feedUrl) {
    try {
      const u = new URL(feedUrl);
      return u.searchParams.get('channel_id') || '';
    } catch (e) {
      return '';
    }
  }

  function _vttFeedNameForChannelId(channelId) {
    for (let i = 0; i < FEEDS.length; i++) {
      const cid = _vttChannelIdFromFeedUrl(FEEDS[i].url);
      if (cid && cid === channelId) return FEEDS[i].name;
    }
    return '';
  }

  function _vttFmtMins(durationSec) {
    var s = parseInt(durationSec || 0, 10) || 0;
    if (!s) return '';
    var m = Math.max(1, Math.round(s / 60));
    return m + ' min';
  }

  function _vttFillHomeInfo(slotEl, title, channel, published, durationSec) {
    if (!slotEl) return;
    const wrap = slotEl.closest ? slotEl.closest('.fv-item') : null;
    const rootEl = wrap || slotEl.parentElement;
    if (!rootEl) return;

    const tEl = rootEl.querySelector('[data-home-yt-title]');
    const cEl = rootEl.querySelector('[data-home-yt-channel]');
    const dEl = rootEl.querySelector('[data-home-yt-date]');
    const durEl = rootEl.querySelector('[data-home-yt-duration]');
    const sepEl = rootEl.querySelector('.fv-sep');

    const dt = fmtDate(published);
    const ch = String(channel || '').trim();
    const tt = String(title || '').trim();
    const mm = _vttFmtMins(durationSec);

    if (tEl) tEl.textContent = trimTo(tt, 56);
    if (cEl) cEl.textContent = ch;
    if (dEl) dEl.textContent = dt;
    if (durEl) durEl.textContent = mm;
    if (sepEl) sepEl.style.display = ch && dt ? '' : 'none';
  }

  function _vttGetHomeChannelIds() {
    const cfg = Array.isArray(window.VTT_HOME_YT_CHANNELS) ? window.VTT_HOME_YT_CHANNELS : [];
    const cleaned = cfg
      .map(function (s) {
        return String(s || '').trim();
      })
      .filter(function (s) {
        return /^UC[\w-]{10,}$/.test(s);
      });

    if (cleaned.length >= 2) return cleaned.slice(0, 2);

    // fallback: first 2 FEEDS
    const fb = FEEDS.map(function (f) {
      return _vttChannelIdFromFeedUrl(f.url);
    }).filter(Boolean);

    return fb.slice(0, 2);
  }

  function _vttReadHomeTileCache(channelId) {
    try {
      const raw = localStorage.getItem(HOME_TILE_PREFIX + channelId);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.videoId) return null;
      const ts = new Date(obj.updatedAt || 0).getTime();
      if (!ts || Date.now() - ts > HOME_TILE_TTL_MS) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function _vttWriteHomeTileCache(channelId, videoId, published, title, channel, durationSec) {
    try {
      localStorage.setItem(
        HOME_TILE_PREFIX + channelId,
        JSON.stringify({
          updatedAt: new Date().toISOString(),
          videoId: videoId,
          published: published || '',
          title: title || '',
          channel: channel || '',
          durationSec: parseInt(durationSec || 0, 10) || 0
        })
      );
    } catch (e) {
      // ignore
    }
  }

  function _vttRenderTeaserInto(el, videoId) {
    if (!el) return;
    videoId = String(videoId || '').trim();
    el.setAttribute('data-video-id', videoId);

    if (!videoId) {
      el.innerHTML = '<div class="vb-yt-ph">Video</div>';
      return;
    }

    const src =
      'https://www.youtube-nocookie.com/embed/' +
      encodeURIComponent(videoId) +
      '?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=' +
      encodeURIComponent(videoId);

    el.innerHTML =
      '<div class="vb-yt-teaser" aria-hidden="true">' +
      '  <iframe class="vb-yt-teaser-iframe" src="' +
      src +
      '" title="" frameborder="0" ' +
      'allow="autoplay; encrypted-media; picture-in-picture" ' +
      'allowfullscreen></iframe>' +
      '  <div class="vb-yt-teaser-shade"></div>' +
      '  <div class="vb-yt-teaser-play">▶</div>' +
      '</div>';
  }

  async function _vttInstallHomeTiles() {
    const slots = Array.from(document.querySelectorAll('[data-home-yt-slot]'));
    if (!slots.length) return;

    // Keep the home sidebar tiles fully hidden (no gap) until BOTH videos are ready.
    const fvWrap = document.querySelector('.feature-videos');
    if (fvWrap) fvWrap.classList.remove('is-ready');

    function _vttMaybeRevealHomeTiles() {
      if (!fvWrap) return;
      if (fvWrap.classList.contains('is-ready')) return;
      if (!slots.length) return;

      const allReady = slots.every(function (el) {
        const vid = (el.getAttribute('data-video-id') || '').trim();
        return !!vid;
      });

      if (!allReady) return;

      // Two RAFs so the browser has a chance to apply the hidden state before fading in.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          fvWrap.classList.add('is-ready');
        });
      });
    }

    const channelIds = _vttGetHomeChannelIds();

    slots.forEach(function (el) {
      el.classList.add('vb-yt-tile');
      _vttRenderTeaserInto(el, '');

      el.addEventListener('click', function (ev) {
        const vid = el.getAttribute('data-video-id') || '';
        if (!vid) return;
        ev.preventDefault();
        _vttOpenOverlay(vid);
      });
    });

    for (let i = 0; i < slots.length; i++) {
      const el = slots[i];
      const idx = parseInt(el.getAttribute('data-home-yt-slot') || String(i), 10) || 0;
      const channelId = channelIds[idx] || channelIds[i] || '';
      if (!channelId) continue;

      const feedName = _vttFeedNameForChannelId(channelId) || ('@' + channelId);

      const cached = _vttReadHomeTileCache(channelId);
      if (cached && cached.videoId) {
        _vttRenderTeaserInto(el, cached.videoId);
        _vttFillHomeInfo(el, cached.title || '', cached.channel || feedName, cached.published || '', cached.durationSec || 0);

        _vttMaybeRevealHomeTiles();

        // If older cache entries are missing title/date, refresh in the background.
        if (cached.title && cached.published) continue;
      }

      try {
        const feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId);
        const txt = await fetchTextWithProxy(feedUrl);
        const parsed = parseRss(txt, feedName);
        const first = (parsed || [])[0];
        if (first && first.videoId) {
          _vttWriteHomeTileCache(channelId, first.videoId, first.published, first.title, first.channel, first.durationSec);
          _vttRenderTeaserInto(el, first.videoId);
          _vttFillHomeInfo(el, first.title, first.channel, first.published, first.durationSec);

          _vttMaybeRevealHomeTiles();
        }
      } catch (e) {
        // ignore
      }
    }

    _vttMaybeRevealHomeTiles();
  }

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
      const updatedAt = obj && obj.updatedAt ? Date.parse(obj.updatedAt) : NaN;
      // If the cache is too old, treat it as empty so we keep fetching fresh videos.
      if (Number.isFinite(updatedAt)) {
        const age = Date.now() - updatedAt;
        if (age > CACHE_TTL_MS) return [];
      }
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

        // Duration (seconds) if present in the feed
        let durSec = 0;
        try {
          const yd = e.getElementsByTagName('yt:duration')[0];
          if (yd && yd.getAttribute) {
            durSec = parseInt(yd.getAttribute('seconds') || '', 10) || 0;
          }
          if (!durSec) {
            let mc = null;
            const mg = e.getElementsByTagName('media:group')[0];
            if (mg) mc = mg.getElementsByTagName('media:content')[0];
            if (!mc) mc = e.getElementsByTagName('media:content')[0];
            if (mc && mc.getAttribute) {
              durSec = parseInt(mc.getAttribute('duration') || '', 10) || 0;
            }
          }
        } catch (e) {
          durSec = 0;
        }

        return {
          title: (title || '').trim(),
          url: (link || '').trim(),
          videoId: (vid || '').trim(),
          published: (pub || '').trim(),
          channel: channelHandle || '',
          durationSec: durSec || 0,
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
      .map(function (it, idx) {
        const t = esc(trimTo(it.title, TITLE_MAX));
        const ch = esc(trimTo(it.channel, CH_MAX));
        const dt = fmtDate(it.published);
        const href = esc(it.url);
        const vid = esc(it.videoId);

        const teaserSrc =
          'https://www.youtube-nocookie.com/embed/' +
          encodeURIComponent(it.videoId || '') +
          '?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=' +
          encodeURIComponent(it.videoId || '');

        // The 5th tile is a full-width card with meta below the video.
        if (idx === 4) {
          return (
            '<a class="vw-item vw-item--wide" href="' +
            href +
            '" data-video-id="' +
            vid +
            '">' +
            '  <span class="vw-thumb vw-thumb--wide">' +
            '    <div class="vb-yt-teaser" aria-hidden="true">' +
            '      <iframe class="vb-yt-teaser-iframe" src="' +
            teaserSrc +
            '" title="" frameborder="0" loading="eager" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
            '      <span class="vb-yt-teaser-shade"></span>' +
            '      <span class="vb-yt-teaser-play">▶</span>' +
            '    </div>' +
            '  </span>' +
            '  <span class="vw-info vw-info--below">' +
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
        }

        return (
          '<a class="vw-item" href="' +
          href +
          '" data-video-id="' +
          vid +
          '">' +
          '  <span class="vw-thumb">' +
          '    <div class="vb-yt-teaser" aria-hidden="true">' +
          '      <iframe class="vb-yt-teaser-iframe" src="' +
          teaserSrc +
          '" title="" frameborder="0" loading="eager" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
          '      <span class="vb-yt-teaser-shade"></span>' +
          '      <span class="vb-yt-teaser-play">▶</span>' +
          '    </div>' +
          '  </span>' +
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

    const wrap = document.createElement('div');
    wrap.className = 'vw-filter';

    const sel = document.createElement('select');
    sel.className = 'vw-select';
    sel.setAttribute('aria-label', 'Filter video channel');

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'Latest videos';
    sel.appendChild(optAll);

    FEEDS.forEach(function (f) {
      const o = document.createElement('option');
      o.value = f.name;
      o.textContent = f.name;
      sel.appendChild(o);
    });

    wrap.appendChild(sel);
    const controls = head.querySelector('.vw-controls');
    if (controls) head.insertBefore(wrap, controls);
    else head.appendChild(wrap);
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
    // Home page autoplay tiles (non-blocking)
    _vttInstallHomeTiles().catch(function(){ });

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


  if (listEl) {
    listEl.addEventListener('click', function (ev) {
      const a = ev.target && ev.target.closest ? ev.target.closest('a.vw-item') : null;
      if (!a) return;
      const vid = a.getAttribute('data-video-id') || _vttExtractVideoIdFromUrl(a.getAttribute('href') || '');
      if (!vid) return;
      ev.preventDefault();
      _vttOpenOverlay(vid);
    });
  }

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
