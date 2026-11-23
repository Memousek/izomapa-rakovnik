// Vodní stav z ČHMÚ (functions/api/hydro.js): sekce v záložce Dnes s grafem za 24 h, značka vodočtu na mapě (klik = karta)
// a při povodňovém stupni pruh nahoře. Stupně podle ČHMÚ: 1. SPA bdělost, 2. SPA pohotovost, 3. SPA ohrožení.
const SPA = [['normální stav', '#7fc8ff'], ['1. SPA – bdělost', '#f2c66d'], ['2. SPA – pohotovost', '#f08a1c'], ['3. SPA – ohrožení', '#e5484d']];
const stupen = (s) => { const h = s.posledni?.h ?? 0; let k = 0; s.spa.forEach((v, i) => { if (v !== null && h >= v) k = i + 1; }); return k; };
const cas = (t) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const trend = (s) => {                                                   // změna za poslední 3 h
  const a = s.h; if (a.length < 4) return '';
  const d = a[a.length - 1][1] - a[a.length - 4][1];
  return d >= 3 ? `stoupá (+${d} cm za 3 h)` : d <= -3 ? `klesá (${d} cm za 3 h)` : 'beze změny';
};

function graf(s) {                                                       // sloupcový graf hladiny po hodinách, čára 1. SPA
  const c = document.createElement('canvas'), W = 280, H = 64, dpr = Math.min(2, devicePixelRatio || 1);
  c.width = W * dpr; c.height = H * dpr; c.style.width = '100%'; c.style.height = H + 'px'; c.className = 'hydro-graf';
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Vodní stav za 24 hodin, nyní ${s.posledni?.h ?? '?'} cm`);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const v = s.h.map((q) => q[1]), lim = s.spa[0] ?? Math.max(...v) * 1.5, max = Math.max(lim * 1.08, ...v) || 1, n = v.length, bw = W / Math.max(1, n);
  v.forEach((x, i) => { g.fillStyle = i === n - 1 ? '#7fc8ff' : '#3f7fbf'; const h = Math.max(1, x / max * (H - 4)); g.fillRect(Math.round(i * bw), H - h, Math.max(1, Math.ceil(bw) - 1), h); });
  if (s.spa[0]) { const y = Math.round(H - s.spa[0] / max * (H - 4)) + 0.5; g.strokeStyle = '#f2c66d'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  return c;
}

export async function spust({ panelPo, ukazKartu }) {
  let d;
  try { const r = await fetch('api/hydro', { signal: AbortSignal.timeout(20000) }); if (!r.ok) return; d = await r.json(); } catch { return; }
  const st = (d.stanice || []).filter((s) => s.posledni);
  if (!st.length) return;
  const karta = (s) => {
    const k = stupen(s);
    ukazKartu({ title: `${s.tok} – ${s.nazev}`, lat: s.lat, lon: s.lon,
      text: 'Vodočet ČHMÚ. Hladina se měří každých 10 minut, povodňové stupně určuje vodoprávní úřad.',
      rows: [['Vodní stav', `${s.posledni.h} cm (${cas(s.posledni.t)})`], ['Průtok', s.posledni.q != null ? `${String(s.posledni.q).replace('.', ',')} m³/s` : ''],
        ['Stav', SPA[k][0]], ['Vývoj', trend(s)], ['Stupně', s.spa.filter((x) => x !== null).map((x, i) => `${i + 1}. SPA ${x} cm`).join(', ')],
        ['Zdroj', d.zdroj]], link: 'https://hydro.chmi.cz/hppsoldv/', linkText: 'Hlásná a předpovědní služba ČHMÚ ↗' });
  };
  // panel
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'hydroBox';
  box.innerHTML = '<summary>Vodní stav <span class="sum-val"></span></summary><div class="hydro-body"></div><p class="predpoved-zdroj">Zdroj: <a href="https://opendata.chmi.cz/" target="_blank" rel="noopener">ČHMÚ</a>, otevřená data</p>';
  const s0 = st[0];
  box.querySelector('.sum-val').textContent = `${s0.posledni.h} cm${stupen(s0) ? ' · ' + SPA[stupen(s0)][0] : ''}`;
  for (const s of st) {
    const k = stupen(s), w = document.createElement('div'); w.className = 'hydro-st';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hydro-hlava';
    const ico = document.createElement('span'); ico.className = 'vy-ico'; ico.style.background = SPA[k][1]; ico.setAttribute('aria-hidden', 'true');
    const n = document.createElement('span'); n.textContent = `${s.tok}, ${s.nazev}`;
    const v = document.createElement('b'); v.textContent = `${s.posledni.h} cm`;
    b.append(ico, n, v); b.addEventListener('click', () => karta(s));
    const p = document.createElement('p'); p.className = 'hydro-pozn'; p.textContent = `${SPA[k][0]} · ${trend(s)} · ${cas(s.posledni.t)}`;
    w.append(b, graf(s), p); box.querySelector('.hydro-body').append(w);
  }
  if (st.some(stupen)) box.open = true;
  panelPo.after(box);
  // pruh nahoře při povodňovém stupni
  const hl = st.find(stupen);
  if (hl) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'vystraha-pruh'; b.style.setProperty('--vc', SPA[stupen(hl)][1]);
    b.textContent = `${hl.tok} v ${hl.nazev}: ${SPA[stupen(hl)][0]} (${hl.posledni.h} cm)`; b.addEventListener('click', () => karta(hl));
    document.body.append(b);
  }
  // značka vodočtu na mapě: modrý štítek s hladinou, klik = karta
  const I = window.Izomapa; if (!I) return;
  const body = st.map((s) => { const [x, y] = I.latLonToWorld(s.lat, s.lon); return { s, x, y }; });
  const kde = [];
  I.onFrame((ctx, view) => {
    kde.length = 0; if (view.sx < 0.08) return;
    for (const b of body) {
      const [ix, iy] = I.toImg(b.x, b.y, I.gz(b.x, b.y) + 2); if (!view.vis(ix, iy, 80)) continue;
      const [X, Y] = view.toScreen(ix, iy), k = stupen(b.s), t = `≈ ${b.s.posledni.h} cm`;
      ctx.font = '700 11px "Atkinson Hyperlegible", system-ui, sans-serif'; const w = Math.ceil(ctx.measureText(t).width) + 22, x0 = Math.round(X - w / 2), y0 = Math.round(Y - 26);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x0 + 2, y0 + 2, w, 18);
      ctx.fillStyle = '#1d3f66'; ctx.fillRect(x0, y0, w, 18); ctx.fillStyle = SPA[k][1]; ctx.fillRect(x0, y0, 3, 18);
      ctx.fillStyle = '#7fc8ff'; for (let i = 0; i < 3; i++) ctx.fillRect(x0 + 7, y0 + 4 + i * 4, 6, 2);   // ikona vlnek
      ctx.fillStyle = '#eef1e6'; ctx.textBaseline = 'middle'; ctx.fillText(t, x0 + 17, y0 + 9.5);
      ctx.fillStyle = '#1d3f66'; ctx.fillRect(Math.round(X) - 1, y0 + 18, 2, 6);
      kde.push([X, Y - 17, b.s]);
    }
  }, { layer: 'top' });
  I.onMapClick((e) => { const h = kde.find((q) => Math.abs(q[0] - e.screenX) < 40 && Math.abs(q[1] - e.screenY) < 14); if (h) { karta(h[2]); return true; } return false; });
}
