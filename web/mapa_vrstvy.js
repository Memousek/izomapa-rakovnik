// Datové vrstvy (Vrstvy → Data): záplavová území (site/zaplavy.json z nastroje/zaplavy.py, VÚV T. G. M., CC BY 4.0)
// a stáří domů (site/stari_budov.json z nastroje/stari.py, RÚIAN ČÚZK). Výchozí vypnuto, stav si pamatuje prohlížeč.
// Záplavy: plochy promítnuté na terén (Q5 tmavší, Q100 světlejší, aktivní zóna šrafovaná). Stáří: celé budovy
// obarvené podle období (RÚIAN má u starších domů jen konec období ze sčítání, proto třídy, ne rok).
const TRIDY = [
  [1919, 'do 1919', '#7a2a1a'], [1945, '1920–1945', '#b8562a'], [1960, '1946–1960', '#e09a3a'], [1980, '1961–1980', '#e8d25a'],
  [1990, '1981–1990', '#8cc063'], [2000, '1991–2000', '#3fa08a'], [9999, 'po 2000', '#2a6fd0'],
];
const ZAPLAVY = [['q100', 'Q100 (jednou za 100 let)', 'rgba(70,140,230,.36)'], ['q20', 'Q20', 'rgba(50,110,220,.36)'], ['q5', 'Q5', 'rgba(30,80,200,.4)']];

export async function spust() {
  const I = window.Izomapa; if (!I) return;
  const [Z, S] = await Promise.all(['zaplavy.json', 'stari_budov.json'].map((f) => fetch(f).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (!Z && !S) return;
  const box = document.querySelector('.prepinace'); if (!box) return;
  // přepínače a legenda
  const ul = (k) => { try { return localStorage.getItem('izo-' + k) === '1'; } catch { return false; } };
  const st = { zaplavy: Z && ul('zaplavy'), stari: S && ul('stari') };
  const leg = document.createElement('div'); leg.className = 'data-legenda'; leg.hidden = true;
  box.after(leg);
  const legenda = () => {
    const casti = [];
    if (st.zaplavy) casti.push(`<p class="label">Záplavová území</p><ul>${ZAPLAVY.map(([, n, c]) => `<li><i style="background:${c.replace(/,\.\d+\)/, ',.75)')}"></i>${n}</li>`).join('')}<li><i class="sraf"></i>aktivní zóna</li></ul><p class="zdroj">Zdroj: VÚV T. G. M., v. v. i. (CC BY 4.0)</p>`);
    if (st.stari) casti.push(`<p class="label">Stáří domů (dokončení)</p><ul>${TRIDY.map(([, n, c]) => `<li><i style="background:${c}"></i>${n}</li>`).join('')}</ul><p class="zdroj">Zdroj: RÚIAN, ČÚZK (CC BY 4.0). U starších domů jen období ze sčítání.</p>`);
    leg.innerHTML = casti.join(''); leg.hidden = !casti.length;
  };
  for (const [k, n, data] of [['zaplavy', 'Záplavy', Z], ['stari', 'Stáří domů', S]]) {
    if (!data) continue;
    const l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = `<input type="checkbox" id="l-${k}"${st[k] ? ' checked' : ''}><span>${n}</span>`;
    box.appendChild(l);
    l.querySelector('input').addEventListener('change', (e) => { st[k] = e.target.checked; try { localStorage.setItem('izo-' + k, st[k] ? '1' : '0'); } catch {} legenda(); });
  }
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

  // stáří: budovy z načtených čtverců (obrys hull v souřadnicích obrázku)
  const budovy = [];
  const barva = (rok) => TRIDY.find((t) => rok <= t[0])[2];
  I.onChunkData((k, d) => {
    for (const b of d.buildings || []) { const r = S && S[b.oid]; if (r) budovy.push({ hull: b.hull, c: barva(r) }); }
    for (const P of Object.values(zp)) for (const p of P) p.img = null;   // terén čtverce je načtený: výšky ploch znovu
  });

  I.onFrame((ctx, v) => {
    if (st.zaplavy && v.sx > 0.03) {
      for (const [k, , c] of ZAPLAVY) for (const p of zp[k] || []) kresliPoly(ctx, v, p, c);
      for (const p of zp.az || []) kresliPoly(ctx, v, p, srafy(ctx));
    }
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
