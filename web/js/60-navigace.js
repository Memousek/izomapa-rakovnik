  // ---------- navigace, hledání ----------
  function goTo(ix, iy, zoomImg = 1.6) {
    viewer.viewport.panTo(new OpenSeadragon.Point(ix / W, iy / W));
    viewer.viewport.zoomTo(zoomImg * W / viewer.viewport.getContainerSize().x);
    if (isMobile()) setMenu(false);
  }
  const placesUl = $('places');
  const placesAbc = [...myPlaces].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  var renderPlaces = () => {
    placesUl.replaceChildren();
    for (const p of placesAbc) {
      if (!shown(p.k)) continue;
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = p.name;
      b.addEventListener('click', () => { goTo(p.xy[0], p.xy[1], 1.4); showCard({ title: p.name, text: p.text, lon: p.lon, lat: p.lat, k: p.k, rows: [] }); if (DENIK) DENIK.zapisPodleNazvu(p.name); });
      li.appendChild(b); placesUl.appendChild(li);
    }
  };
  renderPlaces();
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const index = [];
  for (const n of OV.neighbors || []) {
    if (OBEC && n.obec && n.obec !== OBEC) continue;
    index.push({ label: n.name, kind: 'soused', k: n.k, n: norm(n.name), go: () => { goTo(n.xy[0], n.xy[1], 1.4); showCard({ title: n.name, text: n.text || 'Sousední izometrická mapa.', lon: n.lon, lat: n.lat, k: n.k, link: neighborHref(n), linkText: `Přejít na mapu ${n.name} ↗`, target: n.target, rows: [['Sousední mapa', n.name]] }); } });
  }
  for (const p of OV.places) index.push({ label: p.name, kind: 'místo', k: p.k, n: norm(p.name), go: () => { goTo(p.xy[0], p.xy[1], 1.4); showCard({ title: p.name, text: p.text, lon: p.lon, lat: p.lat, k: p.k, rows: [] }); } });
  for (const s of OV.streets) index.push({ label: s.name, kind: 'ulice', k: s.k, n: norm(s.name), go: () => goTo(s.xy[0], s.xy[1], 0.9) });
  // adresy celé mapy jsou ve zvláštním souboru, načtou se při prvním psaní do hledání
  let addrLoad = null;
  const loadAddr = () => addrLoad || (addrLoad = fetch('search.json').then((r) => r.json()).then((A) => {
    for (const [a, k, cx, cy, i, kind] of A) index.push({ label: a, kind: kind || 'adresa', k, n: norm(a), go: () => { goTo(cx, cy, 2); loadChunk(k).then((c) => c && showBuilding(c.buildings[i])); } });
  }).catch(() => {}));
  $('q').addEventListener('focus', loadAddr);
  let res = [], cur = -1;
  function renderResults() {
    const ul = $('results'); ul.replaceChildren();
    res.forEach((r, i) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
      if (i === cur) b.className = 'on';
      const s1 = document.createElement('span'); s1.textContent = r.label; const s2 = document.createElement('small'); s2.textContent = r.kind;
      b.append(s1, s2); b.addEventListener('click', () => pick(r)); li.appendChild(b); ul.appendChild(li);
    });
  }
  function pick(r) { r.go(); $('q').value = r.label; res = []; cur = -1; renderResults(); }
  $('q').addEventListener('input', (e) => {
    const q = norm(e.target.value.trim());
    cur = -1;
    if (q.length < 2) { res = []; renderResults(); return; }
    if (!addrLoad) { loadAddr().then(() => e.target.dispatchEvent(new Event('input'))); }
    const pool = index.filter((r) => shown(r.k)), seenL = new Set();
    const starts = pool.filter((r) => r.n.startsWith(q)), inside = pool.filter((r) => !r.n.startsWith(q) && r.n.includes(q));
    const order = { 'místo': 0, 'uzavírka': 0.3, 'zastávka': 0.5, budova: 1, ulice: 2, adresa: 3 };
    res = [...starts, ...inside].filter((r) => !seenL.has(r.kind + r.label) && seenL.add(r.kind + r.label)).sort((a, b) => (a.n.startsWith(q) === b.n.startsWith(q) ? order[a.kind] - order[b.kind] : 0)).slice(0, 8);
    renderResults();
  });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { cur = Math.min(res.length - 1, cur + 1); renderResults(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); renderResults(); e.preventDefault(); }
    if (e.key === 'Enter' && res.length) pick(res[Math.max(cur, 0)]);
    if (e.key === 'Escape') { res = []; renderResults(); }
  });

  const zbtn = (id, f) => $(id).addEventListener('click', f);
  zbtn('zin', () => viewer.viewport.zoomBy(1.6));
  zbtn('zout', () => viewer.viewport.zoomBy(1 / 1.6));
  if (HOME_VIEW && !HOME_ALL) $('home').title = 'Výchozí pohled';
  zbtn('home', () => goHome());
  // Tlačítko Zpět (a gesto zpět na Androidu) zavře otevřené okno místo odchodu z webu: otevření okna přidá záznam do historie
  for (const d of document.querySelectorAll('dialog')) {
    const sm = d.showModal.bind(d);
    d.showModal = () => { if (d.open) return; sm(); uiDepth++; try { history.pushState({ ui: uiDepth }, ''); } catch {} };
    d.addEventListener('close', () => { if (uiPop || !uiDepth) return; uiDepth--; uiBackAt = Date.now(); uiSelf++; history.back(); });
  }
  addEventListener('popstate', () => {
    if (uiSelf) { uiSelf--; return; }                     // krok zpět po zavření okna tlačítkem: nezavírat další (vnořené) okno
    if (!uiDepth) return;
    uiDepth--; uiBackAt = Date.now(); uiPop = true;
    const ds = [...document.querySelectorAll('dialog[open]')]; if (ds.length) ds[ds.length - 1].close();
    uiPop = false;
  });
  $('help').addEventListener('click', (e) => { e.stopPropagation(); $('helpDlg').showModal(); });
  $('helpClose').addEventListener('click', () => $('helpDlg').close());
  $('helpDlg').addEventListener('click', (e) => { if (e.target === $('helpDlg')) $('helpDlg').close(); });
  // přidání na plochu: návod podle zařízení; Chrome na Androidu a počítači nabídne rovnou svoje okno instalace
  {
    const ua = navigator.userAgent, os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'pc';
    let prompt = null;
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) $('plochaBtn').hidden = true;   // už běží jako aplikace
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e; });
    addEventListener('appinstalled', () => { prompt = null; $('plochaBtn').hidden = true; $('plochaDlg').close(); });
    $('plochaBtn').addEventListener('click', () => {
      $('plInstall').hidden = !prompt;
      document.querySelectorAll('#plochaDlg [data-os]').forEach((el) => { el.hidden = el.dataset.os !== os; });
      $('plochaDlg').showModal();                       // nad nápovědou; po zavření se vrátí do ní
    });
    $('plochaGo').addEventListener('click', async () => { if (!prompt) return; prompt.prompt(); await prompt.userChoice.catch(() => {}); prompt = null; $('plInstall').hidden = true; });
    $('plochaClose').addEventListener('click', () => $('plochaDlg').close());
    $('plochaDlg').addEventListener('click', (e) => { if (e.target === $('plochaDlg')) $('plochaDlg').close(); });
  }
  // sdílení: odkaz obsahuje polohu, přiblížení, roční období a denní dobu (#zima-noc@50.77,15.06,0.8)
  function odkazPohledu() {
    const tok = [{ spring: 'jaro', summer: 'leto', autumn: 'podzim', winter: 'zima' }[state.season]];
    if (state.night > 0.7) tok.push('noc'); else if (state.night > 0.25) tok.push('soumrak');
    return `${location.origin}${location.pathname}#${tok.join('-')}@${(location.hash.split('@')[1] || '')}`;
  }
  // hlášky po sobě (přelet, deník a odznaky jinak přepisovaly jedna druhou); nejvýš 3 ve frontě
  const toastFronta = [];
  const toast = (t) => {
    if (!$('toast').hidden && toast.t) { if (toastFronta.length < 3 && !toastFronta.includes(t)) toastFronta.push(t); return; }
    $('toast').textContent = t; $('toast').hidden = false; clearTimeout(toast.t);
    toast.t = setTimeout(() => { toast.t = null; $('toast').hidden = true; if (toastFronta.length) toast(toastFronta.shift()); }, 2200);
  };
  // pohlednice (web/mapa_pohlednice.js): obrázek pohledu s rozostřenými okraji, uložit, sdílet nebo zkopírovat odkaz
  async function pohlednice() {
    try {
      const m = await import('./mapa_pohlednice.js');
      m.otevri({ osd: viewer.drawer.canvas, fx: $('fx'), nazev: document.querySelector('.panel h1').textContent.trim(), odkaz: odkazPohledu(), toast });
    } catch { share(); }
  }
  // přelet po zajímavých místech a průvodce ovládáním (web/mapa_prelet.js)
  let preletMod = null;
  const nactiPrelet = () => preletMod || (preletMod = import('./mapa_prelet.js'));
  async function prelet() {
    const nesleduj = () => { MHD.follow = null; if (typeof PLANES !== 'undefined') PLANES.follow = null; $('follow').hidden = true; };   // sledovaný spoj by pohled držel na místě
    try { (await nactiPrelet()).prelet({ goView, OV, toast, popis: (on) => { if (DENIK) DENIK.pauza(on); if (on) { closeCard(); nesleduj(); } } }); } catch {}
  }
  // deník sbírání míst a hádanky (web/mapa_denik.js), jen v tomto prohlížeči
  let DENIK = null;
  import('./mapa_denik.js').then((m) => m.spust({
    OV: { ...OV, districts: (OV.districts || []).map((x) => { const [wx, wy] = imgToWorld(x.xy[0], x.xy[1]), [lo, la] = lonlat(wx, wy); return { ...x, ll: [la, lo] }; }) },
    mesto: '{{MESTO}}', toast, el: $('denikBox'), goView: (v) => { goView(v); if (isMobile()) setMenu(false); }, stav: () => ({ noc: state.night > 0.7, obdobi: state.season }),
  })).then((d) => { DENIK = d; }).catch(() => {});
  // zvuky prostředí (web/mapa_zvuky.js), výchozí vypnuto; prohlížeč pustí zvuk až po kliknutí, proto se jen pamatuje volba
  // AudioContext se musí spustit přímo v obsluze kliknutí (mobil): modul se proto načte dopředu, když je volba uložená
  let zvukyMod = null;
  const zvukyStav = () => ({ noc: state.night, obdobi: state.season, pocasi: state.weather, doprava: $('l-traffic').checked,
    km: +((location.hash.split('@')[1] || '').split(',')[2]) || 3 });
  const zvukyPouzij = (m, zap) => { zvukyMod = m; if (zap) m.zapni(zvukyStav); else m.vypni(); };
  $('l-zvuky').addEventListener('change', (e) => {
    const zap = e.target.checked;
    try { localStorage.setItem('izo-zvuky', zap ? '1' : '0'); } catch {}
    if (zvukyMod) { zvukyPouzij(zvukyMod, zap); return; }
    import('./mapa_zvuky.js').then((m) => zvukyPouzij(m, zap)).catch(() => { e.target.checked = false; });
  });
  try {
    if (localStorage.getItem('izo-zvuky') === '1') {
      import('./mapa_zvuky.js').then((m) => { zvukyMod = m; }).catch(() => {});
      addEventListener('click', () => { if (!$('l-zvuky').checked) { $('l-zvuky').checked = true; $('l-zvuky').dispatchEvent(new Event('change')); } }, { once: true });
    }
  } catch {}
  async function share() {
    const url = odkazPohledu();
    try {
      if (navigator.share && isMobile()) { await navigator.share({ title: document.title, url }); return; }
      await navigator.clipboard.writeText(url); toast('Odkaz na tento pohled je zkopírovaný');
    } catch (e) {
      if (e && e.name === 'AbortError') return;                  // člověk sdílení zavřel: nic nehlásit
      try {                                                      // vestavěné prohlížeče bez schránky: starý způsob kopírování
        const ta = document.createElement('textarea'); ta.value = url; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove();
        toast(ok ? 'Odkaz na tento pohled je zkopírovaný' : url);
      } catch { toast(url); }
    }
  }
  zbtn('share', pohlednice); zbtn('mShare', pohlednice);
  zbtn('preletBtn', () => { $('helpDlg').close(); prelet(); });
  // moje poloha: jen v prohlížeči, nikam se neposílá; mimo mapu jen hláška
  let polohaPin = null;
  function mojePoloha() {
    if (!navigator.geolocation) { toast('Prohlížeč polohu nezná.'); return; }
    toast('Hledám vaši polohu…');
    navigator.geolocation.getCurrentPosition((g) => {
      const pos = goView([g.coords.latitude, g.coords.longitude, 0.4]);
      if (!pos) { toast('Jste mimo území mapy.'); goHome(); return; }
      if (!polohaPin) { polohaPin = document.createElement('div'); polohaPin.className = 'moje-poloha'; polohaPin.title = 'Vy'; }
      else viewer.removeOverlay(polohaPin);
      viewer.addOverlay({ element: polohaPin, location: new OpenSeadragon.Point(pos[0] / W, pos[1] / W), placement: OpenSeadragon.Placement.CENTER, checkResize: false });
      if (isMobile()) setMenu(false);
    }, () => toast('Polohu se nepodařilo zjistit (povolení nebo signál).'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  zbtn('poloha', mojePoloha);
  // ---------- klávesové zkratky (přehled v nápovědě) ----------
  // W/A/S/D, šipky, + − 0, R a F obsluhuje OpenSeadragon sám, když je mapa zaměřená; tady jen písmena, která nepoužívá
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.isComposing) return;
    // jen textová pole (štítky vrstev a posuvník fokus drží, zkratky tam mají fungovat)
    if (e.target.closest && e.target.closest('textarea, select, [contenteditable], input:not([type="checkbox"]):not([type="range"]):not([type="radio"])') || document.querySelector('dialog[open]')) return;
    const vMape = e.target.closest && e.target.closest('#osd'), k = e.key.toLowerCase(), klik = (id) => { const b = $(id); if (b && !b.hidden) b.click(); };
    const prepni = (id) => { const c = $(id); if (!c || (c.closest('[hidden]'))) return; c.checked = !c.checked; c.dispatchEvent(new Event('change')); };
    const akce = {
      '1': () => setSeason('spring'), '2': () => setSeason('summer'), '3': () => setSeason('autumn'), '4': () => setSeason('winter'),
      n: () => klik('mTime'), z: () => klik('zapad'), p: () => {
        const w = ['clear', 'rain', 'snow', 'fog'], i = (w.indexOf(state.weather) + 1) % w.length;
        document.querySelector(`[data-w="${w[i]}"]`).click();
      },
      t: () => setCas({ vlastni: 'ted', ted: 'samo', samo: 'vlastni' }[casRezim]), ' ': () => (casRezim === 'samo' ? klik('casPauza') : null),
      l: () => prepni('l-labels'), o: () => prepni('l-traffic'), u: () => prepni('l-zvuky'), b: () => prepni('l-pumpy'),
      '/': () => { setMenu(true); setFold(false); $('q').focus(); }, m: () => klik('menu'), '?': () => klik('help'),
      k: () => share(), e: () => (typeof pohlednice === 'function' ? pohlednice() : null), h: () => goHome(),
      j: () => klik('jizda3d'), v: () => prelet(), g: () => mojePoloha(),
      '+': () => (vMape ? null : viewer.viewport.zoomBy(1.6)), '=': () => (vMape ? null : viewer.viewport.zoomBy(1.6)), '-': () => (vMape ? null : viewer.viewport.zoomBy(1 / 1.6)),
    };
    const cislo = /^Digit[1-4]$/.test(e.code) && !e.shiftKey ? e.code.slice(5) : null;   // česká klávesnice: horní řada dává + ě š č
    const f = (cislo && akce[cislo]) || akce[e.key] || akce[k];
    if (!f) return;
    if (e.key === ' ' && (casRezim !== 'samo' || (e.target.closest && e.target.closest('button, a, summary, input')))) return;   // mezerník jen pro čas v režimu Samo
    e.preventDefault(); f();
  });
  function setMenu(open) { $('panel').classList.toggle('closed', !open); $('menu').setAttribute('aria-expanded', String(open)); $('menu').textContent = open ? 'Skrýt' : 'Menu'; }
  $('menu').addEventListener('click', () => setMenu($('panel').classList.contains('closed')));
  // desktop: panel jde zasunout ouškem vpravo od něj, stav si pamatuje prohlížeč
  function setFold(f) {
    document.body.classList.toggle('folded', f);
    const t = f ? 'Vysunout panel' : 'Zasunout panel';
    $('fold').textContent = f ? '›' : '‹'; $('fold').title = t; $('fold').setAttribute('aria-label', t); $('fold').setAttribute('aria-expanded', String(!f));
    $('panel').inert = f && !isMobile();
    try { localStorage.setItem('izo-fold', f ? '1' : '0'); } catch {}
  }
  $('fold').addEventListener('click', () => setFold(!document.body.classList.contains('folded')));
  new ResizeObserver(() => document.documentElement.style.setProperty('--pw', $('panel').offsetWidth + 'px')).observe($('panel'));
  try { if (localStorage.getItem('izo-fold') === '1' && !isMobile()) setFold(true); } catch {}
  if (isMobile()) { setMenu(false); $('placesBox').open = false; }
  // Vzhled mapy: na počítači si pamatuje, jestli byl rozbalený
  try { if (localStorage.getItem('izo-vzhled') === '1' && !isMobile()) $('vzhled').open = true; } catch {}
  $('vzhled').addEventListener('toggle', () => { try { localStorage.setItem('izo-vzhled', $('vzhled').open ? '1' : '0'); } catch {} });
  if ({{JIZDA}}) {                                       // 3D jízda (nastroje/jizda.py): otevře se na místě, kam se mapa právě dívá
    const a = $('jizda3d'); a.hidden = false;
    const kam = () => { a.href = 'jizda.html#@' + (location.hash.split('@')[1] || '').split(',').slice(0, 2).join(','); };
    for (const ev of ['pointerenter', 'focus', 'pointerdown']) a.addEventListener(ev, kam);   // i pro otevření v nové kartě
    a.addEventListener('click', (e) => { e.preventDefault(); kam(); location.href = a.href; });
  }
  if ({{HISTORIE}}) {                                    // srovnání s leteckým snímkem z 50. let (site/srovnani.html) na místě, kam se mapa dívá
    const a = $('histBtn'); a.hidden = false;
    const kam = () => { a.href = 'srovnani.html#@' + (location.hash.split('@')[1] || ''); };
    for (const ev of ['pointerenter', 'focus', 'pointerdown']) a.addEventListener(ev, kam);
    a.addEventListener('click', (e) => { e.preventDefault(); kam(); location.href = a.href; });
  }
  $('l-labels').addEventListener('change', (e) => $('map').classList.toggle('nolabels', !e.target.checked));


  // rychlá volba vrstev (inspirace brno2000.cz): jedním klikem sada vrstev a otevřené sekce panelu
  const PREDVOLBY = {
    kolo: { zap: ['l-trasy', 'l-sluzby', 'l-people', 'l-traffic'], vyp: ['l-pumpy', 'l-smoke'], otevri: ['predpovedBox'] },
    deti: { zap: ['l-people', 'l-sluzby', 'l-labels', 'l-traffic'], vyp: ['l-pumpy', 'l-trasy'], otevri: ['placesBox', 'denikBox'] },
    deje: { zap: ['l-traffic', 'l-pluhy', 'l-labels', 'l-people'], vyp: [], otevri: ['vystrahyBox', 'aktualityBox', 'uzBox', 'predpovedBox'] },
  };
  document.querySelectorAll('[data-predvolba]').forEach((b) => b.addEventListener('click', () => {
    const p = PREDVOLBY[b.dataset.predvolba];
    const nastav = (id, v) => { const c = $(id); if (!c || c.closest('[hidden]') || c.checked === v) return; c.checked = v; c.dispatchEvent(new Event('change')); };
    p.zap.forEach((id) => nastav(id, true)); p.vyp.forEach((id) => nastav(id, false));
    for (const id of ['placesBox', 'denikBox', 'vystrahyBox', 'aktualityBox', 'uzBox', 'predpovedBox', 'puBox']) { const d = $(id); if (d) d.open = p.otevri.includes(id) && !d.hidden; }
    document.querySelectorAll('[data-predvolba]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const prvni = p.otevri.map((id) => $(id)).find((d) => d && !d.hidden); if (prvni) prvni.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
