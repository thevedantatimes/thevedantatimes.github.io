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

      var h = parseInt(iframe.getAttribute('height') || '', 10);
      if (!h || h < 200) h = 500;

      var wrapper = document.createElement('div');
      wrapper.className = 'vb-yt-post vb-yt-tile';
      wrapper.style.height = String(h) + 'px';
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

    var indexUrl = (window.VTT_POSTS_INDEX_URL || '/assets/data/posts_index.json');

    fetch(indexUrl, { cache: 'no-store' })
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
      .catch(function (err) {
        try {
          console.warn('[VTT] Recommended-article popup disabled:', err);
        } catch (e) {}
      });
  }

  function init() {
    var postArticle = document.querySelector('article.post');
    if (!postArticle) return;

    upgradeYouTubeEmbeds(postArticle);
    initRecommendations(postArticle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
