---
layout: default
title: Categories
---

<section class="cat-page">
  <header class="cat-head">
    <h1 class="cat-title">Browse by category</h1>
    <p class="cat-sub">Click a category to see matching posts. Results show 5 posts per page.</p>
  </header>

  <nav class="cat-chips" id="catChips" aria-label="Categories">
    <!-- injected -->
  </nav>

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

  const chipsEl = document.getElementById('catChips');
  const gridEl  = document.getElementById('catGrid');
  const pagerEl = document.getElementById('catPager');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const statEl  = document.getElementById('pagerStat');

  function esc(s){
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  function getParams(){
    const u = new URL(window.location.href);
    const c = (u.searchParams.get('c') || '').trim();
    let p = parseInt(u.searchParams.get('p') || '1', 10);
    if (!Number.isFinite(p) || p < 1) p = 1;
    return { c, p };
  }

  function setParams(next){
    const u = new URL(window.location.href);
    if (next.c) u.searchParams.set('c', next.c);
    else u.searchParams.delete('c');
    u.searchParams.set('p', String(next.p || 1));
    window.location.href = u.toString();
  }

  function normalizeCats(arr){
    if (!Array.isArray(arr)) return [];
    return arr.map(x => String(x || '').trim()).filter(Boolean);
  }

  function buildCategoryCounts(posts){
    const map = new Map();
    posts.forEach(p => {
      normalizeCats(p.categories).forEach(c => map.set(c, (map.get(c) || 0) + 1));
    });
    return Array.from(map.entries()).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function renderChips(counts, selected){
    if (!chipsEl) return;
    const allActive = !selected;

    let html = '';
    html += `<a class="cat-chip ${allActive ? 'active' : ''}" href="?p=1">All <span class="sep">·</span> ${counts.reduce((s, x) => s + x[1], 0)}</a>`;

    counts.forEach(([name, count]) => {
      const active = selected && selected === name;
      html += `<a class="cat-chip ${active ? 'active' : ''}" href="?c=${encodeURIComponent(name)}&p=1">${esc(name)} <span class="sep">·</span> ${count}</a>`;
    });

    chipsEl.innerHTML = html;
  }

  function renderPosts(posts, selected, page){
    const filtered = selected
      ? posts.filter(p => normalizeCats(p.categories).includes(selected))
      : posts.slice();

    // Newest first (date is ISO string)
    filtered.sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);
    const start = (p - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    if (!gridEl) return;

    if (total === 0){
      gridEl.innerHTML = `<div class="cat-card"><h3>No posts found</h3><p>Try a different category.</p></div>`;
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
        btnPrev.onclick = () => setParams({ c: selected, p: p - 1 });
        btnNext.onclick = () => setParams({ c: selected, p: p + 1 });
      }
    }
  }

  async function main(){
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    const posts = await res.json();

    const { c, p } = getParams();
    const selected = c || '';

    const counts = buildCategoryCounts(posts);
    renderChips(counts, selected);
    renderPosts(posts, selected, p);
  }

  main().catch(() => {
    if (gridEl) gridEl.innerHTML = `<div class="cat-card"><h3>Could not load posts</h3><p>Refresh and try again.</p></div>`;
  });
})();
</script>
