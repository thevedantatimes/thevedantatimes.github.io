---
layout: default
title: Categories
---

<section class="cat-page">
  <header class="cat-head">
    <h1 class="cat-title">Browse</h1>
    <p class="cat-sub">Filter posts by venue, event, speaker, or year. Results show 5 posts per page.</p>
  </header>

  <div class="cat-filters" aria-label="Filters">
    <label class="cat-filter">
      <span class="cat-filter-label">All venues</span>
      <select id="fVenue" class="cat-select">
        <option value="">All venues</option>
        <option value="Chicago">Chicago</option>
        <option value="New York">New York</option>
        <option value="Belur Math">Belur Math</option>
      </select>
    </label>

    <label class="cat-filter">
      <span class="cat-filter-label">All events</span>
      <select id="fEvent" class="cat-select">
        <option value="">All events</option>
        <option value="Kalpataru Kathamrita">Kalpataru Kathamrita</option>
      </select>
    </label>

    <label class="cat-filter">
      <span class="cat-filter-label">All speakers</span>
      <select id="fSpeaker" class="cat-select">
        <option value="">All speakers</option>
        <option value="Swami Sarvapriyananda">Swami Sarvapriyananda</option>
        <option value="Swami Ishatmananda">Swami Ishatmananda</option>
        <option value="Swami Vivekananda">Swami Vivekananda</option>
        <option value="Sri Ramakrishna">Sri Ramakrishna</option>
      </select>
    </label>

    <label class="cat-filter">
      <span class="cat-filter-label">All years</span>
      <select id="fYear" class="cat-select">
        <option value="">All years</option>
        <!-- years injected -->
      </select>
    </label>
  </div>

  <div class="cat-grid" id="catGrid" aria-live="polite"></div>

  <div class="pager" id="catPager" hidden>
    <button class="pager-btn" id="btnPrev" type="button">Previous</button>
    <div class="pager-stat" id="pagerStat"></div>
    <button class="pager-btn" id="btnNext" type="button">Next</button>
  </div>
</section>

<script>
(() => {
  const DATA_URL = '{{ "/assets/data/posts.json" | relative_url }}';
  const PAGE_SIZE = 5;

  const gridEl  = document.getElementById('catGrid');
  const pagerEl = document.getElementById('catPager');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const statEl  = document.getElementById('pagerStat');

  const selVenue = document.getElementById('fVenue');
  const selEvent = document.getElementById('fEvent');
  const selSpeaker = document.getElementById('fSpeaker');
  const selYear = document.getElementById('fYear');

  function esc(s){
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  function normalizeCats(arr){
    if (!Array.isArray(arr)) return [];
    return arr.map(x => String(x || '').trim()).filter(Boolean);
  }

  function yearFromIso(iso){
    try {
      const d = new Date(String(iso || ''));
      const y = d.getFullYear();
      return Number.isFinite(y) ? String(y) : '';
    } catch (e) {
      return '';
    }
  }

  function getParams(){
    const u = new URL(window.location.href);
    const venue = (u.searchParams.get('venue') || '').trim();
    const event = (u.searchParams.get('event') || '').trim();
    const speaker = (u.searchParams.get('speaker') || '').trim();
    const year = (u.searchParams.get('year') || '').trim();

    let p = parseInt(u.searchParams.get('p') || '1', 10);
    if (!Number.isFinite(p) || p < 1) p = 1;

    return { venue, event, speaker, year, p };
  }

  function setParams(next){
    const u = new URL(window.location.href);

    function setOrDel(key, val){
      if (val) u.searchParams.set(key, val);
      else u.searchParams.delete(key);
    }

    setOrDel('venue', next.venue || '');
    setOrDel('event', next.event || '');
    setOrDel('speaker', next.speaker || '');
    setOrDel('year', next.year || '');

    u.searchParams.set('p', String(next.p || 1));

    history.replaceState(null, '', u.toString());
  }

  function ensureOption(selectEl, value){
    if (!selectEl) return;
    if (!value) return;
    const exists = Array.from(selectEl.options || []).some(o => String(o.value) === String(value));
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    }
  }

  function applyParamsToSelects(params){
    ensureOption(selVenue, params.venue);
    ensureOption(selEvent, params.event);
    ensureOption(selSpeaker, params.speaker);
    ensureOption(selYear, params.year);

    if (selVenue) selVenue.value = params.venue || '';
    if (selEvent) selEvent.value = params.event || '';
    if (selSpeaker) selSpeaker.value = params.speaker || '';
    if (selYear) selYear.value = params.year || '';
  }

  function buildYearOptions(posts){
    if (!selYear) return;

    const set = new Set();
    (posts || []).forEach(p => {
      const y = yearFromIso(p && p.date);
      if (y) set.add(y);
    });

    const years = Array.from(set).sort((a,b) => String(b).localeCompare(String(a)));

    const keepFirst = selYear.options[0];
    selYear.innerHTML = '';
    if (keepFirst) selYear.appendChild(keepFirst);

    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      selYear.appendChild(opt);
    });
  }

  function matchVenue(cats, venue){
    if (!venue) return true;
    return cats.includes(venue);
  }

  function matchSpeaker(cats, speaker){
    if (!speaker) return true;
    return cats.includes(speaker);
  }

  function matchYear(post, year){
    if (!year) return true;
    return yearFromIso(post && post.date) === String(year);
  }

  function matchEvent(post, event){
    if (!event) return true;

    const cats = normalizeCats(post && post.categories);
    const title = String((post && post.title) || '').toLowerCase();

    if (event === 'Kalpataru Kathamrita') {
      const hasKalpataru = cats.includes('Kalpataru') || title.indexOf('kalpataru') >= 0;
      const hasKathamrita = cats.includes('Ramakrishna Kathamrita') || cats.includes('Kathamrita') || title.indexOf('kathamrita') >= 0;
      return hasKalpataru || hasKathamrita;
    }

    return cats.includes(event) || title.indexOf(String(event).toLowerCase()) >= 0;
  }

  function render(posts, filters, page){
    const filtered = (posts || []).filter(p => {
      const cats = normalizeCats(p && p.categories);
      return (
        matchVenue(cats, filters.venue) &&
        matchEvent(p, filters.event) &&
        matchSpeaker(cats, filters.speaker) &&
        matchYear(p, filters.year)
      );
    });

    // Newest first
    filtered.sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);

    const start = (p - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    if (!gridEl) return;

    if (total === 0){
      gridEl.innerHTML = `<div class="cat-card"><h3>No posts found</h3><p>Try different filter combinations.</p></div>`;
    } else {
      gridEl.innerHTML = slice.map(post => {
        const title = esc(post.title);
        const url = esc(post.url);
        const snip = esc(post.snippet);
        const meta = esc(post.dateHuman || '');
        return `
          <article class="cat-card">
            <h3><a href="${url}">${title}</a></h3>
            <div class="meta">${meta}</div>
            <p>${snip}</p>
          </article>
        `;
      }).join('');
    }

    if (pagerEl){
      pagerEl.hidden = total <= PAGE_SIZE;
      if (!pagerEl.hidden){
        btnPrev.disabled = p <= 1;
        btnNext.disabled = p >= pages;
        statEl.textContent = `Page ${p} of ${pages}`;
        btnPrev.onclick = () => {
          setParams({ ...filters, p: p - 1 });
          render(posts, filters, p - 1);
        };
        btnNext.onclick = () => {
          setParams({ ...filters, p: p + 1 });
          render(posts, filters, p + 1);
        };
      }
    }
  }

  function bindFilters(posts){
    function currentFilters(){
      return {
        venue: (selVenue && selVenue.value) || '',
        event: (selEvent && selEvent.value) || '',
        speaker: (selSpeaker && selSpeaker.value) || '',
        year: (selYear && selYear.value) || ''
      };
    }

    function onChange(){
      const filters = currentFilters();
      setParams({ ...filters, p: 1 });
      render(posts, filters, 1);
    }

    [selVenue, selEvent, selSpeaker, selYear].forEach(el => {
      if (!el) return;
      el.addEventListener('change', onChange);
    });
  }

  async function main(){
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    const posts = await res.json();

    buildYearOptions(posts);

    const params = getParams();
    applyParamsToSelects(params);

    const filters = {
      venue: params.venue,
      event: params.event,
      speaker: params.speaker,
      year: params.year
    };

    render(posts, filters, params.p);
    bindFilters(posts);
  }

  main().catch(() => {
    if (gridEl) gridEl.innerHTML = `<div class="cat-card"><h3>Could not load posts</h3><p>Refresh and try again.</p></div>`;
  });
})();
</script>
