// Datové vrstvy (Vrstvy → Na mapě): záplavová území (site/zaplavy.json z nastroje/zaplavy.py, VÚV T. G. M., CC BY 4.0),
// stáří domů (site/stari_budov.json z nastroje/stari.py, RÚIAN ČÚZK), hluk (site/hluk.json z nastroje/hluk.py, MZd)
// a hustota obyvatel (site/hustota.json z nastroje/hustota.py, Eurostat). Výchozí vypnuto, stav si pamatuje prohlížeč.
// Záplavy: plochy promítnuté na terén (Q5 tmavší, Q100 světlejší, aktivní zóna šrafovaná). Stáří: celé budovy
// obarvené podle období (RÚIAN má u starších domů jen konec období ze sčítání, proto třídy, ne rok).
// Hluk a hustota: pásma předkreslená naplno do pomocného plátna a to přes mapu jednou poloprůhledně (pásma hluku jsou
// vnořená „aspoň tolik dB“, takže by se průhlednost sčítala). Plošné vrstvy (záplavy, hluk, hustota) jsou zapnuté nejvýš po jedné.
const TRIDY = [
  [1919, 'do 1919', '#7a2a1a'], [1945, '1920–1945', '#b8562a'], [1960, '1946–1960', '#e09a3a'], [1980, '1961–1980', '#e8d25a'],
  [1990, '1981–1990', '#8cc063'], [2000, '1991–2000', '#3fa08a'], [9999, 'po 2000', '#2a6fd0'],
];
const ZAPLAVY = [['q100', 'Q100 (jednou za 100 let)', 'rgba(70,140,230,.36)'], ['q20', 'Q20', 'rgba(50,110,220,.36)'], ['q5', 'Q5', 'rgba(30,80,200,.4)']];
// barvy a pořadí jako v Liberci (izomapa.fun, Datové mapy)
const PASMA = {
  hluk: { n: 'Hluk', nadpis: 'Hluk: celodenní hladina', file: 'hluk.json', alpha: 0.5,
    col: { l55: '#ffe066', l60: '#ffab3d', l65: '#f2552c', l70: '#b0204a', l75: '#5a2a8a' },
    note: 'Strategická hluková mapa 2022: hluk z hlavních silnic (D6 a průtah městem), průměr přes den, večer a noc ve výšce 4 m. Ostatní ulice a železnice mapa nepokrývá. Pod 55 dB se nekreslí.' },
  hustota: { n: 'Hustota obyvatel', nadpis: 'Hustota obyvatel', file: 'hustota.json', alpha: 0.45,
    col: { h1: '#fff3b0', h100: '#ffd166', h500: '#f4a259', h2000: '#e05a47', h5000: '#8e2a5a' },
    note: 'Obyvatelé na km² podle sčítání 2021 ve čtvercích 1 × 1 km.' },
};
const PLOSNE = ['zaplavy', 'hluk', 'hustota'];

export async function spust() {
  const I = window.Izomapa; if (!I) return;
  const nacti = (f) => fetch(f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const ma = (f) => fetch(f, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);   // velké soubory až po zapnutí
  const [Z, S, maHluk, maHustota] = await Promise.all([nacti('zaplavy.json'), nacti('stari_budov.json'), ma(PASMA.hluk.file), ma(PASMA.hustota.file)]);
  const je = { zaplavy: !!Z, stari: !!S, hluk: maHluk, hustota: maHustota };
  if (!Object.values(je).some(Boolean)) return;
  const box = document.querySelector('.prepinace'); if (!box) return;
  // přepínače a legenda
  const ul = (k) => { try { return localStorage.getItem('izo-' + k) === '1'; } catch { return false; } };
  const st = Object.fromEntries(Object.keys(je).map((k) => [k, je[k] && ul(k)]));
  { let prvni = true; for (const k of PLOSNE) if (st[k]) { if (!prvni) st[k] = false; prvni = false; } }   // ze starší verze víc plošných naráz
  const D = {};                                                     // načtená pásma: {k: {bands, meta} | {busy} | {err}}
  const leg = document.createElement('div'); leg.className = 'data-legenda'; leg.hidden = true; leg.setAttribute('aria-live', 'polite');
  box.after(leg);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const legenda = () => {
    const casti = [];
    if (st.zaplavy) casti.push(`<p class="label">Záplavová území</p><ul>${ZAPLAVY.map(([, n, c]) => `<li><i style="background:${c.replace(/,\.\d+\)/, ',.75)')}"></i>${n}</li>`).join('')}<li><i class="sraf"></i>aktivní zóna</li></ul><p class="zdroj">Zdroj: VÚV T. G. M., v. v. i. (CC BY 4.0)</p>`);
    for (const k of ['hluk', 'hustota']) {
      if (!st[k]) continue;
      const def = PASMA[k], d = D[k] || {};
      const pas = (d.bands || []).map((b) => `<li><i style="background:${def.col[b.k]}"></i>${esc(b.n)}</li>`).join('');
      const zdroj = d.meta ? `<p class="zdroj">Zdroj: <a href="${esc(d.meta.url)}" target="_blank" rel="noopener">${esc(d.meta.zdroj)}</a> (${esc(d.meta.licence)})</p>` : '';
      casti.push(`<p class="label">${def.nadpis}</p><p class="zdroj">${d.busy ? 'Načítá se…' : d.err ? 'Data se nepodařilo načíst.' : def.note}</p>${pas ? `<ul>${pas}</ul>` : ''}${zdroj}`);
    }
    if (st.stari) casti.push(`<p class="label">Stáří domů (dokončení)</p><ul>${TRIDY.map(([, n, c]) => `<li><i style="background:${c}"></i>${n}</li>`).join('')}</ul><p class="zdroj">Zdroj: RÚIAN, ČÚZK (CC BY 4.0). U starších domů jen období ze sčítání.</p>`);
    leg.innerHTML = casti.join(''); leg.hidden = !casti.length;
  };
  const uloz = (k) => { try { localStorage.setItem('izo-' + k, st[k] ? '1' : '0'); } catch {} };
  const zapni = (k, on) => {
    st[k] = on; uloz(k);
    if (on && PLOSNE.includes(k)) for (const j of PLOSNE) if (j !== k && st[j]) { st[j] = false; uloz(j); const i = document.getElementById('l-' + j); if (i) i.checked = false; }
    if (on && PASMA[k]) nactiPasma(k);
    legenda();
  };
  for (const [k, n] of [['zaplavy', 'Záplavy'], ['hluk', 'Hluk'], ['hustota', 'Hustota obyvatel'], ['stari', 'Stáří domů']]) {
    if (!je[k]) continue;
    const l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = `<input type="checkbox" id="l-${k}"${st[k] ? ' checked' : ''}><span>${n}</span>`;
    box.appendChild(l);
    l.querySelector('input').addEventListener('change', (e) => zapni(k, e.target.checked));
  }

  // hluk a hustota: [[vnější kruh, díry…], …] v [lat, lon] -> svět; body v obrázku se dopočítají s terénem při kreslení
  async function nactiPasma(k) {
    if (D[k]) return;
    D[k] = { busy: true }; legenda();
    const j = await nacti(PASMA[k].file);
    if (!j) { D[k] = { err: true }; legenda(); return; }
    const bands = j.pasma.map((b) => ({ k: b.k, n: b.n, polys: b.poly.map((rings) => ({ R: rings.map((r) => r.map(([la, lo]) => I.latLonToWorld(la, lo))), img: null, bb: null })) }));
    const poradi = Object.keys(PASMA[k].col);
    bands.sort((a, b) => poradi.indexOf(a.k) - poradi.indexOf(b.k));
    D[k] = { bands, meta: j.meta }; legenda();
  }
  for (const k of Object.keys(PASMA)) if (st[k]) nactiPasma(k);
  legenda();

  // záplavy: polygony ve světě (lat, lon -> x, y), při kreslení na terén
  const zp = Z ? Object.fromEntries(Object.entries(Z).map(([k, P]) => [k, P.map((r) => {
    const w = r.map(([la, lo]) => I.latLonToWorld(la, lo)); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of w) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { w, bb: [x0, y0, x1, y1], img: null };
  })])) : {};
  let sraf = null;
  const srafy = (ctx) => {
    if (sraf) return sraf;
    const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(150,40,200,.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
    return (sraf = ctx.createPattern(c, 'repeat'));
  };
  const kresliPoly = (ctx, v, p, styl) => {
    if (!p.img) p.img = p.w.map(([x, y]) => I.toImg(x, y, I.gz(x, y)));   // terén se dočítá: po načtení čtverce se přepočítá níž
    let vid = false; for (const [ix, iy] of p.img) if (v.vis(ix, iy, 200)) { vid = true; break; }
    if (!vid) return;
    ctx.beginPath();
    p.img.forEach(([ix, iy], i) => { const [X, Y] = v.toScreen(ix, iy); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    ctx.closePath(); ctx.fillStyle = styl; ctx.fill();
  };
  // pásma: plocha s dírami, body v obrázku (s terénem) a obdélník kvůli vynechání mimo výřez
  const pasmoImg = (p) => {
    if (p.img) return;
    p.img = p.R.map((r) => r.map(([x, y]) => I.toImg(x, y, I.gz(x, y))));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [ix, iy] of p.img[0]) { x0 = Math.min(x0, ix); y0 = Math.min(y0, iy); x1 = Math.max(x1, ix); y1 = Math.max(y1, iy); }
    p.bb = [x0, y0, x1, y1];
  };
  let plt = null;                                                 // pomocné plátno velikosti obrazovky
  const kresliPasma = (ctx, v, k) => {
    const d = D[k]; if (!d || !d.bands) return;
    const def = PASMA[k], dpr = v.dpr || 1, W = Math.round(v.cw * dpr), H = Math.round(v.ch * dpr);
    if (!plt) plt = document.createElement('canvas');
    if (plt.width !== W || plt.height !== H) { plt.width = W; plt.height = H; }
    const g = plt.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vx0 = -v.ox / v.sx, vy0 = -v.oy / v.sx, vx1 = (v.cw - v.ox) / v.sx, vy1 = (v.ch - v.oy) / v.sx;
    let neco = false;
    for (const b of d.bands) {
      g.beginPath(); let n = 0;
      for (const p of b.polys) {
        pasmoImg(p);
        if (p.bb[2] < vx0 || p.bb[0] > vx1 || p.bb[3] < vy0 || p.bb[1] > vy1) continue;
        for (const r of p.img) { r.forEach(([ix, iy], i) => { const X = v.ox + ix * v.sx, Y = v.oy + iy * v.sx; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); }
        n++;
      }
      if (n) { g.fillStyle = def.col[b.k]; g.fill('evenodd'); neco = true; }
    }
    if (!neco) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = def.alpha; ctx.drawImage(plt, 0, 0); ctx.restore();
  };

  // stáří: budovy z načtených čtverců (obrys hull v souřadnicích obrázku)
  const budovy = [];
  const barva = (rok) => TRIDY.find((t) => rok <= t[0])[2];
  I.onChunkData((k, d) => {
    for (const b of d.buildings || []) { const r = S && S[b.oid]; if (r) budovy.push({ hull: b.hull, c: barva(r) }); }
    for (const P of Object.values(zp)) for (const p of P) p.img = null;   // terén čtverce je načtený: výšky ploch znovu
    for (const q of Object.values(D)) for (const b of q.bands || []) for (const p of b.polys) p.img = null;
  });

  I.onFrame((ctx, v) => {
    if (st.zaplavy && v.sx > 0.03) {
      for (const [k, , c] of ZAPLAVY) for (const p of zp[k] || []) kresliPoly(ctx, v, p, c);
      for (const p of zp.az || []) kresliPoly(ctx, v, p, srafy(ctx));
    }
    for (const k of ['hluk', 'hustota']) if (st[k]) kresliPasma(ctx, v, k);
    if (st.stari && budovy.length) {
      ctx.globalAlpha = 0.72;
      for (const b of budovy) {
        const h = b.hull; if (!v.vis(h[0][0], h[0][1], 60)) continue;
        ctx.beginPath(); h.forEach(([ix, iy], i) => { const [X, Y] = v.toScreen(ix, iy); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
        ctx.closePath(); ctx.fillStyle = b.c; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }, { layer: 'world', priority: 3 });
}
