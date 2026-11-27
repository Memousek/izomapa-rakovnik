  // ---------- zásahy hasičů (mesto.json "hasici", prostředník functions/api/hasici.js) ----------
  // Skutečné zásahy jednotek PO z krajského portálu krizového řízení (vkládá je se zpožděním a uvádí jen obec, druh, stav
  // a stupeň poplachu). Seznam okresu je v záložce Dnes. Probíhající zásah v obci, která je v mapě, má značku na silnici
  // u popisku obce a k ní jede cisterna ze stanice HZS ("stanice": [lat, lon]); po skončení zásahu se vrátí na stanici.
  // Místo uvnitř obce a jízda vozu jsou ilustrace, karta to říká. Zásah, který už probíhal při otevření mapy, má vůz rovnou na místě.
  const HZS = { cfg: {{HASICI}}, zasahy: [], vozy: new Map(), off: false, tNet: -1e9, tTick: 0, znacky: [], pocatecni: null };   // pocatecni: zásahy z prvního stažení (vůz už stojí na místě)
  const HZS_NOVY = 20 * 60e3;                                  // zásah ohlášený před méně než 20 min: cisterna teprve vyjíždí ze stanice
  const HZS_IKONA = { 'požár': 'pozar', 'dopravní nehoda': 'nehoda', 'technická pomoc': 'technicka', 'únik nebezpečných látek': 'unik', 'záchrana osob a zvířat': 'zachrana' };
  if (HZS.cfg) $('l-hasici-w').hidden = false;
  const hzsObec = (nazev) => DISTRICTS.find((d) => d.k !== 'cast' && d.name.toLowerCase() === String(nazev).toLowerCase());
  const hzsCas = (iso) => { const d = new Date(iso); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const hzsJmeno = (z) => z.druh.charAt(0).toUpperCase() + z.druh.slice(1);

  // nejbližší kus silnice k bodu ve světě (jen načtené čtverce, bez účelových komunikací): {r, s, d}
  function hzsSilnice(x, y, maxD = 150) {
    let best = null, bd = maxD;
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i]; if (r.c === 'service' || r.uz) continue;
      const prirazka = r.c === 'living_street' || r.c === 'unclassified' || r.L < 25 ? 60 : r.c === 'residential' ? 15 : 0;   // radši průjezdná ulice než ulička
      for (let k = 1; k < r.w.length; k++) {
        const [ax, ay] = r.w[k - 1], [bx, by] = r.w[k], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)), d = Math.hypot(ax + ex * t - x, ay + ey * t - y);
        if (d + prirazka < bd) { bd = d + prirazka; best = { r: i, s: r.len[k - 1] + (r.len[k] - r.len[k - 1]) * t, d }; }
      }
    }
    return best;
  }
  // trasa po silnicích (Dijkstra přes konce kusů, stejná pravidla jako exitOpts): z místa {r, s} na místo cil {r, s}
  // vrací {dir, cesta: [[silnice, směr], …]} nebo null (cíl mimo načtené čtverce); jenSmer = vůz za jízdy se neotáčí
  function hzsTrasa(od, cil, jenSmer) {
    const R0 = roads[od.r], smery = jenSmer ? [jenSmer] : [1, -1];
    if (od.r === cil.r && smery.includes(cil.s >= od.s ? 1 : -1) && (!R0.o || R0.o === (cil.s >= od.s ? 1 : -1))) return { dir: cil.s >= od.s ? 1 : -1, cesta: [] };
    const dist = new Map(), prev = new Map(), fronta = [];
    const push = (key, d, p) => { if (d < (dist.get(key) ?? Infinity)) { dist.set(key, d); prev.set(key, p); fronta.push([d, key]); } };
    for (const dir of smery) if (!R0.o || R0.o === dir) push(ek(dir > 0 ? R0.w[R0.w.length - 1] : R0.w[0]), dir > 0 ? R0.L - od.s : od.s, { start: dir });
    let konec = null, kd = Infinity, n = 0;
    while (fronta.length && n++ < 40000) {
      let bi = 0; for (let i = 1; i < fronta.length; i++) if (fronta[i][0] < fronta[bi][0]) bi = i;
      const [d, key] = fronta.splice(bi, 1)[0];
      if (d > (dist.get(key) ?? Infinity) || d >= kd) continue;
      for (const [i, dir] of ends.get(key) || []) {
        const q = roads[i];
        if (q.c === 'service' || q.uz || (q.o && q.o !== dir)) continue;
        if (i === cil.r) { const dc = d + (dir > 0 ? cil.s : q.L - cil.s); if (dc < kd) { kd = dc; konec = { key, i, dir }; } continue; }
        const dal = ek(dir > 0 ? q.w[q.w.length - 1] : q.w[0]);
        if (dal !== key) push(dal, d + q.L, { key, i, dir });
      }
    }
    if (!konec) return null;
    const cesta = [[konec.i, konec.dir]];
    let p = prev.get(konec.key);
    for (let k = 0; p && p.start === undefined && k < 5000; k++) { cesta.unshift([p.i, p.dir]); p = prev.get(p.key); }
    if (!p || p.start === undefined) return null;
    return { dir: p.start, cesta };
  }
  // nový vůz: ze stanice (jede) nebo rovnou na místě (stojí)
  function hzsVyjed(z, cil, zeStanice) {
    let start = cil, plan = null;
    if (zeStanice && HZS.cfg.stanice) {
      const [la, lo] = HZS.cfg.stanice, st = hzsSilnice((lo - cam.lon0) * cam.kx, (la - cam.lat0) * cam.ky, 120);
      if (st) { plan = hzsTrasa(st, cil); if (plan) start = st; }
    }
    const c = { r: start.r, dir: plan ? plan.dir : 1, s: start.s, t: 'hasici', T: VTYP.hasici, col: '#c8201e|#eef0f2', f: 1.2, q: -1, pr: -1, ln: 0,
      hzs: { z, cil, cesta: plan ? plan.cesta : null, faze: plan ? 'jede' : 'stoji', lastR: start.r, t0: performance.now() } };
    if (!plan) { c.v = 0; c.odst = true; c.lo = hzsKrajnice(roads[c.r]); }
    cars.push(c); HZS.vozy.set(z.id, c);
  }
  const hzsKrajnice = (r) => (r.o ? 2.4 : 3.2);
  // krok cisterny (volá stepCar před běžným pohybem): true = auto se tento krok nehýbe
  function hzsKrok(c, dt) {
    const h = c.hzs, r = roads[c.r];
    if (h.faze === 'stoji') { c.v = 0; c.odst = true; const cl = hzsKrajnice(r); c.lo = (c.lo ?? cl) + Math.sign(cl - (c.lo ?? cl)) * Math.min(Math.abs(cl - (c.lo ?? cl)), 0.8 * dt); return true; }
    if (c.r !== h.lastR) {                                      // vjel na další kus: odškrtnout ho z trasy, jinak naplánovat znovu
      if (h.cesta && h.cesta[0] && h.cesta[0][0] === c.r) h.cesta.shift();
      else { const p = hzsTrasa({ r: c.r, s: c.s }, h.cil, c.dir); h.cesta = p ? p.cesta : []; }   // bez trasy jede dál a zkusí to na dalším kusu
      h.lastR = c.r;
    }
    if (c.r === h.cil.r && c.dir * (h.cil.s - c.s) <= 0.5) {   // dojel na místo: zastavit u krajnice
      if (h.faze === 'zpet') { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); HZS.vozy.delete(h.z.id); return true; }
      h.faze = 'stoji'; c.s = Math.max(0, Math.min(r.L, h.cil.s)); return true;
    }
    return false;
  }
  // po skončení zásahu zpátky na stanici (bez trasy: zmizí, až nebude vidět)
  function hzsZpet(c) {
    const h = c.hzs, [la, lo] = HZS.cfg.stanice || [0, 0], st = HZS.cfg.stanice && hzsSilnice((lo - cam.lon0) * cam.kx, (la - cam.lat0) * cam.ky, 120);
    const plan = st && hzsTrasa({ r: c.r, s: c.s }, st);
    c.odst = false; c.lo = undefined;
    if (!plan) { h.faze = 'pryc'; return; }
    c.dir = plan.dir; h.cesta = plan.cesta; h.cil = st; h.faze = 'zpet'; h.lastR = c.r;
  }
  async function hzsNacti() {
    try {
      const r = await fetch('api/hasici', { signal: AbortSignal.timeout(10000) });
      if (r.status === 404) { HZS.off = true; return; }            // bez prostředníka (jiný hosting, náhled) se dál neptat
      const d = r.ok ? await r.json() : null;
      if (d && Array.isArray(d.zasahy)) {
        HZS.zasahy = d.zasahy; HZS.tTick = 0;
        if (!HZS.pocatecni) HZS.pocatecni = new Set(d.zasahy.filter((z) => z.stav === 'probiha').map((z) => z.id));
        hzsSeznam();
      }
    } catch (e) { console.warn('zásahy hasičů', e); }   // síť: zkusit příště
  }
  // seznam v záložce Dnes: probíhající nahoře, ukončené za posledních 24 h
  function hzsSeznam() {
    const ted = Date.now(), vid = HZS.zasahy.filter((z) => z.stav === 'probiha' || ted - Date.parse(z.cas) < 24 * 3600e3)
      .sort((a, b) => (a.stav !== 'probiha') - (b.stav !== 'probiha') || b.cas.localeCompare(a.cas));
    const ul = $('hzsList'); ul.replaceChildren();
    $('hzsBox').hidden = !vid.length;
    const bezi = vid.filter((z) => z.stav === 'probiha').length;
    $('hzsVal').textContent = bezi ? `${bezi} právě` : String(vid.length);
    $('hasici-n').textContent = bezi ? `(${bezi})` : '';
    $('hzsZdroj').replaceChildren('Zdroj: ', Object.assign(document.createElement('a'), { href: HZS.cfg.url, target: '_blank', rel: 'noopener', textContent: HZS.cfg.zdroj || 'HZS' }), ', vkládá se zpožděním, jen obec.');
    for (const z of vid) {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      const ico = document.createElement('span'); ico.className = 'hzs-ico ' + (HZS_IKONA[z.druh] || 'jine') + (z.stav === 'probiha' ? ' bezi' : ''); ico.setAttribute('aria-hidden', 'true');
      const nm = document.createElement('span'); nm.textContent = `${hzsJmeno(z)}, ${z.obec}`;
      const sm = document.createElement('small'); sm.textContent = (z.stav === 'probiha' ? 'Probíhá' : 'Ukončený') + (z.podtyp ? `, ${z.podtyp}` : '') + `, ${hzsCas(z.cas)}` + (hzsObec(z.obec) ? '' : ', mimo mapu');
      b.append(ico, nm, sm); b.addEventListener('click', () => hzsUkaz(z));
      li.appendChild(b); ul.appendChild(li);
    }
  }
  function hzsKarta(z) {
    const ob = hzsObec(z.obec), c = HZS.vozy.get(z.id);
    let lon, lat;
    if (ob) { const [wx, wy] = imgToWorld(ob.xy[0], ob.xy[1]); [lon, lat] = lonlat(wx, wy); }
    showCard({ title: `${hzsJmeno(z)}: ${z.obec}`, text: z.podtyp ? z.podtyp.charAt(0).toUpperCase() + z.podtyp.slice(1) : '', lon, lat,
      rows: [['Stav', z.stav === 'probiha' ? 'probíhá zásah' : 'ukončený'], ['Stupeň poplachu', z.stupen], ['Poslední změna', hzsCas(z.cas)], ['Zdroj', HZS.cfg.zdroj || 'HZS'],
        ['Na mapě', c ? 'ilustrace: zdroj uvádí jen obec, vůz stojí na silnici u jejího středu a jede ze stanice HZS' : ob ? 'zdroj uvádí jen obec' : 'obec je mimo mapu']],
      link: HZS.cfg.url, linkText: 'Seznam zásahů u zdroje ↗', target: '_blank' });
  }
  function hzsUkaz(z) {
    const c = HZS.vozy.get(z.id), ob = hzsObec(z.obec);
    if (c) { const o = along(roads[c.r], c.s); goTo(o.ix, o.iy, 0.8); }
    else if (ob) goTo(ob.xy[0], ob.xy[1], 1.6);
    hzsKarta(z);
  }
  // jednou za pár sekund: stáhnout (po 2 min), k probíhajícím zásahům v mapě vyslat vůz, ukončeným ho poslat zpět
  function hzsTik(now) {
    if (!HZS.cfg) return;
    if (!HZS.off && (!document.hidden || HZS.tNet < 0) && now - HZS.tNet > 120e3) { HZS.tNet = now; hzsNacti(); }   // poprvé vždy, pak jen viditelná stránka
    if (now - HZS.tTick < 3000) return;
    HZS.tTick = now;
    const bezi = new Map(HZS.zasahy.filter((z) => z.stav === 'probiha').map((z) => [z.id, z]));
    for (const [id, c] of HZS.vozy) {
      if (bezi.has(id)) { c.hzs.z = bezi.get(id); continue; }
      if (c.hzs.faze === 'stoji' || c.hzs.faze === 'jede') hzsZpet(c);
      if (c.hzs.faze === 'pryc' && performance.now() / 1000 - (c.videt || 0) > 2) { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); HZS.vozy.delete(id); }
    }
    for (const z of bezi.values()) {
      if (HZS.vozy.has(z.id) || !$('l-hasici').checked) continue;
      const ob = hzsObec(z.obec); if (!ob) continue;
      const [wx, wy] = imgToWorld(ob.xy[0], ob.xy[1]), cil = hzsSilnice(wx, wy, 250);
      if (!cil) continue;                                       // čtverec obce ještě není načtený: zkusit při dalším tiku
      hzsVyjed(z, cil, !HZS.pocatecni?.has(z.id) && Date.now() - Date.parse(z.cas) < HZS_NOVY);   // nově ohlášený: jede ze stanice
    }
  }
  // značky probíhajících zásahů nad vozem (nebo u popisku obce, dokud vůz nedojel) a majáky
  function hzsKresli(sx, ox, oy, cw, ch, now) {
    hzsTik(now);
    HZS.znacky.length = 0;
    if (!HZS.cfg || !$('l-hasici').checked) return;
    for (const z of HZS.zasahy) {
      if (z.stav !== 'probiha') continue;
      const ob = hzsObec(z.obec); if (!ob) continue;
      const c = HZS.vozy.get(z.id);
      let ix = ob.xy[0], iy = ob.xy[1] - 40;
      if (c && c.hzs.faze === 'stoji') { const o = along(roads[c.r], c.s); ix = o.ix; iy = o.iy - 22; }
      else if (c) { const r = roads[c.hzs.cil.r], o = along(r, c.hzs.cil.s); ix = o.ix; iy = o.iy - 22; }
      const X = ox + ix * sx, Y = oy + iy * sx;
      if (X < -30 || Y < -40 || X > cw + 30 || Y > ch + 30) continue;
      const rr = Math.max(7, Math.min(13, 26 * sx)), f = (now / 1400) % 1;
      if (c && c.hzs.faze === 'stoji' && (z.druh === 'požár' || (z.druh === 'únik nebezpečných látek' && /ovzduší/.test(z.podtyp)))) hzsKour(z, X, Y + 22 * sx, sx, now);
      ctx.beginPath(); ctx.arc(X, Y, rr * (1 + f * 1.4), 0, 6.2832); ctx.strokeStyle = `rgba(232,52,40,${0.6 * (1 - f)})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3a3d42'; ctx.fillRect(Math.round(X - 1), Math.round(Y + rr * 0.6), 2, Math.round(rr * 1.4));
      ctx.beginPath(); ctx.arc(X, Y, rr, 0, 6.2832); ctx.fillStyle = '#d62a1f'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(20,24,32,.7)'; ctx.stroke();
      hzsPiktogram(HZS_IKONA[z.druh] || 'jine', X, Y, rr * 0.62);
      HZS.znacky.push([X, Y, rr + 4, z]);
    }
  }
  // kouř nad místem zásahu (jen u stojícího vozu): požár šedočerný, únik do ovzduší nažloutlý; ilustrace, ne poloha ohně
  function hzsKour(z, X, Y, sx, now) {
    const pozar = z.druh === 'požár', u = Math.max(0.6, sx * 2.2), n = 14;
    for (let k = 0; k < n; k++) {
      const f = ((now / 5200) + k / n) % 1, kol = Math.sin(k * 12.9898) * 0.5;
      const px = X + (f * 34 + kol * 10) * u, py = Y - (6 + f * 70) * u, rr = (4 + f * 16) * u;
      ctx.fillStyle = pozar ? `rgba(${70 + f * 70},${68 + f * 70},${66 + f * 72},${0.55 * (1 - f)})` : `rgba(214,206,${120 + f * 60},${0.45 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.2832); ctx.fill();
    }
  }
  function hzsPiktogram(druh, x, y, r) {                      // bílý piktogram v kolečku značky
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, r * 0.32); ctx.lineCap = 'round';
    ctx.beginPath();
    if (druh === 'pozar') { ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 0.95, y - r * 0.1, x + r * 0.55, y + r * 0.7); ctx.quadraticCurveTo(x, y + r * 1.05, x - r * 0.55, y + r * 0.7); ctx.quadraticCurveTo(x - r * 0.8, y, x - r * 0.15, y - r * 0.35); ctx.quadraticCurveTo(x - r * 0.05, y - r * 0.6, x, y - r); ctx.fill(); }
    else if (druh === 'unik') { ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 0.85, y + r * 0.1, x + r * 0.55, y + r * 0.55); ctx.arc(x, y + r * 0.3, r * 0.62, 0.3, Math.PI - 0.3); ctx.quadraticCurveTo(x - r * 0.85, y + r * 0.1, x, y - r); ctx.fill(); }
    else if (druh === 'nehoda') { ctx.fillRect(x - r * 0.85, y - r * 0.15, r * 1.7, r * 0.6); ctx.fillRect(x - r * 0.5, y - r * 0.6, r, r * 0.5); ctx.fillStyle = '#d62a1f'; ctx.fillRect(x - r * 0.6, y + r * 0.35, r * 0.35, r * 0.3); ctx.fillRect(x + r * 0.25, y + r * 0.35, r * 0.35, r * 0.3); }
    else if (druh === 'zachrana') { ctx.fillRect(x - r * 0.25, y - r * 0.8, r * 0.5, r * 1.6); ctx.fillRect(x - r * 0.8, y - r * 0.25, r * 1.6, r * 0.5); }
    else if (druh === 'technicka') { ctx.moveTo(x - r * 0.7, y + r * 0.7); ctx.lineTo(x + r * 0.35, y - r * 0.35); ctx.stroke(); ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.45, r * 0.42, 0, 6.2832); ctx.stroke(); }
    else { ctx.fillRect(x - r * 0.15, y - r * 0.8, r * 0.3, r * 1.05); ctx.fillRect(x - r * 0.15, y + r * 0.45, r * 0.3, r * 0.3); }
  }
  const hzsAt = (px, py) => HZS.znacky.find(([X, Y, rr]) => Math.hypot(X - px, Y - py) < rr)?.[3] || null;
  // modré majáky na kabině (při jízdě i na místě), v noci se září
  function hzsMajaky(c, o, sx, ox, oy, night, t) {
    c.videt = performance.now() / 1000;
    if (c.hzs.faze === 'zpet' || c.hzs.faze === 'pryc') return;       // zpátky na stanici bez majáků
    const P = honiBodAuta(o, c.T.len, c.T.wid), u = Math.max(1, sx * 1.4);
    for (const [sd, ph] of [[-1, 0], [1, 0.5]]) {
      const fz = (t * 1.8 + ph) % 1; if (!(fz < 0.12 || (fz > 0.2 && fz < 0.32))) continue;
      const p = P(c.T.len / 2 - 0.85, sd * 0.7, 3.25), X = ox + p[0] * sx, Y = oy + p[1] * sx;
      ctx.fillStyle = 'rgba(70,130,255,' + (night > 0.3 ? 0.38 : 0.24) + ')'; ctx.beginPath(); ctx.arc(X, Y, (night > 0.3 ? 16 : 8) * u, 0, 7); ctx.fill();
      ctx.fillStyle = '#9cc4ff'; ctx.fillRect(Math.round(X - u), Math.round(Y - u), Math.ceil(2 * u), Math.ceil(2 * u));
    }
  }
