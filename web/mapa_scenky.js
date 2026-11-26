// Drobné scénky života na mapě (inspirace izomapa.sachytynec.cz, kód vlastní). Místa vybírá nastroje/scenky.py z dat
// (site/scenky.json), co se kde děje, určuje jen datum, hodina, počasí a semínko: všichni návštěvníci vidí totéž.
// Ilustrace, ne zpravodajství:
//   rybáři u rybníků (duben–říjen, ráno a odpoledne), otužilci (listopad–březen, víkendová dopoledne),
//   bruslaři na zamrzlých rybnících (zima se sněhem), koupaliště (červen–srpen, hezky), houbaři na kraji lesa (srpen–říjen),
//   draci na loukách (září–říjen odpoledne), pikniky v parcích (léto o víkendu), pálení čarodějnic (30. 4. večer),
//   svíčky na hřbitovech o Dušičkách (31. 10.–2. 11. večer) a horkovzdušný balón nad městem (jaro a léto za úsvitu a večer).
// Zkouška jiného data: ?zivot=2026-04-30T21:00 (jako web/mapa_zivot.js)
// pražský čas jako místní Date; posun se spočítá jednou, takže čas běží plynule (i s ?zivot=, kde začne v zadaném okamžiku)
const POSUN = (() => {
  const p = new URLSearchParams(location.search).get('zivot'), d = p ? new Date(p) : null, ted = new Date();
  if (d && !isNaN(d)) return d - ted;
  return new Date(ted.toLocaleString('en-US', { timeZone: 'Europe/Prague' })) - ted + ted.getMilliseconds();
})();
const praha = () => new Date(Date.now() + POSUN);
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
  const M = Object.fromEntries(['rybar', 'otuzilci', 'brusleni', 'koupani', 'louka', 'park', 'houbar', 'carodejnice', 'hrbitov', 'ulice', 'advent'].map((k) => [k, pripravit(k)]));
  const hpx = Math.abs(I.toImg(0, 0, 1)[1] - I.toImg(0, 0, 0)[1]);   // obrazové body na 1 m výšky
  // svahy pro sáňkování: louky a parky se sklonem nad 6 % (terén z mapy), směr dolů
  const KOPCE = [...M.louka, ...M.park].map(({ w: [x, y] }) => {
    const dx = (I.gz(x + 6, y) - I.gz(x - 6, y)) / 12, dy = (I.gz(x, y + 6) - I.gz(x, y - 6)) / 12, sk = Math.hypot(dx, dy);
    return { x, y, sk, a: Math.atan2(-dy, -dx) };
  }).filter((k) => k.sk > 0.06);
  const KOSTYM = {
    duch: { top: 'dress', topC: '#f4f2ea', bot: 'none', hair: '#f4f2ea', hairStyle: 'long', shoes: '#f4f2ea', skin: '#f4f2ea' },
    carodejnice: { top: 'dress', topC: '#2a1f2e', bot: 'none', hair: '#5a8a3a', hairStyle: 'long', shoes: '#1a1a1a' },
    dyne: { top: 'hoodie', topC: '#e07020', bot: 'trousers', botC: '#2a2a2e', hair: '#3a6a2a', shoes: '#1a1a1a' },
    kostlivec: { top: 'hoodie', topC: '#1a1a1e', bot: 'trousers', botC: '#1a1a1e', shoes: '#1a1a1a', skin: '#e8e6df' },
  };
  const md = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const vObdobi = (d, od, do_) => { const x = md(d); return od <= do_ ? x >= od && x <= do_ : x >= od || x <= do_; };
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
    if ((m === 8 || m === 9 || (m === 10 && dd <= 15)) && !dest && h >= (m === 10 ? 13 : 14) && h < (m === 10 ? 16.5 : 18) && vitr.ms >= 1.5) M.louka.forEach(({ w: [x, y] }, k) => {
      if (rnd(D * 7 + k) > (vikend ? 0.6 : 0.2)) return;
      const sm = otoc(x, y, Math.atan2(vitr.n, vitr.e));          // lidé koukají za drakem
      pridej(x, y, { oi: 800 + k, kid: true, ...sm });
      pridej(x - vitr.n * 1.2, y + vitr.e * 1.2, { oi: 820 + k, ...sm });
      const sila = Math.min(vitr.ms, 12), delka = 16 + sila * 1.5, kyv = (0.12 + sila * 0.03) * Math.sin(t * (0.4 + sila * 0.08) + k);
      const ex = vitr.e * Math.cos(kyv) - vitr.n * Math.sin(kyv), ny = vitr.e * Math.sin(kyv) + vitr.n * Math.cos(kyv);
      const vx = x + ex * delka, vy = y + ny * delka, vz = 12 + sila * 1.6 + Math.sin(t * (0.6 + sila * 0.1) + k) * (1 + sila * 0.25);
      if (u < 0.3) return;                                        // drak jen tam, kde jsou vidět i lidé
      kresli(() => {
        const [X, Y] = v.toScreen(...I.toImg(vx, vy, I.gz(vx, vy) + vz)), [X0, Y0] = v.toScreen(...I.toImg(x, y, I.gz(x, y) + 1.0));
        // provázek: průvěs (víc při slabém větru), lehce se chvěje
        const pr = (1.2 - sila / 12) * Math.hypot(X - X0, Y - Y0) * 0.12, cvx = (X + X0) / 2 + Math.sin(t * 1.3 + k) * 2, cvy = (Y + Y0) / 2 + pr;
        ctx.strokeStyle = 'rgba(240,240,240,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.quadraticCurveTo(cvx, cvy, X, Y); ctx.stroke();
        // drak: kosočtverec, kolébá se podle síly větru
        const s = Math.max(5, u * 12), c = ['#e0302a', '#f0c030', '#2a7fd0', '#2fa060'][k % 4], na = Math.sin(t * (1.1 + sila * 0.25) + k) * (0.12 + sila * 0.03);
        ctx.save(); ctx.translate(X, Y); ctx.rotate(na);
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s * 1.2); ctx.lineTo(-s * 0.7, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s * 1.2); ctx.closePath(); ctx.fill();
        ctx.restore();
        // ocas: vlnitá stužka po větru (vlna běží od draka), mašle po 1/5 délky
        const ox = -Math.sin(na) * s * 1.2 + X, oy = Math.cos(na) * s * 1.2 + Y, dw = v.wind ? Math.hypot(v.wind.dx, v.wind.dy) || 1 : 1;
        const wx = v.wind ? v.wind.dx / dw : 0.7, wy = v.wind ? v.wind.dy / dw : 0.3, del = s * (4 + sila * 0.3), A = s * (0.35 - sila * 0.015);
        let px = ox, py = oy;
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.14);
        for (let j = 1; j <= 16; j++) {
          const q = j / 16, vl = Math.sin(q * 9 - t * (5 + sila * 0.6) + k) * A * q;
          const qx = ox + (wx * 0.6) * del * q - wy * vl, qy = oy + (0.8 + wy * 0.6) * del * q * 0.6 + wx * vl;   // ocas visí dolů a po větru
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
          if (j % 4 === 0) { ctx.fillStyle = '#f4f2ea'; ctx.fillRect(qx - s * 0.18, qy - s * 0.1, s * 0.36, s * 0.2); }
          px = qx; py = qy;
        }
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

    // ---------- zima a podzim ----------
    // sáňkování: zima se sněhem, o víkendu 9–16 h, ve všední den 13–16 h (po škole); děti sjíždějí svah a jdou nahoru
    if (zima && v.snowy && !dest && h >= (vikend ? 9 : 13) && h < 16) KOPCE.forEach((kp, k) => {
      if (rnd(D * 19 + k) > (vikend ? 0.8 : 0.45)) return;
      for (let j = 0; j < 4; j++) {
        const f = (t / (14 + j * 3) + rnd(j + k)) % 1, dolu = f < 0.35, q = dolu ? f / 0.35 : 1 - (f - 0.35) / 0.65, L = 22;   // sjezd rychle, výstup pomalu
        const bo = (j - 1.5) * 2.2, px = kp.x + Math.cos(kp.a) * (q - 0.5) * L - Math.sin(kp.a) * bo, py = kp.y + Math.sin(kp.a) * (q - 0.5) * L + Math.cos(kp.a) * bo;
        pridej(px, py, { outfit: BRUSLAR(j + k), kid: true, ...otoc(px, py, dolu ? kp.a : kp.a + Math.PI), frame: dolu ? 0 : Math.floor(t * 3 + j) % 4 });
        const sa = kp.a, sx_ = px + Math.cos(sa) * (dolu ? 0.1 : -0.7), sy_ = py + Math.sin(sa) * (dolu ? 0.1 : -0.7);
        kresli(() => deka(ctx, v, sx_, sy_, 0.5, 0.22, sa, '#8a4a2a'));   // sáňky (pod dítětem, při výstupu za ním)
      }
    });
    // sněhuláci: zima se sněhem, v parcích a na loukách, každý týden jinde
    if (zima && v.snowy && u >= 0.3) [...M.park, ...M.louka.slice(0, 10)].forEach(({ w: [x, y] }, k) => {
      if (rnd(Math.floor(D / 7) * 23 + k) > 0.45) return;
      const sx2 = x + 3, sy2 = y - 2;
      kresli(() => {
        const g = I.gz(sx2, sy2), Z = (h_) => v.toScreen(...I.toImg(sx2, sy2, g + h_)), R = hpx * v.sx;
        for (const [hh, r] of [[0.32, 0.34], [0.82, 0.25], [1.18, 0.18]]) { const [X, Y] = Z(hh); ctx.fillStyle = '#f6f7fa'; ctx.beginPath(); ctx.arc(X, Y, r * R, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(120,130,150,.25)'; ctx.beginPath(); ctx.arc(X + r * R * 0.3, Y + r * R * 0.2, r * R * 0.8, 0, 6.283); ctx.fill(); }
        const [X, Y] = Z(1.2), r = 0.18 * R;
        ctx.fillStyle = '#1a1a1e'; ctx.fillRect(X - r * 0.5, Y - r * 0.3, Math.max(1, r * 0.2), Math.max(1, r * 0.2)); ctx.fillRect(X + r * 0.2, Y - r * 0.3, Math.max(1, r * 0.2), Math.max(1, r * 0.2));
        ctx.fillStyle = '#e8701a'; ctx.fillRect(X - r * 0.1, Y, r * 0.9, Math.max(1, r * 0.22));                            // mrkev
        ctx.fillStyle = '#2a2a30'; ctx.fillRect(X - r * 0.7, Y - r * 1.1, r * 1.4, Math.max(1, r * 0.25)); ctx.fillRect(X - r * 0.45, Y - r * 1.9, r * 0.9, r * 0.8);   // hrnec
      }, 'nad');
    });
    // krmení kachen: o víkendu 10–16 h u rybníků (ne zamrzlých), rodič s dítětem a kachny ve vodě
    if (vikend && !dest && !(zima && v.snowy) && h >= 10 && h < 16 && u >= 0.3) M.rybar.forEach(({ q, w: [x, y] }, k) => {
      if (rnd(D * 29 + k) > 0.3) return;
      const a = q[3] ?? 0, sm = otoc(x, y, a), bx = x - Math.sin(a) * 1.5, by = y + Math.cos(a) * 1.5;
      pridej(bx, by, { oi: 1200 + k, ...sm });
      pridej(bx + Math.cos(a) * 0.4 - Math.sin(a) * 0.9, by + Math.sin(a) * 0.4 + Math.cos(a) * 0.9, { oi: 1210 + k, kid: true, ...sm, frame: Math.floor(t * 2) % 2 });
      kresli(() => {
        for (let j = 0; j < 6; j++) {
          const r = 2.2 + rnd(j + k) * 3 + Math.sin(t * 0.4 + j) * 0.6, o = a + (rnd(j + 40 + k) - 0.5) * 1.2, px = bx + Math.cos(o) * r, py = by + Math.sin(o) * r;
          const [X, Y] = v.toScreen(...I.toImg(px, py, I.gz(px, py) + 0.05 + Math.sin(t * 2 + j) * 0.02)), s = Math.max(1, u * 1.1);
          ctx.fillStyle = '#7a5a3a'; ctx.fillRect(Math.round(X - s * 2), Math.round(Y - s), Math.round(s * 4), Math.round(s * 2));   // tělo
          ctx.fillStyle = j % 2 ? '#2f6a3a' : '#8a6a4a'; ctx.fillRect(Math.round(X + s * 1.2), Math.round(Y - s * 2.2), Math.round(s * 1.6), Math.round(s * 1.6));   // hlava (kačer zelená)
          ctx.fillStyle = '#e8a020'; ctx.fillRect(Math.round(X + s * 2.8), Math.round(Y - s * 1.6), Math.max(1, Math.round(s * 0.9)), Math.max(1, Math.round(s * 0.6)));
        }
      });
    });
    // advent: lidé u vánočních stánků (období z assets/vanoce.json), 15–21 h, o víkendu víc; v zimě pára z hrnků
    if (h >= 15 && h < 21) M.advent.forEach(({ q, w: [x, y] }, k) => {
      if (!vObdobi(d, q[6] || '11-15', q[7] || '01-06')) return;
      const a = (q[2] || 0) * Math.PI / 180, n = q[3] || 6, sw = (q[4] || 3) + (q[5] || 1.2), na = Math.atan2(-Math.cos(a), Math.sin(a));   // na: strana pultu (−t)
      for (let i = 0; i < n; i++) {
        const lidi = (vikend ? 3 : 1) + Math.floor(rnd(i + D) * 2);
        for (let j = 0; j < lidi; j++) {
          const o = (i - (n - 1) / 2) * sw + (rnd(i * 7 + j) - 0.5) * 2, r = 2.3 + rnd(i * 5 + j) * 1.6;
          const px = x + Math.cos(a) * o + Math.cos(na) * r, py = y + Math.sin(a) * o + Math.sin(na) * r;
          pridej(px, py, { oi: 1300 + i * 4 + j, kid: j === 2, ...otoc(px, py, na + Math.PI) });
          if (v.season === 'winter' || v.night > 0.3) kresli(() => { const [X, Y] = v.toScreen(...I.toImg(px, py, I.gz(px, py) + 1.45)), f = (t * 0.6 + j * 0.3 + i) % 1; ctx.fillStyle = `rgba(255,255,255,${(0.5 * (1 - f)).toFixed(2)})`; ctx.fillRect(Math.round(X + u * 3), Math.round(Y - f * u * 8), Math.max(1, u), Math.max(1, u)); }, 'nad');
        }
      }
    });
    // Halloween 31. 10. 17–20:30: děti v kostýmech s rodiči chodí po ulicích, u domů svítí dýně
    if (m === 9 && dd === 31 && h >= 17 && h < 20.5) M.ulice.forEach(({ q, w: [x, y] }, k) => {
      if (rnd(k * 3 + 7) > 0.35) return;
      const a = q[2] || 0, f = Math.sin(t / 18 + k) * 12, sm = otoc(x, y, Math.cos(t / 18 + k) > 0 ? a : a + Math.PI), kr = Math.floor(t * 3 + k) % 4;
      const kost = Object.values(KOSTYM), dx = Math.cos(a), dy = Math.sin(a);
      for (let j = 0; j < 3; j++) {
        const px = x + dx * (f + j * 0.9) - dy * (j % 2 ? 0.7 : -0.3), py = y + dy * (f + j * 0.9) + dx * (j % 2 ? 0.7 : -0.3), c = kost[Math.floor(rnd(k + j * 11) * kost.length)];
        pridej(px, py, { outfit: c, kid: true, ...sm, frame: kr });
        if (c === KOSTYM.carodejnice) kresli(() => { const [X, Y] = v.toScreen(...I.toImg(px, py, I.gz(px, py) + 1.3)), s = Math.max(2, u * 4); ctx.fillStyle = '#1a1420'; ctx.beginPath(); ctx.moveTo(X - s, Y); ctx.lineTo(X + s, Y); ctx.lineTo(X + s * 0.2, Y - s * 1.8); ctx.closePath(); ctx.fill(); }, 'nad');
      }
      const px = x + dx * (f - 1.2) - dy * 0.3, py = y + dy * (f - 1.2) + dx * 0.3;
      pridej(px, py, { oi: 1400 + k, ...sm, frame: kr });
      const dx2 = x - dy * 5, dy2 = y + dx * 5;                     // dýně u domu
      kresli(() => { const [X, Y] = bod(ctx, v, dx2, dy2, 0.2, '#e8701a', Math.max(3, u * 4)); if (v.night > 0.2) { const g = ctx.createRadialGradient(X, Y, 0, X, Y, u * 14 + 4); g.addColorStop(0, `rgba(255,160,40,${(0.45 * v.night).toFixed(2)})`); g.addColorStop(1, 'rgba(255,160,40,0)'); ctx.fillStyle = g; ctx.fillRect(X - u * 14 - 4, Y - u * 14 - 4, u * 28 + 8, u * 28 + 8); } }, 'nad');
    });

    for (const [f, kde] of P) if (kde !== 'nad') f();
    L.sort((p, q) => p[3] - q[3]);
    for (const [x, y, q] of L) I.postava(v, x, y, q);
    for (const [f, kde] of P) if (kde === 'nad') f();
  }, { layer: 'world', priority: -2 });

  // ---------- nebe: proudy větru při silném větru (od 6 m/s), jen při oddálení (jako mraky) ----------
  // Stužky leží v souřadnicích obrázku mapy jako mraky: s pohledem se posouvají a zvětšují, samy plují po větru.
  // Vlna běží po stužce, ke koncům se stužka ztrácí.
  let PR = null;
  const obrys = () => { const b = I.obrysMapy().flat(); return [Math.min(...b.map((p) => p[0])), Math.min(...b.map((p) => p[1])), Math.max(...b.map((p) => p[0])), Math.max(...b.map((p) => p[1]))]; };
  I.onFrame((ctx, v) => {
    const w = v.wind, fade = Math.max(0, Math.min(1, (0.45 - v.sx) / 0.25)); if (!w || !(w.ms >= 6)) return;
    const dt = Math.min(0.1, v.dt > 1 ? v.dt / 1000 : v.dt || 0.016), t = v.now / 1000, sila = Math.min(1, (w.ms - 6) / 8);
    if (!PR) { const [x0, y0, x1, y1] = obrys(); PR = { x0, y0, x1, y1, p: Array.from({ length: 30 }, (_, i) => ({ x: x0 + rnd(i + 1) * (x1 - x0), y: y0 + rnd(i + 2) * (y1 - y0), a: 0.6 + rnd(i + 5) * 0.8, f: rnd(i + 9) * 6.283 })) }; }
    const L = Math.hypot(w.dx, w.dy) || 1, ux = w.dx / L, uy = w.dy / L, rv = Math.max(6, Math.min(60, w.ms * 4));   // stejná rychlost jako mraky
    for (const c of PR.p) {                                        // pohyb i mimo obraz, ať po oddálení nejsou na stejném místě
      c.x += ux * rv * dt; c.y += uy * rv * dt;
      if (c.x > PR.x1 + 1500) c.x = PR.x0 - 1500; else if (c.x < PR.x0 - 1500) c.x = PR.x1 + 1500;
      if (c.y > PR.y1 + 900) c.y = PR.y0 - 900; else if (c.y < PR.y0 - 900) c.y = PR.y1 + 900;
    }
    if (fade <= 0) return;
    const n = Math.round((16 + sila * 14) * (v.eco ? 0.5 : 1)), dl = 1400 + sila * 900, A = 70 + sila * 50, K = 6.283 / (520 + sila * 200), SEG = 22;   // obrazové body mapy
    ctx.lineCap = 'round'; ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const c = PR.p[i];
      if (!v.vis(c.x, c.y, dl * v.sx)) continue;
      let px = null, py = null;
      for (let k = 0; k <= SEG; k++) {
        const q = k / SEG, s_ = (q - 0.5) * dl, vl = Math.sin(s_ * K - t * (1.2 + sila * 0.8) + c.f) * A * c.a * Math.sin(q * Math.PI);
        const [X, Y] = v.toScreen(c.x + ux * s_ - uy * vl, c.y + uy * s_ + ux * vl);
        if (px !== null) {
          const al = (0.3 + sila * 0.25) * fade * Math.sin(q * Math.PI);
          ctx.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(X, Y); ctx.stroke();
        }
        px = X; py = Y;
      }
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
