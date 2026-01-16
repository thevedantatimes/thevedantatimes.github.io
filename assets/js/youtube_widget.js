/* Latest Videos sidebar widget (multi-channel RSS) */
(function(){
  const FEEDS = [
    { name: '@ChicagoVedanta', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC64nHa3IWptZ-KPlQxdfsbw' },
    { name: '@VedantaNY', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZOKv_xnTzyLD9RJmbBUV9Q' },
    { name: '@VedantaOrg', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCoeQClkDRaj9uABKHfHJUdw' },
    { name: '@vedantasocietyofwesternwa', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHNlxSbZiXS6oBJuJEiiIPA' },
    { name: '@VedantaDC', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4zi_tfjGdO4Gjulz-GSAvg' },
    { name: '@belurmathofficial', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCuv4AUvgAgut3zdiPmvG5Pw' },
  ];

  const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest=' // fallback
  ];

  function esc(s){
    return String(s||'').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function ytThumb(videoId){
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg';
  }

  function fmtDate(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'2-digit' });
    }catch(e){ return iso || ''; }
  }

  async function fetchTextWithRetry(url, attempts){
    const maxAttempts = Math.max(1, attempts || 3);
    let lastErr;

    for (let pi=0; pi<PROXIES.length; pi++){
      const proxy = PROXIES[pi];
      const proxied = proxy + encodeURIComponent(url);

      for (let i=0; i<maxAttempts; i++){
        try{
          const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
          const t = ctrl ? setTimeout(() => ctrl.abort(), 9000) : null;
          const res = await fetch(proxied, ctrl ? { signal: ctrl.signal } : undefined);
          if (t) clearTimeout(t);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return await res.text();
        }catch(e){
          lastErr = e;
          // small backoff; W3 sometimes needed a second run
          await new Promise(r => setTimeout(r, 450 + i*350));
        }
      }
    }
    throw lastErr || new Error('Fetch failed');
  }

  function parseFeed(xmlText, sourceName){
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));

    return entries.map(e => {
      const title = e.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled';
      const link  = e.getElementsByTagName('link')[0]?.getAttribute('href') || '';
      const vid   = e.getElementsByTagName('yt:videoId')[0]?.textContent?.trim() || '';
      const pub   = e.getElementsByTagName('published')[0]?.textContent?.trim() || '';
      return {
        source: sourceName || '',
        title,
        link,
        videoId: vid,
        thumb: vid ? ytThumb(vid) : '',
        published: pub,
        publishedText: pub ? fmtDate(pub) : ''
      };
    }).filter(v => v.videoId && v.link);
  }

  function uniqByVideoId(arr){
    const seen = new Set();
    const out = [];
    for (const v of arr){
      if (!v.videoId) continue;
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      out.push(v);
    }
    return out;
  }

  function getCacheKey(){ return 'vtt_youtube_v1'; }

  function loadCache(){
    try{
      const raw = sessionStorage.getItem(getCacheKey());
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.items) || !obj.ts) return null;
      // 10 min cache
      if ((Date.now() - obj.ts) > 10*60*1000) return null;
      return obj.items;
    }catch(e){ return null; }
  }

  function saveCache(items){
    try{
      sessionStorage.setItem(getCacheKey(), JSON.stringify({ ts: Date.now(), items }));
    }catch(e){}
  }

  function initWidget(root){
    const pageSize = Math.max(1, parseInt(root.getAttribute('data-yt-page-size') || '2', 10) || 2);
    const listEl   = root.querySelector('[data-yt-list]');
    const statusEl = root.querySelector('[data-yt-status]');
    const prevBtn  = root.querySelector('[data-yt-prev]');
    const nextBtn  = root.querySelector('[data-yt-next]');
    const pagerEl  = root.querySelector('[data-yt-pager]');

    let items = [];
    let page = 0;

    function render(){
      const total = items.length;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.max(0, Math.min(page, pages - 1));

      if (pagerEl) pagerEl.textContent = total ? ((page + 1) + '/' + pages) : '0/0';

      if (prevBtn) prevBtn.disabled = (total === 0);
      if (nextBtn) nextBtn.disabled = (total === 0);

      if (listEl) listEl.innerHTML = '';

      if (!total){
        if (statusEl) statusEl.innerHTML = '<span class="ytErr">No videos yet (or feed fetch blocked).</span>';
        return;
      }

      const start = page * pageSize;
      const slice = items.slice(start, start + pageSize);

      for (const v of slice){
        const div = document.createElement('div');
        div.className = 'ytItem';
        div.innerHTML = `
          <a href="${esc(v.link)}" target="_blank" rel="noopener">
            <img class="ytThumb" src="${esc(v.thumb)}" alt="${esc(v.title)}">
          </a>
          <div class="ytTxt">
            <a href="${esc(v.link)}" target="_blank" rel="noopener">${esc(v.title)}</a>
            <div class="ytDate">${esc(v.publishedText)} · ${esc(v.source)}</div>
          </div>
        `;
        listEl.appendChild(div);
      }

      if (statusEl) statusEl.textContent = '';
    }

    if (prevBtn){
      prevBtn.addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
    }
    if (nextBtn){
      nextBtn.addEventListener('click', () => {
        const pages = Math.max(1, Math.ceil(items.length / pageSize));
        page = Math.min(pages - 1, page + 1);
        render();
      });
    }

    async function load(){
      if (statusEl) statusEl.textContent = 'Loading…';

      const cached = loadCache();
      if (cached && cached.length){
        items = cached;
        page = 0;
        render();
        return;
      }

      const all = [];
      const results = await Promise.allSettled(
        FEEDS.map(async f => {
          const xml = await fetchTextWithRetry(f.url, 3);
          return parseFeed(xml, f.name);
        })
      );

      for (const r of results){
        if (r.status === 'fulfilled') all.push(...(r.value || []));
      }

      items = uniqByVideoId(all).sort((a,b) => new Date(b.published) - new Date(a.published));
      if (items.length > 120) items = items.slice(0, 120);
      saveCache(items);

      page = 0;
      render();

      // If everything failed (sometimes proxies flake), auto-try once more.
      if (!items.length){
        if (statusEl) statusEl.textContent = 'Retrying…';
        await new Promise(r => setTimeout(r, 900));
        sessionStorage.removeItem(getCacheKey());
        return load();
      }
    }

    load().catch(err => {
      console.error('[ytWidget] load failed', err);
      if (statusEl) statusEl.innerHTML = '<span class="ytErr">Could not load videos right now.</span>';
    });
  }

  function boot(){
    const root = document.getElementById('ytWidget');
    if (!root) return;
    initWidget(root);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
