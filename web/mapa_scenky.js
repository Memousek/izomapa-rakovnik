// Drobné scénky života na mapě (inspirace izomapa.sachytynec.cz, kód vlastní). Místa vybírá nastroje/scenky.py z dat
// (site/scenky.json), co se kde děje, určuje jen datum, hodina, počasí a semínko: všichni návštěvníci vidí totéž.
// Ilustrace, ne zpravodajství:
//   rybáři u rybníků (duben–říjen, ráno a odpoledne), otužilci (listopad–březen, víkendová dopoledne),
//   bruslaři na zamrzlých rybnících (zima se sněhem), koupaliště (červen–srpen, hezky), houbaři na kraji lesa (srpen–říjen),
//   draci na loukách (září–říjen odpoledne), pikniky v parcích (léto o víkendu), pálení čarodějnic (30. 4. večer),
//   svíčky na hřbitovech o Dušičkách (31. 10.–2. 11. večer) a horkovzdušný balón nad městem (jaro a léto za úsvitu a večer).
// Zkouška jiného data: ?zivot=2026-04-30T21:00 (jako web/mapa_zivot.js)
const praha = () => {
  const p = new URLSearchParams(location.search).get('zivot'), d = p ? new Date(p) : new Date();
  return isNaN(d) ? new Date() : (p ? d : new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Prague' })));
};
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const PLAVKY = (k) => ({ top: 'tank', topC: ['#2a6fb0', '#c8343c', '#2f8f5b', '#e0a020'][k % 4], bot: 'shorts', botC: ['#1d3e70', '#2a2a2e', '#c8343c'][k % 3], shoes: '#e8c4a0' });
const BRUSLAR = (k) => ({ top: 'coat', topC: ['#c8343c', '#2a6fb0', '#3a3a40', '#e0a020'][k % 4], bot: 'trousers', botC: '#2a2a2e', hat: { t: 'beanie', c: ['#f4f2ea', '#c8343c', '#2a6fb0'][k % 3] }, shoes: '#e8e8ec', gloves: '#2a2a2e' });

export async function spust() {
  const I = window.Izomapa; if (!I) return;
  let S;
  try { S = await (await fetch('scenky.json')).json(); } catch { return; }
  const W = (q) => I.latLonToWorld(q[0], q[1]);
  const cam = I.getCam();
  const vMape = (x, y) => cam.grounds.some((g) => Math.abs(x - g.cx) <= cam.half && Math.abs(y - g.cy) <= cam.half);
  const pripravit = (k) => (S[k] || []).map((q) => ({ q, w: W(q) })).filter((o) => vMape(...o.w));
  const M = Object.fromEntries(['rybar', 'otuzilci', 'brusleni', 'koupani', 'louka', 'park', 'houbar', 'carodejnice', 'hrbitov'].map((k) => [k, pripravit(k)]));
  const hpx = Math.abs(I.toImg(0, 0, 1)[1] - I.toImg(0, 0, 0)[1]);   // obrazové body na 1 m výšky
  const den = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) + d.getFullYear() * 400;

  // čára mezi dvěma body světa (s výškou nad terénem)
  const cara = (ctx, v, a, b, barva, sirka = 1) => {
    const A = v.toScreen(...I.toImg(a[0], a[1], I.gz(a[0], a[1]) + a[2])), B = v.toScreen(...I.toImg(b[0], b[1], I.gz(b[0], b[1]) + b[2]));
    ctx.strokeStyle = barva; ctx.lineWidth = sirka; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  };
  // obdélník na zemi (deka, ručník) jako rovnoběžník v izometrii
  const deka = (ctx, v, x, y, d, s, a, barva) => {
    const ca = Math.cos(a), sa = Math.sin(a), P = [[-d, -s], [d, -s], [d, s], [-d, s]].map(([u, w]) => v.toScreen(...I.toImg(x + u * ca - w * sa, y + u * sa + w * ca, I.gz(x, y) + 0.03)));
    ctx.fillStyle = barva; ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill();
  };
  const bod = (ctx, v, x, y, h, barva, r) => { const [X, Y] = v.toScreen(...I.toImg(x, y, I.gz(x, y) + h)); ctx.fillStyle = barva; ctx.fillRect(Math.round(X - r / 2), Math.round(Y - r / 2), r, r); return [X, Y]; };

  I.onFrame((ctx, v) => {
    if (v.sx < 0.3 || !I.postava) return;
    const d = praha(), h = d.getHours() + d.getMinutes() / 60, m = d.getMonth(), dd = d.getDate(), wd = d.getDay(), t = d.getTime() / 1000, D = den(d);
    const vikend = wd === 0 || wd === 6, dest = v.weather === 'rain', zima = v.season === 'winter', u = hpx * 0.1 * v.sx;   // u: 10 cm na obrazovce
    const L = [], P = [], kresli = (f, kde = 'pod') => P.push([f, kde]);   // postavy [x, y, volby, hloubka]; doplňky pod nimi nebo nad nimi
    const pridej = (x, y, q) => L.push([x, y, q, I.toImg(x, y, I.gz(x, y))[1]]);
    const otoc = (x, y, a) => { const p0 = I.toImg(x, y, 0), p1 = I.toImg(x + Math.cos(a), y + Math.sin(a), 0); return { mir: p1[0] < p0[0], back: p1[1] < p0[1] }; };

    // rybáři: duben–říjen 5–10 a 15–20 h, každý den jiní (asi polovina míst), prut nad vodou, splávek
    if (m >= 3 && m <= 9 && !dest && ((h >= 5 && h < 10) || (h >= 15 && h < 20))) M.rybar.forEach(({ q, w: [x, y] }, k) => {
      if (rnd(D * 3 + k) > 0.45) return;
      const a = q[3] ?? 0, sm = otoc(x, y, a), kyv = Math.sin(t * 0.7 + k) * 0.15;
      pridej(x, y, { oi: 500 + k, ...sm });
      kresli(() => {
        const sx = x + Math.cos(a) * 0.3, sy = y + Math.sin(a) * 0.3, kx = x + Math.cos(a + kyv) * 3.2, ky = y + Math.sin(a + kyv) * 3.2;
        cara(ctx, v, [sx, sy, 1.1], [kx, ky, 2.4], '#5a4632', Math.max(1, u * 0.5));
        const fx = x + Math.cos(a) * 5.5, fy = y + Math.sin(a) * 5.5;
        cara(ctx, v, [kx, ky, 2.4], [fx, fy, 0.05], 'rgba(230,230,230,.6)', 1);
        bod(ctx, v, fx, fy, 0.05 + Math.max(0, Math.sin(t * 2 + k)) * 0.05, '#e03a2a', Math.max(2, u * 0.9));
      }, 'pod');
    });
    // otužilci: listopad–březen, sobota a neděle 9–11 h; na břehu v plavkách, pár hlav ve vodě
    if ((m >= 10 || m <= 2) && vikend && h >= 9 && h < 11) M.otuzilci.forEach(({ q }) => {
      const breh = M.rybar.find((r) => r.q[2] === q[2]) || null; if (!breh) return;
      const [x, y] = breh.w, a = breh.q[3] ?? 0;
      for (let k = 0; k < 5; k++) { const px = x - Math.sin(a) * (k - 2) * 0.9, py = y + Math.cos(a) * (k - 2) * 0.9; pridej(px, py, { outfit: PLAVKY(k), ...otoc(px, py, a), oi: 600 + k }); }
      kresli(() => { for (let k = 0; k < 4; k++) { const r = 2.5 + rnd(k) * 3, o = a + (rnd(k + 5) - 0.5) * 1.4; bod(ctx, v, x + Math.cos(o) * r, y + Math.sin(o) * r, 0.15 + Math.sin(t * 1.5 + k) * 0.04, '#e8c4a0', Math.max(2, u * 2.2)); } });
    });
    // bruslaři: zima se sněhem (zamrzlý rybník), 10–17 h, krouží
    if (zima && v.snowy && h >= 10 && h < 17) M.brusleni.forEach(({ q, w: [x, y] }, k) => {
      if (rnd(D + k * 7) > 0.6) return;
      const R = Math.min(q[2] || 20, 25);
      for (let j = 0; j < 8; j++) {
        const sm = j % 2 ? 1 : -1, r = R * (0.3 + rnd(j + k) * 0.6), a = sm * t * (0.35 / Math.max(0.5, r / 10)) + j * 0.8, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        pridej(px, py, { outfit: BRUSLAR(j + k), kid: j % 3 === 2, ...otoc(px, py, a + sm * Math.PI / 2), frame: Math.floor(t * 2 + j) % 4 });
      }
    });
    // koupaliště: červen–srpen 10–19 h bez deště; ručníky a lidé v plavkách
    if (m >= 5 && m <= 7 && !dest && h >= 10 && h < 19) M.koupani.forEach(({ q, w: [x, y] }) => {
      const n = vikend ? 26 : 14, R = q[2] || 25;
      for (let k = 0; k < n; k++) {
        const a = rnd(k + 11) * 6.283, r = R * (0.85 + rnd(k + 3) * 0.5), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (I.vBudove(px, py)) continue;
        if (k % 3) kresli(() => deka(ctx, v, px + 0.6, py, 0.9, 0.45, a, ['#e05a4a', '#3a8fd0', '#f0c030', '#7ac070'][k % 4]));
        pridej(px, py, { outfit: PLAVKY(k), kid: k % 4 === 1, ...otoc(px, py, a + Math.PI), frame: k % 5 === 0 ? Math.floor(t * 3 + k) % 4 : 0 });
      }
    });
    // houbaři: srpen–říjen 7–13 h, kus po kraji lesa s košíkem (pomalu)
    if (m >= 7 && m <= 9 && !dest && h >= 7 && h < 13) M.houbar.forEach(({ w: [x, y] }, k) => {
      if (rnd(D * 5 + k) > (vikend ? 0.5 : 0.25)) return;
      const a = t * 0.04 + k, px = x + Math.cos(a) * 6, py = y + Math.sin(a) * 6;
      pridej(px, py, { oi: 700 + k, ...otoc(px, py, a + Math.PI / 2), frame: Math.floor(t * 1.5) % 4 });
      kresli(() => bod(ctx, v, px + 0.35, py, 0.55, '#8a6a3a', Math.max(2, u * 2.5)), 'nad');
    });
    // draci: září–říjen 14–18 h, o víkendu skoro vždy, ve všední den občas; dítě a dospělý, drak 25 m nad loukou
    // drak letí po větru (v.wind z Open-Meteo: e, n = kam fouká, ms = m/s); za bezvětří (pod 1,5 m/s) nelétá
    const vitr = v.wind && Number.isFinite(v.wind.ms) ? v.wind : { e: 0.8, n: 0.6, ms: 4 };
    if ((m === 8 || m === 9) && !dest && h >= 14 && h < 18 && vitr.ms >= 1.5) M.louka.forEach(({ w: [x, y] }, k) => {
      if (rnd(D * 7 + k) > (vikend ? 0.6 : 0.2)) return;
      const sm = otoc(x, y, Math.atan2(vitr.n, vitr.e));          // lidé koukají za drakem
      pridej(x, y, { oi: 800 + k, kid: true, ...sm });
      pridej(x - vitr.n * 1.2, y + vitr.e * 1.2, { oi: 820 + k, ...sm });
      const sila = Math.min(vitr.ms, 12), delka = 16 + sila * 1.5, kyv = (0.12 + sila * 0.03) * Math.sin(t * (0.4 + sila * 0.08) + k);
      const ex = vitr.e * Math.cos(kyv) - vitr.n * Math.sin(kyv), ny = vitr.e * Math.sin(kyv) + vitr.n * Math.cos(kyv);
      const vx = x + ex * delka, vy = y + ny * delka, vz = 12 + sila * 1.6 + Math.sin(t * (0.6 + sila * 0.1) + k) * (1 + sila * 0.25);
      kresli(() => {
        cara(ctx, v, [x, y, 1.0], [vx, vy, vz], 'rgba(240,240,240,.7)', 1);
        const [X, Y] = v.toScreen(...I.toImg(vx, vy, I.gz(vx, vy) + vz)), s = Math.max(6, u * 12), c = ['#e0302a', '#f0c030', '#2a7fd0', '#2fa060'][k % 4];
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(X, Y - s); ctx.lineTo(X + s * 0.7, Y); ctx.lineTo(X, Y + s * 1.2); ctx.lineTo(X - s * 0.7, Y); ctx.closePath(); ctx.fill();
        for (let j = 1; j <= 4; j++) { ctx.fillStyle = j % 2 ? '#f4f2ea' : c; ctx.fillRect(X - s * 0.15 + Math.sin(t * (2 + sila * 0.5) + j) * s * (0.15 + sila * 0.04), Y + s * (1.2 + j * 0.45), s * 0.3, s * 0.25); }
      }, 'nad');
    });
    // pikniky: červen–srpen o víkendu 11–18 h bez deště
    if (m >= 5 && m <= 7 && vikend && !dest && h >= 11 && h < 18) M.park.forEach(({ w: [x, y] }, k) => {
      if (rnd(D * 11 + k) > 0.5) return;
      kresli(() => deka(ctx, v, x, y, 1.1, 0.8, k, ['#c8343c', '#2a6fb0', '#e0a020'][k % 3]));
      pridej(x - 1.2, y + 0.4, { oi: 900 + k, ...otoc(x - 1.2, y + 0.4, 0) });
      pridej(x + 1.3, y - 0.2, { oi: 910 + k, ...otoc(x + 1.3, y - 0.2, Math.PI) });
      pridej(x + 0.2, y - 1.4, { oi: 920 + k, kid: true, ...otoc(x, y - 1.4, Math.PI / 2), frame: Math.floor(t * 4) % 4 });
    });
    // pálení čarodějnic: 30. 4. 18–24 h, oheň a lidé kolem
    if (m === 3 && dd === 30 && h >= 18) M.carodejnice.forEach(({ w: [x, y] }) => {
      for (let k = 0; k < 34; k++) { const a = rnd(k + 1) * 6.283, r = 6 + rnd(k + 50) * 6, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; pridej(px, py, { oi: 1000 + k, kid: k % 5 === 2, ...otoc(px, py, a + Math.PI) }); }
      kresli(() => {
        const vyska = h < 19 ? 0.6 : 1 + Math.sin(t * 2) * 0.1;
        for (let j = 0; j < 26; j++) {
          const r = rnd(j) * 1.6, a = rnd(j + 3) * 6.283, z = (rnd(j + 7) * 3.5 + (t * 1.3 + rnd(j)) % 1.2) * vyska;
          bod(ctx, v, x + Math.cos(a) * r * (1 - z / 4.5), y + Math.sin(a) * r * (1 - z / 4.5), z, z > 2.4 ? 'rgba(255,220,90,.85)' : j % 2 ? '#ff7a1a' : '#e8401a', Math.max(2, u * 4));
        }
        if (v.night > 0.3) { const [X, Y] = v.toScreen(...I.toImg(x, y, I.gz(x, y) + 1.5)), R = u * 140; const g = ctx.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, `rgba(255,150,60,${(0.4 * v.night).toFixed(2)})`); g.addColorStop(1, 'rgba(255,150,60,0)'); ctx.fillStyle = g; ctx.fillRect(X - R, Y - R, R * 2, R * 2); }
      }, 'nad');
    });
    // Dušičky: 31. 10.–2. 11. od 15 h svíčky na hřbitovech (v noci svítí), odpoledne návštěvníci
    if (((m === 9 && dd === 31) || (m === 10 && dd <= 2)) && h >= 15) M.hrbitov.forEach(({ q, w: [x, y] }, k) => {
      const R = q[2] || 25;
      kresli(() => { for (let j = 0; j < 90; j++) { const a = rnd(j + k * 100) * 6.283, r = Math.sqrt(rnd(j + 33 + k * 100)) * R, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, bl = 0.75 + Math.sin(t * 6 + j) * 0.25;
        const [X, Y] = bod(ctx, v, px, py, 0.25, j % 3 ? '#d02a20' : '#f0f0e8', Math.max(2, u * 1.2));
        if (v.night > 0.3) { ctx.fillStyle = `rgba(255,190,90,${(0.55 * bl * v.night).toFixed(2)})`; ctx.fillRect(Math.round(X - u * 0.6), Math.round(Y - u * 2), Math.max(1, u * 1.2), Math.max(1, u * 1.2)); } } });
      if (h < 19) for (let j = 0; j < 8; j++) { const a = rnd(j + 7 + k) * 6.283, r = Math.sqrt(rnd(j + 8 + k)) * R * 0.8, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; pridej(px, py, { oi: 1100 + j, ...otoc(px, py, a) }); }
    });

    for (const [f, kde] of P) if (kde !== 'nad') f();
    L.sort((p, q) => p[3] - q[3]);
    for (const [x, y, q] of L) I.postava(v, x, y, q);
    for (const [f, kde] of P) if (kde === 'nad') f();
  }, { layer: 'world', priority: -2 });

  // ---------- nebe: čáry větru při silném větru (od 6 m/s) jen při oddálení, letí po větru, víc a delší podle síly ----------
  const cary = Array.from({ length: 40 }, (_, i) => ({ x: rnd(i + 1) * 2 - 1, y: rnd(i + 2) * 2 - 1, f: rnd(i + 3), d: 0.6 + rnd(i + 4) * 0.8 }));
  I.onFrame((ctx, v) => {
    const w = v.wind, fade = Math.max(0, Math.min(1, (0.45 - v.sx) / 0.25)); if (!w || !(w.ms >= 6) || fade <= 0) return;   // jen při oddálení (jako mraky)
    const sila = Math.min(1, (w.ms - 6) / 8), n = Math.round((12 + sila * 28) * (v.eco ? 0.5 : 1)), t = v.now / 1000;
    const L = Math.hypot(w.dx, w.dy) || 1, ux = w.dx / L, uy = w.dy / L, dl = (40 + sila * 60) * Math.max(0.6, Math.min(1.6, v.sx * 3));
    ctx.lineWidth = Math.max(1.5, Math.min(3, v.sx * 3)); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const c = cary[i], fz = (t * (0.18 + sila * 0.25) * c.d + c.f) % 1;   // fáze průletu přes obrazovku
      const X = ((c.x * 0.5 + 0.5) * v.cw + ux * (fz - 0.5) * v.cw * 1.2 + v.cw) % v.cw, Y = ((c.y * 0.5 + 0.5) * v.ch + uy * (fz - 0.5) * v.cw * 1.2 + v.ch) % v.ch;
      const a = Math.sin(fz * Math.PI) * (0.38 + sila * 0.32) * fade;
      ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(2)})`; ctx.beginPath();
      const zv = Math.sin(t * 2 + i) * 6;                          // lehké zvlnění
      ctx.moveTo(X - ux * dl, Y - uy * dl); ctx.quadraticCurveTo(X - ux * dl * 0.4 - uy * zv, Y - uy * dl * 0.4 + ux * zv, X, Y); ctx.stroke();
    }
  }, { layer: 'sky', priority: -3 });

  // ---------- nebe: horkovzdušný balón (duben–září, za úsvitu 6–8:30 a večer 18–20:30, ne každý den, bez deště) ----------
  const stred = I.latLonToWorld(...I.worldToLatLon(0, 0));
  I.onFrame((ctx, v) => {
    const d = praha(), h = d.getHours() + d.getMinutes() / 60, m = d.getMonth(), D = den(d);
    if (m < 3 || m > 8 || v.weather === 'rain' || v.weather === 'snow' || rnd(D * 13) > 0.3 || (v.wind && v.wind.ms > 7)) return;
    const okno = h >= 6 && h < 8.5 ? [6, 8.5] : h >= 18 && h < 20.5 ? [18, 20.5] : null; if (!okno) return;
    const f = (h - okno[0]) / (okno[1] - okno[0]), sm = v.wind && Number.isFinite(v.wind.e) ? Math.atan2(v.wind.n, v.wind.e) : rnd(D * 17) * 6.283;   // let přes mapu po větru, 3 km za okno
    const x = stred[0] + Math.cos(sm) * (f - 0.5) * 3000 + Math.sin(sm) * 400, y = stred[1] + Math.sin(sm) * (f - 0.5) * 3000 - Math.cos(sm) * 400;
    const z = 120 + Math.sin(f * Math.PI) * 180, ip = I.toImg(x, y, I.gz(x, y) + z);
    if (!v.vis(ip[0], ip[1], 200)) return;
    const [X, Y] = v.toScreen(...ip), s = Math.max(6, hpx * v.sx * 9), B = ['#d8302a', '#f2c230', '#2a6fd0'];
    for (let r = 0; r < 3; r++) { ctx.fillStyle = B[r]; ctx.beginPath(); ctx.ellipse(X, Y, s * (1 - r * 0.33), s * 1.15, 0, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(X - s * 0.35, Y - s * 0.4, s * 0.25, s * 0.45, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X - s * 0.45, Y + s * 0.95); ctx.lineTo(X - s * 0.2, Y + s * 1.6); ctx.moveTo(X + s * 0.45, Y + s * 0.95); ctx.lineTo(X + s * 0.2, Y + s * 1.6); ctx.stroke();
    ctx.fillStyle = '#7a5a32'; ctx.fillRect(X - s * 0.22, Y + s * 1.6, s * 0.44, s * 0.35);
    const [gx, gy] = v.toScreen(...I.toImg(x, y, I.gz(x, y)));   // stín na zemi
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(gx, gy, s * 0.8, s * 0.4, 0, 0, 6.283); ctx.fill();
  }, { layer: 'sky', priority: -2 });
}
