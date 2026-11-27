  // ---------- policejní honička (ilustrace, ne skutečný zásah) ----------
  // Spouští ji ukazatel rychlosti (web/mapa_merice.js přes Izomapa.policie): auto projede kolem tabule nad limit a občas se za ním
  // na silnici objeví hlídka s majáky. Jede po stopě piráta (stejné odbočky, pruhy i krajnice) a dojede ho. Pak:
  //  - většinou (9 z 10) řidič zpomalí a zastaví u krajnice, vystoupí, policista k němu dojde, pokuta na místě, oba odjedou;
  //  - asi 1 z 10 ujede: zrychlí, předjíždí protisměrem, jede i na červenou a po chvíli dostane smyk a skončí mimo vozovku
  //    (výstražná světla, pára z motoru, řidič a policista u vozu). Bez výbuchu.
  // Auto piráta je běžné auto z `cars` (c.honi řídí rychlost, pruh a natočení), hlídka je auto typu police přidané do `cars`.
  // Vozy u krajnice mají `odst`, ostatní je objedou (leaderOf). Postavy kreslí honiKresliLidi stejným modelem jako chodce.
  const HONI = { akce: null, posledni: -1e9, odjizdi: [] }, HONI_PAUZA = 75, UJEDE = 0.1;
  const POLICIE_COL = '#d9dde1|#1f4ea3';
  const POLICISTA = { top: 'jacket', topC: '#d5ec34', topC2: '#1f2a44', bot: 'trousers', botC: '#1f2a44', hat: { t: 'cap', c: '#1f2a44' }, shoes: '#16181c' };
  const honiTed = () => performance.now() / 1000;
  const krajnice = (r) => (r.o ? (lanes2(r) ? 3.4 : 2.2) : 3.3);       // kam k okraji zajet (m vpravo od osy)
  const kmhPokuta = (nad) => (nad < 10 ? 1000 : nad < 20 ? 2500 : 5000);   // příkaz na místě: odhad podle zákona o silničním provozu

  function honickaStart(c, opts = {}) {
    if (HONI.akce || !c || c.honi || c.odst || !(c.t === 'car' || c.t === 'van')) return false;
    const now = honiTed();
    if (!opts.hned && now - HONI.posledni < HONI_PAUZA) return false;
    const r = roads[c.r], zpet = Math.min(120, c.dir > 0 ? c.s : r.L - c.s);
    if (zpet < 25) return false;                                           // auto právě vjelo na kus silnice: hlídka by se neměla kde objevit
    const p = { r: c.r, dir: c.dir, s: c.s - c.dir * zpet, t: 'police', T: VTYP.police, col: POLICIE_COL, f: 1, q: 0, pr: -1, ln: c.ln || 0 };
    const lo = c.lo ?? laneOff(r, c.ln || 0);
    const A = { c, p, faze: 'honi', t0: now, cas: now, vidi: 0, ujede: opts.ujede ?? Math.random() < UJEDE, kmh: opts.kmh || 0, limit: opts.limit || 50,
      stopa: [[c.r, p.s, c.dir, 0, lo], [c.r, c.s, c.dir, zpet, lo]], d: zpet, dp: 0, i: 0, lide: [], uhel: 0, smyk: 0, tNaraz: 6 + Math.random() * 8 };
    c.honi = { a: A }; p.honi = { a: A, v: 12, krok: krokHlidky }; p.v = 12;
    cars.push(p);
    HONI.akce = A; HONI.posledni = now;
    return true;
  }

  // stopa piráta: [silnice, s, směr, ujetá délka, pruh]
  function zapisStopu(A) {
    const c = A.c, S = A.stopa, last = S[S.length - 1], lo = c.lo ?? laneOff(roads[c.r], c.ln || 0);
    if (last[0] === c.r && last[2] === c.dir) {
      const ds = Math.abs(c.s - last[1]); if (ds < 0.4 && Math.abs(lo - last[4]) < 0.05) return;
      A.d += ds; S.push([c.r, c.s, c.dir, A.d, lo]);
    } else {
      const a = along(roads[last[0]], last[1]), b = along(roads[c.r], c.s), d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 40) { A.faze = 'konec'; return; }                             // auto se objevilo jinde (konec jednosměrky): honička končí
      A.d += d; S.push([c.r, c.s, c.dir, A.d, lo]);
    }
    if (A.i > 50) { S.splice(0, A.i - 2); A.i = 2; }
  }
  function naStope(A, d) {                                                 // [silnice, s, směr, pruh] ve vzdálenosti d po stopě
    const S = A.stopa; let i = A.i;
    while (i < S.length - 2 && S[i + 1][3] <= d) i++;
    A.i = i;
    const a = S[i], b = S[i + 1] || a, u = b[3] > a[3] ? Math.max(0, Math.min(1, (d - a[3]) / (b[3] - a[3]))) : 1;
    const lo = a[4] + (b[4] - a[4]) * u;
    if (a[0] === b[0] && a[2] === b[2]) return [a[0], a[1] + (b[1] - a[1]) * u, a[2], lo];
    return u < 0.5 ? [a[0], a[1], a[2], lo] : [b[0], b[1], b[2], lo];
  }
  const kSi = (v, cil, nahoru, dolu, dt) => v + Math.max(-dolu * dt, Math.min(nahoru * dt, cil - v));
  const posunPruh = (c, cil, rychle, dt) => { const lo = c.lo ?? cil; c.lo = lo + Math.sign(cil - lo) * Math.min(Math.abs(cil - lo), rychle * dt); };
  // bod vedle auta: s m dopředu, t m vlevo (kladné) od osy vozu, ve světě
  function vedleAuta(c, s, t) {
    const r = roads[c.r], o = along(r, c.s), L = Math.hypot(o.dx, o.dy) || 1, fx = o.dx / L * c.dir, fy = o.dy / L * c.dir, lo = c.lo ?? 1.6;
    const cx = o.x + fy * lo, cy = o.y - fx * lo;                         // střed vozu (pruh vpravo od osy)
    return [cx + fx * s - fy * t, cy + fy * s + fx * t];
  }

  // krok hlídky (volá stepCar): vede celou scénu, piráta i hlídku
  function krokHlidky(p, dt) {
    const A = p.honi.a, c = A.c, now = honiTed(), t = now - A.cas;
    if (A.faze === 'konec') { konecHonicky(A); return false; }
    zapisStopu(A); if (A.faze === 'konec') { konecHonicky(A); return false; }
    const r = roads[c.r], vc = c.hold ? 0 : (c.v ?? 0), mezera = A.d - A.dp;   // po stopě mezi středy vozů
    // --- pirát ---
    if (A.faze === 'honi') {
      if (mezera < 32) A.vidi += dt;
      if (A.vidi > 1.5) { A.faze = A.ujede ? 'ujizdi' : 'zastavuje'; A.cas = now; c.honi.v = vc; }
      if (now - A.t0 > 120) A.faze = 'konec';                               // nedojel ho
    } else if (A.faze === 'zastavuje') {
      c.honi.v = kSi(c.honi.v, 0, 0, 2.2, dt); posunPruh(c, krajnice(r), 0.9, dt);
      if (c.honi.v === 0 && Math.abs(c.lo - krajnice(r)) < 0.1) { A.faze = 'stoji'; A.cas = now; c.odst = true; }
    } else if (A.faze === 'ujizdi') {
      c.honi.ignor = true;
      const cilV = Math.min(roadSpeed(r) * 1.6, 25);
      c.honi.v = kSi(c.honi.v, cilV, 3, 6, dt);
      let pred = 1e9; try { pred = leaderOf(c, r, c.ln || 0)[0]; } catch {}
      const vlastni = laneOff(r, c.ln || 0), protismer = r.o ? (lanes2(r) ? laneOff(r, 1) : vlastni) : -1.6;
      posunPruh(c, pred < 28 ? protismer : vlastni, 3.2, dt);              // předjíždí protisměrem
      if (t > A.tNaraz && c.honi.v > 12) { A.faze = 'smyk'; A.cas = now; A.smer = Math.random() < 0.5 ? -1 : 1; }
    } else if (A.faze === 'smyk') {
      c.honi.v = kSi(c.honi.v, 0, 0, 8, dt); posunPruh(c, krajnice(r) + 1.6, 4, dt);
      A.uhel = A.smer * Math.min(0.75, t * 1.1);
      if (c.honi.v === 0) { A.faze = 'nehoda'; A.cas = now; c.odst = true; c.honi.ignor = false; }
    }
    // --- hlídka po stopě ---
    const stoji = A.faze === 'stoji' || A.faze === 'nehoda' || A.faze === 'zastavuje' || A.faze === 'smyk';
    const odstup = stoji ? (A.faze === 'nehoda' || A.faze === 'smyk' ? 12 : 9) : 14;
    let v = vc + Math.max(-6, Math.min(A.faze === 'honi' ? 15 : 9, (mezera - odstup) * 0.7));
    if (mezera <= odstup + 0.3 && vc < 0.3) v = 0;
    p.honi.v = p.v = kSi(p.honi.v, Math.max(0, Math.min(v, 32)), 4.5, stoji ? 10 : 7, dt);
    const nejbliz = A.faze === 'smyk' || A.faze === 'nehoda' ? 11 : stoji ? 8 : 5.5;   // za vrakem s odstupem, jinak nikdy do piráta
    A.dp = Math.min(A.d - nejbliz, A.dp + p.v * dt);
    if (A.dp >= A.d - nejbliz - 0.05 && stoji) p.honi.v = p.v = Math.min(p.v, vc);
    const [ri, s, dir, lo] = naStope(A, A.dp); p.r = ri; p.s = s; p.dir = dir; p.lo = Math.min(lo, krajnice(roads[ri]));   // hlídka mimo vozovku nezajede
    p.odst = stoji && p.v === 0;
    // --- lidé: policista dojde k řidiči, řidič vystoupí, pokuta, oba zpátky ---
    if (A.faze === 'stoji' || A.faze === 'nehoda') scenaLidi(A, p, t, dt);
    if (A.faze === 'stoji' && t > 34) odjezd(A);
    if (A.faze === 'nehoda' && t > 75) A.faze = 'konec';
    return true;
  }
  function scenaLidi(A, p, t, dt) {
    const c = A.c, L = A.lide;
    if (!A.polVen && t > 2) {
      A.polVen = true;
      const [x, y] = vedleAuta(p, 0.6, 1.4);                                // policista vystoupí z hlídky na straně řidiče
      L.push({ k: 'policista', x, y, outfit: POLICISTA, cil: null, chuze: 0 });
    }
    const pol = L.find((q) => q.k === 'policista');
    if (pol) {
      const zpet = A.faze === 'stoji' ? t > 26 : t > 68;
      pol.cil = zpet ? vedleAuta(p, 0.6, 1.4) : vedleAuta(c, A.faze === 'nehoda' ? 0.3 : -0.2, A.faze === 'nehoda' ? 3.6 : 2.2);
      if (zpet && Math.hypot(pol.x - pol.cil[0], pol.y - pol.cil[1]) < 0.2) L.splice(L.indexOf(pol), 1);
    }
    if (!A.ridVen && t > (A.faze === 'nehoda' ? 3 : 5)) {
      A.ridVen = true;
      const [x, y] = vedleAuta(c, 0.5, 1.3);
      L.push({ k: 'ridic', x, y, oi: (A.t0 * 1000) % 997 | 0, cil: vedleAuta(c, 0.3, A.faze === 'nehoda' ? 2.6 : 1.5), chuze: 0 });
    }
    const rid = L.find((q) => q.k === 'ridic');
    if (rid && t > (A.faze === 'stoji' ? 24 : 70)) { rid.cil = vedleAuta(c, 0.5, 1.3); if (Math.hypot(rid.x - rid.cil[0], rid.y - rid.cil[1]) < 0.2) L.splice(L.indexOf(rid), 1); }
    for (const q of L) {
      if (!q.cil) continue;
      const dx = q.cil[0] - q.x, dy = q.cil[1] - q.y, d = Math.hypot(dx, dy), st = Math.min(d, 1.3 * dt);
      if (d > 0.05) { q.x += dx / d * st; q.y += dy / d * st; q.chuze += st; q.dx = dx; q.dy = dy; } else q.chuze = 0;
      q.jde = d > 0.05;
    }
    // pokuta: bublina, když policista stojí u řidiče
    A.bublina = A.faze === 'stoji' && pol && rid && !pol.jde && t > 8 && t < 24 ? `Pokuta ${kmhPokuta(Math.max(0, A.kmh - A.limit)).toLocaleString('cs-CZ')} Kč` : null;
  }
  function odjezd(A) {                                                      // pokuta vyřízená: pirát odjede, hlídka chvíli po něm
    const c = A.c, p = A.p;
    if (A.lide.length) return;
    if (c.honi) { delete c.honi; c.odst = false; c.lo = undefined; c.v = 0; A.cas2 = honiTed(); return; }
    if (honiTed() - A.cas2 > 4) { A.faze = 'konec'; konecHonicky(A); }
  }
  function konecHonicky(A) {
    const c = A.c, p = A.p;
    if (p.honi) {                                                          // hlídka se stane běžným autem, majáky zhasnou; po chvíli zmizí mimo obraz
      delete p.honi; p.odst = false; p.lo = undefined; p.v = 0; p.konec = honiTed(); HONI.odjizdi.push(p);
    }
    if (c.honi && A.uhel) { A.faze = 'konec_nehody'; A.lide.length = 0; A.bublina = null; return; }   // vrak počká, až nebude vidět (honiUklid)
    if (c.honi) { delete c.honi; c.odst = false; c.lo = undefined; c.v = undefined; }
    if (!c.honi) A.lide.length = 0;
    if (HONI.akce === A && !c.honi) HONI.akce = null;
  }
  // úklid: vrak po nehodě (až není vidět) přesunout jinam, hlídku po odjezdu odebrat, až není vidět
  function honiUklid(now) {
    const A = HONI.akce;
    if (A && A.faze === 'konec_nehody') {
      const c = A.c;
      if (now - (c.videt || 0) > 1.5 || now - A.cas > 300) {
        let i = c.r; for (let k = 0; k < 20; k++) { i = Math.floor(Math.random() * roads.length); if (roads[i].c !== 'service' && !roads[i].uz) break; }
        delete c.honi; c.odst = false; c.lo = undefined; c.v = undefined; c.r = i; c.dir = roads[i].o || 1; c.s = c.dir > 0 ? 0 : roads[i].L; c.pr = -1; c.nx = null;
        A.lide.length = 0; HONI.akce = null;
      }
    }
    for (let k = HONI.odjizdi.length - 1; k >= 0; k--) {
      const p = HONI.odjizdi[k];
      if (now - p.konec > 40 && now - (p.videt || 0) > 1.5) { const i = cars.indexOf(p); if (i >= 0) cars.splice(i, 1); HONI.odjizdi.splice(k, 1); }
    }
  }

  // ---------- kreslení: natočení vozu ve smyku, majáky, výstražná světla, pára, postavy a bublina s pokutou ----------
  function honiPoza(c, o) {
    const A = c.honi?.a; if (!A || A.c !== c || !A.uhel) return;
    const ca = Math.cos(A.uhel), sa = Math.sin(A.uhel); [o.dx, o.dy] = [o.dx * ca - o.dy * sa, o.dx * sa + o.dy * ca];
  }
  function honiBodAuta(o, len, wid) {                                       // jako drawVehicle: bod (s dopředu, t vlevo, h) na obrazovce
    const L = Math.hypot(o.dx, o.dy) || 1, fx = o.dx / L * (o.dirSign || 1), fy = o.dy / L * (o.dirSign || 1), sxv = -fy, syv = fx;
    const lane = o.lane ?? 1.6, cx = o.x - sxv * lane, cy = o.y - syv * lane, h0 = o.z ?? gz(cx, cy);
    return (s, t, h) => toImg(cx + fx * s + sxv * t, cy + fy * s + syv * t, h0 + h);
  }
  function honiKresli(c, o, sx, ox, oy, night, t) {
    const A = c.honi?.a, now = honiTed(); c.videt = now;
    if (!A) return;
    const P = honiBodAuta(o, c.T.len, c.T.wid), S = (p) => [ox + p[0] * sx, oy + p[1] * sx], u = Math.max(1, sx * 1.4);
    if (c === A.p) {                                                       // majáky: modré, střídavě dvojzáblesk
      for (const [sd, ph] of [[-1, 0], [1, 0.5]]) {
        const f = (t * 1.6 + ph) % 1; if (!(f < 0.12 || (f > 0.2 && f < 0.32))) continue;
        const [X, Y] = S(P(-0.1, sd * 0.45, 1.58));
        ctx.fillStyle = 'rgba(70,130,255,' + (night > 0.3 ? 0.35 : 0.22) + ')'; ctx.beginPath(); ctx.arc(X, Y, (night > 0.3 ? 14 : 7) * u, 0, 7); ctx.fill();
        ctx.fillStyle = '#9cc4ff'; ctx.fillRect(Math.round(X - u), Math.round(Y - u), Math.ceil(2 * u), Math.ceil(2 * u));
      }
      return;
    }
    if (A.faze === 'stoji' || A.faze === 'nehoda' || A.faze === 'konec_nehody' || A.faze === 'zastavuje' && c.honi.v < 3) {   // výstražná světla
      if (Math.floor(t * 1.5) % 2 === 0) for (const s of [-1, 1]) for (const w of [-1, 1]) {
        const [X, Y] = S(P(s * c.T.len / 2 * 0.97, w * c.T.wid / 2 * 0.8, 0.72));
        ctx.fillStyle = 'rgba(255,160,20,0.3)'; ctx.beginPath(); ctx.arc(X, Y, 3.5 * u, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffb02a'; ctx.fillRect(Math.round(X - u / 2), Math.round(Y - u / 2), Math.ceil(u), Math.ceil(u));
      }
    }
    if (A.faze === 'smyk' || A.faze === 'nehoda' || A.faze === 'konec_nehody') {
      const tt = now - A.cas;
      if (A.faze !== 'smyk' && tt < 2.5) for (let k = 0; k < 10; k++) {   // prach z krajnice po nárazu
        const r1 = rnd(k * 3 + 1), r2 = rnd(k * 5 + 2), q = tt / 2.5, [X, Y] = S(P(c.T.len / 2 + r1 * 2, (r2 - 0.5) * 4, 0.3 + q * 1.5 * r1));
        ctx.fillStyle = `rgba(170,160,140,${0.5 * (1 - q)})`; ctx.fillRect(X - 2 * u * (1 + q * 2), Y - 2 * u, 4 * u * (1 + q * 2), 3 * u);
      }
      if (A.faze !== 'smyk') for (let k = 0; k < 6; k++) {                 // pára z rozbité chladiče
        const f = (t * 0.6 + k / 6) % 1, [X, Y] = S(P(c.T.len / 2 - 0.4, (rnd(k + 9) - 0.5) * 0.8, 0.9 + f * 3));
        ctx.fillStyle = `rgba(235,236,238,${0.45 * (1 - f)})`; ctx.fillRect(X - (1 + f * 3) * u, Y - u, (2 + f * 6) * u, 2 * u);
      }
    }
  }
  function honiKresliLidi(sx, ox, oy, vis, night, t) {
    const A = HONI.akce; if (!A || !A.lide.length) return;
    const v = { sx, ox, oy, vis, night };
    for (const q of [...A.lide].sort((a, b) => toImg(a.x, a.y, 0)[1] - toImg(b.x, b.y, 0)[1])) {
      const dx = q.dx || 0, dy = q.dy || 0, scr = toImg(q.x + dx, q.y + dy, 0), z = toImg(q.x, q.y, 0);
      const mir = scr[0] < z[0], back = scr[1] < z[1];                      // směr chůze na obrazovce
      postavaApi(v, q.x, q.y, { outfit: q.outfit, oi: q.oi, mir, back, frame: q.jde ? Math.floor(q.chuze * 2.2) % 4 : 0 });
    }
    if (A.bublina && sx > 0.4) {                                            // bublina nad řidičem
      const rid = A.lide.find((q) => q.k === 'ridic'); if (!rid) return;
      const p = toImg(rid.x, rid.y, gz(rid.x, rid.y) + 2.6), X = Math.round(ox + p[0] * sx), Y = Math.round(oy + p[1] * sx);
      ctx.font = '600 11px system-ui, sans-serif'; const w = Math.ceil(ctx.measureText(A.bublina).width) + 12;
      ctx.fillStyle = 'rgba(20,22,28,.85)'; ctx.fillRect(X - w / 2, Y - 20, w, 17); ctx.fillRect(X - 3, Y - 3, 6, 3);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(A.bublina, X, Y - 11.5); ctx.textAlign = 'start';
    }
  }
