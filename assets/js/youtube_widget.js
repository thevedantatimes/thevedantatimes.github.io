(function () {
  const root = document.getElementById('ytWidget');
  if (!root) return;

  const btnPrev = root.querySelector('[data-vw-prev]');
  const btnNext = root.querySelector('[data-vw-next]');
  const statusEl = root.querySelector('[data-vw-status]');
  const listEl = root.querySelector('[data-vw-list]');

  const PAGE_SIZE = 2;
  let items = [];
  let page = 0;
  let lastErrors = [];

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

  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
      const hasErr = Array.isArray(lastErrors) && lastErrors.length;
      const hint = hasErr
        ? 'Feed fetch had errors during the last site build.'
        : 'If you are previewing locally, run scripts/fetch_youtube.py once.';
      listEl.innerHTML = '<div class="vw-empty">No videos yet.<div class="vw-hint">' + esc(hint) + '</div></div>';
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

  async function load() {
    try {
      const url = root.getAttribute('data-json') || '/assets/data/youtube_videos.json';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      items = Array.isArray(data.items) ? data.items : [];
      lastErrors = Array.isArray(data.errors) ? data.errors : [];
      render();
    } catch (e) {
      if (listEl) {
        listEl.innerHTML = '<div class="vw-empty">Videos unavailable right now.</div>';
      }
      if (statusEl) statusEl.textContent = '';
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
    }
  }

  if (btnPrev) btnPrev.addEventListener('click', function () { go(-1); });
  if (btnNext) btnNext.addEventListener('click', function () { go(1); });

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
