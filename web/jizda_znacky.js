// Dopravní značení ve 3D jízdě podle skutečnosti: značky z OSM (znacky.json, nastroje/znacky.py: stop, dej přednost,
// vyznačené přechody, začátek a konec obce) a značky odvozené z dat silnic (rychlostní limit B20a, obytná zóna IP26a,
// jednosměrka IP4b a zákaz vjezdu B2 na jejím konci). Kreslí se na pravé straně ve směru jízdy, čelem k řidiči.
// Vzhled podle vyhlášky 294/2015 Sb., nakreslený na plátno (žádné cizí obrázky). Vše je InstancedMesh: jeden druh = jedno volání kreslení.
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
const VYSKA = 2.25;                                          // střed značky nad silnicí (m)
const PUL = { motorway: 9, trunk: 6, primary: 5, secondary: 4.5, tertiary: 4, residential: 3, unclassified: 3, living_street: 3, service: 1.5 };

// ---------- kreslení značek na plátno ----------
function platno(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
const CERVENA = '#c8102e', MODRA = '#0059a8', CERNA = '#111';
const tvary = {
  kruh(g, S) { g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); },
  troj(g, S) { g.beginPath(); g.moveTo(4, 10); g.lineTo(S - 4, 10); g.lineTo(S / 2, S - 12); g.closePath(); },   // hrotem dolů (P4)
  osm(g, S) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(S / 2 + Math.cos(a) * (S / 2 - 2), S / 2 + Math.sin(a) * (S / 2 - 2)); } g.closePath(); },
  ctverec(g, S) { g.beginPath(); g.roundRect(3, 3, S - 6, S - 6, 10); },
  obdelnik(g, W, H) { g.beginPath(); g.roundRect(3, 3, W - 6, H - 6, 10); },
};
function kresli(druh, text) {
  const S = 256;
  if (druh === 'obec' || druh === 'obecK') {                 // IS12a / IS12b: bílá tabule s černým okrajem a názvem
    const W = 512, H = 200, [c, g] = platno(W, H);
    tvary.obdelnik(g, W, H); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 12; g.strokeStyle = CERNA; g.stroke();
    let f = 96; g.font = `700 ${f}px system-ui, sans-serif`;
    while (g.measureText(text).width > W - 60 && f > 30) { f -= 4; g.font = `700 ${f}px system-ui, sans-serif`; }
    g.fillStyle = CERNA; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 4);
    if (druh === 'obecK') { g.strokeStyle = CERVENA; g.lineWidth = 22; g.beginPath(); g.moveTo(30, H - 24); g.lineTo(W - 30, 24); g.stroke(); }
    return c;
  }
  if (druh === 'zona') {                                     // IP26a obytná zóna: modrá tabule, dům, dospělý, dítě s míčem
    const W = 200, H = 300, [c, g] = platno(W, H);
    tvary.obdelnik(g, W, H); g.fillStyle = MODRA; g.fill(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(30, 120); g.lineTo(100, 50); g.lineTo(170, 120); g.closePath(); g.fill(); g.fillRect(45, 118, 110, 70);
    g.fillStyle = MODRA; g.fillRect(85, 140, 30, 48);
    g.fillStyle = '#fff';
    const postava = (x, y, k) => { g.beginPath(); g.arc(x, y, 9 * k, 0, 6.3); g.fill(); g.fillRect(x - 7 * k, y + 10 * k, 14 * k, 34 * k); g.fillRect(x - 7 * k, y + 44 * k, 5 * k, 26 * k); g.fillRect(x + 2 * k, y + 44 * k, 5 * k, 26 * k); };
    postava(60, 212, 1); postava(118, 232, 0.7); g.beginPath(); g.arc(160, 268, 10, 0, 6.3); g.fill();
    return c;
  }
  const [c, g] = platno(S, S);
  if (druh === 'limit' || druh === 'zakaz') {                // B20a / B2: bílý kruh s červeným okrajem
    tvary.kruh(g, S); g.fillStyle = '#fff'; g.fill();
    g.lineWidth = 30; g.strokeStyle = CERVENA; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 17, 0, Math.PI * 2); g.stroke();
    if (druh === 'limit') {
      g.fillStyle = CERNA; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${text.length > 2 ? 92 : 118}px system-ui, sans-serif`; g.fillText(text, S / 2, S / 2 + 6);
    }
  } else if (druh === 'dej') {                               // P4: obrácený trojúhelník, bílý s červeným okrajem
    tvary.troj(g, S); g.fillStyle = CERVENA; g.fill();
    g.beginPath(); g.moveTo(42, 32); g.lineTo(S - 42, 32); g.lineTo(S / 2, S - 54); g.closePath(); g.fillStyle = '#fff'; g.fill();
  } else if (druh === 'stop') {                              // P6: červený osmiúhelník s bílým STOP
    tvary.osm(g, S); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(S / 2 + Math.cos(a) * (S / 2 - 10), S / 2 + Math.sin(a) * (S / 2 - 10)); } g.closePath();
    g.fillStyle = CERVENA; g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 74px system-ui, sans-serif'; g.fillText('STOP', S / 2, S / 2 + 4);
  } else if (druh === 'prechod') {                           // IP6: modrý čtverec, bílý trojúhelník, chodec na zebře
    tvary.ctverec(g, S); g.fillStyle = MODRA; g.fill();
    g.beginPath(); g.moveTo(S / 2, 26); g.lineTo(S - 26, S - 34); g.lineTo(26, S - 34); g.closePath(); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = CERNA;
    for (let i = 0; i < 5; i++) g.fillRect(70 + i * 24, S - 60, 14, 18);
    g.beginPath(); g.arc(130, 92, 13, 0, 6.3); g.fill();
    g.lineWidth = 13; g.lineCap = 'round'; g.strokeStyle = CERNA;
    g.beginPath(); g.moveTo(128, 108); g.lineTo(120, 150); g.lineTo(100, 186); g.moveTo(120, 150); g.lineTo(142, 186); g.moveTo(126, 118); g.lineTo(104, 140); g.moveTo(126, 118); g.lineTo(150, 136); g.stroke();
  } else if (druh === 'jedn') {                              // IP4b: modrý čtverec s bílou šipkou nahoru
    tvary.ctverec(g, S); g.fillStyle = MODRA; g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(S / 2, 34); g.lineTo(S / 2 + 58, 110); g.lineTo(S / 2 + 22, 110); g.lineTo(S / 2 + 22, S - 34);
    g.lineTo(S / 2 - 22, S - 34); g.lineTo(S / 2 - 22, 110); g.lineTo(S / 2 - 58, 110); g.closePath(); g.fill();
  }
  return c;
}
function maska(tvar) {                                       // tvar značky pro šedou zadní stranu
  if (tvar === 'obdelnik' || tvar === 'zona') { const W = tvar === 'zona' ? 200 : 512, H = tvar === 'zona' ? 300 : 200, [c, g] = platno(W, H); tvary.obdelnik(g, W, H); g.fillStyle = '#fff'; g.fill(); return c; }
  const [c, g] = platno(256, 256); tvary[tvar](g, 256); g.fillStyle = '#fff'; g.fill(); return c;
}
const TVAR = { limit: 'kruh', zakaz: 'kruh', dej: 'troj', stop: 'osm', prechod: 'ctverec', jedn: 'ctverec', obec: 'obdelnik', obecK: 'obdelnik', zona: 'zona' };
const ROZMER = { limit: [0.7, 0.7], zakaz: [0.7, 0.7], dej: [0.9, 0.9], stop: [0.7, 0.7], prechod: [0.7, 0.7], jedn: [0.7, 0.7], obec: [1.3, 0.51], obecK: [1.3, 0.51], zona: [0.6, 0.9] };

export function vytvorZnacky(THREE, scene, api) {
  const { roads, ends, ek, along } = api;
  let data = [], spinave = false, zmenaT = 0, pocet = 0, seznam = [];
  let prechMap = new Map(), prechBody = null;                // přechody pro chodce: kus silnice -> staničení, body (null = data ještě nejsou)
  const skupina = new THREE.Group(); skupina.name = 'znacky'; scene.add(skupina);
  const tex = new Map(), texM = new Map();
  const textura = (k, mapa, druh, text) => {
    if (!mapa.has(k)) { const t = new THREE.CanvasTexture(druh === null ? maska(text) : kresli(druh, text)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mapa.set(k, t); }
    return mapa.get(k);
  };
  fetch('jizda/znacky.json').then((r) => (r.ok ? r.json() : [])).then((d) => { data = d || []; spinave = true; }).catch(() => {});

  // ---------- poloha značky u silnice ----------
  // r: kus silnice, s: staničení, dir: směr jízdy (1 = k vyššímu staničení), vlevo: na levé straně (B2 u konce jednosměrky ne)
  function u(r, s, dir) {
    const o = along(r, Math.max(0, Math.min(r.L, s))), L = Math.hypot(o.dx, o.dy) || 1, hx = o.dx / L * dir, hy = o.dy / L * dir;
    const off = (r.o ? (PUL[r.c] || 3) * 0.7 : PUL[r.c] || 3) + 1.1;
    let x = o.x + hy * off, y = o.y - hx * off;
    if (api.hitBuilding && api.hitBuilding(x, y, 0.2)) { x = o.x + hy * (off - 0.9); y = o.y - hx * (off - 0.9); }
    // výška paty sloupku: terén v místě značky (silnice na náspu nebo ve svahu by ji zabořila); na mostě výška mostovky
    const zt = api.gz ? api.gz(x, y) : o.z, naMoste = api.gz && o.z - api.gz(o.x, o.y) > 0.8;
    return { x, y, z: naMoste ? o.z : zt, hx, hy, ox: o.x, oy: o.y };
  }
  function nejblizsi(x, y, max, bezService) {
    let best = null, bd = max;
    for (const r of roads) {
      if (bezService && r.c === 'service') continue;
      const w0 = r.w[0]; if (Math.abs(w0[0] - x) > r.L + max || Math.abs(w0[1] - y) > r.L + max) continue;
      for (let i = 1, acc = 0; i < r.w.length; i++) {
        const a = r.w[i - 1], b = r.w[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, sl = Math.sqrt(l2);
        const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0, d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
        if (d < bd) { bd = d; best = { r, s: acc + sl * t }; }
        acc += sl;
      }
    }
    return best;
  }
  const sousede = (r, konec) => (ends.get(ek(konec > 0 ? r.w[r.w.length - 1] : r.w[0])) || []).map(([i]) => roads[i]).filter((q) => q !== r && q.c !== 'service');
  // hustota zástavby ve směru (začátek obce: kam je víc domů)
  function zastavba(x, y, hx, hy) {
    if (!api.hitBuilding) return 0;
    let n = 0;
    for (let d = 40; d <= 480; d += 40) for (const b of [-60, -25, 0, 25, 60]) if (api.hitBuilding(x + hx * d - hy * b, y + hy * d + hx * b, 8)) n++;
    return n;
  }

  // ---------- sestavení všech značek ----------
  function sestav() {
    spinave = false;
    const zn = [], prechody = [], cary = [];
    const pridej = (druh, text, p) => { if (!zn.some((q) => q.druh === druh && Math.abs(q.x - p.x) < 3 && Math.abs(q.y - p.y) < 3)) zn.push({ druh, text, ...p }); };
    // z OSM
    for (const [x, y, druh, text] of data) {
      if (druh === 'prechod') {
        const n = nejblizsi(x, y, 6, true); if (!n) continue;
        prechody.push(n);
        for (const dir of n.r.o ? [n.r.o] : [1, -1]) pridej('prechod', '', u(n.r, n.s - dir * 1.5, dir));
      } else if (druh === 'stop' || druh === 'dej') {
        const n = nejblizsi(x, y, 14, true); if (!n) continue;
        const dir = n.r.o || (n.s > n.r.L / 2 ? 1 : -1);    // směr ke křižovatce (bližší konec kusu)
        pridej(druh, '', u(n.r, n.s, dir));
        if (druh === 'stop') cary.push({ r: n.r, s: Math.max(0, Math.min(n.r.L, n.s + dir * 1.5)), dir });
      } else if (druh === 'obec') {
        const n = nejblizsi(x, y, 15, true); if (!n) continue;
        const a = u(n.r, n.s, 1), b = u(n.r, n.s, -1);
        // dovnitř obce: k hlavnímu městu mapy míří střed mapy (0, 0), u ostatních obcí tam, kde je víc domů
        const dovnitr = api.mesto && text === api.mesto ? (a.hx * -a.ox + a.hy * -a.oy > 0 ? 1 : -1)
          : zastavba(a.ox, a.oy, a.hx, a.hy) >= zastavba(b.ox, b.oy, b.hx, b.hy) ? 1 : -1;
        if (!n.r.o || n.r.o === dovnitr) pridej('obec', text, dovnitr > 0 ? a : b);
        if (!n.r.o || n.r.o === -dovnitr) pridej('obecK', text, dovnitr > 0 ? b : a);
      }
    }
    // odvozené z dat silnic: limit, obytná zóna, jednosměrka
    for (const r of roads) {
      if (r.c === 'service' || r.L < 12) continue;
      for (const dir of [1, -1]) {
        if (r.o && r.o !== dir) continue;
        const vjezd = dir > 0 ? -1 : 1, nb = sousede(r, vjezd); if (!nb.length) continue;
        const s = dir > 0 ? Math.min(8, r.L / 2) : Math.max(r.L - 8, r.L / 2);
        if (r.c === 'living_street') { if (nb.some((q) => q.c !== 'living_street')) pridej('zona', '', u(r, s, dir)); }
        else if (r.l && r.l !== 50 && nb.some((q) => (q.l || 0) !== r.l && q.c !== 'living_street')) pridej('limit', String(r.l), u(r, s, dir));
        else if (r.l === 50 && nb.some((q) => q.l && q.l !== 50 && q.c !== 'living_street')) pridej('limit', '50', u(r, s, dir));
      }
      if (r.o) {
        const zac = sousede(r, -r.o), kon = sousede(r, r.o);
        if (zac.length && !zac.some((q) => q.o)) pridej('jedn', '', u(r, r.o > 0 ? Math.min(6, r.L / 2) : Math.max(r.L - 6, r.L / 2), r.o));
        if (kon.length && !kon.some((q) => q.o)) pridej('zakaz', '', u(r, r.o > 0 ? Math.max(r.L - 6, r.L / 2) : Math.min(6, r.L / 2), -r.o));
      }
    }
    vykresli(zn, prechody, cary);
    pocet = zn.length; seznam = zn;
    prechMap = new Map(); prechBody = [];
    for (const { r, s } of prechody) { if (!prechMap.has(r)) prechMap.set(r, []); prechMap.get(r).push(s); const o = along(r, s); prechBody.push([o.x, o.y]); }
  }

  // ---------- instance ----------
  const sloupGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6).translate(0, 0.5, 0);
  const sloupMat = new THREE.MeshLambertMaterial({ color: 0x8c9196 });
  const bilaMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const stripGeo = new THREE.BoxGeometry(1, 0.02, 1);
  function smaz() {
    for (const o of skupina.children.slice()) { skupina.remove(o); if (o.geometry !== sloupGeo && o.geometry !== stripGeo) o.geometry.dispose(); if (o.material !== sloupMat && o.material !== bilaMat) o.material.dispose(); }
    api.jenVeDne.splice(0, api.jenVeDne.length, ...api.jenVeDne.filter((o) => !o.userData.znacka));
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), osa = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  function instance(geo, mat, items, matice) {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { matice(it); m.setMatrixAt(i, m4); });
    m.instanceMatrix.needsUpdate = true; m.userData.znacka = true; m.frustumCulled = false;
    skupina.add(m); api.jenVeDne.push(m);
    return m;
  }
  function vykresli(zn, prechody, cary) {
    smaz();
    // sloupky
    const sloupy = zn.map((z) => ({ x: z.x, y: z.y, z: z.z, h: VYSKA + (ROZMER[z.druh][1] / 2) }));
    if (sloupy.length) instance(sloupGeo, sloupMat, sloupy, (s) => { m4.compose(v.set(s.x, s.z - 0.3, -s.y), q.identity(), sc.set(1, s.h + 0.3, 1)); });
    // líc a rub po druzích (limit podle čísla, obec podle názvu)
    const skupiny = new Map();
    for (const z of zn) { const k = z.druh + '|' + z.text; if (!skupiny.has(k)) skupiny.set(k, []); skupiny.get(k).push(z); }
    const ruby = new Map();
    for (const [k, a] of skupiny) {
      const { druh, text } = a[0], [w, h] = ROZMER[druh];
      const mat = new THREE.MeshBasicMaterial({ map: textura(k, tex, druh, text), alphaTest: 0.5, color: 0xe6e6e6 });   // reflexní fólie: bez stínování
      instance(new THREE.PlaneGeometry(w, h), mat, a, (z) => {
        q.setFromAxisAngle(osa, Math.atan2(-z.hx, z.hy));    // líc proti směru jízdy (k řidiči): normála (-hx, 0, hy)
        m4.compose(v.set(z.x - z.hx * 0.06, z.z + VYSKA, -(z.y - z.hy * 0.06)), q, sc.set(1, 1, 1));   // líc před sloupkem (poloměr 3,5 cm)
      });
      const tv = TVAR[druh], rk = tv + w;
      if (!ruby.has(rk)) ruby.set(rk, { tv, w, h, items: [] });
      ruby.get(rk).items.push(...a);
    }
    for (const { tv, w, h, items } of ruby.values()) {
      const mat = new THREE.MeshLambertMaterial({ color: 0x9a9ea3, map: textura('m' + tv, texM, null, tv), alphaTest: 0.5 });
      instance(new THREE.PlaneGeometry(w, h), mat, items, (z) => {
        q.setFromAxisAngle(osa, Math.atan2(z.hx, -z.hy));
        m4.compose(v.set(z.x - z.hx * 0.045, z.z + VYSKA, -(z.y - z.hy * 0.045)), q, sc.set(1, 1, 1));   // rub těsně za lícem, sloupek je celý za tabulí
      });
    }
    // zebra: pruhy 0,5 m široké, 3 m dlouhé (podél silnice), mezery 0,5 m přes celou šířku
    const pruhy = [];
    for (const { r, s } of prechody) {
      const o = along(r, s), L = Math.hypot(o.dx, o.dy) || 1, ux = o.dx / L, uy = o.dy / L, W = (PUL[r.c] || 3) * (r.o ? 0.7 : 1);
      for (let b = -W + 0.5; b <= W - 0.4; b += 1.0) pruhy.push({ x: o.x - uy * b, y: o.y + ux * b, z: o.z, h: Math.atan2(uy, ux), dl: 3, s: 0.5 });
    }
    for (const { r, s, dir } of cary) {                       // stopčára přes pravý pruh
      const o = along(r, s), L = Math.hypot(o.dx, o.dy) || 1, ux = o.dx / L * dir, uy = o.dy / L * dir, W = (PUL[r.c] || 3) * (r.o ? 0.7 : 1);
      const b = r.o ? 0 : W / 2;
      pruhy.push({ x: o.x + uy * b, y: o.y - ux * b, z: o.z, h: Math.atan2(uy, ux), dl: 0.5, s: r.o ? W * 2 : W });
    }
    if (pruhy.length) instance(stripGeo, bilaMat, pruhy, (p) => {
      q.setFromAxisAngle(osa, p.h);
      m4.compose(v.set(p.x, p.z + 0.06, -p.y), q, sc.set(p.dl, 1, p.s));
    });
  }

  return {
    zmena() { spinave = true; zmenaT = performance.now(); },   // přibyly silnice (načtený čtverec)
    update(now) { if (spinave && data && now - zmenaT > 800) sestav(); },
    get pocet() { return pocet; },
    get seznam() { return seznam; },
    prechodyNa: (r) => prechMap.get(r) || null,              // staničení přechodů na kusu silnice
    prechodBlizko(x, y, R) {                                 // je do R metrů přechod? (null = značky ještě nejsou načtené)
      if (!prechBody) return null;
      for (const [px, py] of prechBody) if (Math.abs(px - x) < R && Math.abs(py - y) < R && Math.hypot(px - x, py - y) < R) return true;
      return false;
    },
    skupina,
  };
}
