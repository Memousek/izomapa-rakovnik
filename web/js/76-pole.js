  // ---------- práce na polích a traktory na polních cestách ----------
  // Ilustrace bez stavu (stejná pro všechny návštěvníky): kterou plochu se dnes pracuje, určí datum a číslo pole.
  // Pole od 3 ha s plodinou (site/pole_prace.json z build_html.py, ZABAGED a ortofoto): jaro setí (traktor se strojem),
  // léto žně na pšenici a řepce (kombajn, vedle traktor s vlekem), podzim orba (traktor s pluhem); stroj jede po pruzích
  // podél delší osy pole tam a zpět. Na polních a lesních cestách (walk 'l', overlay.py) občas projede traktor. V zimě nic.
  const FARM = { pole: null, cesty: [], den: '', akt: [] };
  fetch('pole_prace.json').then((r) => (r.ok ? r.json() : [])).then((d) => {
    FARM.pole = d.map(([pl, ha, P]) => { let x = 0, y = 0; for (const q of P) { x += q[0]; y += q[1]; } return { pl, ha, P, c: [x / P.length, y / P.length] }; });
  }).catch(() => { FARM.pole = []; });
  onChunk.push((k, d) => {                                   // traktor asi na každé 3 km polních cest (delší úseky)
    const W = d.walk || {}, C = W.c || '';
    (W.l || []).forEach((w, j) => {
      if (C[j] !== 'l') return;
      const len = [0]; for (let m = 1; m < w.length; m++) len.push(len[m - 1] + Math.hypot(w[m][0] - w[m - 1][0], w[m][1] - w[m - 1][1]));
      const L = len[len.length - 1], seed = sid(k) + j * 13;
      if (L < 150 || rnd(seed) > L / 3000) return;
      FARM.cesty.push({ path: w, len, L, seed });
    });
  });
  const PRACE = {
    spring: { ok: (pl) => pl === 'soil' || pl === 'maize' || pl === 'None', stroj: 13, col: '#2f7a2e|#5a5f66', sirka: 6, v: 2.2, podil: 0.08 },
    summer: { ok: (pl) => pl === 'wheat' || pl === 'rape', stroj: 12, col: '#7fae3a|#e0c23a', sirka: 6, v: 1.6, podil: 0.1, vlek: true },
    autumn: { ok: (pl) => pl === 'soil' || pl === 'wheat' || pl === 'maize', stroj: 13, col: '#b8402a|#8a3a2a', sirka: 3, v: 1.8, podil: 0.08 },
  };
  function pruhy(P, sirka) {                                // cik-cak přes pole po pruzích šířky stroje podél hlavní osy (PCA)
    let mx = 0, my = 0; for (const [x, y] of P) { mx += x; my += y; } mx /= P.length; my /= P.length;
    let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of P) { const dx = x - mx, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(a), uy = Math.sin(a);
    const Q = P.map(([x, y]) => [(x - mx) * ux + (y - my) * uy, -(x - mx) * uy + (y - my) * ux]);
    let v0 = Infinity, v1 = -Infinity; for (const q of Q) { v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
    const W = (u, v) => [mx + u * ux - v * uy, my + u * uy + v * ux], path = [];
    let smer = 1;
    for (let v = v0 + sirka / 2; v < v1; v += sirka) {
      const xs = [];
      for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const [ui, vi] = Q[i], [uj, vj] = Q[j]; if ((vi > v) !== (vj > v)) xs.push(ui + (v - vi) / (vj - vi) * (uj - ui)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a0 = xs[k] + 4, a1 = xs[k + 1] - 4; if (a1 - a0 < 15) continue;
        if (smer > 0) path.push(W(a0, v), W(a1, v)); else path.push(W(a1, v), W(a0, v));
      }
      smer = -smer;
    }
    const len = [0]; for (let i = 1; i < path.length; i++) len.push(len[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    return { path, len, L: len[len.length - 1] || 0 };
  }
  function poCeste(r, s) {                                  // bod a směr na lomené čáře ve vzdálenosti s
    let i = 1; while (i < r.len.length - 1 && r.len[i] < s) i++;
    const a = r.path[i - 1], b = r.path[i], t = Math.max(0, Math.min(1, (s - r.len[i - 1]) / ((r.len[i] - r.len[i - 1]) || 1)));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b[0] - a[0], b[1] - a[1]];
  }
  const praha = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()), g = (t) => p.find((q) => q.type === t).value;
    return { den: `${g('year')}-${g('month')}-${g('day')}`, s: +g('hour') * 3600 + +g('minute') * 60 + +g('second') }; };
  let farmCas = null, farmCasT = 0;
  pluginFrames.push({ layer: 'world', priority: 1, fn: (ctx, v) => {
    if (v.sx < 0.3 || v.night > 0.5) return;                // stroje jen ve dne a zblízka
    const nyni = performance.now(); if (!farmCas || nyni - farmCasT > 1000) { farmCas = praha(); farmCasT = nyni; }
    const t = farmCas.s + (nyni - farmCasT) / 1000, cfg = PRACE[state.season];
    const vid = (x, y) => { const p = toImg(x, y, gz(x, y)); return v.vis(p[0], p[1], 200); };
    const jed = (x, y, dx, dy, len, wid, col, kod) => drawVehicle({ x, y, z: gz(x, y), dx, dy, lane: 0, noLights: true }, len, wid, col, v.sx, v.ox, v.oy, v.night, kod);
    const suchy = state.weather !== 'rain' && state.weather !== 'snow';
    if (cfg && FARM.pole) {
      if (FARM.den !== farmCas.den + state.season) {      // dnešní pole: podle data a čísla pole (stejné pro všechny)
        FARM.den = farmCas.den + state.season; const h = sid(farmCas.den);
        FARM.akt = FARM.pole.map((f, i) => [f, i]).filter(([f, i]) => cfg.ok(f.pl) && rnd(h + i * 7.7) < cfg.podil);
      }
      for (const [f, i] of FARM.akt) {
        if (!f.bbi) {                                         // obdélník pole v obrázku (stroj bývá na obrazovce, i když střed pole ne)
          let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
          for (const [x, y] of f.P) { const q = toImg(x, y, gz(x, y)); a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); e = Math.max(e, q[1]); }
          f.bbi = [a, b - 40, c, e];
        }
        { const [A, B] = v.toScreen(f.bbi[0], f.bbi[1]), [C, E] = v.toScreen(f.bbi[2], f.bbi[3]); if (C < -50 || A > v.cw + 50 || E < -50 || B > v.ch + 50) continue; }
        const r = f.pr || (f.pr = pruhy(f.P, cfg.sirka)); if (!r.L) continue;
        const s = (((t - 7 * 3600) * cfg.v + rnd(i) * r.L) % r.L + r.L) % r.L;
        const [x, y, dx, dy] = poCeste(r, s);
        if (suchy && state.season !== 'spring') {            // prach za strojem
          for (let k = 1; k <= 6; k++) {
            const [qx, qy] = poCeste(r, Math.max(0, s - k * 2.2)), p = toImg(qx, qy, gz(qx, qy) + 1.2 + k * 0.25);
            ctx.fillStyle = `rgba(196,176,128,${(0.28 - k * 0.04).toFixed(2)})`; const sz = (3 + k * 1.6) * v.sx;
            ctx.fillRect(v.ox + p[0] * v.sx - sz / 2, v.oy + p[1] * v.sx - sz / 2, sz, sz);
          }
        }
        jed(x, y, dx, dy, cfg.stroj === 12 ? 8.5 : 4.3, cfg.stroj === 12 ? 3.4 : 2.3, cfg.col, cfg.stroj);
        if (cfg.vlek && i % 2 === 0) {                       // traktor s vlekem jede vedle kombajnu (přesyp zrna)
          const L = Math.hypot(dx, dy) || 1, o = 7.5;
          jed(x - dy / L * o - dx / L * 4, y + dx / L * o - dy / L * 4, dx, dy, 4.3, 2.3, '#2f7a2e|#c23a2a', 14);
        }
      }
    }
    if (state.season === 'winter') return;
    for (const c of FARM.cesty) {                            // traktor na polní cestě: tam a zpět, 20 km/h
      const ph = ((t * 5.5 + rnd(c.seed) * 2 * c.L) % (2 * c.L) + 2 * c.L) % (2 * c.L), s = ph < c.L ? ph : 2 * c.L - ph;
      const r = { path: c.path, len: c.len }, [x, y, dx, dy] = poCeste(r, s), d = ph < c.L ? 1 : -1;
      if (!vid(x, y)) continue;
      jed(x, y, dx * d, dy * d, 4.3, 2.3, rnd(c.seed + 1) < 0.6 ? '#2f7a2e|#c23a2a' : '#b52a1e|#2f6b8a', rnd(c.seed + 2) < 0.5 ? 14 : 10);
    }
  } });
