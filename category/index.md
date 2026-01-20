---
layout: default
title: Categories
---

<section class="cat-page">
  <style>
    /* Category page local polish */
    .cat-page { padding-top: 8px; }
    .cat-filters {
      display: flex;
      flex-wrap: nowrap;
      gap: 10px;
      align-items: center;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding: 8px 2px 10px;
      border-bottom: 1px solid rgba(0,0,0,0.10);
      margin-bottom: 10px;
    }
    .cat-filters::-webkit-scrollbar { height: 6px; }

    .cat-select {
      width: auto;
      max-width: 100%;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.14);
      background: #fff;
      font: inherit;
      line-height: 1.1;
      white-space: nowrap;
    }

    .cat-summary {
      font-size: 14px;
      opacity: 0.92;
      margin: 6px 0 12px;
      padding: 0 2px;
    }

    @media (max-width: 560px){
      .cat-select { padding: 7px 9px; }
      .cat-summary { font-size: 13px; }
    }
  </style>

  <div class="cat-filters" aria-label="Filters">
    <select id="fVenue" class="cat-select" aria-label="Venue">
      <option value="">Venue</option>
      <option value="Chicago">Chicago</option>
      <option value="New York">New York</option>
      <option value="Belur Math">Belur Math</option>
    </select>

    <select id="fSpeaker" class="cat-select" aria-label="Speaker">
      <option value="">Speaker</option>
      <option value="Swami Sarvapriyananda">Swami Sarvapriyananda</option>
      <option value="Swami Ishatmananda">Swami Ishatmananda</option>
      <option value="Swami Purnananda">Swami Purnananda</option>
    </select>

    <select id="fSubject" class="cat-select" aria-label="Subject">
      <option value="">Subject</option>
      <option value="Sri Ramakrishna">Sri Ramakrishna</option>
      <option value="Swami Vivekananda">Swami Vivekananda</option>
      <option value="Maa Sarada">Maa Sarada</option>
      <option value="Kalpataru">Kalpataru</option>
      <option value="Kathamrita">Kathamrita</option>
      <option value="Durga Puja">Durga Puja</option>
      <option value="Kali Puja">Kali Puja</option>
      <option value="Yoga">Yoga</option>
      <option value="Maya">Maya</option>
      <option value="Meditation">Meditation</option>
    </select>

    <select id="fText" class="cat-select" aria-label="Text">
      <option value="">Text</option>
      <option value="Kathamrita">Kathamrita</option>
      <option value="Bhagavad Gita">Bhagavad Gita</option>
      <option value="Uddhava Gita">Uddhava Gita</option>
      <option value="Upanishads">Upanishads</option>
    </select>

    <select id="fFormat" class="cat-select" aria-label="Format">
      <option value="">Format</option>
      <option value="Talk">Talk</option>
      <option value="Puja">Puja</option>
    </select>

    <select id="fYear" class="cat-select" aria-label="Year">
      <option value="">Year</option>
      <!-- years injected -->
    </select>
  </div>

  <div class="cat-summary" id="catSummary" aria-live="polite"></div>

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
  const sumEl   = document.getElementById('catSummary');

  const selVenue   = document.getElementById('fVenue');
  const selSpeaker = document.getElementById('fSpeaker');
  const selSubject = document.getElementById('fSubject');
  const selText    = document.getElementById('fText');
  const selFormat  = document.getElementById('fFormat');
  const selYear    = document.getElementById('fYear');

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

  function normText(s){
    return String(s || '').toLowerCase();
  }

  function includesWord(hay, needle){
    const h = normText(hay);
    const n = normText(needle);
    return n && h.indexOf(n) >= 0;
  }

  function getParams(){
    const u = new URL(window.location.href);
    const venue   = (u.searchParams.get('venue') || '').trim();
    const speaker = (u.searchParams.get('speaker') || '').trim();
    const subject = (u.searchParams.get('subject') || '').trim();
    const text    = (u.searchParams.get('text') || '').trim();
    const format  = (u.searchParams.get('format') || '').trim();
    const year    = (u.searchParams.get('year') || '').trim();

    let p = parseInt(u.searchParams.get('p') || '1', 10);
    if (!Number.isFinite(p) || p < 1) p = 1;

    return { venue, speaker, subject, text, format, year, p };
  }

  function setParams(next){
    const u = new URL(window.location.href);

    function setOrDel(key, val){
      if (val) u.searchParams.set(key, val);
      else u.searchParams.delete(key);
    }

    setOrDel('venue', next.venue || '');
    setOrDel('speaker', next.speaker || '');
    setOrDel('subject', next.subject || '');
    setOrDel('text', next.text || '');
    setOrDel('format', next.format || '');
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
    ensureOption(selSpeaker, params.speaker);
    ensureOption(selSubject, params.subject);
    ensureOption(selText, params.text);
    ensureOption(selFormat, params.format);
    ensureOption(selYear, params.year);

    if (selVenue) selVenue.value = params.venue || '';
    if (selSpeaker) selSpeaker.value = params.speaker || '';
    if (selSubject) selSubject.value = params.subject || '';
    if (selText) selText.value = params.text || '';
    if (selFormat) selFormat.value = params.format || '';
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

  function isPujaPost(post){
    const title = String((post && post.title) || '');
    const snip  = String((post && post.snippet) || '');
    const cats  = normalizeCats(post && post.categories).join(' | ');
    const blob  = (title + ' ' + snip + ' ' + cats);
    return /\bpuja\b/i.test(blob) || /\bpujo\b/i.test(blob);
  }

  function matchVenue(cats, venue){
    if (!venue) return true;
    return cats.includes(venue);
  }

  function matchSpeaker(cats, speaker){
    if (!speaker) return true;
    return cats.includes(speaker);
  }

  function matchSubject(post, subject){
    if (!subject) return true;

    const cats = normalizeCats(post && post.categories);
    const title = String((post && post.title) || '');
    const snip = String((post && post.snippet) || '');

    if (cats.includes(subject)) return true;

    // Common soft matches
    return includesWord(title, subject) || includesWord(snip, subject);
  }

  function matchText(post, text){
    if (!text) return true;

    const cats = normalizeCats(post && post.categories);
    const title = String((post && post.title) || '');
    const snip = String((post && post.snippet) || '');

    // Simple canonicalization
    if (text === 'Bhagavad Gita') {
      return cats.includes('Gita') || cats.includes('Bhagavad Gita') || includesWord(title, 'gita') || includesWord(snip, 'gita');
    }

    if (text === 'Uddhava Gita') {
      return cats.includes('Uddhava Gita') || includesWord(title, 'uddhava') || includesWord(snip, 'uddhava');
    }

    if (text === 'Upanishads') {
      return cats.includes('Upanishads') || includesWord(title, 'upanishad') || includesWord(snip, 'upanishad');
    }

    // Kathamrita
    return cats.includes(text) || includesWord(title, text) || includesWord(snip, text);
  }

  function matchFormat(post, format){
    if (!format) return true;

    const puja = isPujaPost(post);
    if (format === 'Puja') return puja;
    if (format === 'Talk') return !puja;

    return true;
  }

  function matchYear(post, year){
    if (!year) return true;
    return yearFromIso(post && post.date) === String(year);
  }

  function joinPretty(parts){
    const clean = (parts || []).map(String).filter(Boolean);
    if (!clean.length) return '';
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return clean[0] + ' and ' + clean[1];
    return clean.slice(0, -1).join(', ') + ', and ' + clean[clean.length - 1];
  }

  function describeFilters(filters){
    const out = [];
    if (filters.venue) out.push('Venue ' + filters.venue);
    if (filters.speaker) out.push('Speaker ' + filters.speaker);
    if (filters.subject) out.push('Subject ' + filters.subject);
    if (filters.text) out.push('Text ' + filters.text);
    if (filters.format) out.push('Format ' + filters.format);
    if (filters.year) out.push('Year ' + filters.year);
    return out;
  }

  function setSummary(total, filters){
    if (!sumEl) return;

    const parts = describeFilters(filters);
    const tail = parts.length ? (' for ' + joinPretty(parts)) : '';

    if (total > 0){
      sumEl.textContent = 'Showing ' + total + ' results' + tail + '.';
    } else {
      sumEl.textContent = 'No results' + tail + '. Try changing the filter?';
    }
  }

  function render(posts, filters, page){
    const filtered = (posts || []).filter(p => {
      const cats = normalizeCats(p && p.categories);
      return (
        matchVenue(cats, filters.venue) &&
        matchSpeaker(cats, filters.speaker) &&
        matchSubject(p, filters.subject) &&
        matchText(p, filters.text) &&
        matchFormat(p, filters.format) &&
        matchYear(p, filters.year)
      );
    });

    // Newest first
    filtered.sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));

    const total = filtered.length;
    setSummary(total, filters);

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);

    const start = (p - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    if (!gridEl) return;

    if (total === 0){
      gridEl.innerHTML = `<div class="cat-card"><h3>No posts found</h3></div>`;
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
        statEl.textContent = 'Page ' + p + ' of ' + pages;
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

  function fitSelectToWidest(selectEl){
    if (!selectEl) return;

    const style = window.getComputedStyle(selectEl);
    const font = style.font || (style.fontStyle + ' ' + style.fontVariant + ' ' + style.fontWeight + ' ' + style.fontSize + '/' + style.lineHeight + ' ' + style.fontFamily);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = font;

    let max = 0;
    Array.from(selectEl.options || []).forEach(opt => {
      const w = ctx.measureText(String(opt.text || '')).width;
      if (w > max) max = w;
    });

    // Add padding and room for the caret
    const padLeft = parseFloat(style.paddingLeft || '0') || 0;
    const padRight = parseFloat(style.paddingRight || '0') || 0;
    const extra = 28;

    selectEl.style.width = Math.ceil(max + padLeft + padRight + extra) + 'px';
  }

  function fitAllSelects(){
    [selVenue, selSpeaker, selSubject, selText, selFormat, selYear].forEach(fitSelectToWidest);
  }

  function bindFilters(posts){
    function currentFilters(){
      return {
        venue: (selVenue && selVenue.value) || '',
        speaker: (selSpeaker && selSpeaker.value) || '',
        subject: (selSubject && selSubject.value) || '',
        text: (selText && selText.value) || '',
        format: (selFormat && selFormat.value) || '',
        year: (selYear && selYear.value) || ''
      };
    }

    function onChange(){
      const filters = currentFilters();
      setParams({ ...filters, p: 1 });
      fitAllSelects();
      render(posts, filters, 1);
    }

    [selVenue, selSpeaker, selSubject, selText, selFormat, selYear].forEach(el => {
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
      speaker: params.speaker,
      subject: params.subject,
      text: params.text,
      format: params.format,
      year: params.year
    };

    fitAllSelects();

    render(posts, filters, params.p);
    bindFilters(posts);
  }

  main().catch(() => {
    if (sumEl) sumEl.textContent = 'No results. Try changing the filter?';
    if (gridEl) gridEl.innerHTML = `<div class="cat-card"><h3>Could not load posts</h3><p>Refresh and try again.</p></div>`;
  });
})();
</script>
