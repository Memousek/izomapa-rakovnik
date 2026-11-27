  // ---------- animovaná vrstva ----------
  const fx = $('fx'), ctx = fx.getContext('2d');
  viewer.canvas.insertBefore(fx, viewer.canvas.lastChild);           // mezi dlaždice a popisky: vozidla nepřekryjí názvy míst
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const DISTRICTS = (OV.districts || []).slice().sort((p, q) => (q.k === 'obec') - (p.k === 'obec') || q.a - p.a);   // obce před místními částmi
  const DISPLAY_FONT = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'monospace';
  const sid = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h) % 1000003; };
  const occluded = (ix, iy, d) => {
    for (const b of grid.get(Math.floor(ix / CELL) + ',' + Math.floor(iy / CELL)) || [])
      if (shown(b.k) && b.d < d - 3 && ix >= b.bb[0] && ix <= b.bb[2] && iy >= b.bb[1] && iy <= b.bb[3] && inPoly(ix, iy, b.hull)) return true;
    return false;
  };
  // značené trasy z OSM (nastroje/trasy.py -> trasy.json): pěší KČT barevně vedle sebe, cyklotrasy fialově přerušovaně, rozcestníky
  const TRASY = { on: {{TRASY}}, cesty: null, rozc: null };
  if (TRASY.on) {
    $('l-trasy-row').hidden = false;
    fetch('trasy.json').then((r) => r.json()).then((d) => { TRASY.data = d; }).catch(() => { TRASY.on = false; });
  }
  const TRASA_C = { red: '#d8352a', blue: '#2f6fd1', green: '#2a9a48', yellow: '#efbf1c' };
  function trasyPriprav() {                                  // jednou: body do obrázku mapy (výška terénu z gz)
    const w = (la, lo) => { const x = (lo - cam.lon0) * cam.kx, y = (la - cam.lat0) * cam.ky, h = gz(x, y), [ix, iy] = toImg(x, y, h); return [ix, iy, depth(x, y, h)]; };
    TRASY.cesty = TRASY.data.cesty.map((c) => {
      const pts = c.l.map(([la, lo]) => w(la, lo)), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { pts, p: c.p, c: c.c, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    });
    TRASY.rozc = TRASY.data.rozcestniky.map(([la, lo, n]) => [...w(la, lo), n]);
  }
  function kresliTrasy(sx, ox, oy, cw, ch) {
    if (!TRASY.data || !$('l-trasy').checked) return;
    if (!TRASY.cesty) trasyPriprav();
    const lw = Math.max(1.6, 6 * sx), sk = (ix, iy) => [ox + ix * sx, oy + iy * sx];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const c of TRASY.cesty) {
      if (ox + c.bb[2] * sx < -20 || oy + c.bb[3] * sx < -20 || ox + c.bb[0] * sx > cw + 20 || oy + c.bb[1] * sx > ch + 20) continue;
      const pruhy = [...c.p.map((b) => [TRASA_C[b], null]), ...(c.c.length ? [['#a347c9', [lw * 1.6, lw * 1.2]]] : [])];
      const vid = c.pts.map(([ix, iy, d]) => !occluded(ix, iy, d));       // za budovou se trasa přeruší
      pruhy.forEach(([col, dash], k) => {
        const o = (k - (pruhy.length - 1) / 2) * lw * 0.95;
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath();
        for (let i = 1; i < c.pts.length; i++) {
          if (!vid[i - 1] || !vid[i]) continue;
          const [x0, y0] = sk(c.pts[i - 1][0], c.pts[i - 1][1]), [x1, y1] = sk(c.pts[i][0], c.pts[i][1]), l = Math.hypot(x1 - x0, y1 - y0) || 1;
          const nx = -(y1 - y0) / l * o, ny = (x1 - x0) / l * o;
          ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x1 + nx, y1 + ny);
        }
        ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
      });
    }
    ctx.setLineDash([]);
    if (sx > 0.35) for (const [ix, iy, d, n] of TRASY.rozc) {     // rozcestník: sloupek se žlutou šipkou
      const [x, y] = sk(ix, iy); if (x < -20 || y < -40 || x > cw + 20 || y > ch + 20 || occluded(ix, iy, d)) continue;
      const h = 14 * sx, q = Math.max(2, 2.6 * sx);
      ctx.fillStyle = '#6b5a45'; ctx.fillRect(x - q * 0.25, y - h, q * 0.5, h);
      ctx.fillStyle = '#efbf1c'; ctx.fillRect(x - q * 0.2, y - h, q * 2.4, q); ctx.fillRect(x - q * 2.2, y - h + q * 1.3, q * 2.4, q);
      ctx.strokeStyle = '#2b2d31'; ctx.lineWidth = 1; ctx.strokeRect(x - q * 0.2, y - h, q * 2.4, q); ctx.strokeRect(x - q * 2.2, y - h + q * 1.3, q * 2.4, q);
      if (n && sx > 0.9) { ctx.font = `600 ${Math.round(10 + sx * 2)}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(20,24,32,.85)'; ctx.lineWidth = 3; ctx.strokeText(n, x + q * 3, y - h + q); ctx.fillText(n, x + q * 3, y - h + q); }
    }
    ctx.restore();
  }
  // silniční graf
  // ---------- uzavírky silnic (assets/upresneni.json -> overlay.json "uzavirky") ----------
  // Platná uzavírka: červený pás s bílými čárkami po ose úseku, na koncích zábrana Z2 se značkou B1 (v noci bliká).
  // Klik na úsek otevře kartu, v panelu je seznam i s chystanými. Auta do uzavřeného kusu silnice neodbočí.
  const dnesISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtD = (s) => { const [y, m, d] = String(s).split('-').map(Number); return `${d}. ${m}. ${y}`; };
  // Data: site/uzavirky.json (nastroje/uzavirky.py: ruční z upresneni.json + automaticky z webu města), načte se za běhu.
  let UZAV = [], UZ_AKT = [], UZ_SEG = [], KOL_SEG = [];
  // kolony a nehody z JSDI (functions/api/jsdi.js, u.druh): pás bez zábran, auta na úseku zpomalí podle druhu kolony
  const KOL_V = { stationaryTraffic: 0.06, queuingTraffic: 0.2, slowTraffic: 0.45, heavyTraffic: 0.7, unspecifiedAbnormalTraffic: 0.3 };
  const KOL_TXT = { stationaryTraffic: 'Stojící kolona', queuingTraffic: 'Kolona', slowTraffic: 'Pomalý provoz', heavyTraffic: 'Hustý provoz', unspecifiedAbnormalTraffic: 'Kolona' };
  const uzTitul = (u) => u.druh === 'kolona' ? KOL_TXT[u.typ] || 'Kolona' : u.druh === 'nehoda' ? 'Nehoda' : u.castecna ? 'Částečná uzavírka' : 'Uzavírka';
  const uzDo = (u) => { const d = new Date(u.konec); return `hlášeno teď, nejdéle do ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  // editor správce (index.html?admin, uzavirky_editor.js): edit = {klic, line} rozpracovaný úsek, klik = háček na klik do mapy
  const UZ_ED = { extra: null, edit: null, klik: null, zmena: null, upravit: null, obnov: null };
  function uzPriprav(u) {
    const w = u.line.map(([la, lo]) => [(lo - cam.lon0) * cam.kx, (la - cam.lat0) * cam.ky]);
    const pts = w.map(([x, y]) => { const h = gz(x, y), [ix, iy] = toImg(x, y, h); return [ix, iy, depth(x, y, h)]; });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), m = pts[Math.floor(pts.length / 2)], ml = u.line[Math.floor(u.line.length / 2)], mw = w[Math.floor(w.length / 2)];
    return { ...u, w, pts, k: `c${Math.round(mw[0] / (2 * cam.half))}_${Math.round(mw[1] / (2 * cam.half))}`, mid: { ix: m[0], iy: m[1], lat: ml[0], lon: ml[1] },
      bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], nyni: !u.od || u.od <= dnesISO() };
  }
  const uzPlati = (u) => (u.od && u.do ? `${fmtD(u.od)} – ${fmtD(u.do)}` : u.do ? `do ${fmtD(u.do)}` : u.od ? `od ${fmtD(u.od)}` : 'do odvolání');
  function showUz(u) {
    showCard({ title: u.druh && (!u.nazev || u.nazev === uzTitul(u) || u.nazev === 'Kolona') ? uzTitul(u) : uzTitul(u) + ': ' + (u.nazev || 'silnice'), text: u.popis, lon: u.mid.lon, lat: u.mid.lat, k: u.k,
      rows: [['Platí', u.druh ? uzDo(u) : (u.nyni ? '' : 'chystá se, ') + uzPlati(u)], ['Délka kolony', u.delka ? (u.delka >= 1000 ? `${(u.delka / 1000).toFixed(1).replace('.', ',')} km` : `${u.delka} m`) : null],
        ['Zdržení', u.zdrzeni ? `asi ${u.zdrzeni} min` : null], ['Objížďka', u.objizdka], ['Zdroj', u.zdroj],
        ['Úsek', u.uprava ? 'upravený správcem mapy' : u.auto === 'odhad' ? 'odhad (celá ulice), přesný rozsah je u zdroje' : u.puvod === 'jsdi' ? 'podle Jednotného systému dopravních informací' : u.puvod === 'kraj' ? (u.usek ? `rozsah podle zdroje ${u.usek}` : 'odhad: zdroj uvádí jen bod, úsek je kus silnice kolem něj') : u.puvod && u.puvod !== 'web' ? 'podle mapy zdroje' : u.auto ? 'dopočítaný automaticky z textu oznámení' : null]],
      link: /^https?:\/\//.test(u.url || '') ? u.url : null, linkText: 'Podrobnosti u zdroje ↗', target: '_blank' });
    if (UZ_ED.upravit && !u.druh) { const b = document.createElement('button'); b.type = 'button'; b.className = 'px-btn'; b.textContent = 'Upravit uzavírku'; b.addEventListener('click', () => UZ_ED.upravit(u)); $('cardLinks').prepend(b); }
  }
  // nejbližší platná uzavírka do tol px obrázku od bodu
  function uzAt(ix, iy, tol) {
    let best = null, bd = tol;
    for (const u of UZ_AKT) {
      if (ix < u.bb[0] - tol || ix > u.bb[2] + tol || iy < u.bb[1] - tol || iy > u.bb[3] + tol) continue;
      for (let i = 1; i < u.pts.length; i++) {
        const [ax, ay] = u.pts[i - 1], [bx, by] = u.pts[i], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((ix - ax) * ex + (iy - ay) * ey) / l2)), d = Math.hypot(ax + ex * t - ix, ay + ey * t - iy);
        if (d < bd) { bd = d; best = u; }
      }
    }
    return best;
  }
  function kresliZnackuB1(x, y, r, post) {                   // B1 zákaz vjezdu všech vozidel na sloupku
    if (post) { ctx.fillStyle = '#3a3d42'; ctx.fillRect(Math.round(x - Math.max(1, r * 0.12)), Math.round(y - post), Math.max(2, Math.round(r * 0.24)), Math.round(post)); }
    const cy = y - (post || 0);
    ctx.beginPath(); ctx.arc(x, cy, r, 0, 6.2832); ctx.fillStyle = '#d4202c'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy, r * 0.72, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20,24,32,.6)'; ctx.beginPath(); ctx.arc(x, cy, r + 0.5, 0, 6.2832); ctx.stroke();
  }
  function kresliVystrahu(x, y, r) {                        // výstražný trojúhelník (kolona, nehoda)
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.7); ctx.lineTo(x - r * 0.95, y + r * 0.7); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = Math.max(2, r * 0.28); ctx.strokeStyle = '#d4202c'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = '#14181f'; ctx.fillRect(Math.round(x - r * 0.08), Math.round(y - r * 0.35), Math.max(1, Math.round(r * 0.16)), Math.round(r * 0.55));
    ctx.fillRect(Math.round(x - r * 0.08), Math.round(y + r * 0.3), Math.max(1, Math.round(r * 0.16)), Math.max(1, Math.round(r * 0.16)));
  }
  function kresliUzavirky(sx, ox, oy, cw, ch, now) {
    const ed = UZ_ED.edit;
    if (!UZ_AKT.length && !(ed && ed.line)) return;
    const sk = (p) => [ox + p[0] * sx, oy + p[1] * sx], blik = state.night > 0.3 && Math.floor(now / 500) % 2;
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    if (ed && ed.line) {                                     // editor: rozpracovaný úsek modře přes všechno
      ctx.beginPath();
      ed.line.forEach(([la, lo], i) => { const x = (lo - cam.lon0) * cam.kx, y = (la - cam.lat0) * cam.ky, [ix, iy] = toImg(x, y, gz(x, y)), [px, py] = sk([ix, iy]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.strokeStyle = 'rgba(20,24,32,.6)'; ctx.lineWidth = Math.max(4, 11 * sx) + 2; ctx.stroke();
      ctx.strokeStyle = '#2f6fd1'; ctx.lineWidth = Math.max(4, 11 * sx); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(4, 11 * sx) * 0.4; ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const u of UZ_AKT) {
      if (!shown(u.k) && u.k) continue;
      if (ed && u.klic === ed.klic) continue;
      if (ox + u.bb[2] * sx < -40 || oy + u.bb[3] * sx < -40 || ox + u.bb[0] * sx > cw + 40 || oy + u.bb[1] * sx > ch + 40) continue;
      if (sx < 0.12) { const [x, y] = sk([u.mid.ix, u.mid.iy]); if (u.druh) kresliVystrahu(x, y, 7); else kresliZnackuB1(x, y, 6, 0); continue; }   // z dálky jen značka
      // za budovou se pás přeruší jen tam, kde opravdu je: viditelnost po ~1 m (5 px obrázku), ne po lomových bodech
      const lw = Math.max(3, 11 * sx), useky = [];
      if (!u.vz) { u.vz = []; for (let i = 1; i < u.pts.length; i++) { const a = u.pts[i - 1], b = u.pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5)); for (let k = i === 1 ? 0 : 1; k <= n; k++) { const t = k / n; u.vz.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); } } }
      let beh = null;
      for (const q of u.vz) { if (occluded(q[0], q[1], q[2])) { beh = null; continue; } if (!beh) useky.push(beh = []); beh.push(sk(q)); }
      const cesta = () => { ctx.beginPath(); for (const r of useky) if (r.length > 1) { ctx.moveTo(r[0][0], r[0][1]); for (let i = 1; i < r.length; i++) ctx.lineTo(r[i][0], r[i][1]); } };
      if (u.druh) {                                            // kolona: plný pás (tmavě červený stojí, oranžový pomalý), nehoda: výstraha uprostřed
        const kl = lw * 0.7, barva = u.druh === 'nehoda' ? '#f08a1c' : (KOL_V[u.typ] ?? 0.3) <= 0.2 ? '#9e1c1c' : '#e8890c';
        cesta(); ctx.strokeStyle = 'rgba(20,24,32,.5)'; ctx.lineWidth = kl + 2; ctx.setLineDash([]); ctx.stroke();
        cesta(); ctx.strokeStyle = barva; ctx.lineWidth = kl; ctx.stroke();
        if (u.druh === 'nehoda') { const [x, y] = sk([u.mid.ix, u.mid.iy]); kresliVystrahu(x, y - Math.max(6, 14 * sx), Math.max(7, 12 * sx)); }
        continue;
      }
      cesta(); ctx.strokeStyle = 'rgba(20,24,32,.55)'; ctx.lineWidth = lw + 2; ctx.setLineDash([]); ctx.stroke();
      cesta(); ctx.strokeStyle = u.castecna ? '#f08a1c' : '#d4202c'; ctx.lineWidth = lw; ctx.stroke();
      cesta(); ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 0.45; ctx.setLineDash([lw * 1.2, lw * 1.2]); ctx.stroke(); ctx.setLineDash([]);
      if (u.castecna) continue;                                // částečná: jen oranžový pás, projet se dá
      for (const [i, j] of [[0, 1], [u.pts.length - 1, u.pts.length - 2]]) {   // zábrana napříč silnicí na obou koncích
        const a = sk(u.pts[i]), b = sk(u.pts[j]), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
        const pul = Math.max(5, 17 * sx), tl = Math.max(3, 5 * sx);
        ctx.lineWidth = tl + 2; ctx.strokeStyle = 'rgba(20,24,32,.7)'; ctx.beginPath(); ctx.moveTo(a[0] - nx * pul, a[1] - ny * pul - tl); ctx.lineTo(a[0] + nx * pul, a[1] + ny * pul - tl); ctx.stroke();
        ctx.lineWidth = tl; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.strokeStyle = '#d4202c'; ctx.setLineDash([tl * 1.5, tl * 1.5]); ctx.stroke(); ctx.setLineDash([]);
        kresliZnackuB1(a[0], a[1] - tl, Math.max(5, 9 * sx), Math.max(7, 20 * sx));
        if (blik) for (const s of [-1, 1]) { ctx.fillStyle = 'rgba(255,162,31,.35)'; ctx.beginPath(); ctx.arc(a[0] + nx * pul * s, a[1] + ny * pul * s - tl * 1.8, Math.max(3, 5 * sx), 0, 6.2832); ctx.fill(); ctx.fillStyle = '#ffa21f'; ctx.fillRect(Math.round(a[0] + nx * pul * s - 1.5), Math.round(a[1] + ny * pul * s - tl * 1.8 - 1.5), 3, 3); }
      }
    }
    ctx.restore();
  }
  // je kus silnice (w: body ve světě) uzavřený? Počítá se délka podél čáry uzavírky do 6 m od ní (křížící ulice ne), jako ve 3D jízdě
  function uzKryje(w, SEG = UZ_SEG) {
    if (!SEG.length) return false;
    let kryto = 0, L = 0;
    for (let i = 1; i < w.length; i++) {
      const dx = w[i][0] - w[i - 1][0], dy = w[i][1] - w[i - 1][1], l = Math.hypot(dx, dy); if (l < 0.01) continue;
      L += l; const n = Math.max(1, Math.ceil(l / 4)), ux = dx / l, uy = dy / l;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, mx = w[i - 1][0] + dx * t, my = w[i - 1][1] + dy * t;
        for (const g of SEG) {
          if (Math.abs(ux * g.ux + uy * g.uy) < 0.8) continue;
          const q = Math.max(0, Math.min(g.L, (mx - g.ax) * g.ux + (my - g.ay) * g.uy));
          if (Math.hypot(g.ax + g.ux * q - mx, g.ay + g.uy * q - my) < 6) { kryto += l / n; break; }
        }
      }
    }
    return kryto >= 8 || (L > 0 && kryto >= 0.4 * L);
  }
  const kolNa = (w) => { for (const k of KOL_SEG) if (uzKryje(w, k.seg)) return k.f; return 0; };   // nejpomalejší kolona na kusu silnice
  function uzNastav(data, extra) {
    if (extra && (extra.zApi || !UZ_ED.extra)) UZ_ED.extra = extra;   // statický seznam nesmí přepsat úpravy ze serveru
    UZAV = (Array.isArray(data) ? data : []).filter((u) => u && u.line && u.line.length > 1 && (!u.do || u.do >= dnesISO()) && !(u.konec && Date.parse(u.konec) < Date.now())).map(uzPriprav)
      .sort((a, b) => (b.nyni - a.nyni) || String(a.do || '9').localeCompare(String(b.do || '9')));
    UZ_AKT = UZAV.filter((u) => u.nyni);
    const segy = (u) => u.w.slice(1).map((b, i) => { const a = u.w[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { ax: a[0], ay: a[1], ux: (b[0] - a[0]) / L, uy: (b[1] - a[1]) / L, L }; });
    UZ_SEG = UZ_AKT.filter((u) => !u.castecna && !u.druh).flatMap(segy);
    KOL_SEG = [...new Set(UZ_AKT.filter((u) => u.druh === 'kolona').map((u) => u.typ))].map((t) => ({ f: KOL_V[t] ?? 0.3, seg: UZ_AKT.filter((u) => u.druh === 'kolona' && u.typ === t).flatMap(segy) })).sort((a, b) => a.f - b.f);
    for (const r of roads) { r.uz = uzKryje(r.w); r.kol = kolNa(r.w); }   // už načtené silnice: auta do uzavírky neodbočí, v koloně zpomalí
    for (let i = index.length - 1; i >= 0; i--) if (index[i].kind === 'uzavírka') index.splice(i, 1);   // druhé volání (čerstvá data) nahradí první
    $('uzList').replaceChildren(); $('uzBox').hidden = true;
    const jednou = UZAV.filter((u, i) => UZAV.findIndex((q) => q.klic === u.klic) === i);   // uzavírka z víc úseků (JSDI) jednou v seznamu i hledání
    for (const u of jednou) index.push({ label: 'Uzavírka ' + (u.nazev || ''), kind: 'uzavírka', k: u.k, n: norm('uzavirka ' + (u.nazev || '') + ' ' + (u.popis || '')), go: () => { goTo(u.mid.ix, u.mid.iy, 1.2); showUz(u); } });
    if (!UZAV.length) return;                                  // seznam v panelu
    $('uzBox').hidden = false;
    const aktivni = new Set(UZ_AKT.map((u) => u.klic)).size;
    $('uzVal').textContent = aktivni ? String(aktivni) : 'chystané';
    $('uzBox').querySelector('summary').firstChild.textContent = UZAV.some((u) => u.druh) ? 'Uzavírky a kolony ' : 'Uzavírky silnic ';
    for (const u of jednou) {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      const ico = document.createElement('span'); ico.className = 'uz-ico' + (u.nyni ? '' : ' pristi') + (u.castecna ? ' castecna' : '') + (u.druh ? ' ' + u.druh : ''); ico.setAttribute('aria-hidden', 'true');
      const nm = document.createElement('span'); nm.textContent = u.nazev || u.popis || 'Uzavírka';
      const sm = document.createElement('small'); sm.textContent = u.druh ? uzTitul(u) + (u.delka ? `, ${u.delka >= 1000 ? (u.delka / 1000).toFixed(1).replace('.', ',') + ' km' : u.delka + ' m'}` : '') + (u.zdrzeni ? `, zdržení ${u.zdrzeni} min` : '') : (u.nyni ? '' : 'Chystá se, ') + (u.castecna ? 'částečná, ' : '') + uzPlati(u);
      b.append(ico, nm, sm);
      b.addEventListener('click', () => { goTo(u.mid.ix, u.mid.iy, 1.2); showUz(u); });
      li.appendChild(b); $('uzList').appendChild(li);
    }
    if (UZ_ED.zmena) UZ_ED.zmena();
  }

  const roads = [], ends = new Map(), cars = [];
  UZ_ED.obnov = () => import('./uzavirky.js').then((m) => m.nactiUzavirky('', uzNastav))   // hned statický seznam, pak čerstvý z api/uzavirky
    .catch(() => fetch('uzavirky.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((d) => uzNastav(d)));
  UZ_ED.obnov();
  // kolony a nehody z JSDI se mění během minut: čerstvá data z api/uzavirky každých 5 min (jen viditelná stránka, bez statického mezikroku)
  setInterval(() => { if (!document.hidden && !UZ_ED.edit) import('./uzavirky.js').then((m) => m.nactiUzavirky('', uzNastav, { jenApi: true })).catch(() => {}); }, 5 * 60e3);
  if (new URLSearchParams(location.search).has('admin'))   // správa uzavírek: index.html?admin
    import('./uzavirky_editor.js').then((m) => m.spust({ viewer, W, cam, toImg, imgToWorld, gz, UZ_ED, uzavirky: () => UZAV, goTo })).catch((e) => console.warn('editor uzavírek', e));
  // ---------- čerpací stanice a nabíječky (nastroje/pumpy.py -> site/pumpy.json, načte se za běhu) ----------
  // Ikona na sloupku nad místem, při přiblížení název a cena Naturalu 95 (jen když jsou ceny z ověřeného zdroje, assets/ceny_paliv.json).
  const PALIVO = { 95: 'Natural 95', 98: 'Natural 98', 100: 'Natural 100', nafta: 'Nafta', lpg: 'LPG', cng: 'CNG', lng: 'LNG', adblue: 'AdBlue', propan: 'Propan-butan' };
  const KONEKTOR = { type2: 'Type 2', type2_cable: 'Type 2 (kabel)', type2_combo: 'CCS', chademo: 'CHAdeMO', type1: 'Type 1', type1_combo: 'CCS1', tesla_supercharger: 'Tesla',
    tesla_standard: 'Tesla', gb_dc: 'GB/T', schuko: 'zásuvka 230 V', bosch_3pin: 'Bosch', bosch_5pin: 'Bosch', shimano_steps_5pin: 'Shimano', xlr_3pin_cable: 'XLR' };
  const PU_BARVA = { pumpa: '#1f6f8b', ev: '#2c9a4b', kolo: '#2f6fd0' };
  let PUMPY = [], PU_ZDROJ = {};
  const DNY_OH = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  // OSM opening_hours: jen běžné tvary (24/7, „Mo-Fr 07:00-19:00; Sa-Su,PH 08:00-14:00“, „05:00-22:00“); jiné -> null (neznámo)
  function ohOtevreno(s, d = new Date()) {
    if (!s) return null; s = s.trim();
    if (s === '24/7') return true;
    const den = d.getDay(), min = d.getHours() * 60 + d.getMinutes();
    let res = false;
    for (const cast of s.split(';')) {
      const m = cast.trim().match(/^(?:((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)\s+)?(off|closed|(?:\d\d:\d\d-\d\d:\d\d)(?:,\s*\d\d:\d\d-\d\d:\d\d)*)$/);
      if (!m) return null;
      if (m[1]) {
        const dny = new Set();
        for (const r of m[1].split(',')) {
          const [a, b] = r.split('-'); if (a === 'PH') continue;
          const ia = DNY_OH.indexOf(a), ib = b ? DNY_OH.indexOf(b) : ia; if (ia < 0 || ib < 0) return null;
          for (let i = ia, n = 0; n < 8; i = (i + 1) % 7, n++) { dny.add(i); if (i === ib) break; }
        }
        if (!dny.has(den)) continue;
      }
      if (/off|closed/.test(m[2])) { res = false; continue; }
      res = m[2].split(',').some((t) => {
        const [a, b] = t.trim().split('-').map((q) => { const [h, mm] = q.split(':').map(Number); return h * 60 + mm; });
        return b > a ? min >= a && min < b : min >= a || min < b;
      });
    }
    return res;
  }
  const MES_OH = { Jan: 'led', Feb: 'úno', Mar: 'bře', Apr: 'dub', May: 'kvě', Jun: 'čvn', Jul: 'čvc', Aug: 'srp', Sep: 'zář', Oct: 'říj', Nov: 'lis', Dec: 'pro' };
  const ohCz = (s) => s.trim() === '24/7' ? 'nonstop' : s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (m) => ({ Mo: 'po', Tu: 'út', We: 'st', Th: 'čt', Fr: 'pá', Sa: 'so', Su: 'ne', PH: 'svátky' })[m])
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MES_OH[m]).replace(/(\d\d:\d\d)-(\d\d:\d\d)/g, '$1–$2').replace(/;\s*/g, ', ');
  const kc = (v) => v.toFixed(2).replace('.', ',') + ' Kč';
  const puNazev = (p) => p.nazev || p.znacka || p.provozovatel || (p.druh === 'pumpa' ? 'Čerpací stanice' : p.druh === 'ev' ? 'Nabíječka elektromobilů' : 'Nabíječka elektrokol');
  const puStari = (p) => p.cas ? (Date.now() - new Date(p.cas).getTime()) / 3600000 : Infinity;     // hodin od zjištění ceny
  const puCena = (p) => (p.ceny && puStari(p) < 168 ? p.ceny['95'] ?? p.ceny.nafta ?? p.ceny.lpg ?? null : null);
  const puPred = (h) => h < 1 ? 'před chvílí' : h < 24 ? `před ${Math.round(h)} h` : `před ${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'dnem' : 'dny'}`;
  function puKonektory(p) {
    return (p.konektory || []).map(([s, n, v]) => `${n > 1 ? n + '× ' : ''}${KONEKTOR[s] || s}${v ? ' ' + v : ''}`).join(', ');
  }
  const puD = (s) => { const [y, m, d] = String(s).split('-').map(Number); return `${d}. ${m}. ${y}`; };
  const puPasmo = (q) => q.do_kw != null ? (q.od_kw ? `${q.od_kw + 1}–${q.do_kw} kW` : `do ${q.do_kw} kW`) : `nad ${q.od_kw} kW`;
  const puNabCena = (q) => `${kc(q.cena)}/kWh${q.noc != null ? ', v noci ' + kc(q.noc) : ''}${q.reg != null ? ` · s registrací ${kc(q.reg)}${q.reg_noc != null ? ', v noci ' + kc(q.reg_noc) : ''}` : ''}`;
  function puPopis(p) {                                       // krátký řádek do seznamu
    if (p.druh === 'pumpa') {
      const c = puCena(p);
      if (c !== null) return Object.entries(p.ceny).map(([k, v]) => `${k === 'nafta' ? 'N' : k.toUpperCase()} ${v.toFixed(2).replace('.', ',')}`).join(' · ');
      return (p.paliva || []).map((k) => PALIVO[k] || k).join(', ') || 'paliva neuvedena';
    }
    const od = p.nabijeni ? ` · od ${kc(Math.min(...p.nabijeni.pasma.map((q) => q.cena)))}/kWh` : '';
    return (puKonektory(p) || (p.druh === 'kolo' ? 'pro elektrokola' : 'nabíječka')) + od;
  }
  function showPumpa(p) {
    const rows = [], ot = ohOtevreno(p.oteviraci);
    let text = '', link = /^https?:\/\//i.test(p.web || '') ? p.web : null, linkText = 'Web provozovatele ↗';   // tag website z OSM může kdokoli upravit
    if (p.druh === 'pumpa') {
      if (p.ceny && puStari(p) < 168) {
        for (const [k, v] of Object.entries(p.ceny)) rows.push([PALIVO[k] || k, kc(v)]);
        const zd = PU_ZDROJ.zdroj || 'ceník';
        rows.push(['Aktualizace', `${puStari(p) > 48 ? 'starší údaj, ' : ''}${p.aktualizace ? p.aktualizace.toLowerCase() : puPred(puStari(p))}`]);
        if (p.ceny_url || PU_ZDROJ.zdroj_url) { link = p.ceny_url || PU_ZDROJ.zdroj_url; linkText = PU_ZDROJ.text || `Ceny: ${zd}`; }   // mBenzin: „Ceny: mbenzin.cz“ jako odkaz
      } else rows.push(['Paliva', (p.paliva || []).map((k) => PALIVO[k] || k).join(', ') || 'neuvedeno']);
      const sluzby = [p.obchod && 'obchod', p.myci && 'myčka', p.vzduch && 'vzduch'].filter(Boolean).join(', ');
      if (sluzby) rows.push(['Služby', sluzby]);
    } else {
      text = p.druh === 'kolo' ? 'Nabíjecí box pro elektrokola.' : '';
      rows.push(['Konektory', puKonektory(p) || 'neuvedeno']);
      if (p.stojanu) rows.push(['Míst k nabíjení', String(p.stojanu)]);
      if (p.placene !== undefined) rows.push(['Nabíjení', p.placene ? 'placené' : 'zdarma']);
      const nb = p.nabijeni;
      if (nb) {                                               // veřejný ceník provozovatele (assets/ceny_nabijeni.json)
        text = 'Cena za kWh bez registrace podle ceníku provozovatele, s registrací zdarma je levnější.';
        for (const q of nb.pasma) rows.push([`Cena ${puPasmo(q)}`, puNabCena(q)]);
        if (nb.noc && nb.pasma.some((q) => q.noc != null)) rows.push(['Noční cena', nb.noc]);
        if (nb.poplatek) rows.push(['Obsazení', nb.poplatek]);
        rows.push(['Ceník', `${nb.zdroj || nb.nazev}${nb.platnost ? ', platí od ' + puD(nb.platnost) : ''}${nb.overeno ? ', ověřeno ' + puD(nb.overeno) : ''}`]);
        if (nb.url) { link = nb.url; linkText = `Ceník ${nb.nazev || 'provozovatele'} ↗`; }
      }
    }
    if (p.oteviraci) rows.push(['Otevřeno', ohCz(p.oteviraci) + (ot === null ? '' : ot ? ' (teď otevřeno)' : ' (teď zavřeno)')]);
    if (p.zakaznici) rows.push(['Přístup', 'jen pro zákazníky']);
    if (p.provozovatel && p.provozovatel !== puNazev(p)) rows.push(['Provozovatel', p.provozovatel]);
    if (p.ulice) rows.push(['Adresa', p.ulice + (p.cp ? ' ' + p.cp : '')]);
    showCard({ title: puNazev(p), text, lon: p.lon, lat: p.lat, k: p.k, rows, link, linkText, target: '_blank' });
  }
  function puAt(ix, iy, tol) {
    if (!PUMPY.length || !$('l-pumpy').checked) return null;
    let best = null, bd = tol;
    for (const p of PUMPY) {
      if (!shown(p.k)) continue;
      const d = Math.min(Math.hypot(ix - p.ix, iy - p.iy), Math.hypot(ix - p.ix, iy - (p.iy - p.zv)));   // pata i ikona na sloupku
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function puIkona(x, y, r, druh) {                            // čtvereček s piktogramem: stojan (pumpa) nebo blesk (nabíječka)
    const q = Math.round(r);
    ctx.fillStyle = 'rgba(15,18,26,.75)'; ctx.fillRect(Math.round(x - q) - 1, Math.round(y - q) - 1, q * 2 + 2, q * 2 + 2);
    ctx.fillStyle = PU_BARVA[druh]; ctx.fillRect(Math.round(x - q), Math.round(y - q), q * 2, q * 2);
    ctx.fillStyle = '#fff';
    const u = Math.max(1, Math.round(q / 5)), X = Math.round(x - q), Y = Math.round(y - q);
    if (druh === 'pumpa') {
      ctx.fillRect(X + u * 2, Y + u * 2, u * 4, u * 7);              // tělo stojanu
      ctx.fillStyle = PU_BARVA.pumpa; ctx.fillRect(X + u * 3, Y + u * 3, u * 2, u * 2); ctx.fillStyle = '#fff';   // okénko
      ctx.fillRect(X + u * 6, Y + u * 4, u, u); ctx.fillRect(X + u * 7, Y + u * 4, u, u * 4); ctx.fillRect(X + u * 6, Y + u * 8, u * 2, u);   // hadice
    } else {
      ctx.beginPath(); ctx.moveTo(x + q * 0.15, y - q * 0.8); ctx.lineTo(x - q * 0.5, y + q * 0.1); ctx.lineTo(x - q * 0.02, y + q * 0.1);
      ctx.lineTo(x - q * 0.2, y + q * 0.8); ctx.lineTo(x + q * 0.5, y - q * 0.15); ctx.lineTo(x + q * 0.02, y - q * 0.15); ctx.closePath(); ctx.fill();
    }
  }
  function kresliPumpy(sx, ox, oy, cw, ch) {
    if (!PUMPY.length || !$('l-pumpy').checked || sx < 0.06) return;
    const popisky = $('l-labels').checked;
    ctx.save();
    for (const p of PUMPY) {
      if (!shown(p.k) || (p.druh === 'kolo' && sx < 0.3)) continue;
      const x = ox + p.ix * sx, y = oy + p.iy * sx;
      if (x < -60 || y < -60 || x > cw + 160 || y > ch + 60) continue;
      if (sx < 0.15) { ctx.fillStyle = 'rgba(15,18,26,.75)'; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); ctx.fillStyle = PU_BARVA[p.druh]; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4); continue; }
      const r = Math.min(11, Math.max(6, 9 * Math.sqrt(sx))) * (p.druh === 'kolo' ? 0.8 : 1), top = y - Math.max(10, p.zv * sx);
      ctx.fillStyle = 'rgba(15,18,26,.7)'; ctx.fillRect(Math.round(x) - 1, Math.round(top), 2, Math.round(y - top));   // sloupek
      puIkona(x, top - r, r, p.druh);
      const c = puCena(p);
      const txt = c !== null && sx > 0.22 ? `${p.ceny['95'] !== undefined ? '95' : p.ceny.nafta !== undefined ? 'N' : 'LPG'} ${c.toFixed(2).replace('.', ',')}` : popisky && sx > 0.55 ? puNazev(p) : '';
      if (!txt) continue;
      ctx.font = `600 ${Math.round(11 + Math.min(2, sx))}px system-ui, sans-serif`;
      const w = Math.ceil(ctx.measureText(txt).width) + 8, tx = Math.round(x + r + 3), ty = Math.round(top - r * 2);
      ctx.fillStyle = 'rgba(15,18,26,.82)'; ctx.fillRect(tx, ty, w, r * 2);
      if (p.nej) { ctx.fillStyle = '#35e06f'; ctx.fillRect(tx, ty, 3, r * 2); }
      ctx.fillStyle = c !== null && puStari(p) > 48 ? '#a9b3c4' : '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(txt, tx + 5, ty + r);
    }
    ctx.restore();
  }
  // ---------- pítka a veřejné WC (nastroje/sluzby.py -> site/sluzby.json, OSM) ----------
  let SLUZBY = [];
  fetch('sluzby.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((d) => {
    SLUZBY = (Array.isArray(d) ? d : []).map((p) => {
      const x = (p.lon - cam.lon0) * cam.kx, y = (p.lat - cam.lat0) * cam.ky, [ix, iy] = toImg(x, y, gz(x, y));
      return { ...p, ix, iy, k: `c${Math.round(x / (2 * cam.half))}_${Math.round(y / (2 * cam.half))}` };
    });
    if (SLUZBY.length) $('l-sluzby-row').hidden = false;
  });
  function slAt(ix, iy, tol) {
    if (!SLUZBY.length || !$('l-sluzby').checked) return null;
    let best = null, bd = tol;
    for (const p of SLUZBY) { if (!shown(p.k)) continue; const d = Math.hypot(ix - p.ix, iy - (p.iy - 30)); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function showSluzba(p) {
    showCard({ title: p.nazev || (p.druh === 'pitko' ? 'Pítko' : 'Veřejné WC'), text: p.druh === 'pitko' ? 'Pítko s pitnou vodou.' : '', lon: p.lon, lat: p.lat, k: p.k, rows: [
      ['Poplatek', p.poplatek === undefined ? null : p.poplatek ? 'placené' : 'zdarma'], ['Otevřeno', p.oteviraci ? ohCz(p.oteviraci) : null],
      ['Bezbariérové', p.bezbarier ? 'ano' : null], ['Přístup', p.zakaznici ? 'jen pro zákazníky' : null], ['Zdroj', 'OpenStreetMap']] });
  }
  function kresliSluzby(sx, ox, oy, cw, ch) {
    if (!SLUZBY.length || !$('l-sluzby').checked || sx < 0.25) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of SLUZBY) {
      if (!shown(p.k)) continue;
      const x = ox + p.ix * sx, y = oy + p.iy * sx; if (x < -30 || y < -40 || x > cw + 30 || y > ch + 30) continue;
      const q = Math.round(Math.min(9, Math.max(5, 7 * Math.sqrt(sx)))), X = Math.round(x - q), Y = Math.round(y - q * 2 - 4);
      ctx.fillStyle = 'rgba(15,18,26,.7)'; ctx.fillRect(Math.round(x) - 1, Y + q * 2, 2, 4);
      ctx.fillStyle = 'rgba(15,18,26,.75)'; ctx.fillRect(X - 1, Y - 1, q * 2 + 2, q * 2 + 2);
      ctx.fillStyle = p.druh === 'pitko' ? '#2f8cff' : '#6b5bd6'; ctx.fillRect(X, Y, q * 2, q * 2);
      ctx.fillStyle = '#fff';
      if (p.druh === 'wc') { ctx.font = `700 ${Math.max(7, Math.round(q * 0.95))}px system-ui, sans-serif`; ctx.fillText('WC', x, Y + q + 0.5); }
      else { ctx.beginPath(); ctx.moveTo(x, Y + q * 0.35); ctx.quadraticCurveTo(x + q * 0.75, Y + q * 1.1, x, Y + q * 1.65); ctx.quadraticCurveTo(x - q * 0.75, Y + q * 1.1, x, Y + q * 0.35); ctx.fill(); }   // kapka
    }
    ctx.restore();
  }
  function puNastav(data) {
    const st = (data && data.stanice) || [];
    PU_ZDROJ = (data && data.zdroj) || {};
    PUMPY = st.map((p) => {
      const x = (p.lon - cam.lon0) * cam.kx, y = (p.lat - cam.lat0) * cam.ky, h = gz(x, y), [ix, iy] = toImg(x, y, h), [, iy2] = toImg(x, y, h + 9);
      return { ...p, x, y, ix, iy, zv: iy - iy2, k: `c${Math.round(x / (2 * cam.half))}_${Math.round(y / (2 * cam.half))}` };
    }).filter((p) => cam.grounds.some((q) => Math.abs(p.x - q.cx) <= cam.half && Math.abs(p.y - q.cy) <= cam.half));
    if (!PUMPY.length) return;
    const sCenou = PUMPY.filter((p) => p.druh === 'pumpa' && puCena(p) !== null && p.ceny['95'] !== undefined);
    if (sCenou.length > 1) { const m = Math.min(...sCenou.map((p) => p.ceny['95'])); for (const p of sCenou) p.nej = p.ceny['95'] === m; }
    const poradi = { pumpa: 0, ev: 1, kolo: 2 };
    PUMPY.sort((a, b) => (poradi[a.druh] - poradi[b.druh]) || ((puCena(a) ?? 999) - (puCena(b) ?? 999)) || puNazev(a).localeCompare(puNazev(b), 'cs'));
    $('l-pumpy-row').hidden = false; $('puBox').hidden = false;
    const np = PUMPY.filter((p) => p.druh === 'pumpa').length, ne = PUMPY.length - np;
    $('puVal').textContent = `${np} + ${ne}`;
    for (const p of PUMPY) {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      if (p.nej) li.className = 'pu-nej';
      const ico = document.createElement('span'); ico.className = 'pu-ico ' + p.druh; ico.setAttribute('aria-hidden', 'true'); ico.textContent = p.druh === 'pumpa' ? 'P' : '⚡';
      const nm = document.createElement('span'); nm.textContent = puNazev(p);
      const sm = document.createElement('small'); sm.textContent = (p.nej ? 'Nejlevnější · ' : '') + puPopis(p);
      b.append(ico, nm, sm);
      b.addEventListener('click', () => { if (!$('l-pumpy').checked) $('l-pumpy').checked = true; goTo(p.ix, p.iy, 1.2); showPumpa(p); });
      li.appendChild(b); $('puList').appendChild(li);
      const druh = p.druh === 'pumpa' ? 'benzínka' : 'nabíječka';
      index.push({ label: puNazev(p), kind: druh, k: p.k, n: norm(`${puNazev(p)} ${p.znacka || ''} ${druh} ${p.druh === 'pumpa' ? 'pumpa cerpaci stanice benzin nafta' : 'nabijecka dobijeci stanice elektro'}`),
        go: () => { goTo(p.ix, p.iy, 1.2); showPumpa(p); } });
    }
    if (PU_ZDROJ.text && PUMPY.some((p) => puCena(p) !== null)) {   // podmínka zdroje: „Ceny: mbenzin.cz“ jako odkaz u seznamu i v patičce
      const li = document.createElement('li'), a = document.createElement('a'); li.className = 'pu-zdroj';
      a.href = PU_ZDROJ.zdroj_url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = PU_ZDROJ.text; li.append(a); $('puList').appendChild(li);
      $('puZdrojPata').hidden = false;
    }
  }
  // stanice z pumpy.json, ceny z mBenzin.cz přes functions/api/ceny.js (bez funkce, třeba v lokálním náhledu, zůstanou bez cen)
  fetch('pumpy.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then(async (data) => {
    if (!data) return;
    try {
      const m = await import('./ceny_paliv.js'), ceny = await m.nactiCeny(data.stanice || []);
      if (ceny.size) {
        for (const p of data.stanice) { const c = ceny.get(p.id); if (c) Object.assign(p, { ceny: c.ceny, cas: c.cas, ceny_url: c.url, aktualizace: c.aktualizace }); }
        data.zdroj = { zdroj: 'mbenzin.cz', zdroj_url: m.ZDROJ_URL, text: m.ZDROJ_TEXT };
      }
    } catch { /* bez cen */ }
    puNastav(data);
  });
  // vjezd na kruhový objezd: auto dá přednost autům na okruhu (25 m před vjezdem nebo právě v něm)
  function yieldZ(r, y) {
    const e = y[0] < 1 ? r.w[0] : r.w[r.w.length - 1], z = [y[0]];
    z.t = y[0] < 1 ? -1 : 1;                // jen pro směr k okruhu: auto vyjíždějící z okruhu by jinak čekalo samo na sebe a zablokovalo okruh
    z.rb = { k: y[1].toFixed(0) + ',' + y[2].toFixed(0), cx: y[1], cy: y[2], R: y[3], an: Math.atan2(e[1] - y[2], e[0] - y[1]) };
    return z;
  }
  function ringFree(g) {
    for (const c of cars) {
      if (!carActive(c) || roads[c.r].rbk !== g.k) continue;
      const o = along(roads[c.r], c.s), rx = o.x - g.cx, ry = o.y - g.cy, turn = Math.sign((rx * o.dy - ry * o.dx) * c.dir) || 1;   // směr jízdy po okruhu
      let d = ((g.an - Math.atan2(ry, rx)) * turn) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI;
      if (d * g.R < 25 || (2 * Math.PI - d) * g.R < 5) return false;
    }
    return true;
  }
  const blocked = (z) => z.rb ? !ringFree(z.rb) : (z.g || z.xc).closed;    // vjezd na kruhový objezd, zavřený přejezd (skupina z.g) nebo semafor (fáze z.xc)
  // železniční přejezdy (z[0] metry od začátku kusu, z[1..2] svět): zavřeno ~25 s před příjezdem vlaku, dokud neprojede poslední vůz
  // Přejezdy přes sousední koleje (do XG_M od sebe) tvoří jeden přejezd: jedny výstražníky před první a za poslední kolejí,
  // zavřeno, když jede vlak po kterékoli koleji (v OSM je přejezd zvlášť na každé koleji).
  const XC = new Map(), xings = [], XG = [], XG_M = 15;
  function addXing(r, z) {
    const key = Math.round(z[1]) + ',' + Math.round(z[2]);
    if (!XC.has(key)) XC.set(key, { x: z[1], y: z[2], closed: false, on: null });
    z.xc = XC.get(key);
    let g = XG.find((q) => q.pts.some(([x, y]) => Math.hypot(x - z[1], y - z[2]) < XG_M));
    if (!g) XG.push(g = { pts: [], cs: new Set(), closed: false });
    g.pts.push([z[1], z[2]]); g.cs.add(z.xc); z.g = g;
    const lead = xings.find(([r2, z2]) => r2 === r && z2.g === g);       // na jednom kusu silnice jedny výstražníky pro celou skupinu
    if (lead) { lead[1].s0 = Math.min(lead[1].s0, z[0]); lead[1].s1 = Math.max(lead[1].s1, z[0]); }
    else { z.s0 = z.s1 = z[0]; xings.push([r, z]); }
  }
  function xingShapes(c) {                                 // na kterých tratích (tvar, metry od začátku) přejezd leží
    c.on = [];
    MHD.shapes.forEach((sh, i) => {
      let best = 4, bs = 0;
      for (let k = 1; k < sh.w.length; k++) {
        const a = sh.w[k - 1], b = sh.w[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((c.x - a[0]) * dx + (c.y - a[1]) * dy) / l2)), d = Math.hypot(a[0] + dx * t - c.x, a[1] + dy * t - c.y);
        if (d < best) { best = d; bs = sh.len[k - 1] + (sh.len[k] - sh.len[k - 1]) * t; }
      }
      if (best < 4) c.on.push([i, bs]);
    });
  }
  const trainS = (trip, el) => {                           // metry po trati jako v mhdPos (střed vlaku)
    const q = trip[4]; let i = 2; while (i < q.length - 2 && q[i] < el) i += 2;
    const f = Math.max(0, Math.min(1, (el - q[i - 2]) / ((q[i] - q[i - 2]) || 1)));
    return q[i - 1] + (q[i + 1] - q[i - 1]) * f;
  };
  const busWait = new Map();                               // zpoždění autobusů a tramvají (s) čekajících na přejezdu
  function busDelay(i, trip, el, dt) {                     // před zavřeným přejezdem stát, po otevření zpoždění dohnat (o polovinu rychleji)
    let d = busWait.get(i) || 0, wait = false;
    if (!XC.size && !d) return 0;
    const s = trainS(trip, el - d);
    for (const c of XC.values()) if (c.closed && c.on) for (const [sh, sc] of c.on) if (sh === trip[1] && s > sc - 10 && s < sc - 2) wait = true;
    d = wait ? d + dt : Math.max(0, d - dt * 0.5);
    if (d) busWait.set(i, d); else busWait.delete(i);
    return d;
  }
  function updateXings() {
    if (!XC.size) return;
    const trains = MHD.on ? MHD.act.filter(([i]) => MHD.routes[MHD.trips[i][0]][1] === 2) : [];
    for (const c of XC.values()) {
      if (!trains.length) { c.closed = false; continue; }
      if (!c.on) xingShapes(c);
      c.closed = trains.some(([i, el]) => {
        const trip = MHD.trips[i], T = TRAINS[trainOf(MHD.routes[trip[0]][0])].cars.reduce((a, q) => a + q.len + 0.4, 0);
        return c.on.some(([sh, s]) => sh === trip[1] && trainS(trip, el + 25) + T / 2 > s - 5 && trainS(trip, el) - T / 2 < s + 8);
      });
    }
    for (const g of XG) g.closed = [...g.cs].some((c) => c.closed);
  }
  // semafory (OV.signals z nastroje/semafory.py, [x, y, křižovatka]): každá křižovatka má cyklus SIG_CYC s pro dvě osy
  // (osa 0 = směr nejvyšší třídy silnice, kolmé příjezdy osa 1); samotný přechod má jen osu 0 a zbytek cyklu patří chodcům.
  // Na kusu silnice r.sg: z = [metry od začátku, x, y], z.t směr jízdy ke křižovatce (0 = oba), z.d stop čára tolik m před bodem.
  const SIG_CYC = 64, SIG = new Map(), sigPosts = [];
  const SIG_RANK = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 1 };
  for (const [x, y, j] of OV.signals || []) {
    if (!SIG.has(j)) SIG.set(j, { pts: [], app: [], off: rnd(j + 900) * SIG_CYC, st: [{ closed: false, c: 'g' }, { closed: true, c: 'r' }] });
    SIG.get(j).pts.push([x, y]);
  }
  for (const J of SIG.values()) { J.cx = J.pts.reduce((a, p) => a + p[0], 0) / J.pts.length; J.cy = J.pts.reduce((a, p) => a + p[1], 0) / J.pts.length; }
  function projS(r, x, y) {                                // nejbližší bod kusu silnice: [vzdálenost, metry od začátku]
    let best = 1e9, bs = 0;
    for (let k = 1; k < r.w.length; k++) {
      const a = r.w[k - 1], b = r.w[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
      if (d < best) { best = d; bs = r.len[k - 1] + (r.len[k] - r.len[k - 1]) * t; }
    }
    return [best, bs];
  }
  function addSignals(r) {
    if (!SIG.size || r.c === 'service' || r.c === 'living_street') return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of r.w) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    for (const J of SIG.values()) {
      if (J.cx < x0 - 60 || J.cx > x1 + 60 || J.cy < y0 - 60 || J.cy > y1 + 60) continue;
      for (const [px, py] of J.pts) {
        const [d, s] = projS(r, px, py);
        if (d > 8) continue;
        const end = s < 1 ? -1 : s > r.L - 1 ? 1 : 0;        // semafor v uzlu na konci kusu: křižovatka je tam
        if (end && r.L < 20) continue;                      // krátký kus uvnitř křižovatky: tam se nestojí
        let t = end;
        if (!end) { const sc = projS(r, J.cx, J.cy)[1]; t = Math.abs(sc - s) < 3 ? 0 : Math.sign(sc - s); }
        if (r.o) { if (t && t !== r.o) continue; t = r.o; }   // jednosměrka: jen směr, kterým se jezdí
        if ((r.sg || []).some((q) => q.J === J && (q.t === t || !q.t || !t))) continue;   // víc bodů jedné křižovatky na tomtéž kusu
        const o = along(r, Math.max(0.5, Math.min(r.L - 0.5, s)));
        const z = [s, px, py]; Object.assign(z, { t, d: end ? 9 : 3, J, ang: Math.atan2(o.dy, o.dx), rank: SIG_RANK[r.c] || 0 });
        (r.sg = r.sg || []).push(z); J.app.push(z); sigPosts.push([r, z]);
        const ref = J.app.reduce((a, q) => (q.rank > a.rank ? q : a));
        for (const q of J.app) { let da = Math.abs(q.ang - ref.ang) % Math.PI; if (da > Math.PI / 2) da = Math.PI - da; q.xc = J.st[da > Math.PI / 4 ? 1 : 0]; }
      }
    }
  }
  function updateSignals() {                               // fáze podle hodin: všichni návštěvníci vidí stejnou barvu
    const t = Date.now() / 1000;
    for (const J of SIG.values()) {
      const p = (t + J.off) % SIG_CYC;
      J.st[0].c = p < 26 ? 'g' : p < 29 ? 'y' : 'r';
      J.st[1].c = p >= 32 && p < 58 ? 'g' : p >= 58 && p < 61 ? 'y' : 'r';
      for (const q of J.st) q.closed = q.c !== 'g';
    }
  }
  const SIG_LAMP = { r: [0, '#ff3b30', '255,59,48'], y: [1, '#ffc21a', '255,194,26'], g: [2, '#38e06a', '56,224,106'] };
  function drawSigPost(o, z, sx, ox, oy, night) {          // semafor: sloup a hlava se třemi světly, v noci svítící světlo září
    const x = ox + o.ix * sx, y = oy + o.iy * sx, h = 24 * sx, q = Math.max(1.6, 2.4 * sx);
    ctx.fillStyle = '#2a2c30'; ctx.fillRect(x - q * 0.3, y - h, q * 0.6, h);
    const hx = x - q * 0.9, hy = y - h - q * 4.2, [on, col, rgb] = SIG_LAMP[z.xc.c];
    ctx.fillStyle = '#17181b'; ctx.fillRect(hx, hy, q * 1.8, q * 4.4);
    for (let k = 0; k < 3; k++) { ctx.fillStyle = k === on ? col : '#3a3b40'; ctx.fillRect(hx + q * 0.4, hy + q * (0.35 + k * 1.35), q, q); }
    if (night > 0.3) {
      const lx = hx + q * 0.9, ly = hy + q * (0.85 + on * 1.35), g = ctx.createRadialGradient(lx, ly, 0, lx, ly, q * 3.5);
      g.addColorStop(0, `rgba(${rgb},${0.55 * Math.min(1, (night - 0.3) / 0.4)})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(lx - q * 3.5, ly - q * 3.5, q * 7, q * 7);
    }
  }
  const ek = (p) => Math.round(p[0]) + ',' + Math.round(p[1]);
  const TRUCKC = ['#c42a20|#ecebe6|box', '#eceeed|#d6a13a|tarp', '#eceeed|#3f5f8a|tarp', '#2f4f86|#e4e4de|box', '#eceeed|#9aa0a7|box'];
  const CARC = ['#ecebe6', '#b3b8bf', '#2a2c31', '#b8291f', '#33529e', '#62666d', '#3d6b4c', '#cdbd99'];
  const VANC = ['#ecebe6', '#ecebe6', '#ecebe6', '#ecebe6', '#b3b8bf', '#2f3f6e', '#c23b2a', '#e8c547'];   // dodávky: hlavně bílé
  const CABC = ['#ecebe6', '#ecebe6', '#c23b2a', '#2f5fa8', '#e3a52b', '#3c6e47', '#1d1f24', '#b3b8bf'];   // kabiny tahačů
  const BOXC = ['#e9e8e2', '#e9e8e2', '#e9e8e2', '#c9ccd0', '#2f4f8a', '#a33a2c', '#4f6b4a', '#d9d2bf'];   // návěsy
  // druhy vozidel: len/wid rozměr v m, code obrázek ve vehicleSprite (3 nákladní auto, 5 dodávka, 7 tahač, 9 popelářské auto, 10 traktor),
  // vmax km/h, gap místo ve frontě před přejezdem (m). Kamion = tahač + návěs (TRAILER m) za ním po silnici.
  const VTYP = {
    car: { len: 4.2, wid: 1.76, code: false, gap: 8 }, van: { len: 5.4, wid: 2.0, code: 5, vmax: 110, gap: 9 },
    truck: { len: 9, wid: 2.45, code: 3, vmax: 80, gap: 13 }, semi: { len: 6.1, wid: 2.5, code: 7, vmax: 80, gap: 25 },
    garbage: { len: 9.2, wid: 2.5, code: 9, vmax: 35, gap: 13 }, tractor: { len: 4.3, wid: 2.3, code: 10, vmax: 30, gap: 8 },
    police: { len: 4.7, wid: 1.82, code: 15, gap: 8 },                                     // hlídka při honičce (78-honicka.js)
    hasici: { len: 8.6, wid: 2.5, code: 16, gap: 13 },                                     // cisterna k zásahu (79-hasici.js)
  };
  const TRAILER = 13.6, TAH = 3.05 - 1.0 + 6.8;                 // střed návěsu za středem tahače (točnice 1 m před zadkem tahače)
  const MINOR = new Set(['residential', 'living_street', 'unclassified', 'tertiary']);   // popeláři a traktory jezdí po vedlejších silnicích
  // silnice čtverce: napojit na graf (konce se potkají i přes šev) a přidat auta
  onChunk.push((k, d) => {
    const i0 = roads.length;
    for (const r of d.roads) {
      const len = [0]; for (let i = 1; i < r.w.length; i++) len.push(len[i - 1] + Math.hypot(r.w[i][0] - r.w[i - 1][0], r.w[i][1] - r.w[i - 1][1]));
      if (len[len.length - 1] > 1) { roads.push({ ...r, sg: undefined, k, len, L: len[len.length - 1] }); const rr = roads[roads.length - 1]; if (uzKryje(r.w)) rr.uz = true; rr.kol = kolNa(r.w); for (const z of r.j || []) addXing(rr, z); rr.jy = [...(r.j || []), ...(r.y || []).map((y) => yieldZ(rr, y))]; if (r.rb) rr.rbk = r.rb[0].toFixed(0) + ',' + r.rb[1].toFixed(0); addSignals(rr); }   // i krátké kousky (kruhový objezd u vjezdů), jinak v okruhu zůstanou mezery a auta tam stojí
    }
    for (let i = i0; i < roads.length; i++) { const r = roads[i]; for (const [end, dir] of [[r.w[0], 1], [r.w[r.w.length - 1], -1]]) { const q = ek(end); if (!ends.has(q)) ends.set(q, []); ends.get(q).push([i, dir]); } }
    // konce, které se v datech minou o pár metrů (rozdělená vozovka, mostovka), propojit, ať auto nemusí otáčet ani mizet
    for (let i = i0; i < roads.length; i++) for (const end of [roads[i].w[0], roads[i].w[roads[i].w.length - 1]]) {
      const q = ek(end); if (ends.get(q).length > 1) continue;
      let best = null, bd = 36; const X = Math.round(end[0]), Y = Math.round(end[1]);
      for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
        const d = dx * dx + dy * dy, l2 = (dx || dy) && d < bd && ends.get((X + dx) + ',' + (Y + dy));
        if (l2) { bd = d; best = l2; }
      }
      if (best) { const mine = ends.get(q).slice(); ends.get(q).push(...best.filter((e) => e[0] !== i)); best.push(...mine); }
    }
    const main = []; for (let i = i0; i < roads.length; i++) if (roads[i].c !== 'service') main.push(i);
    // s daty sčítání (r.v = vozidla za 24 h) je na silnici tolik aut, kolik odpovídá intenzitě a délce:
    // ve špičce projede za hodinu asi 10 % denní intenzity, při 45 km/h je to v / 450 aut na kilometr (odhad)
    const weights = main.map((i) => (roads[i].v || 0) * roads[i].L), wsum = weights.reduce((a, b) => a + b, 0);
    const n0 = cars.length, n = wsum ? Math.min(300, Math.round(wsum / 450 / 1000 * CAR_DENS)) : Math.min(110, Math.round(main.length / 6));
    const pickMain = (u) => { if (!wsum) return main[Math.floor(u * main.length)]; let x = u * wsum; for (let k = 0; k < main.length; k++) { x -= weights[k]; if (x <= 0) return main[k]; } return main[main.length - 1]; };
    for (let j = 0; j < n && main.length; j++) {
      const i = n0 + j, r_ = pickMain(rnd(i)), c = { r: r_, dir: roads[r_].o || (rnd(i + 9) > 0.5 ? 1 : -1), s: rnd(i + 3) * roads[r_].L,   // po celé délce, jinak se na dlouhé silnici auta nalepí do hloučku
        f: povaha(rnd(i + 5)), q: rnd(i + 7), col: CARC[i % CARC.length], truck: rnd(i + 11) * 100 < (roads[r_].t || 0) };
      if (c.truck) c.col = TRUCKC[i % TRUCKC.length];
      const u_ = rnd(i + 13), rc = roads[r_].c;
      c.t = c.truck ? (u_ < 0.55 && !MINOR.has(rc) ? 'semi' : 'truck') : u_ < 0.1 ? 'van' : u_ < 0.11 ? 'garbage' : u_ < 0.116 ? 'tractor' : 'car';
      if (c.t === 'van') c.col = VANC[i % VANC.length];
      else if (c.t === 'semi') { c.col = CABC[i % CABC.length]; c.col2 = BOXC[(i >> 3) % BOXC.length]; }
      else if (c.t === 'garbage') c.col = '#ecebe6|#e8742a';
      else if (c.t === 'tractor') c.col = rnd(i + 17) < 0.7 ? '#3f7a2e' : '#b52a1e';
      c.T = VTYP[c.t]; c.pr = -1;
      if (c.dir < 0) c.s = roads[c.r].L - c.s;
      cars.push(c);
    }
  });
  function along(r, s) {
    const L = r.len; let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const t = Math.max(0, Math.min(1, (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1)));
    const a = r.w[i - 1], b = r.w[i], pa = r.p[i - 1], pb = r.p[i];
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ix: pa[0] + (pb[0] - pa[0]) * t, iy: pa[1] + (pb[1] - pa[1]) * t, d: pa[2] + (pb[2] - pa[2]) * t, dx: b[0] - a[0], dy: b[1] - a[1], z: a.length > 2 ? a[2] + (b[2] - a[2]) * t : undefined };
  }
  function pickExit(all, c) {
    if (c.hzs?.cesta) { const n = c.hzs.cesta[0]; const m = n && all.find(([i, dir]) => i === n[0] && dir === n[1]); if (m) return m; }   // cisterna jede po naplánované trase (79-hasici.js)
    const big = c.truck ? all.filter(([i]) => roads[i].t) : c.t === 'garbage' || c.t === 'tractor' ? all.filter(([i]) => MINOR.has(roads[i].c)) : all, opts = big.length ? big : all;   // nákladní auta drží sčítané silnice, popeláři a traktory vedlejší
    const sum = opts.reduce((a, [i]) => a + (roads[i].v || 0), 0);
    if (!sum) return opts[Math.floor(Math.random() * opts.length)];
    let x = Math.random() * sum;
    for (const o of opts) { x -= roads[o[0]].v || 0; if (x <= 0) return o; }
    return opts[opts.length - 1];
  }
  // podíl aut podle denní doby: odhad tvaru dne, ne měření ze sčítání. Ranní špička 6–8 h, odpolední 14–16 h (konec ranní
  // směny ve fabrikách), přes poledne asi polovina, v noci málo; o víkendu bez špiček. Hodina je ta z hodin na mapě
  // (state.hod, 62-rakovnik-hud.js: Právě teď skutečná, Vlastní podle posuvníku, Samo herní), jinak podle tmy.
  const DAY_SHARE = [.06, .04, .03, .03, .07, .22, .62, .95, .8, .55, .5, .52, .55, .56, .78, 1, .96, .78, .58, .42, .3, .22, .15, .1];
  const VIKEND = [.08, .06, .04, .04, .05, .1, .18, .28, .4, .5, .55, .58, .55, .5, .48, .5, .52, .5, .45, .38, .3, .22, .16, .11];
  const trafficShare = () => {
    if (!roads.some((r) => r.v)) return 1;
    const h = state.hod;
    if (h === undefined || !isFinite(h)) return 1 - 0.85 * state.night;
    const P = state.vikend ? VIKEND : DAY_SHARE, i = Math.floor(h) % 24, f = h - Math.floor(h);
    return P[i] + (P[(i + 1) % 24] - P[i]) * f;              // plynule mezi hodinami
  };
  // pevná hustota na silnici (ne strop na celou mapu: ten se dělil podle počtu načtených čtverců a auta chodila ve vlnách);
  // strop aut na celou mapu; rozděluje se rovnoměrně přes c.q, takže platí pro všechny čtverce stejně
  const CAR_DENS = 0.65, SLOW_SHARE = 0.35;   // CAR_DENS: zlomek špičkové hustoty ve špičce (kolony za vozem tvoří followCars); mimo špičku ubere trafficShare
  const MAX_CARS = 1000, MAX_CARS_SLOW = 300;
  // Zvolená auta jsou stabilní podle q. Při dosažení stropu vybereme přesný počet,
  // místo náhodného prahu, který může limit překročit.
  function limitCars(all, share, slow) {
    const threshold = share * (slow ? SLOW_SHARE : 1), cap = Math.floor(share * (slow ? MAX_CARS_SLOW : MAX_CARS));
    const eligible = all.filter((c) => c.q <= threshold);
    const allowed = eligible.length > cap ? new Set(eligible.sort((a, b) => a.q - b.q).slice(0, cap)) : null;
    return { threshold, allowed };
  }
  let tShare = 1, tShareT = 0, tShareCount = -1, tShareSlow = null, tAllowed = null;
  const carActive = (c) => c.q <= tShare && (!tAllowed || tAllowed.has(c)) && (c.t !== 'garbage' || state.night < 0.5);   // popeláři jen ve dne
  // rychlost podle limitu z dat, jinak odhad podle třídy silnice; c.f je povaha řidiče
  // povaha řidiče z rovnoměrného u: asi 8 % šneků (60–80 % limitu), většina kolem limitu (90–112 %),
  // asi 12 % spěchá (120–145 %, v padesátce 60–72 km/h)
  function povaha(u) {
    if (u < 0.08) return 0.6 + u / 0.08 * 0.2;
    if (u < 0.88) return 0.9 + (u - 0.08) / 0.8 * 0.22;
    return 1.2 + (u - 0.88) / 0.12 * 0.25;
  }
  const CLASS_KMH = { motorway: 110, trunk: 90, primary: 50, secondary: 50, tertiary: 50, unclassified: 40, residential: 30, living_street: 20 };
  const roadSpeed = (r) => (r.x ? Math.min(r.l || 50, 50) : r.l || CLASS_KMH[r.c] || 40) / 3.6;   // r.x = nájezdová rampa
  const carSpeed = (c, r) => Math.min((c.truck ? Math.min(roadSpeed(r), 22) * 0.85 : roadSpeed(r)) * c.f, (c.T.vmax || 999) / 3.6) * (r.kol || 1);   // r.kol: kolona z JSDI   // nákladní auta o něco pomaleji, popeláři a traktory pomalu (strop vmax i pro spěchající)
  function drawXPost(o, z, sx, ox, oy, now, night) {      // výstražník s křížem; v noci světlo září
    const x = ox + o.ix * sx, y = oy + o.iy * sx, h = 30 * sx, q = Math.max(2.5, 3.4 * sx), ph = Math.floor(now / 500) % 2;
    ctx.fillStyle = '#26262a'; ctx.fillRect(x - q * 0.35, y - h - q * 2.6, q * 0.7, h + q * 2.6);
    ctx.strokeStyle = '#d23a2e'; ctx.lineWidth = q * 0.9; ctx.beginPath();
    ctx.moveTo(x - q * 1.8, y - h - q * 3.6); ctx.lineTo(x + q * 1.8, y - h - q * 1.2); ctx.moveTo(x + q * 1.8, y - h - q * 3.6); ctx.lineTo(x - q * 1.8, y - h - q * 1.2); ctx.stroke();
    ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = q * 0.45; ctx.stroke();
    ctx.fillStyle = '#26262a'; ctx.fillRect(x - q * 2, y - h - q * 0.2, q * 4, q * 1.6);
    const lamp = z.g.closed ? [x + (ph ? 1.05 : -1.05) * q, '#ff4438', '255,68,56'] : Math.floor(now / 900) % 2 ? [x, '#f4f4f0', '244,244,240'] : null;
    if (!lamp) return;
    if (night > 0.3) {
      const g = ctx.createRadialGradient(lamp[0], y - h + q * 0.6, 0, lamp[0], y - h + q * 0.6, q * 3.5);
      g.addColorStop(0, `rgba(${lamp[2]},${0.55 * Math.min(1, (night - 0.3) / 0.4)})`); g.addColorStop(1, `rgba(${lamp[2]},0)`);
      ctx.fillStyle = g; ctx.fillRect(lamp[0] - q * 3.5, y - h + q * 0.6 - q * 3.5, q * 7, q * 7);
    }
    ctx.fillStyle = lamp[1]; ctx.fillRect(lamp[0] - q * 0.6, y - h + q * 0.05, q * 1.2, q * 1.1);
  }
  const curbPt = (o, side, off) => {                       // bod u pravého okraje vozovky pro auta jedoucí po kusu (side 1) nebo proti (-1)
    const L = Math.hypot(o.dx, o.dy) || 1, x = o.x + o.dy / L * side * off, y = o.y - o.dx / L * side * off, h = o.z ?? gz(x, y), [ix, iy] = toImg(x, y, h);
    return { x, y, ix, iy, d: depth(x, y, h) };
  };
  // fronta před semaforem nebo přejezdem sahá za začátek dalšího kusu silnice: auto zastaví ve frontě ještě na svém kusu
  // (jinak by všechna stála na sobě na začátku dalšího kusu) a po rozjezdu pokračuje na kus, který si vybralo (c.nx)
  function queueBack(c, r, i, dir) {
    const q = roads[i], s0 = dir > 0 ? 0 : q.L, qi = dir > 0 ? 0 : 1;
    for (const zs of [q.jy, q.sg]) if (zs) for (const z of zs) {
      if (!blocked(z) || (z.t && z.t !== dir)) continue;
      const over = dir * (s0 - (z[0] - dir * ((z.d ?? 6) + ((z.q && z.q[qi]) || 0))));
      if (over <= 0) continue;
      c.s = Math.max(0, Math.min(r.L, (c.dir > 0 ? r.L : 0) - c.dir * over)); c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; c.nx = [i, dir];
      return true;
    }
    return false;
  }
  // kam auto smí z konce kusu silnice pokračovat (ne na účelové komunikace, do uzavírky ani proti jednosměrce)
  const exitOpts = (c, endPt) => (ends.get(ek(endPt)) || []).filter(([i, dir]) => i !== c.r && roads[i].c !== 'service' && !roads[i].uz && (!roads[i].o || roads[i].o === dir));
  // řazení za sebou: auto drží odstup za vozem před sebou ve stejném pruhu (i na navazujícím kusu silnice), takže se samy tvoří kolony
  // za pomalým vozem; na dvoupruhové jednosměrce (dálnice, rychlostní silnice bez ramp) osobní auta předjíždějí levým pruhem
  const ACC = 2.2, DEC = 6, HEAD = 1.2, MIN_GAP = 2.5, LC_V = 1.5;   // zrychlení a brzdění m/s², časový odstup s, mezera v klidu m, příčná rychlost při změně pruhu m/s
  const lanes2 = (r) => !!(r.o && !r.x && (r.c === 'motorway' || r.c === 'trunk'));
  const laneOff = (r, ln) => (!r.o ? 1.6 : !lanes2(r) ? 0 : ln ? -1.7 : r.c === 'motorway' ? 2.0 : 1.7);   // kladné = vpravo od osy
  const backOf = (o) => (o.t === 'semi' ? TAH + TRAILER / 2 : o.T.len / 2);   // od středu vozu k jeho zádi (kamion i s návěsem)
  const GRP = new Map();
  const grpKey = (i, dir) => i * 2 + (dir > 0 ? 1 : 0);
  const inLane = (o, r, ln) => !lanes2(r) || o.ln === ln || Math.abs(o.lo - laneOff(r, ln)) < 1.3;   // při přejíždění zabírá oba pruhy
  // nejbližší vůz před c v pruhu ln: [volné místo mezi nárazníky v m, vůz]
  function leaderOf(c, r, ln) {
    let best = null, bd = 1e9;
    for (const o of GRP.get(grpKey(c.r, c.dir)) || []) {
      if (o === c || o.odst || o.pg <= c.pg || !inLane(o, r, ln)) continue;   // odst: stojí u krajnice (honička), objede se
      const d = o.pg - c.pg - backOf(o) - c.T.len / 2; if (d < bd) { bd = d; best = o; }
    }
    const rest = r.L - c.pg;
    if (!best && rest < 70) {                              // konec kusu blízko: podívat se na kus, kam auto pojede
      if (!c.nx) { const opts = exitOpts(c, c.dir > 0 ? r.w[r.w.length - 1] : r.w[0]); if (opts.length) c.nx = pickExit(opts, c); }
      if (c.nx) {
        const q = roads[c.nx[0]];
        for (const o of GRP.get(grpKey(c.nx[0], c.nx[1])) || []) {
          if (o.odst) continue;
          if (lanes2(q) && lanes2(r) && !inLane(o, q, ln)) continue;
          const d = rest + o.pg - backOf(o) - c.T.len / 2; if (d < bd) { bd = d; best = o; }
        }
      }
    }
    return [bd, best];
  }
  // volný pruh ln pro změnu: nikdo vedle ani kousek před a za (rychlejší vůz zezadu potřebuje víc místa)
  function laneFree(c, r, ln, front, back) {
    for (const o of GRP.get(grpKey(c.r, c.dir)) || []) {
      if (o === c || !inLane(o, r, ln)) continue;
      const ahead = o.pg - backOf(o) - (c.pg + c.T.len / 2), behind = (c.pg - backOf(c)) - (o.pg + o.T.len / 2);
      if (ahead > -0.5 ? ahead < front : behind < back + Math.max(0, (o.v || 0) - c.v) * 3) return false;
    }
    return true;
  }
  function followCars(act, dt) {
    GRP.clear();
    for (const c of act) {
      const r = roads[c.r]; c.pg = c.dir > 0 ? c.s : r.L - c.s;
      const k = grpKey(c.r, c.dir); let g = GRP.get(k); if (!g) GRP.set(k, (g = [])); g.push(c);
    }
    for (const c of act) {
      if (c.honi && c.honi.v != null) { c.v = c.honi.v; continue; }   // rychlost řídí honička (78-honicka.js)
      if (c.hzs?.faze === 'stoji') { c.v = 0; continue; }      // cisterna stojí u zásahu (79-hasici.js), pruh řídí hzsKrok
      const r = roads[c.r], v0 = carSpeed(c, r), two = lanes2(r);
      if (c.v === undefined) c.v = v0;
      if (c.ln === undefined || !two) c.ln = 0;
      if (c.lo === undefined || !two) c.lo = laneOff(r, c.ln);
      if (c.hold) { c.v = 0; continue; }
      let [d, ld] = leaderOf(c, r, c.ln);
      c.lt = (c.lt || 0) + dt;
      if (two && c.lt > 3 && (c.t === 'car' || c.t === 'van')) {
        if (c.ln === 0 && ld && d < 40 && (ld.v ?? v0) < v0 * 0.93 && laneFree(c, r, 1, 25, 15)) { c.ln = 1; c.lt = 0; }
        else if (c.ln === 1 && laneFree(c, r, 0, 35, 12)) { c.ln = 0; c.lt = 0; }      // po předjetí zpátky doprava
        if (!c.lt) [d, ld] = leaderOf(c, r, c.ln);
      }
      if (two && Math.abs(c.lo - laneOff(r, c.ln)) > 0.05) {   // během přejíždění hlídat i pruh, ze kterého odjíždí
        const [d2] = leaderOf(c, r, 1 - c.ln); d = Math.min(d, d2);
        c.lo += Math.sign(laneOff(r, c.ln) - c.lo) * Math.min(Math.abs(laneOff(r, c.ln) - c.lo), LC_V * dt);
      }
      const vt = Math.min(v0, Math.max(0, (d - MIN_GAP) / HEAD));
      c.v = vt < c.v ? Math.max(vt, c.v - DEC * dt) : Math.min(vt, c.v + ACC * dt);
      if (dt > 0) c.v = Math.min(c.v, Math.max(0, (d - 0.5) / dt));   // nikdy nenajet do vozu před sebou
    }
  }
  function stepCar(c, dt) {
    if (c.honi?.krok && c.honi.krok(c, dt)) return;           // hlídka jede po stopě piráta (78-honicka.js)
    if (c.hzs && hzsKrok(c, dt)) return;                      // cisterna k zásahu (79-hasici.js)
    if (c.hold) { if (blocked(c.hold)) return; c.hold.q = null; c.hold = null; }
    const r = roads[c.r], next = c.s + (c.v ?? carSpeed(c, r)) * dt * c.dir;
    for (const zs of [r.jy, r.sg]) if (zs) for (const z of zs) {   // zavřený přejezd, plný kruhový objezd (6 m před) nebo červená/žlutá na semaforu (z.d m před bodem); fronta po c.T.gap m
      if (!blocked(z) || (z.t && z.t !== c.dir) || c.honi?.ignor || c.hzs) continue;  // semafor platí jen pro směr ke křižovatce; ujíždějící pirát jede i na červenou
      const D = z.d ?? 6, qi = c.dir > 0 ? 0 : 1, stop = z[0] - c.dir * (D + ((z.q && z.q[qi]) || 0));   // z.q = délka fronty v m
      if (c.dir * (stop - c.s) >= 0 && c.dir * (next - stop) > 0) { c.s = stop; c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; return; }
      if (c.dir * (stop - c.s) < 0 && c.dir * (z[0] - c.dir * D - c.s) >= 0) { c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; return; }   // fronta mezitím narostla za auto: zastavit na místě
    }
    c.s = next;
    if (c.s < 0 || c.s > r.L) {
      const endPt = c.s < 0 ? r.w[0] : r.w[r.w.length - 1];
      const pr0 = c.pr, pd0 = c.pdir;
      c.pr = c.r; c.pdir = c.dir;                           // návěs kamionu ještě chvíli jede po předchozí silnici
      const opts = exitOpts(c, endPt);   // do uzavírky neodbočí
      if (opts.length) {
        const nx = c.nx && opts.find(([i, dir]) => i === c.nx[0] && dir === c.nx[1]); c.nx = null;
        const [i, dir] = nx || pickExit(opts, c);
        if (queueBack(c, r, i, dir)) { c.pr = pr0; c.pdir = pd0; return; }
        c.r = i; c.dir = dir; c.s = dir > 0 ? 0 : roads[i].L;
        if (lanes2(roads[i]) && lanes2(r)) c.lo = laneOff(roads[i], c.ln); else c.ln = 0;   // pruh drží i na dalším kusu dálnice
      }
      else if (r.o && (ends.get(ek(endPt)) || []).some(([i]) => i !== c.r && roads[i].c !== 'service')) {   // data mají navazující kus opačně: radši pokračovat než zmizet
        const [i, dir] = pickExit((ends.get(ek(endPt)) || []).filter(([i]) => i !== c.r && roads[i].c !== 'service'), c); c.r = i; c.dir = dir; c.s = dir > 0 ? 0 : roads[i].L;
      }
      else if (r.o) {                  // konec jednosměrky: otočit se nesmí, auto se objeví jinde
        let i = c.r; for (let k = 0; k < 20; k++) { i = Math.floor(Math.random() * roads.length); if (roads[i].c !== 'service') break; }
        c.r = i; c.dir = roads[i].o || 1; c.s = c.dir > 0 ? 0 : roads[i].L; c.pr = -1;
      }
      else { c.dir *= -1; c.s = Math.max(0, Math.min(r.L, c.s)); c.pr = -1; }
    }
  }
  function trailerPos(c) {                                  // návěs kamionu TAH m za tahačem, po předchozí silnici, když tahač právě odbočil
    const r = roads[c.r], done = c.dir > 0 ? c.s : r.L - c.s;
    if (done >= TAH || c.pr < 0) { const o = along(r, Math.max(0, Math.min(r.L, c.s - TAH * c.dir))); o.dirSign = c.dir; o.lane = c.lo ?? (r.o ? 0 : 1.6); return o; }
    const q = roads[c.pr], rem = Math.min(q.L, TAH - done);
    const o = along(q, c.pdir > 0 ? q.L - rem : rem); o.dirSign = c.pdir; o.lane = lanes2(q) ? laneOff(q, 0) : q.o ? 0 : 1.6; return o;
  }
  const bus = (() => {
    if (!OV.bus) return null;
    const w = OV.bus.w; if (w.length < 2) return null;
    const len = [0]; for (let i = 1; i < w.length; i++) len.push(len[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const r = { w, p: OV.bus.p, len, L: len[len.length - 1] };
    const stopS = OV.bus.stops.map(([sx, sy]) => { let best = 0, bd = 1e18; r.p.forEach((p, i) => { const d = (p[0] - sx) ** 2 + (p[1] - sy) ** 2; if (d < bd) { bd = d; best = i; } }); return len[best]; });
    return { r, s: 0, dir: 1, v: 9, wait: 3, stopS };
  })();
  // tramvaje: linky z overlay.json, na každé několik souprav (dva články), jezdí tam a zpět a stojí v zastávkách
  const trams = (OV.trams || []).flatMap((t) => {
    const w = t.w, len = [0]; for (let i = 1; i < w.length; i++) len.push(len[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    const r = { w, p: t.p, len, L: len[len.length - 1] };
    const stopS = t.stops.map(([sx, sy]) => { let best = 0, bd = 1e18; r.p.forEach((p, i) => { const d = (p[0] - sx) ** 2 + (p[1] - sy) ** 2; if (d < bd) { bd = d; best = i; } }); return len[best]; });
    return Array.from({ length: t.n }, (_, j) => ({ r, s: r.L * (j + 0.5) / t.n, dir: j % 2 ? -1 : 1, v: 8, wait: 0, stopS }));
  });
  // MHD podle jízdních řádů GTFS (site/mhd.json z mhd.py): poloha každého spoje podle skutečného času
  const MHD = { on: false, act: [], t: -1, drawn: [], follow: null, kartaSpoj: 0 };
  const MHD_ZDROJ = {{MHD_ZDROJ_KRATKY}};
  // MHD v reálném čase (mesto.json mhd.realtime = GTFS-RT vehicle_positions, prostředník functions/api/mhd.js): z polohy vozidla
  // na trase se dopočítá zpoždění spoje a vozidlo jede podle jízdního řádu posunutého o to zpoždění (mezi zprávami po 15 s plynule).
  // Bez prostředníka (jiný statický hosting) první odpověď 404 vypne dotazy a jezdí se jen podle jízdního řádu.
  const MHD_RT = {{MHD_RT}};
  const RT = { d: new Map(), on: false, off: false }, RT_MAX = 1800;   // d: spoj -> {c: zpoždění podle poslední polohy (s), v: zobrazené, at: kdy (ms)}
  const rtDelay = (i) => { const q = RT.d.get(i); return q ? q.v : 0; };
  function rtProject(sh, x, y, sNear) {                    // místo trasy u polohy: [metry od začátku, vzdálenost]; trasa tam a zpět po téže ulici:
    let bs = 0, bd = Infinity, bc = Infinity;               // ze stejně blízkých úseků ten blíž k čekanému místu sNear (1 km po trase = 50 m vedle)
    for (let k = 1; k < sh.w.length; k++) {
      const a = sh.w[k - 1], b = sh.w[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
      const s = sh.len[k - 1] + (sh.len[k] - sh.len[k - 1]) * t, cost = d + (sNear === undefined ? 0 : Math.abs(s - sNear) * 0.05);
      if (cost < bc) { bc = cost; bd = d; bs = s; }
    }
    return [bs, bd];
  }
  function rtSAt(trip, el) {                               // metry po trase podle jízdního řádu el s po výjezdu
    const q = trip[4]; let i = 2; while (i < q.length - 2 && q[i] < el) i += 2;
    return q[i - 1] + (q[i + 1] - q[i - 1]) * Math.max(0, Math.min(1, (el - q[i - 2]) / ((q[i] - q[i - 2]) || 1)));
  }
  function rtElAt(trip, s, near) {                         // kdy (s od výjezdu) je spoj podle jízdního řádu s metrů po trase; z více možností nejblíž k near
    const q = trip[4]; let best = null;
    for (let k = 2; k < q.length; k += 2) {
      const s0 = q[k - 1], s1 = q[k + 1];
      if (s < Math.min(s0, s1) - 2 || s > Math.max(s0, s1) + 2) continue;
      const e = s1 === s0 ? Math.max(q[k - 2], Math.min(q[k], near)) : q[k - 2] + (q[k] - q[k - 2]) * Math.max(0, Math.min(1, (s - s0) / (s1 - s0)));
      if (best === null || Math.abs(e - near) < Math.abs(best - near)) best = e;
    }
    return best;
  }
  async function rtLoad() {
    if (!MHD_RT || RT.off || !MHD.on || !MHD.tidx || document.hidden || !$('l-traffic').checked) return;
    const G = cam.grounds, m = cam.half + 600, lo = (x) => (x / cam.kx + cam.lon0).toFixed(4), la = (y) => (y / cam.ky + cam.lat0).toFixed(4);
    const x0 = Math.min(...G.map((g) => g.cx)) - m, x1 = Math.max(...G.map((g) => g.cx)) + m, y0 = Math.min(...G.map((g) => g.cy)) - m, y1 = Math.max(...G.map((g) => g.cy)) + m;
    try {
      const r = await fetch(`api/mhd?src=${encodeURIComponent(MHD_RT)}&lamin=${la(y0)}&lamax=${la(y1)}&lomin=${lo(x0)}&lomax=${lo(x1)}`, { signal: AbortSignal.timeout(6000) });
      if (r.status === 404) { RT.off = true; return; }
      if (!r.ok) return;
      const { v } = await r.json(), n = pragueNow(), nowMs = Date.now();
      for (const [id, lat, lon, ts] of v) {
        const i = MHD.tidx.get(id); if (i === undefined) continue;
        const trip = MHD.trips[i], sh = MHD.shapes[trip[1]], old = RT.d.get(i);
        const age = Math.max(0, Math.min(120, nowMs / 1000 - ts));
        let elNow = n.s - trip[3]; if (elNow < -43200) elNow += 86400;   // spoj, který vyjel včera před půlnocí
        if (elNow < 30) continue;                         // ještě stojí na konečné před odjezdem: poloha neznamená zpoždění
        const near = elNow - age - (old ? old.c : 0), [s, d] = rtProject(sh, (lon - cam.lon0) * cam.kx, (lat - cam.lat0) * cam.ky, rtSAt(trip, near));
        if (d > 80) continue;                              // vozidlo mimo trasu (objížďka): radši jízdní řád
        const at = rtElAt(trip, s, near);
        if (at === null) continue;
        const c = Math.max(-300, Math.min(RT_MAX, elNow - age - at));
        RT.d.set(i, { c, v: old ? old.v : c, at: nowMs });
      }
      for (const [i, q] of RT.d) if (nowMs - q.at > 180000) RT.d.delete(i);   // 3 minuty bez polohy: zpátky na jízdní řád
      RT.on = true;
    } catch {}
  }
  // bez GTFS v mesto.json se mhd.json nevyrábí: nežádat o něj (jinak chyba 404 v konzoli)
  if ({{MHD}}) fetch('mhd.json' + VER).then((r) => r.json()).then((m) => {
    m.shapes = m.shapes.map((w) => { const len = [0]; for (let i = 1; i < w.length; i++) len.push(len[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1])); return { w, len, L: len[len.length - 1] }; });
    m.dur = m.trips.map((t) => t[4][t[4].length - 2]);
    m.maxDur = Math.max(...m.dur);
    m.maxWait = m.trips.reduce((x, t) => Math.max(x, t[7] || 0), 0);   // čekání na konečné před odjezdem (mhd.py)
    m.tidx = new Map((m.tid || []).map((id, i) => [id, i]).filter(([id]) => id));   // GTFS trip_id -> spoj (polohy v reálném čase)
    Object.assign(MHD, m, { on: true });
    stopsReady();
    if (MHD_RT) { setTimeout(rtLoad, 1000); setInterval(rtLoad, 15000); }
  }).catch(() => {});
  const pragueNow = () => {                                // datum, den v týdnu (po = 0) a sekundy od půlnoci (čas v Česku)
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(new Date()).map((q) => [q.type, q.value]));
    return { d: +(p.year + p.month + p.day), wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday), s: (+p.hour % 24) * 3600 + +p.minute * 60 + +p.second + (Date.now() % 1000) / 1000 };
  };
  const ymd = (d) => +`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  function mhdServices(d, wd, strict) {                    // služby jízdního řádu platné v daný den
    const on = new Set();
    for (const [id, [days, from, to, add, rem]] of Object.entries(MHD.services)) {
      if (rem.includes(d)) continue;
      if (add.includes(d) || (days[wd] && (!strict || (d >= from && d <= to)))) on.add(id);
    }
    return on;
  }
  function mhdActive() {                                   // jedoucí spoje (dnešní i ty, co vyjely včera před půlnocí)
    const n = pragueNow(), y = new Date(); y.setDate(y.getDate() - 1);
    let today = mhdServices(n.d, n.wd, true);
    if (!MHD.trips.some((t) => today.has(t[2]))) today = mhdServices(n.d, n.wd, false);   // prošlý jízdní řád: aspoň podle dne v týdnu
    const yest = mhdServices(ymd(y), (n.wd + 6) % 7, false), out = [];
    for (const [svc, t] of [[today, n.s], [yest, n.s + 86400]]) {
      const T = MHD.trips; let lo = 0, hi = T.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (T[m][3] < t - MHD.maxDur - (RT.d.size ? RT_MAX : 0)) lo = m + 1; else hi = m; }
      for (let i = lo; i < T.length && T[i][3] <= t + (MHD.maxWait || 0) + (RT.d.size ? 300 : 0); i++) {
        if (!svc.has(T[i][2])) continue;
        const el = t - T[i][3] - rtDelay(i);               // se zpožděním z polohy v reálném čase (jinak 0)
        if (el <= MHD.dur[i] && el >= -(T[i][7] || 0)) { const a = el >= 0 ? [i, el] : [i, 0, -el]; a.d0 = rtDelay(i); out.push(a); }   // [i, s od odjezdu, s do odjezdu když stojí na konečné]; d0 = zpoždění při výpočtu
      }
    }
    const fronta = {};                                     // víc vozů na téže konečné: kdo odjíždí později, stojí za ním (a[3] = pořadí)
    // autobus na konečné jen poslední 3 minuty před odjezdem a nejvýš jeden na stanovišti (jinak na velké konečné vzniklo „hnízdo
    // autobusů“); ostatní čekají mimo mapu (odstavná plocha, pauza řidiče). Tramvaje beze změny, mají vlastní odstavné koleje.
    const BUS_CEKA = 180, stan = new Set();
    for (let k = out.length - 1; k >= 0; k--) { const a = out[k]; if (a[2] && MHD.routes[MHD.trips[a[0]][0]][1] === 3 && a[2] > BUS_CEKA) out.splice(k, 1); }
    for (const a of out.filter((q) => q[2] && MHD.routes[MHD.trips[q[0]][0]][1] === 3).sort((p, q) => p[2] - q[2])) {
      const w0 = MHD.shapes[MHD.trips[a[0]][1]].w[0], k = `${Math.round(w0[0] / 4)}_${Math.round(w0[1] / 4)}`;
      if (stan.has(k)) out.splice(out.indexOf(a), 1); else stan.add(k);
    }
    for (const a of out.filter((q) => q[2]).sort((p, q) => p[2] - q[2])) {
      const t = MHD.trips[a[0]], w0 = MHD.shapes[t[1]].w[0], k = `${MHD.routes[t[0]][1]}_${Math.round(w0[0] / 4)}_${Math.round(w0[1] / 4)}`;   // fronta po stanovištích (začátek trasy), ne po názvu zastávky
      a[3] = fronta[k] = (fronta[k] ?? -1) + 1;
    }
    return out;
  }
  // trasa sledovaného spoje: čára po celé trase v mapě, zastávky s časem příjezdu (i se zpožděním), projeté šedě
  const hhmm = (sec) => { const m = ((Math.round(sec / 60) % 1440) + 1440) % 1440; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  function followRoute(sx, ox, oy) {
    const i = MHD.follow, trip = MHD.trips[i], sh = MHD.shapes[trip[1]], typ = MHD.routes[trip[0]][1], a = MHD.act.find((q) => q[0] === i);
    if (!sh.img) sh.img = sh.w.map(([x, y]) => toImg(x, y, gz(x, y)));
    if (!trip.zpos) trip.zpos = (() => {                   // zastávka spoje = zastávka stejného jména nejblíž trase
      const out = [], z = trip[6];
      for (let k = 0; k < z.length; k += 2) {
        let best = null;
        for (const st of MHD.stops || []) if (st[0] === z[k]) for (let v = 0; v < sh.w.length; v += 2) { const d = Math.hypot(sh.w[v][0] - st[1], sh.w[v][1] - st[2]); if (!best || d < best.d) best = { d, x: st[1], y: st[2] }; }
        if (best && best.d < 150) { const [ix, iy] = toImg(best.x, best.y, gz(best.x, best.y)); out.push({ n: z[k], t: z[k + 1], ix, iy }); }
      }
      return out;
    })();
    const col = typ === 2 ? '#ff9f1c' : typ === 0 ? '#e0483a' : '#2f8cff', path = () => { ctx.beginPath(); sh.img.forEach(([ix, iy], k) => (k ? ctx.lineTo(ox + ix * sx, oy + iy * sx) : ctx.moveTo(ox + ix * sx, oy + iy * sx))); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(16,20,30,.55)'; ctx.lineWidth = Math.max(5, 12 * sx); path(); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, 7 * sx); path(); ctx.stroke();
    const el = a ? a[1] : -1, d = rtDelay(i);
    ctx.font = '700 12px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (const z of trip.zpos) {
      const X = Math.round(ox + z.ix * sx), Y = Math.round(oy + z.iy * sx), byla = el > z.t;
      ctx.fillStyle = byla ? '#7c8698' : '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(X, Y, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (sx < 0.12) continue;
      const txt = `${MHD.names[z.n]} ${hhmm(trip[3] + z.t + d)}`, w = ctx.measureText(txt).width + 10;
      ctx.fillStyle = byla ? 'rgba(20,26,39,.6)' : 'rgba(20,26,39,.9)'; ctx.fillRect(X + 8, Y - 10, w, 20);
      ctx.fillStyle = byla ? '#a9b3c4' : '#eef1e6'; ctx.fillText(txt, X + 13, Y);
    }
    ctx.restore();
  }
  function mhdFollow(i) {                                  // kliknutí na vozidlo: pohled jede za ním, lišta ukazuje linku, cíl a další zastávku
    MHD.follow = i; $('follow').hidden = false; mhdFollowText(); closeCard();
  }
  // ---------- karta vozidla: klik na vlak, autobus, tramvaj nebo auto (nápad z minimapa.cz) ----------
  const CARS_DRAWN = [];
  const VLAK_POPIS = {
    regiopanter: ['RegioPanter (řada 640/650)', 'Elektrická jednotka Škoda pro regionální dopravu, dva vozy.'],
    regioshark: ['RegioShark (řada 844)', 'Motorová jednotka PESA, dva vozy s nízkou podlahou.'],
    regionova: ['Regionova (řada 814)', 'Modernizovaný motorový vůz z 90. let s přívěsem.'],
    vuz810: ['Motorový vůz řady 810', 'Jednovozový „orchestrion“ na lokálkách.'],
    cityelefant: ['CityElefant (řada 471)', 'Patrová elektrická jednotka pro příměstskou dopravu.'],
    rychlik: ['Rychlík', 'Lokomotiva řady 380 a osobní vozy.'],
    arriva628: ['Arriva vlaky, řada 845/945', 'Dvouvozová motorová jednotka (původně DB řady 628) v barvách Arrivy.'],
    dlb654: ['Die Länderbahn, RegioSprinter (řada 654)', 'Kloubový motorový vůz s nízkou podlahou v barvách Dopravy Ústeckého kraje.'],
  };
  const AUTO_POPIS = {
    car: ['Osobní auto', ''], van: ['Dodávka', 'Asi každé desáté osobní vozidlo.'], truck: ['Nákladní auto', ''],
    semi: ['Kamion s návěsem', 'Tahač s návěsem, jezdí nejvýš 80 km/h.'], garbage: ['Popelářský vůz', 'Jezdí ve dne po vedlejších ulicích.'],
    tractor: ['Traktor', 'Vzácný host na vedlejších silnicích, nejvýš 30 km/h.'],
    hasici: ['Hasiči', 'Cisterna jede k zásahu nebo u něj stojí. Zásah je skutečný (krajský portál krizového řízení), jízda vozu a místo uvnitř obce jsou ilustrace.'],
    police: ['Policie ČR', 'Hlídka jede za řidičem, který projel kolem ukazatele rychlosti rychleji, než smí. Je to ilustrace, ne skutečný zásah.'],
  };
  const mistoZ = (ix, iy) => { const [x, y] = imgToWorld(ix, iy); return lonlat(x, y); };
  // karta spoje: linka, odkud a kam, stav (zpoždění z polohy vozidla PID v reálném čase), tlačítka Sledovat a Trasa linky,
  // zastávky spoje s časem podle jízdního řádu a očekávaným časem se zpožděním; projeté zastávky sbalené, karta se obnovuje po 10 s
  const zpTxt = (zp) => (zp >= 60 ? `+${Math.round(zp / 60)} min` : zp <= -60 ? `${Math.round(zp / 60)} min` : '');
  const zpTrida = (zp) => (zp >= 300 ? 'zp-velke' : zp >= 60 ? 'zp-male' : zp <= -60 ? 'zp-napred' : 'zp-vcas');
  function showMhd(i) {
    const t = MHD.trips[i], a0 = MHD.act.find((q) => q[0] === i); if (!t || !a0) return;
    const [line, typ] = MHD.routes[t[0]], z = t[6], o = mhdPos(t, a0[2] ? 0 : a0[1]), [lon, lat] = mistoZ(o.ix, o.iy);
    const druh = typ === 0 ? 'Tramvaj' : typ === 2 ? 'Vlak' : 'Autobus', vl = typ === 2 ? VLAK_POPIS[trainOf(line)] : null;
    showCard({ title: '', text: vl ? vl[1] : '', lon, lat, rows: [['Odkud', MHD.names[z[0]]], ['Kam', MHD.names[t[5]]], ['Vozidlo', vl ? vl[0] : druh.toLowerCase()]] });
    $('cardTitle').replaceChildren(`${druh} `, Object.assign(document.createElement('span'), { className: `linka ${typ === 2 ? 'vlak' : typ === 0 ? 'tram' : 'bus'}`, textContent: line }), ` → ${MHD.names[t[5]]}`);
    const box = $('cardSpoj'); box.hidden = false; box.replaceChildren();
    const tl = document.createElement('div'); tl.className = 'spoj-tlacitka';
    const bSled = document.createElement('button'); bSled.type = 'button'; bSled.className = 'px-btn';
    const sledTxt = () => { const on = MHD.follow === i; bSled.textContent = on ? '■ Nesledovat' : '▶ Sledovat'; bSled.setAttribute('aria-pressed', String(on)); };
    bSled.addEventListener('click', () => {
      if (MHD.follow === i) { MHD.follow = null; $('follow').hidden = true; } else { MHD.follow = i; $('follow').hidden = false; mhdFollowText(); }
      sledTxt();
    });
    const bTrasa = document.createElement('button'); bTrasa.type = 'button'; bTrasa.className = 'px-btn'; bTrasa.textContent = 'Trasa linky';
    bTrasa.addEventListener('click', () => { linkaVyber(line, typ); closeCard(); });
    tl.append(bSled, bTrasa); sledTxt();
    const stav = document.createElement('p'); stav.className = 'spoj-stav';
    const seznam = document.createElement('div');
    const pozn = document.createElement('p'); pozn.className = 'spoj-pozn';
    box.append(tl, stav, seznam, pozn);
    const vy = window.Izomapa?.vyluky?.(line) || [];        // platné výluky a mimořádnosti linky (web/mapa_vyluky.js)
    if (vy.length) {
      const w = document.createElement('div'); w.className = 'spoj-vyluky';
      for (const v of vy.slice(0, 3)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'odkaz-btn'; b.textContent = `${v.druh === 'mimoradnost' ? 'Mimořádnost' : 'Výluka'}: ${v.nazev}`; b.addEventListener('click', v.ukaz); w.append(b); }
      box.insertBefore(w, seznam);
    }
    const id = ++MHD.kartaSpoj;
    const obnov = () => {
      if (id !== MHD.kartaSpoj || $('card').hidden || !box.contains(seznam)) return false;
      const a = MHD.act.find((q) => q[0] === i), el = a ? (a[2] ? -a[2] : a[1]) : Infinity, zp = rtDelay(i), live = RT.d.has(i);
      sledTxt();
      const st = document.createElement('span'); st.className = 'zp ' + (live && a ? zpTrida(zp) : 'zp-jr');
      st.textContent = !a ? 'dojel' : !live ? 'podle jízdního řádu' : zp >= 60 ? `zpoždění ${Math.round(zp / 60)} min` : zp <= -60 ? `${Math.round(-zp / 60)} min napřed` : 'jede včas';
      let dalsi = null; for (let k = 0; k < z.length; k += 2) if (z[k + 1] >= el) { dalsi = k; break; }
      const kde = !a ? 'Spoj dojel do cílové zastávky.' : a[2] ? `Stojí na výchozí zastávce, odjezd za ${Math.max(1, Math.round(a[2] / 60))} min.`
        : dalsi !== null ? `Další zastávka ${MHD.names[z[dalsi]]} v ${hhmm(t[3] + z[dalsi + 1] + (live ? zp : 0))}.` : '';
      stav.replaceChildren(st, ' ', kde);
      const radek = (k, byla) => {                         // čas podle jízdního řádu, u budoucích zastávek očekávaný čas se zpožděním
        const li = document.createElement('li'); if (byla) li.className = 'byla'; if (k === dalsi) li.className = 'dalsi';
        const c = document.createElement('span'); c.className = 'cas'; c.textContent = hhmm(t[3] + z[k + 1]);
        const n = document.createElement('span'); n.className = 'zast'; n.textContent = MHD.names[z[k]];
        li.append(c, n);
        if (live && !byla && Math.abs(zp) >= 60) { const q = document.createElement('span'); q.className = 'zp ' + zpTrida(zp); q.textContent = `${zpTxt(zp)} · ${hhmm(t[3] + z[k + 1] + zp)}`; li.append(q); }
        return li;
      };
      const nProj = dalsi === null ? z.length / 2 : dalsi / 2;
      const otev = seznam.querySelector('details')?.open || false, scroll = seznam.querySelector('ol.spoj-budouci')?.scrollTop || 0;
      seznam.replaceChildren();
      const h3 = document.createElement('p'); h3.className = 'label spoj-nadpis'; h3.textContent = 'Jízdní řád spoje'; seznam.append(h3);
      if (nProj > 0) {
        const d = document.createElement('details'); d.className = 'spoj-projete'; d.open = otev;
        const sm = document.createElement('summary'); sm.textContent = `${nProj} ${nProj === 1 ? 'projetá zastávka' : nProj < 5 ? 'projeté zastávky' : 'projetých zastávek'}`;
        const ol = document.createElement('ol'); ol.className = 'spoj-zast';
        for (let k = 0; k < nProj * 2; k += 2) ol.append(radek(k, true));
        d.append(sm, ol); seznam.append(d);
      }
      const ol = document.createElement('ol'); ol.className = 'spoj-zast spoj-budouci';
      for (let k = nProj * 2; k < z.length; k += 2) ol.append(radek(k, false));
      seznam.append(ol); ol.scrollTop = scroll;
      pozn.textContent = live ? `Poloha a zpoždění podle živých dat ${MHD_ZDROJ}, časy v levém sloupci podle jízdního řádu.`
        : `Podle jízdního řádu ${MHD_ZDROJ}. Živá poloha tohoto spoje teď není k dispozici, zpoždění se proto neukazuje.`;
      return true;
    };
    obnov();
    const tm = setInterval(() => { if (!obnov()) clearInterval(tm); }, 10000);
  }
  function showCar(c) {
    const [nm, txt] = AUTO_POPIS[c.t] || AUTO_POPIS.car, r = roads[c.r], o = along(r, c.s), [lon, lat] = mistoZ(o.ix, o.iy);
    const v = Math.round(carSpeed(c, r) * 3.6);
    showCard({ title: nm, text: [txt, 'Auta na mapě jsou ilustrace hustoty provozu podle sčítání dopravy, ne skutečná vozidla.'].filter(Boolean).join(' '), lon, lat,
      rows: [['Rychlost', c.hold ? 'stojí' : `${v} km/h`]] });
  }
  function mhdFollowText() {
    const i = MHD.follow, a = MHD.act.find((q) => q[0] === i);
    if (!a) { $('followTxt').textContent = 'Spoj dojel do cílové zastávky.'; MHD.follow = null; setTimeout(() => { if (MHD.follow === null) $('follow').hidden = true; }, 4000); return; }
    const t = MHD.trips[i], [line, typ] = MHD.routes[t[0]], z = t[6]; let next = '';
    for (let k = 0; k < z.length; k += 2) if (z[k + 1] >= a[1]) { next = MHD.names[z[k]]; break; }
    const b = document.createElement('b'); b.textContent = `${typ === 0 ? 'Tramvaj' : typ === 2 ? 'Vlak' : 'Autobus'} ${line}`;
    const odj = a[2] ? ` · stojí na konečné, odjezd za ${Math.max(1, Math.round(a[2] / 60))} min` : next ? ` · další zastávka ${next}` : '';
    const zp = rtDelay(i), rt = !RT.d.has(i) ? '' : zp >= 90 ? ` · zpoždění ${Math.round(zp / 60)} min` : zp <= -90 ? ` · ${Math.round(-zp / 60)} min napřed` : ' · jede včas';
    $('followTxt').replaceChildren(b, ` → ${MHD.names[t[5]]}`, odj, rt);
  }
  $('followStop').addEventListener('click', () => { MHD.follow = null; if (typeof PLANES !== 'undefined') PLANES.follow = null; $('follow').hidden = true; });
  viewer.addHandler('canvas-drag', () => {
    if (MHD.follow !== null) { MHD.follow = null; $('follow').hidden = true; }
    if (typeof PLANES !== 'undefined' && PLANES.follow !== null) { PLANES.follow = null; $('follow').hidden = true; }
  });
  function odstavPos(trip, ceka, poradi) {                 // tramvaj na konečné, kde kolej za zastávkou slepě končí: z nástupiště dozadu na konec koleje, před odjezdem zpátky
    const pole = MHD.odstav && MHD.odstav[trip[1]];
    if (!pole) return null;
    const od = pole[(poradi || 0) % pole.length];
    if (!od.len) { od.len = [0]; for (let i = 1; i < od.length; i++) od.len.push(od.len[i - 1] + Math.hypot(od[i][0] - od[i - 1][0], od[i][1] - od[i - 1][1])); od.L = od.len[od.len.length - 1]; }
    const f = Math.min(1, Math.min((trip[7] || 0) - ceka, ceka) / 30), s = Math.max(0, od.L * f - 8 - ((poradi || 0) >= pole.length ? 34 : 0));
    const bod = (s_) => { let k = 1; while (k < od.len.length - 1 && od.len[k] < s_) k++; const a = od[k - 1], b = od[k], u = Math.max(0, Math.min(1, (s_ - od.len[k - 1]) / ((od.len[k] - od.len[k - 1]) || 1))); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
    const [x, y] = bod(s), [x2, y2] = bod(Math.min(od.L, s + 6)), h = gz(x, y), [ix, iy] = toImg(x, y, h);   // směr z delšího úseku, koleje jsou po krátkých kouscích
    return { x, y, z: h, ix, iy, dx: x2 - x, dy: y2 - y, dirSign: 1 };
  }
  // zastávky (mhd.json "stops": [jméno, x, y, druh]): kliknutí ukáže nejbližší odjezdy podle jízdního řádu, hledání je najde
  function linesReady() {
    const seen = new Set();
    MHD.routes.forEach(([line, typ], ri) => {
      if (seen.has(line + typ)) return; seen.add(line + typ);
      const label = `${typ === 0 ? 'Tramvaj' : typ === 2 ? 'Vlak' : 'Autobus'} ${line}`;
      index.push({ label, kind: 'linka', n: norm(label + ' linka ' + line), go: () => {
        const c = vp0(), act = mhdActive().filter(([i]) => MHD.trips[i][0] === ri);
        if (!act.length) { $('followTxt').textContent = `${label} teď nejede.`; $('follow').hidden = false; setTimeout(() => { if (MHD.follow === null) $('follow').hidden = true; }, 4000); return; }
        let best = act[0], bd = Infinity;
        for (const a of act) { const o = mhdPos(MHD.trips[a[0]], a[2] ? 0 : a[1]), dd = Math.hypot(o.ix - c.x, o.iy - c.y); if (dd < bd) { bd = dd; best = a; } }
        const o = mhdPos(MHD.trips[best[0]], best[2] ? 0 : best[1]); goTo(o.ix, o.iy, 2); mhdFollow(best[0]);
      } });
    });
  }
  const vp0 = () => { const b = viewer.viewport.getCenter(true); return { x: b.x * W, y: b.y * W }; };
  function seznamSpoju() {
    const c = vp0(), out = [];
    for (const a of mhdActive()) {                         // vždy čerstvě (nezávisle na vykreslování)
      const [i, el, ceka] = a, trip = MHD.trips[i], o = mhdPos(trip, ceka ? 0 : el);
      if (!cam.grounds.some((q) => Math.abs(o.x - q.cx) <= cam.half && Math.abs(o.y - q.cy) <= cam.half)) continue;   // jen spoje v mapě
      out.push({ i, o, d: Math.hypot(o.ix - c.x, o.iy - c.y) * cam.mpp, ceka });
    }
    out.sort((a, b) => a.d - b.d);
    const ul = $('sledList');
    if (!out.length) { const li = document.createElement('li'); li.className = 'prazdno'; li.textContent = 'Teď po mapě nic nejede.'; ul.replaceChildren(li); return; }
    ul.replaceChildren(...out.slice(0, 40).map(({ i, o, d, ceka }) => {
      const [line, typ] = MHD.routes[MHD.trips[i][0]], li = document.createElement('li'), b = document.createElement('button'), l = document.createElement('span'), sm = document.createElement('small');
      l.className = 'linka ' + (typ === 2 ? 'vlak' : typ === 0 ? 'tram' : 'bus'); l.textContent = line;
      sm.textContent = ` · ${d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m'}${ceka ? ' · stojí na konečné' : ''}${RT.d.has(i) ? ' · živě' : ''}`;
      const txt = document.createElement('span'); txt.append(`${typ === 2 ? 'Vlak' : typ === 0 ? 'Tramvaj' : 'Autobus'} → ${MHD.names[MHD.trips[i][5]]}`, sm);
      b.type = 'button'; b.append(l, txt);
      b.addEventListener('click', () => { MHD.act = mhdActive(); goTo(o.ix, o.iy, 2); mhdFollow(i); });
      li.appendChild(b); return li;
    }));
  }
  // ---------- linky: celá trasa jednoho směru na mapě, opačný směr, kolik spojů právě jede (inspirace izomapa.fun) ----------
  const LINKA = { ri: null, smer: 0, smery: [], sh: null };
  const typNazev = (typ) => (typ === 2 ? 'Vlak' : typ === 0 ? 'Tramvaj' : 'Autobus');
  function linkaVyber(line, typ) {
    const ri = MHD.routes.map((r, i) => (r[0] === line && r[1] === typ ? i : -1)).filter((i) => i >= 0);
    const podleCile = new Map();                             // směr = cíl spoje; tvar trasy = nejčastější tvar spojů do toho cíle
    MHD.trips.forEach((t) => { if (!ri.includes(t[0])) return; const k = t[5]; if (!podleCile.has(k)) podleCile.set(k, new Map()); const m = podleCile.get(k); m.set(t[1], (m.get(t[1]) || 0) + 1); });
    const smery = [...podleCile.entries()].map(([cil, m]) => ({ cil, sh: [...m.entries()].sort((a, b) => b[1] - a[1])[0][0], n: [...m.values()].reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.n - a.n).slice(0, 2);
    if (!smery.length) return;
    Object.assign(LINKA, { line, typ, ri, smer: 0, smery });
    MHD.follow = null; $('follow').hidden = true;
    linkaUkaz(true);
  }
  function linkaUkaz(najet) {
    const s = LINKA.smery[LINKA.smer]; if (!s) return;
    const sh = MHD.shapes[s.sh]; if (!sh.img) sh.img = sh.w.map(([x, y]) => toImg(x, y, gz(x, y)));
    LINKA.sh = sh;
    const jede = mhdActive().filter(([i]) => LINKA.ri.includes(MHD.trips[i][0]) && MHD.trips[i][5] === s.cil).length;
    $('linkaTxt').replaceChildren(Object.assign(document.createElement('b'), { textContent: `${typNazev(LINKA.typ)} ${LINKA.line}` }), ` → ${MHD.names[s.cil]} · ${jede ? `právě jede ${jede} ${jede === 1 ? 'spoj' : jede < 5 ? 'spoje' : 'spojů'}` : 'teď nejede'}`);
    $('linkaOtoc').hidden = LINKA.smery.length < 2; $('linkaBar').hidden = false;
    if (najet) {
      const xs = sh.img.map((p) => p[0]), ys = sh.img.map((p) => p[1]), m = 60;
      viewer.viewport.fitBounds(new OpenSeadragon.Rect((Math.min(...xs) - m) / W, (Math.min(...ys) - m) / W, (Math.max(...xs) - Math.min(...xs) + 2 * m) / W, (Math.max(...ys) - Math.min(...ys) + 2 * m) / W));
      if (isMobile()) setMenu(false);
    }
  }
  function kresliLinku(sx, ox, oy) {
    const sh = LINKA.sh; if (!sh || $('linkaBar').hidden) return;
    const col = LINKA.typ === 2 ? '#ff9f1c' : LINKA.typ === 0 ? '#e0483a' : '#2f8cff', path = () => { ctx.beginPath(); sh.img.forEach(([ix, iy], k) => (k ? ctx.lineTo(ox + ix * sx, oy + iy * sx) : ctx.moveTo(ox + ix * sx, oy + iy * sx))); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(16,20,30,.5)'; ctx.lineWidth = Math.max(5, 11 * sx); path(); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, 6 * sx); ctx.setLineDash([Math.max(6, 14 * sx), Math.max(3, 6 * sx)]); path(); ctx.stroke();
    ctx.restore();
  }
  $('linkaOtoc').addEventListener('click', () => { LINKA.smer = (LINKA.smer + 1) % LINKA.smery.length; linkaUkaz(false); });
  $('linkaZavri').addEventListener('click', () => { $('linkaBar').hidden = true; LINKA.sh = null; });
  setInterval(() => { if (!$('linkaBar').hidden) linkaUkaz(false); }, 15000);
  function seznamLinek() {
    const act = mhdActive(), seen = new Map();
    MHD.routes.forEach(([line, typ], ri) => { const k = typ + '|' + line; if (!seen.has(k)) seen.set(k, { line, typ, n: 0 }); });
    for (const [i] of act) { const [line, typ] = MHD.routes[MHD.trips[i][0]]; const q = seen.get(typ + '|' + line); if (q) q.n++; }
    const ul = $('linkyList'), PORADI = (t) => (t === 0 ? 1 : t === 2 ? 2 : 0), lin = [...seen.values()].sort((a, b) => PORADI(a.typ) - PORADI(b.typ) || String(a.line).localeCompare(String(b.line), 'cs', { numeric: true }));   // autobusy, tramvaje, vlaky
    ul.replaceChildren(...lin.map(({ line, typ, n }) => {
      const li = document.createElement('li'), b = document.createElement('button'), l = document.createElement('span'), t = document.createElement('span'), sm = document.createElement('small');
      l.className = 'linka ' + (typ === 2 ? 'vlak' : typ === 0 ? 'tram' : 'bus'); l.textContent = line;
      sm.textContent = n ? ` · právě jede ${n}` : ' · teď nejede'; t.append(typNazev(typ), sm);
      b.type = 'button'; b.append(l, t); b.addEventListener('click', () => linkaVyber(line, typ)); li.append(b); return li;
    }));
  }
  $('linkyBtn').addEventListener('click', () => { const ul = $('linkyList'); ul.hidden = !ul.hidden; $('linkyBtn').setAttribute('aria-expanded', String(!ul.hidden)); if (!ul.hidden) seznamLinek(); });
  $('sledBtn').addEventListener('click', () => { const ul = $('sledList'); ul.hidden = !ul.hidden; $('sledBtn').setAttribute('aria-expanded', String(!ul.hidden)); if (!ul.hidden) seznamSpoju(); });
  setInterval(() => { if (!$('sledList').hidden) seznamSpoju(); }, 3000);
  function stopsReady() {
    $('sledBox').hidden = false;                             // jízdní řády načtené: jde sledovat spoje
    linesReady();
    if (!MHD.stops) return;
    MHD.stopPts = MHD.stops.map(([n, x, y, kd]) => { const [ix, iy] = toImg(x, y, gz(x, y)); return { n, x, y, kd, ix, iy }; });
    const seen = new Set();
    for (const s of MHD.stopPts) {
      if (seen.has(s.n)) continue; seen.add(s.n);
      const nm = MHD.names[s.n];
      index.push({ label: nm, kind: 'zastávka', k: `c${Math.round(s.x / (2 * cam.half))}_${Math.round(s.y / (2 * cam.half))}`, n: norm(nm), go: () => { goTo(s.ix, s.iy, 2); showStop(s); } });
    }
  }
  function stopDepartures(nid) {                             // [s do odjezdu, spoj] na hodinu dopředu (bez cílové zastávky spoje), i noční spoje po půlnoci
    const p = pragueNow(), y = new Date(); y.setDate(y.getDate() - 1);
    const zit = new Date(); zit.setDate(zit.getDate() + 1);
    let today = mhdServices(p.d, p.wd, true);
    if (!MHD.trips.some((t) => today.has(t[2]))) today = mhdServices(p.d, p.wd, false);
    const yest = mhdServices(ymd(y), (p.wd + 6) % 7, false), tom = mhdServices(ymd(zit), (p.wd + 1) % 7, false), out = [];
    for (const [svc, base] of [[today, 0], [yest, -86400], [tom, 86400]]) MHD.trips.forEach((t, ti) => {
      if (!svc.has(t[2])) return;                         // i vlaky (na nádraží)
      const z = t[6], zp = base === 0 || base === -86400 ? rtDelay(ti) : 0;
      for (let k = 0; k < z.length - 2; k += 2) if (z[k] === nid) { const dt = base + t[3] + z[k + 1] + zp - p.s; if (dt >= -20 && dt <= 3600) out.push([dt, t, zp]); }
    });
    return out.sort((a, b) => a[0] - b[0]);
  }
  function showStop(s) {
    const hm = (dt) => { const p = pragueNow(), v = Math.round((p.s + dt) / 60) % 1440; return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
    const za = (dt) => (dt < 60 ? 'teď' : `za ${Math.round(dt / 60)} min`);
    const groups = new Map();
    const zpTxt = (zp) => (zp >= 90 ? ` +${Math.round(zp / 60)} min` : '');
    for (const [dt, t, zp] of stopDepartures(s.n)) {
      const [line, typ] = MHD.routes[t[0]], key = `${typ === 0 ? 'Tramvaj' : typ === 2 ? 'Vlak' : 'Autobus'} ${line} → ${MHD.names[t[5]]}`;
      if (!groups.has(key)) groups.set(key, []);
      if (groups.get(key).length < 3) groups.get(key).push([dt, zp]);
    }
    const rows = [...groups.entries()].sort((a, b) => a[1][0][0] - b[1][0][0]).slice(0, 10).map(([k, v]) => [k, `${hm(v[0][0])}${zpTxt(v[0][1])} (${za(v[0][0])})` + v.slice(1).map(([d, zp]) => ', ' + hm(d) + zpTxt(zp)).join('')]);
    showCard({ title: `Zastávka ${MHD.names[s.n]}`, text: rows.length ? (RT.on ? 'Odjezdy podle jízdního řádu a poloh vozidel v reálném čase (časy jsou i se zpožděním).' : 'Odjezdy podle jízdního řádu, bez zpoždění.') : 'V příští hodině odtud podle jízdního řádu nic nejede.',
      rows, lon: s.x / cam.kx + cam.lon0, lat: s.y / cam.ky + cam.lat0 });
  }
  const stopAt = (ix, iy) => {                              // zastávka pod kliknutím (do ~20 px na obrazovce, nejméně 6 m)
    if (!MHD.stopPts) return null;
    const scr = viewer.viewport.getContainerSize().x / (viewer.viewport.getBounds(true).width * W);
    if (scr < 0.12) return null;
    const r = Math.max(20 / scr, 30); let best = null, bd = r;
    for (const s of MHD.stopPts) { const d = Math.hypot(s.ix - ix, s.iy - iy); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  function mhdPos(trip, el, T = 0, off = 0) {                              // kde na trase je spoj el sekund po výjezdu
    const q = trip[4]; let i = 2; while (i < q.length - 2 && q[i] < el) i += 2;
    const f = Math.max(0, Math.min(1, (el - q[i - 2]) / ((q[i] - q[i - 2]) || 1)));
    const sh = MHD.shapes[trip[1]], s0 = Math.min(sh.L, q[i - 1] + (q[i + 1] - q[i - 1]) * f), s = Math.max(0, Math.min(sh.L, Math.max(T / 2, Math.min(sh.L - T / 2, s0)) + off));   // T: délka vlaku, off: článek od středu
    return shapePos(sh, s);
  }
  // poloha a směr vozu v metru s trasy. Směr z bodů před a za vozidlem: trasy z GTFS mívají u zastávek krátké zalomené úseky
  // a „ostruhy“ k označníku (pár metrů tam a zpět). Na ostruze leží oba body ±4 m na ní a vůz by se stočil napříč, proto když body
  // nejsou aspoň na 80 % délky úseku od sebe (ostrý obrat), okno se zvětší na ±13 m a ±22 m – za kořen ostruhy. Na začátku a konci
  // trasy se počítá jen skutečná délka úseku (jinak by na konečné stál vůz šejdrem). Na rovné trase zůstane ±4 m.
  function shapePos(sh, s) {
    const L = sh.len;
    const at = (s) => {
      let k = 1; while (k < L.length - 1 && L[k] < s) k++;
      const a = sh.w[k - 1], b = sh.w[k], u = Math.max(0, Math.min(1, (s - L[k - 1]) / ((L[k] - L[k - 1]) || 1)));
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    const [x, y] = at(s);
    let p0, p1, dx, dy;
    for (const w of [4, 13, 22]) {
      const sa = Math.max(0, s - w), sb = Math.min(sh.L, s + w);
      p0 = at(sa); p1 = at(sb); dx = p1[0] - p0[0]; dy = p1[1] - p0[1];
      if (dx * dx + dy * dy > (0.8 * (sb - sa)) ** 2) break;
    }
    const h = deckZ(x, y, dx, dy) ?? gz(x, y), [ix, iy] = toImg(x, y, h);
    return { x, y, z: h, ix, iy, dx, dy, dirSign: 1 };   // z: autobus, tramvaj a vlak na mostě ve výšce mostovky
  }
  // fronta na konečné: trasa, po které vozy linky na konečnou přijíždějí (spoj stejné linky, který končí v první zastávce tohoto spoje)
  const PRIJEZD = new Map();
  function prijezdSh(trip) {
    const z0 = trip[6][0], key = trip[0] + '|' + z0;
    if (PRIJEZD.has(key)) return PRIJEZD.get(key);
    let sh = null;
    for (const t of MHD.trips) { const z = t[6]; if (z[z.length - 2] === z0 && t[0] === trip[0]) { sh = MHD.shapes[t[1]]; break; } }
    if (!sh) for (const t of MHD.trips) { const z = t[6]; if (z[z.length - 2] === z0) { sh = MHD.shapes[t[1]]; break; } }
    PRIJEZD.set(key, sh); return sh;
  }

  function stepShuttle(b, dt, stopWait, endWait) {
    if (b.wait > 0) { b.wait -= dt; return; }
    const prev = b.s; b.s += b.v * dt * b.dir;
    for (const s of b.stopS) if ((prev - s) * (b.s - s) <= 0 && Math.abs(prev - s) > 0.01) { b.s = s; b.wait = stopWait; }
    if (b.s >= b.r.L || b.s <= 0) { b.dir *= -1; b.s = Math.max(0, Math.min(b.r.L, b.s)); b.wait = endWait; }
  }
  // lyžaři: v zimě sjíždějí sjezdovky (data shora dolů) obloučky, dole se objeví znovu nahoře
  const skiers = [], SKIC = ['#d8352a', '#2f6fd1', '#f2c230', '#2aa36b', '#e0629a', '#f07a24', '#1d1f24', '#7b4fc9'];
  onChunk.push((k, d) => {
    for (const pl of d.pistes || []) {
      const len = [0]; for (let i = 1; i < pl.length; i++) len.push(len[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
      const r = { w: pl, len, L: len[len.length - 1], k };
      if (r.L < 40) continue;
      const n = Math.max(1, Math.round(r.L / 80));
      for (let j = 0; j < n; j++) {
        const i = skiers.length + 1;
        skiers.push({ r, s: r.L * j / n + rnd(i) * 30, v: 5 + rnd(i + 1) * 5, amp: 3 + rnd(i + 2) * 9, wl: 22 + rnd(i + 3) * 30, ph: rnd(i + 4) * 6.3,
                      col: SKIC[i % SKIC.length], hat: SKIC[(i * 3 + 1) % SKIC.length] });
      }
    }
  });
  if (location.hostname === 'localhost') window.__izo = { trams, skiers, MHD, mhdActive, mhdPos, cars, roads, XC, busWait, ringFree: (g) => ringFree(g), get planes() { return PLANES; } };       // ladění v lokálním náhledu
  function drawSkier(q, sx, ox, oy) {
    const L = q.r.len; let i = 1; while (i < L.length - 1 && L[i] < q.s) i++;
    const a = q.r.w[i - 1], b = q.r.w[i], t = Math.max(0, Math.min(1, (q.s - L[i - 1]) / ((L[i] - L[i - 1]) || 1)));
    const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1, ph = q.s / q.wl * Math.PI * 2 + q.ph, off = Math.sin(ph) * q.amp;
    const x = a[0] + dx * t - dy / dl * off, y = a[1] + dy * t + dx / dl * off, h = gz(x, y);
    const p = toImg(x, y, h);
    if (occluded(p[0], p[1], depth(x, y, h))) return;
    for (const q of treeShapes(x, y, h, [p[0] - 1, p[1] - 9, p[0] + 1, p[1]]))
      if (q[0] === 1 ? ((p[0] - q[1][0]) / q[2]) ** 2 + ((p[1] - 4 - q[1][1]) / q[3]) ** 2 < 1 : p[1] - 4 > q[1][1] && p[1] - 4 < q[2][1] && Math.abs(p[0] - q[1][0]) < q[3] * (p[1] - 4 - q[1][1]) / (q[2][1] - q[1][1])) return;
    const top = toImg(x, y, h + 1.8), u = Math.max(1, Math.round((p[1] - top[1]) * sx / 8));
    const X = Math.round(ox + p[0] * sx), Y = Math.round(oy + p[1] * sx), lean = Math.cos(ph) > 0 ? 1 : -1;
    const R = (cx, cy, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X + cx * u, Y - cy * u, w * u, hh * u); };
    R(-3, 1, 6, 1, '#2a2c31');                         // lyže
    R(-1, 3, 2, 2, '#2a2c31');                         // nohy
    R(-1 + (lean > 0 ? 0 : -1), 6, 3, 3, q.col);       // bunda, předklon do oblouku
    R(lean > 0 ? 0 : -1, 7, 2, 1, '#e8c6a4');          // obličej
    R(lean > 0 ? 0 : -1, 8, 2, 1, q.hat);              // čepice
    R(lean > 0 ? 2 : -3, 4, 1, 3, '#9aa0a8');          // hůlka
  }
