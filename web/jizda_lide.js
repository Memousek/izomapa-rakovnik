// Chodci pro režim jízdy: nízkopolygonové postavy (InstancedMesh po částech těla), chůze po chodnících kolem silnic
// a po stezkách z OSM (chodci.json), občasné přecházení silnice, lidé na zastávkách, uhýbání před autem hráče.
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y); rotation.y = h (lokální +x míří po směru).
export function vytvorLidi(THREE, scene, api) {
  const MAX = 150, CIL = 48, DOSAH = 250, ZAHOD = 285, MIN_SPAWN = 55;
  const TRIDY = new Set(['residential', 'living_street', 'tertiary', 'secondary', 'primary', 'unclassified']);
  const BOK = { residential: 4.5, living_street: 4.5, unclassified: 4.5, tertiary: 5.5, secondary: 6.5, primary: 6.5 };

  // ---------- barvy ----------
  const KOZE = [0xf1c9a5, 0xe0ac86, 0xc98e66, 0x9c6a48, 0x6f4a32];
  const VLASY = [0x1c1410, 0x3a2616, 0x6b4a2a, 0xa5793a, 0xd2b36a, 0x8a8a8a, 0x5a2a1a];
  const TRIKA = [0xc83a3a, 0x2f5fa8, 0x3c8a4c, 0xe0b13a, 0xf0f0f0, 0x1f1f24, 0x8a4aa0, 0xe07a2a, 0x4aa8b0, 0x7a7a82, 0xd86a8a, 0x5a6a3a];
  const KALHOTY = [0x23314f, 0x1f1f24, 0x4a4a52, 0x6a5a3a, 0x2a3f6a, 0x8a8a92, 0x3a2f28];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // pouliční režim: typ 0 běžný chodec, 1 výtržník (tepláky), 2 opilec, 3 policista, 4 naštvaný řidič
  const VZHLED = {
    1: { trika: [0x1a1a1e, 0x23314f, 0x2a2a2e], kalh: [0x1a1a1e, 0x2a2a2e], vlasy: [0x111111, 0x2a2a2a] },
    2: { trika: [0x6a5a3a, 0x5a4a3a, 0x4a4f3a], kalh: [0x4a4a52, 0x3a2f28], vlasy: [0x8a8a8a, 0x5a4a3a] },
    3: { trika: [0x1d2c4f], kalh: [0x1d2c4f], vlasy: [0x14203a] },
  };
  const HP = { 0: 2, 1: 3, 2: 2, 3: 4, 4: 3 };
  const boj = () => api.boj && api.boj.on;

  // ---------- instancované části těla ----------
  const telesa = [];
  const box = (hore) => { const g = new THREE.BoxGeometry(1, 1, 1); if (hore) g.translate(0, -0.5, 0); return g; };
  function cast(hore) {
    const m = new THREE.InstancedMesh(box(hore), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(0xffffff));            // vytvoří instanceColor ještě před prvním vykreslením
    m.count = 0; m.frustumCulled = false; m.castShadow = false;
    scene.add(m); telesa.push(m); return m;
  }
  const mNohaA = cast(true), mNohaB = cast(true), mRukaA = cast(true), mRukaB = cast(true), mTorzo = cast(false), mHlava = cast(false), mVlasy = cast(false);
  const barva = new THREE.Color();
  const barvy = (i, p) => {
    barva.setHex(p.cTrika); mTorzo.setColorAt(i, barva); mRukaA.setColorAt(i, barva); mRukaB.setColorAt(i, barva);
    barva.setHex(p.cKalh); mNohaA.setColorAt(i, barva); mNohaB.setColorAt(i, barva);
    barva.setHex(p.cKoze); mHlava.setColorAt(i, barva);
    barva.setHex(p.cVlasy); mVlasy.setColorAt(i, barva);
    for (const m of telesa) m.instanceColor.needsUpdate = true;
  };

  // zápis matice části: pivot (X, Y, Z) v three souřadnicích, otočení kolem y (c, s = cos/sin h), houpání kolem z (ca, sa)
  function dej(m, i, X, Y, Z, c, s, ca, sa, sx, sy, sz) {
    const e = m.instanceMatrix.array, o = i * 16;
    e[o] = c * ca * sx; e[o + 1] = sa * sx; e[o + 2] = -s * ca * sx; e[o + 3] = 0;
    e[o + 4] = -c * sa * sy; e[o + 5] = ca * sy; e[o + 6] = s * sa * sy; e[o + 7] = 0;
    e[o + 8] = s * sz; e[o + 9] = 0; e[o + 10] = c * sz; e[o + 11] = 0;
    e[o + 12] = X; e[o + 13] = Y; e[o + 14] = Z; e[o + 15] = 1;
  }

  // ---------- trasy (chodníky z OSM + silnice s bočním odstupem) ----------
  const stezky = new Map();                                // key → [trasa]
  let stezkyVse = [];
  const prepoc = () => { stezkyVse = []; for (const a of stezky.values()) for (const t of a) stezkyVse.push(t); };
  function trasa(w, k, foot) {
    const len = [0];
    for (let i = 1; i < w.length; i++) len.push(len[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
    return { w, len, L: len[len.length - 1], k, foot };
  }
  function pridejCtverec(key, walks) {
    const a = [];
    for (const w of walks || []) { if (!w || w.length < 2) continue; const t = trasa(w, key, true); if (t.L > 4) a.push(t); }
    stezky.set(key, a); prepoc();
  }
  function odeberCtverec(key) {
    if (!stezky.delete(key)) return;
    prepoc();
    for (const p of lide) if (p.tr.foot && p.tr.k === key) p.mrtvy = true;
  }

  let cas = 0;
  // silnice je „městská“, když je v okolí budova (cache, u neúspěchu se po čase zkusí znovu, až se načtou budovy)
  function mesto(r) {
    if (r._lo || (r._lt !== undefined && cas - r._lt < 15)) return !!r._lo;
    r._lt = cas;
    const L = r.L;
    for (const f of [0.5, 0.25, 0.75]) {
      const o = bod(r, L * f);
      if (api.hitBuilding(o.x, o.y, 40)) { r._lo = true; return true; }
    }
    r._lo = false; return false;
  }
  const spolecny = { x: 0, y: 0, z: 0, dx: 1, dy: 0, i: 1 };
  // bod na trase ve vzdálenosti s od začátku (hint: index úseku, ať se nehledá od nuly)
  function bod(t, s, hint) {
    const L = t.len, n = L.length - 1;
    let i = hint > 0 && hint <= n ? hint : 1;
    while (i > 1 && L[i - 1] > s) i--;
    while (i < n && L[i] < s) i++;
    const a = t.w[i - 1], b = t.w[i], u = Math.min(1, Math.max(0, (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1)));
    const o = spolecny;
    o.x = a[0] + (b[0] - a[0]) * u; o.y = a[1] + (b[1] - a[1]) * u; o.z = a[2] + (b[2] - a[2]) * u;
    o.dx = b[0] - a[0]; o.dy = b[1] - a[1]; o.i = i;
    return o;
  }

  // ---------- lidé ----------
  const lide = [], volni = [];
  const hr = api.hrac;
  let blizko = [], tBlizko = 0, tZastavky = 0, snimek = 0;
  const idleNaZast = new Map();                            // index zastávky → počet stojících

  function nacti() {                                       // seznam tras v dosahu hráče (obnova 2× za sekundu)
    blizko = [];
    for (const r of api.roads) {
      if (!TRIDY.has(r.c) || r.L < 12) continue;
      const m = r.w[r.w.length >> 1];
      if (Math.hypot(m[0] - hr.x, m[1] - hr.y) > DOSAH + r.L / 2) continue;
      if (mesto(r)) blizko.push(r);
    }
  }
  function ofsRoad(r) { return (BOK[r.c] || 4.5) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.6; }

  function novy() {
    const p = volni.pop() || { tr: null };
    p.mrtvy = false; p.mod = 0; p.cx = 0; p.cy = 0;
    p.ex = 0; p.ey = 0; p.blok = 0; p.bloky = 0; p.hint = 1; p.stop = -1;
    p.faze = Math.random() * 6.28; p.bob = 0;
    const kid = Math.random() < 0.08;
    p.sc = kid ? 0.62 + Math.random() * 0.18 : 0.95 + Math.random() * 0.13;
    p.hl = kid ? 1.25 : 1;
    p.v = (1.1 + Math.random() * 0.5) * (kid ? 0.9 : 1);
    p.cKoze = pick(KOZE); p.cVlasy = pick(VLASY); p.cTrika = pick(TRIKA); p.cKalh = pick(KALHOTY);
    p.typ = 0; p.stav = null; p.hp = HP[0]; p.lezi = 0; p.utok = 0; p.uder = 0; p.vf = 0; p.vytrv = 0; p._tr = null; p._nej = undefined; p._zas = 0; p._pruchod = 0;
    return p;
  }
  function nastavTyp(p, typ) {
    p.typ = typ; p.hp = HP[typ];
    const v = VZHLED[typ];
    if (v) { p.cTrika = pick(v.trika); p.cKalh = pick(v.kalh); p.cVlasy = pick(v.vlasy); }
    if (typ === 2) p.cKoze = 0xe0a088;                       // opilec: zarudlý obličej
    if (typ === 3 || typ === 1) { p.sc = 1.02 + Math.random() * 0.08; p.hl = 1; }
  }
  function pridej(p) { lide.push(p); barvy(lide.length - 1, p); }

  function zrodChodce() {
    const maFoot = stezkyVse.length > 0, maRoad = blizko.length > 0;
    if (!maFoot && !maRoad) return false;
    const foot = maFoot && (!maRoad || Math.random() < 0.4);
    const t = foot ? stezkyVse[Math.floor(Math.random() * stezkyVse.length)] : blizko[Math.floor(Math.random() * blizko.length)];
    const s = Math.random() * t.L, o = bod(t, s), ofs = foot ? (Math.random() - 0.5) * 0.8 : ofsRoad(t);
    const dl = Math.hypot(o.dx, o.dy) || 1, x = o.x - o.dy / dl * ofs, y = o.y + o.dx / dl * ofs;
    const d = Math.hypot(x - hr.x, y - hr.y);
    if (d < MIN_SPAWN || d > DOSAH || api.hitBuilding(x, y, 0.4)) return false;
    const p = novy();
    p.tr = t; p.s = s; p.dir = Math.random() < 0.5 ? 1 : -1; p.ofs = p.ofsT = ofs; p.hint = o.i;
    p.x = x; p.y = y; p.z = o.z; p.h = Math.atan2(o.dy * p.dir, o.dx * p.dir);
    if (boj() && p.sc > 0.9) {                               // pouliční režim: v noci víc výtržníků a opilců
      const r = Math.random(), noc = api.doba() > 0.6, sance = noc ? 0.22 : 0.08;
      if (r < sance) nastavTyp(p, r < sance * 0.55 ? 1 : 2);
    }
    pridej(p); return true;
  }
  // ---------- pouliční režim: volný pohyb (útěk, útok, honička), zásahy ----------
  function zrodNa(x, y, typ, stav) {
    if (lide.length >= MAX) return null;
    if (api.hitBuilding(x, y, 0.4)) {                        // ve zdi: nejbližší volné místo do 8 m
      let ok = false;
      for (let r = 1; r <= 8 && !ok; r += 1) for (let a = 0; a < 6.28 && !ok; a += 0.5) { const X = x + Math.cos(a) * r, Y = y + Math.sin(a) * r; if (!api.hitBuilding(X, Y, 0.4)) { x = X; y = Y; ok = true; } }
      if (!ok) return null;
    }
    const p = novy();
    nastavTyp(p, typ);
    p.tr = null; p.mod = 3; p.x = x; p.y = y; p.z = api.gz(x, y); p.h = Math.random() * 6.28;
    p.stav = stav || 'utoci'; p.vytrv = 40;
    pridej(p); return p;
  }
  function uvolni(p) {                                       // z trasy do volného pohybu (posun z uhýbání započítat)
    p.x += p.ex; p.y += p.ey; p.ex = 0; p.ey = 0;
    if (p.stop >= 0) { idleNaZast.set(p.stop, Math.max(0, (idleNaZast.get(p.stop) || 1) - 1)); p.stop = -1; }
    p.mod = 3;
  }
  function zasah(p, sila, ux, uy) {
    if (p.stav === 'lezi') return 'lezi';
    uvolni(p);
    p.hp -= sila; p.uder = 0;
    const ox = ux * 0.7, oy = uy * 0.7;
    if (!api.hitBuilding(p.x + ox, p.y + oy, 0.3)) { p.x += ox; p.y += oy; }
    if (p.hp <= 0) { p.stav = 'lezi'; p.lezi = 14 + Math.random() * 12; p.h = Math.atan2(-uy, -ux); return 'ko'; }
    if (p.typ === 3) p.stav = 'honi';
    else if (p.typ) p.stav = 'utoci';
    else p.stav = Math.random() < 0.35 ? 'utoci' : 'utika';
    p.vytrv = 30;
    return 'zasah';
  }
  function srazen(p, ux, uy, v) {                            // sražení autem: odhodí a složí (u velké rychlosti hned)
    uvolni(p);
    const k = Math.min(6, 1 + v * 0.25);
    for (let f = k; f > 0.3; f *= 0.5) if (!api.hitBuilding(p.x + ux * f, p.y + uy * f, 0.3)) { p.x += ux * f; p.y += uy * f; break; }
    p.hp = 0; p.stav = 'lezi'; p.lezi = 18 + Math.random() * 15; p.h = Math.atan2(uy, ux);
  }
  function panika(x, y, r) {                                 // běžní lidé kolem utečou
    let n = 0;
    for (const p of lide) {
      if (p.typ || p.stav || Math.hypot(p.x - x, p.y - y) > r) continue;
      n++;
      if (Math.random() < 0.75) { uvolni(p); p.stav = 'utika'; p.vytrv = 20; }
    }
    return n;
  }
  function svedci(x, y, r) {
    let n = 0;
    for (const p of lide) if (p.typ !== 3 && p.typ !== 1 && p.stav !== 'lezi' && Math.hypot(p.x + p.ex - x, p.y + p.ey - y) < r) n++;
    return n;
  }
  function blizky(x, y, r, filtr) {
    let best = null, bd = r;
    for (const p of lide) {
      if (filtr && !filtr(p)) continue;
      const d = Math.hypot(p.x + p.ex - x, p.y + p.ey - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function volny(p, dt) {
    p.uder = Math.max(0, p.uder - dt);
    if (p.stav === 'lezi') {
      p.krok = 0; p.lezi -= dt;
      if (p.lezi <= 0) { p.hp = Math.max(1, HP[p.typ] - 1); p.stav = p.typ === 3 ? 'honi' : p.typ ? 'utoci' : 'utika'; p.vytrv = 20; }
      return;
    }
    p.vytrv -= dt;
    const B = api.boj;
    const dx = hr.x - p.x, dy = hr.y - p.y, d = Math.hypot(dx, dy) || 1;
    let ux = dx / d, uy = dy / d, v = 0;
    const mezicil = p.stav !== 'utika' && !(p._pruchod > 0) && B && B.cil ? B.cil(p, d) : null;   // honička přes ulice (pěší trasa), zblízka rovnou
    if (mezicil) { const mx = mezicil[0] - p.x, my = mezicil[1] - p.y, ml = Math.hypot(mx, my) || 1; ux = mx / ml; uy = my / ml; }
    if (!boj() && p.stav !== 'utika') p.stav = 'utika';
    if (p.stav === 'utika') {
      ux = -ux; uy = -uy; v = p.typ === 2 ? 2.4 : 4.2;
      if (d > 70 || p.vytrv < -20) p.mrtvy = true;
    } else {                                                 // utoci / honi
      const dosah = hr.vAuto ? 2.8 : 1.1;
      v = p.stav === 'honi' ? 5.6 : p.typ === 2 ? 2.3 : 4.1;
      if (p.stav === 'utoci' && (d > 45 || p.vytrv < 0) && !(B && B.drzi && B.drzi(p))) { p.stav = 'utika'; p.vytrv = 10; }
      if (d < dosah) {
        v = 0; p.utok -= dt;
        if (p.utok <= 0) { p.utok = p.typ === 3 ? 0.8 : 1.1 + Math.random() * 0.4; p.uder = 0.3; if (B && B.utok) B.utok(p, d); }
      } else p.utok = Math.min(p.utok, 0.4);
    }
    if (p.typ === 2 && v > 0) { const w = Math.sin(cas * 2.3 + p.faze) * 0.6; const c = Math.cos(w), s = Math.sin(w); [ux, uy] = [ux * c - uy * s, ux * s + uy * c]; }   // opilec se motá
    if (v > 0) {
      // zaseklý pronásledovatel (dvůr přístupný jen průjezdem domu, který data neznají): po 5 s bez přiblížení projde
      if (p.stav !== 'utika') {
        if (p._nej === undefined || d < p._nej - 1) { p._nej = d; p._zas = 0; } else p._zas = (p._zas || 0) + dt;
        if (p._zas > 5) { p._pruchod = 3; p._zas = 0; p._nej = d; }
      }
      if (p._pruchod > 0) p._pruchod -= dt;
      const nx = p.x + ux * v * dt, ny = p.y + uy * v * dt, uvnitr = p._pruchod > 0 || api.hitBuilding(p.x, p.y, 0.3);   // kdo uvízl ve zdi, smí ven
      let pohyb = false;
      if (uvnitr || !api.hitBuilding(nx, p.y, 0.3)) { p.x = nx; pohyb = true; }
      if (uvnitr || !api.hitBuilding(p.x, ny, 0.3)) { p.y = ny; pohyb = true; }
      if (!pohyb) { const s = (p.faze % 2 < 1) ? 1 : -1; const bx = p.x - uy * s * v * dt, by = p.y + ux * s * v * dt; if (!api.hitBuilding(bx, by, 0.3)) { p.x = bx; p.y = by; } }
      p.z = api.gz(p.x, p.y);
      p.h += tmpAng(Math.atan2(uy, ux) - p.h) * Math.min(1, dt * 10);
      p.faze += v * dt * 3.2; p.krok = 1;
    } else {
      p.h += tmpAng(Math.atan2(dy, dx) - p.h) * Math.min(1, dt * 10);
      p.krok = 0;
    }
  }
  function zrodNaZastavce() {
    const Z = api.zastavky || [], noc = api.doba() > 0.6;
    for (let k = 0; k < Z.length; k++) {
      const z = Z[k];
      if (Math.hypot(z.x - hr.x, z.y - hr.y) > 160) continue;
      const ves = api.hustota && api.hustota() < 150;           // na vsi na zastávce nanejvýš jeden člověk, v noci nikdo
      const cil = ves ? (noc ? 0 : (k * 5 + 1) % 3 === 0 ? 1 : 0) : noc ? (k * 5 + 1) % 2 : (k * 5 + 1) % 4, ma = idleNaZast.get(k) || 0;
      if (ma >= cil) continue;
      const a = Math.random() * 6.28, r = 2 + Math.random() * 2, x = z.x + Math.cos(a) * r, y = z.y + Math.sin(a) * r;
      if (Math.hypot(x - hr.x, y - hr.y) < 25 || api.hitBuilding(x, y, 0.4)) continue;
      const p = novy();
      p.mod = 2; p.stop = k; p.tr = null; p.x = x; p.y = y; p.z = api.gz(x, y); p.h = Math.random() * 6.28; p.v = 0;
      idleNaZast.set(k, ma + 1);
      pridej(p); return;
    }
  }

  // konec trasy: napoj se na jinou trasu v dosahu 6 m od konce, jinak se otoč
  function konec(p) {
    const t = p.tr, koncDir = p.dir, e = koncDir > 0 ? t.w[t.w.length - 1] : t.w[0];
    const moz = [];
    const zkus = (u) => {
      if (u === t) return;
      const a = u.w[0], b = u.w[u.w.length - 1];
      if (Math.hypot(a[0] - e[0], a[1] - e[1]) < 6) moz.push([u, 1]);
      else if (Math.hypot(b[0] - e[0], b[1] - e[1]) < 6) moz.push([u, -1]);
    };
    for (const u of stezkyVse) zkus(u);
    for (const r of api.roads) if (TRIDY.has(r.c) && r.L >= 12 && mesto(r)) zkus(r);
    if (!moz.length || Math.random() < 0.12) { p.dir = -p.dir; p.s = Math.min(t.L, Math.max(0, p.s)); return; }
    const [u, d] = moz[Math.floor(Math.random() * moz.length)];
    p.tr = u; p.dir = d; p.s = d > 0 ? 0 : u.L; p.hint = d > 0 ? 1 : u.len.length - 1;
    p.ofsT = u.foot ? (Math.random() - 0.5) * 0.8 : ofsRoad(u);
  }

  const tmpAng = (a) => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };

  function update(dt) {
    cas += dt; snimek++;
    if (dt > 0.25) dt = 0.25;
    const doba = api.doba(), noc = doba > 0.6;
    // počet lidí podle zástavby kolem hráče (api.hustota = budov do 250 m): město desítky, vesnice pár lidí, pole nikdo
    const hus = api.hustota ? api.hustota() : 400, ves = hus < 150;
    const zaklad = Math.min(CIL, Math.max(hus < 15 ? 0 : 2, hus / 12 * (ves ? 0.55 : 1)));
    const cilPocet = Math.min(MAX - 2, Math.round(zaklad * (noc ? 0.3 : 1)));
    if (cas - tBlizko > 0.5) { tBlizko = cas; nacti(); }
    if (cas - tZastavky > 1.0) { tZastavky = cas; zrodNaZastavce(); }

    // auto hráče: pohyb vpřed → chodci před ním uhnou
    const car = hr.vAuto && hr.car && Math.abs(hr.car.v) > 1 ? hr.car : null;
    let ch = 1, sh = 0, sg = 1, dopr = 0;
    if (car) { ch = Math.cos(car.h); sh = Math.sin(car.h); sg = car.v > 0 ? 1 : -1; dopr = 3.5 + Math.abs(car.v) * 0.25; }

    // 1) logika pohybu
    for (let i = 0; i < lide.length; i++) {
      const p = lide[i];
      const vzd = Math.hypot(p.x - hr.x, p.y - hr.y);
      if (vzd > ZAHOD) { p.mrtvy = true; continue; }
      if (p.stav) { volny(p, dt); continue; }
      // výtržník si hráče všimne a jde po něm (v noci a na smradlavého bezdomovce častěji)
      if (p.typ && boj() && vzd < 14 && !hr.vAuto && Math.random() < dt * (api.boj.provokace ? api.boj.provokace(p) : 0.15)) { uvolni(p); p.stav = 'utoci'; p.vytrv = 25; volny(p, dt); continue; }
      let krok = 0, cil = p.h;
      if (p.mod !== 2) {
        // přecházení silnice
        if (p.mod === 0 && !p.tr.foot && Math.abs(p.ofs - p.ofsT) < 0.1 && Math.random() < dt * 0.012) {
          p.mod = 1; p.ofsT = -p.ofsT;
        }
        if (p.mod === 0) {
          p.s += p.dir * p.v * dt; krok = p.v;
          if (p.s < 0 || p.s > p.tr.L) konec(p);
        }
        const o = bod(p.tr, p.s, p.hint);
        p.hint = o.i;
        const dl = Math.hypot(o.dx, o.dy) || 1, nx = -o.dy / dl, ny = o.dx / dl;
        const rychl = p.mod === 1 ? p.v : 1.5, rozd = p.ofsT - p.ofs;
        if (Math.abs(rozd) <= rychl * dt) { p.ofs = p.ofsT; if (p.mod === 1) p.mod = 0; }
        else p.ofs += Math.sign(rozd) * rychl * dt;
        if (p.mod === 1) { krok = p.v; cil = Math.atan2(ny * Math.sign(rozd), nx * Math.sign(rozd)); }
        else cil = Math.atan2(o.dy * p.dir, o.dx * p.dir);
        p.x = o.x + nx * p.ofs; p.y = o.y + ny * p.ofs; p.z = o.z;
        // stěna před chodcem → otočit (kontrola jen každý 4. snímek)
        if (p.blok > 0) p.blok -= dt;
        else if ((snimek + i) % 4 === 0) {
          const hx = Math.cos(cil) * 0.9, hy = Math.sin(cil) * 0.9;
          if (api.hitBuilding(p.x + p.ex + hx, p.y + p.ey + hy, 0.3)) {
            p.blok = 1.2; p.bloky++;
            if (p.mod === 1) p.ofsT = -p.ofsT; else p.dir = -p.dir;
            if (p.bloky > 4) p.mrtvy = true;
          } else if (p.bloky > 0 && Math.random() < 0.05) p.bloky--;
        }
        p.h += tmpAng(cil - p.h) * Math.min(1, dt * 6);
      } else {
        p.h += Math.sin(cas * 0.4 + p.faze) * 0.0015;
      }
      // uhnutí před autem hráče
      let uhyb = false;
      if (car) {
        const dx = p.x + p.ex - car.x, dy = p.y + p.ey - car.y;
        const f = (dx * ch + dy * sh) * sg, bok = -dx * sh + dy * ch;
        if (f > -1.5 && f < dopr && Math.abs(bok) < 2.2) {
          uhyb = true;
          const sm = bok === 0 ? (i & 1 ? 1 : -1) : Math.sign(bok), px = -sh * sm * 3.6 * dt, py = ch * sm * 3.6 * dt;
          if (!api.hitBuilding(p.x + p.ex + px, p.y + p.ey + py, 0.3)) { p.ex += px; p.ey += py; }
        }
      }
      if (!uhyb && (p.ex !== 0 || p.ey !== 0)) {          // vrátit se pomalu zpět na trasu
        const l = Math.hypot(p.ex, p.ey), k = Math.min(l, 0.8 * dt) / l;
        p.ex -= p.ex * k; p.ey -= p.ey * k;
        if (l < 0.02) { p.ex = 0; p.ey = 0; }
      }
      p.faze += (krok > 0 ? krok : uhyb ? 2.5 : 0) * dt * 4.2;
      p.krok = krok > 0 || uhyb ? 1 : 0;
    }

    // 2) úklid mrtvých, 3) spawn
    for (let i = lide.length - 1; i >= 0; i--) {
      if (!lide[i].mrtvy) continue;
      const p = lide[i], last = lide.pop();
      if (p.stop >= 0) idleNaZast.set(p.stop, Math.max(0, (idleNaZast.get(p.stop) || 1) - 1));
      volni.push(p);
      if (last !== p) { lide[i] = last; barvy(i, last); }
    }
    if (lide.length > cilPocet + 2) {                      // méně lidí (noc, vesnice): odeber vzdálenější
      for (let i = 0; i < lide.length; i++) if (Math.hypot(lide[i].x - hr.x, lide[i].y - hr.y) > 80) { lide[i].mrtvy = true; break; }
    } else if (lide.length < cilPocet) {
      for (let k = 0, n = 0; k < 12 && n < 3 && lide.length < cilPocet; k++) if (zrodChodce()) n++;
    }

    // 4) matice
    const n = lide.length;
    for (let i = 0; i < n; i++) {
      const p = lide[i], c = Math.cos(p.h), s = Math.sin(p.h), sc = p.sc;
      if (p.stav === 'lezi') {                               // leží na zádech: celé tělo otočené o 90° kolem boční osy, hlava za patami
        const X = p.x, Z = -p.y, Y = p.z + 0.12 * sc;
        const q = (m, H, lat, sx, sy, sz) => dej(m, i, X + s * lat - c * H, Y, Z + c * lat + s * H, c, s, 0, 1, sx, sy, sz);
        q(mNohaA, 0.84 * sc, 0.1 * sc, 0.13 * sc, 0.84 * sc, 0.15 * sc);
        q(mNohaB, 0.84 * sc, -0.1 * sc, 0.13 * sc, 0.84 * sc, 0.15 * sc);
        q(mRukaA, 1.40 * sc, 0.33 * sc, 0.11 * sc, 0.6 * sc, 0.11 * sc);
        q(mRukaB, 1.40 * sc, -0.33 * sc, 0.11 * sc, 0.6 * sc, 0.11 * sc);
        q(mTorzo, 1.13 * sc, 0, 0.24 * sc, 0.58 * sc, 0.42 * sc);
        const hs = 0.22 * sc * p.hl;
        q(mHlava, 1.42 * sc + hs * 0.55, 0, hs, hs, hs);
        q(mVlasy, 1.42 * sc + hs * 1.0, 0, hs * 1.12, hs * 0.4, hs * 1.12);
        continue;
      }
      const chodi = p.krok === 1, ph = p.faze;
      const a = chodi ? Math.sin(ph) * 0.55 : 0, ar = chodi ? a * 0.8 : Math.sin(cas * 1.3 + p.faze) * 0.03;
      const bob = chodi ? Math.abs(Math.sin(ph)) * 0.035 * sc : 0;
      const X = p.x + p.ex, Z = -(p.y + p.ey), Y0 = p.z + bob;
      const ca = Math.cos(a), sa = Math.sin(a), cr = Math.cos(ar), sr = Math.sin(ar);
      const zn = 0.1 * sc, zr = 0.265 * sc;
      // nohy (pivot v kyčli)
      dej(mNohaA, i, X + s * zn, Y0 + 0.84 * sc, Z + c * zn, c, s, ca, sa, 0.13 * sc, 0.84 * sc, 0.15 * sc);
      dej(mNohaB, i, X - s * zn, Y0 + 0.84 * sc, Z - c * zn, c, s, ca, -sa, 0.13 * sc, 0.84 * sc, 0.15 * sc);
      // ruce (pivot v rameni, proti nohám)
      if (p.uder > 0) {                                      // úder: pravá ruka natažená dopředu
        const u = 1.45 * Math.sin(Math.PI * p.uder / 0.3);
        dej(mRukaA, i, X + s * zr, Y0 + 1.40 * sc, Z + c * zr, c, s, Math.cos(u), Math.sin(u), 0.11 * sc, 0.6 * sc, 0.11 * sc);
      } else
      dej(mRukaA, i, X + s * zr, Y0 + 1.40 * sc, Z + c * zr, c, s, cr, -sr, 0.11 * sc, 0.6 * sc, 0.11 * sc);
      dej(mRukaB, i, X - s * zr, Y0 + 1.40 * sc, Z - c * zr, c, s, cr, sr, 0.11 * sc, 0.6 * sc, 0.11 * sc);
      dej(mTorzo, i, X, Y0 + 1.13 * sc, Z, c, s, 1, 0, 0.24 * sc, 0.58 * sc, 0.42 * sc);
      const hs = 0.22 * sc * p.hl;
      dej(mHlava, i, X, Y0 + 1.42 * sc + hs * 0.55, Z, c, s, 1, 0, hs, hs, hs);
      dej(mVlasy, i, X - c * 0.01 * sc, Y0 + 1.42 * sc + hs * 1.0, Z + s * 0.01 * sc, c, s, 1, 0, hs * 1.12, hs * 0.4, hs * 1.12);
    }
    for (const m of telesa) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }

  // stojí chodec v pruhu auta před (x, y) ve směru h do vzdálenosti d (± 2 m do strany)?
  function chodciPred(x, y, h, d) {
    const c = Math.cos(h), s = Math.sin(h);
    for (let i = 0; i < lide.length; i++) {
      const p = lide[i], dx = p.x + p.ex - x, dy = p.y + p.ey - y;
      if (dx > d + 2 || dx < -d - 2 || dy > d + 2 || dy < -d - 2) continue;
      const f = dx * c + dy * s, b = -dx * s + dy * c;
      if (f > 0 && f <= d && b >= -2 && b <= 2) return true;
    }
    return false;
  }

  return { pridejCtverec, odeberCtverec, update, telesa, chodciPred, _lide: lide, zrodNa, zasah, srazen, panika, svedci, blizky };
}
