// Motorky (3D jízda): zaparkované u krajnice ulic, nasednout E, jízda s náklonem do zatáčky, kamera zezadu nebo z helmy (V).
// Rozhraní režimu: REZIMY ve web/jizda.html. Model je procedurální (three.js), nic se nestahuje.
// Svět: x na východ, y na sever, z nahoru; three = (x, z, −y). Model: předek +x, nahoru +y, vpravo +z, počátek na zemi uprostřed rozvoru.
// Místa zaparkovaných motorek: po ROZESTUP m obytných a vedlejších ulic podle uid silnice (u všech hráčů stejná, pevná místa,
// nic se neobjevuje u hráče), k tomu ty, na kterých hráč dojel.

const G = 9.81, ROZVOR = 1.45, R_KOLA = 0.31, VMAX = 140 / 3.6, VTURBO = 160 / 3.6, NAKLON_MAX = 45 * Math.PI / 180;
const RIDITKA_MAX = Math.atan(ROZVOR / 2.8);               // plný rejd: otočka na ~3 m při chůzi
const ROZESTUP = 900, DOSAH = 200, MAX_STOJICICH = 5, BLIZKO = 3, PAD = 1.5, NARAZ = 25 / 3.6;
const RAKE = Math.atan2(0.23, 0.69), VIDLICE = Math.hypot(0.23, 0.69);
const BARVY = [0xb8201a, 0x1d1e22, 0x1f4fa0, 0xe8701a, 0x3d9a2a, 0xe8e8e4, 0xe2b41c];
const KRAJNICE = { residential: 3.1, tertiary: 3.8, unclassified: 2.9, living_street: 2.5 };   // osa silnice -> krajnice (m)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function hash(s) {                                         // FNV-1a -> 0..1 (stejné místo u všech hráčů)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export function vytvorMotorky(api) {
  const { THREE, scene3, hrac } = api;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const M = { ram: lam(0x1e1f22), kov: lam(0xa9adb3), pneu: lam(0x18191b), motor: lam(0x3a3c40), sedlo: lam(0x151517), celDen: lam(0xdcd9c6),
    koncDen: lam(0x9c211a), spz: lam(0xf4f4f0), bunda: lam(0x2d3138), kalhoty: lam(0x2a3550), boty: lam(0x141414), hledi: lam(0x1a2230) };
  const LAKY = BARVY.map(lam);
  const SV = { celni: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), koncove: new THREE.MeshBasicMaterial({ color: 0xb01a12 }),
    brzda: new THREE.MeshBasicMaterial({ color: 0xff2414 }) };
  const BOX = new THREE.BoxGeometry(1, 1, 1), VALEC = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), KOULE = new THREE.SphereGeometry(1, 12, 8);
  const VALEC_X = new THREE.CylinderGeometry(0.5, 0.5, 1, 14).rotateZ(Math.PI / 2);   // osa podél x (světlo)

  // ---------- stavba modelu ----------
  function dil(rodic, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); rodic.add(o); return o;
  }
  const _d = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  function natahni(o, a, b) {                              // díl s osou y mezi body a a b (souřadnice rodiče)
    _d.subVectors(b, a); const L = _d.length() || 1e-3;
    o.position.addVectors(a, b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(_Y, _d.divideScalar(L)); o.scale.y = L;
  }
  function tyc(rodic, mat, a, b, t, t2 = t, geo = BOX) {
    const o = new THREE.Mesh(geo, mat); o.scale.set(t, 1, t2); natahni(o, V(...a), V(...b)); rodic.add(o); return o;
  }
  const gPneu = new THREE.TorusGeometry(R_KOLA - 0.055, 0.055, 6, 18), gRafek = new THREE.TorusGeometry(0.2, 0.016, 4, 18);
  const gKotouc = new THREE.CylinderGeometry(0.15, 0.15, 0.012, 16).rotateX(Math.PI / 2), gNaboj = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 8).rotateX(Math.PI / 2);
  function kolo(rodic, x, y, predni) {                     // pneumatika, ráfek, pět paprsků litého kola, náboj a kotouč(e)
    const g = new THREE.Group(); g.position.set(x, y, 0); rodic.add(g);
    dil(g, gPneu, M.pneu, 0, 0, 0); dil(g, gRafek, M.kov, 0, 0, 0); dil(g, gNaboj, M.kov, 0, 0, 0);
    for (let i = 0; i < 5; i++) { const a = i * 2 * Math.PI / 5, p = dil(g, BOX, M.kov, -Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0, 0.03, 0.2, 0.022); p.rotation.z = a; }
    for (const z of predni ? [0.065, -0.065] : [-0.065]) dil(g, gKotouc, M.kov, 0, 0, z);
    return g;
  }
  // s: { jezdec } s jezdcem (jízda), jinak se stojánkem (zaparkovaná). Vrací díly, se kterými se hýbe.
  function postav(sJezdcem) {
    const koren = new THREE.Group(), telo = new THREE.Group(); koren.add(telo);
    const P = { koren, telo, laky: [] };
    const lak = (o) => { P.laky.push(o); return o; };
    P.koloZ = kolo(telo, -0.72, R_KOLA, false);
    // předek: hlava řízení se sklonem (rake), v ní řízení (natočení řídítek), vidlice, kolo, blatník, světlo, řídítka
    const hlava = new THREE.Group(); hlava.position.set(0.5, 1.0, 0); hlava.rotation.z = RAKE; telo.add(hlava);
    const riz = new THREE.Group(); hlava.add(riz); P.rizeni = riz;
    for (const z of [0.09, -0.09]) { tyc(riz, M.kov, [0, 0.08, z], [0, -0.35, z], 0.05, 0.05, VALEC); tyc(riz, M.ram, [0, -0.35, z], [0, -VIDLICE, z], 0.06, 0.06, VALEC); }
    kvadr(riz, M.ram, 0, 0.02, 0, 0.08, 0.05, 0.26);                                                      // brýle vidlice
    P.koloP = kolo(riz, 0, -VIDLICE, true);
    const bl = lak(dil(riz, BOX, LAKY[0], 0.37 * Math.sin(RAKE), -VIDLICE + 0.37 * Math.cos(RAKE), 0, 0.4, 0.025, 0.13)); bl.rotation.z = -RAKE;   // blatník nad kolem
    const sv = new THREE.Group(); sv.position.set(0.15, -0.02, 0); sv.rotation.z = -RAKE; riz.add(sv);
    dil(sv, VALEC_X, M.ram, 0, 0, 0, 0.12, 0.19, 0.19);                                                   // pouzdro kulatého světla
    dil(sv, VALEC_X, M.celDen, 0.06, 0, 0, 0.012, 0.16, 0.16);
    P.celni = dil(sv, VALEC_X, SV.celni, 0.068, 0, 0, 0.012, 0.165, 0.165);
    const rid = new THREE.Group(); rid.position.set(-0.04, 0.14, 0); rid.rotation.z = -RAKE; riz.add(rid);
    kvadr(rid, M.ram, 0, 0, 0, 0.032, 0.032, 0.72);                                                       // řídítka
    kvadr(rid, M.ram, 0.04, 0.06, 0, 0.08, 0.06, 0.15);                                                   // budíky
    P.uchop = [];
    for (const g of [-1, 1]) {
      kvadr(rid, M.ram, 0, 0, g * 0.32, 0.045, 0.045, 0.12);                                              // rukojeti
      tyc(rid, M.ram, [0, 0, g * 0.25], [-0.03, 0.2, g * 0.3], 0.018);                                    // zrcátka
      kvadr(rid, M.ram, -0.03, 0.23, g * 0.31, 0.03, 0.08, 0.13);
      const u = new THREE.Object3D(); u.position.set(0, 0, g * 0.33); rid.add(u); P.uchop.push(u);
    }
    // nádrž, sedlo, záď
    const n = lak(dil(telo, KOULE, LAKY[0], 0.17, 0.95, 0, 0.33, 0.13, 0.17)); n.rotation.z = -0.12;
    kvadr(telo, M.sedlo, -0.33, 0.95, 0, 0.48, 0.07, 0.26).rotation.z = 0.05;
    lak(dil(telo, KOULE, LAKY[0], -0.66, 0.99, 0, 0.24, 0.06, 0.09)).rotation.z = 0.18;
    kvadr(telo, M.koncDen, -0.885, 0.98, 0, 0.02, 0.05, 0.1);
    P.koncove = kvadr(telo, SV.koncove, -0.897, 0.98, 0, 0.008, 0.052, 0.102);
    P.brzda = kvadr(telo, SV.brzda, -0.905, 0.98, 0, 0.008, 0.055, 0.106);
    tyc(telo, M.ram, [-0.62, 0.9, 0], [-0.86, 0.78, 0], 0.03, 0.1);                                       // držák SPZ
    kvadr(telo, M.spz, -0.87, 0.78, 0, 0.01, 0.12, 0.18).rotation.z = 0.25;
    // motor, chladič, rám, kyvná vidlice, tlumič, výfuk, stupačky
    kvadr(telo, M.motor, 0.07, 0.5, 0, 0.44, 0.36, 0.3);
    kvadr(telo, M.kov, 0.24, 0.74, 0, 0.2, 0.2, 0.34).rotation.z = -0.35;
    for (const z of [0.16, -0.16]) dil(telo, VALEC, M.motor, 0.0, 0.46, z, 0.22, 0.03, 0.22).rotation.x = Math.PI / 2;
    kvadr(telo, M.motor, 0.4, 0.66, 0, 0.05, 0.3, 0.32);
    for (const g of [-1, 1]) {
      tyc(telo, M.ram, [0.48, 1.0, g * 0.1], [-0.08, 0.76, g * 0.12], 0.06);
      tyc(telo, M.ram, [-0.08, 0.76, g * 0.12], [-0.12, 0.45, g * 0.12], 0.06);
      tyc(telo, M.ram, [-0.1, 0.8, g * 0.09], [-0.7, 0.92, g * 0.07], 0.03);
      tyc(telo, M.kov, [-0.72, R_KOLA, g * 0.1], [-0.1, 0.45, g * 0.12], 0.06, 0.04);
      tyc(telo, M.kov, [-0.4, 0.42, g * 0.1], [-0.3, 0.85, g * 0.1], 0.04, 0.04, VALEC);
      kvadr(telo, M.kov, -0.16, 0.4, g * 0.2, 0.05, 0.03, 0.12);
    }
    tyc(telo, M.kov, [0.28, 0.52, 0.12], [0.12, 0.28, 0.14], 0.05, 0.05, VALEC);
    tyc(telo, M.kov, [0.12, 0.28, 0.14], [-0.22, 0.34, 0.19], 0.05, 0.05, VALEC);
    tyc(telo, M.kov, [-0.2, 0.37, 0.2], [-0.68, 0.58, 0.2], 0.13, 0.13, VALEC);                           // tlumič výfuku
    if (!sJezdcem) { tyc(telo, M.ram, [-0.2, 0.38, -0.12], [-0.25, 0.03, -0.3], 0.03); return P; }        // boční stojánek
    // jezdec: pánev, trup, helma v barvě motorky s hledím, ruce a nohy se dopočítávají (koncetiny)
    const j = new THREE.Group(); telo.add(j); P.jezdec = j;
    kvadr(j, M.kalhoty, -0.34, 1.03, 0, 0.26, 0.18, 0.34);
    tyc(j, M.bunda, [-0.32, 1.02, 0], [-0.08, 1.47, 0], 0.26, 0.38);
    P.helma = lak(dil(j, KOULE, LAKY[0], 0.0, 1.64, 0, 0.15, 0.15, 0.14));
    P.hledi = kvadr(j, M.hledi, 0.11, 1.63, 0, 0.08, 0.09, 0.2);
    const kost = (mat, t, t2) => { const o = new THREE.Mesh(BOX, mat); o.scale.set(t, 1, t2); j.add(o); return o; };
    P.paze = [0, 1].map(() => kost(M.bunda, 0.1, 0.1)); P.predlokti = [0, 1].map(() => kost(M.bunda, 0.085, 0.085));
    P.rukavice = [0, 1].map(() => kvadr(j, M.boty, 0, 0, 0, 0.09, 0.07, 0.07));
    P.stehno = [0, 1].map(() => kost(M.kalhoty, 0.15, 0.15)); P.lytko = [0, 1].map(() => kost(M.kalhoty, 0.12, 0.12));
    P.bota = [0, 1].map(() => kvadr(j, M.boty, 0, 0, 0, 0.26, 0.1, 0.11));
    return P;
  }
  function kvadr(rodic, mat, x, y, z, dx, dy, dz) { return dil(rodic, BOX, mat, x, y, z, dx, dy, dz); }
  function obarvi(P, v) { for (const o of P.laky) o.material = LAKY[v % LAKY.length]; }

  // zaparkovaná motorka: díly slité podle materiálu (pár sítí místo ~70), lak se mění podle varianty
  function slij(P) {
    P.koren.rotation.z = 0; P.rizeni.rotation.y = 0.45;     // řídítka vytočená doleva (na stojánku)
    P.koren.updateMatrixWorld(true);
    const inv = P.koren.matrixWorld.clone().invert(), skup = new Map(), m4 = new THREE.Matrix4();
    P.koren.traverse((o) => {
      if (!o.isMesh || o.material.isMeshBasicMaterial) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      let a = skup.get(o.material); if (!a) skup.set(o.material, a = []); a.push(g);
    });
    return [...skup].map(([mat, gs]) => {
      const p = [], nn = [];
      for (const g of gs) { p.push(...g.attributes.position.array); nn.push(...g.attributes.normal.array); g.dispose(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      g.computeBoundingSphere();
      return { g, mat, lak: mat === LAKY[0] };
    });
  }
  const SLITA = slij(postav(false));
  const pool = [];
  function stojici(i) {
    while (pool.length <= i) {
      const g = new THREE.Group();
      for (const s of SLITA) { const o = new THREE.Mesh(s.g, s.mat); o.userData.lak = s.lak; o.castShadow = true; g.add(o); api.jenVeDne.push(o); }
      g.visible = false; scene3.add(g); pool.push(g);
    }
    return pool[i];
  }

  // motorka, na které se jede
  const J = postav(true);
  J.koren.visible = false; scene3.add(J.koren);
  J.koren.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) { o.castShadow = true; api.jenVeDne.push(o); } });

  // ---------- místa zaparkovaných motorek ----------
  const vzato = new Set();                                  // místa z ulic, odkud hráč odjel
  const vlastni = [];                                       // kde hráč motorku nechal (nejvýš 3)
  let mista = [], obnovaT = -1e9, idM = 0;
  function mistaSilnice(r) {                                // pevná místa jedné silnice (bez kontroly domů, ty se načítají později)
    if (r._moto) return r._moto;
    const kr = KRAJNICE[r.c], out = (r._moto = []);
    if (!kr || r.uz) return out;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of r.w) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    out.bb = [x0, y0, x1, y1];
    const uid = String(r.uid ?? r.w[0].join(','));
    const n = Math.floor(r.L / ROZESTUP + hash(uid));          // kusy silnic bývají krátké: v průměru jedna na ROZESTUP m
    for (let k = 0; k < n; k++) {
      const key = uid + '/' + k, o = api.along(r, (k + 0.1 + 0.8 * hash(key + 's')) * r.L / n), L = Math.hypot(o.dx, o.dy) || 1, strana = r.o ? 1 : hash(key) < 0.5 ? 1 : -1;
      const x = o.x + o.dy / L * kr * strana, y = o.y - o.dx / L * kr * strana;
      const h = Math.atan2(o.dy, o.dx) + (strana > 0 ? 0 : Math.PI) + (hash(key + 'h') - 0.5) * 0.6;   // po směru jízdy v pruhu, trochu šikmo
      out.push({ key, x, y, zr: o.z, h, var: Math.floor(hash(key + 'b') * BARVY.length) });
    }
    return out;
  }
  const volno = (x, y) => api.inMap(x, y) && !api.hitBuilding(x, y, 0.7) && !(api.parkovana && api.parkovana(x, y, 2.6).length);
  const vyskaMista = (s) => { if (s.z === undefined) s.z = api.vyska(s.x, s.y, Math.max(s.zr ?? -1e9, api.gz(s.x, s.y))).z; return s.z; };
  function obnovMista() {
    const hx = hrac.x, hy = hrac.y, kand = [];
    for (const r of api.roads) {
      const a = mistaSilnice(r); if (!a.length) continue;
      const b = a.bb; if (hx < b[0] - DOSAH || hx > b[2] + DOSAH || hy < b[1] - DOSAH || hy > b[3] + DOSAH) continue;
      for (const s of a) { if (vzato.has(s.key)) continue; const d = Math.hypot(s.x - hx, s.y - hy); if (d < DOSAH) kand.push([d, s]); }
    }
    kand.sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [, s] of kand) { if (out.length >= MAX_STOJICICH) break; if (volno(s.x, s.y)) out.push(s); }
    for (const s of vlastni) out.push(s);
    mista = out;
    for (let i = 0; i < Math.max(out.length, pool.length); i++) {
      const g = stojici(i), s = out[i];
      if (!s) { g.visible = false; continue; }
      g.position.set(s.x, vyskaMista(s), -s.y); g.rotation.set(-0.12, s.h, 0, 'YXZ');   // na stojánku nakloněná doleva
      for (const o of g.children) if (o.userData.lak) o.material = LAKY[s.var % LAKY.length];
      g.visible = true;
    }
  }
  function nejblizsi(x, y, r) {
    let best = null, bd = r;
    for (const s of mista) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // ---------- jezdec: postavička hráče (jizda/kenney.js, póza 'ridi'), dokud se nenačte, procedurální jezdec ----------
  const PROC = J.jezdec.children.slice();                   // díly procedurálního jezdce
  const SEDLO = { x: -0.3, y: 0.99, z: 0 };                 // počátek postavičky: v póze 'ridi' jsou kyčle ~0,33 m nad ním, tj. na sedle
  let loutka = null;
  function jezdecHrace(dt) {
    const P = api.postavy, model = api.postava?.();
    if (loutka && loutka.model !== model && model) { loutka.zrus(); loutka = null; }
    if (!loutka && P) { if (P.pripraveno) loutka = P.nova({ model, bez: true }, J.jezdec); else P.nacti?.(); }
    for (const o of PROC) o.visible = !loutka;
    if (!loutka) return;
    loutka.g.position.set(SEDLO.x, SEDLO.y, SEDLO.z); loutka.g.rotation.set(0, Math.PI / 2, 0);   // model míří na +z, motorka na +x
    loutka.skryj(false); loutka.prvniOsoba(!!hrac.kabina);
    loutka.nastav('ridi', 0, dt);
  }

  // ---------- jízda ----------
  let m = null, hlaska = '', hlaskaT = 0;
  const vis = { lean: 0, steer: 0, pitch: 0, noha: 1 };
  const tacho = () => (typeof document !== 'undefined' ? document.getElementById('tacho')?.firstChild : null);
  function rekni(t) { hlaska = t; hlaskaT = 2; }
  function srazkaAuto(nx, ny, nh) {                         // vjel by do auta v provozu (jen když se k němu blíží)
    for (const c of api.cars) {
      const p = api.carPose(c), dx = nx - p.x, dy = ny - p.y;
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) continue;
      const ch = Math.cos(p.h), sh = Math.sin(p.h), L = (c.T?.len ?? 4.2) / 2 + 0.2, W = (c.T?.wid ?? 1.8) / 2 + 0.25;
      for (const l of [0.95, 0]) {
        const qx = nx + Math.cos(nh) * l - p.x, qy = ny + Math.sin(nh) * l - p.y;
        if (Math.abs(qx * ch + qy * sh) < L && Math.abs(-qx * sh + qy * ch) < W && Math.hypot(dx, dy) < Math.hypot(m.x - p.x, m.y - p.y)) return c;
      }
    }
    return null;
  }
  function pad(duvod) {                                     // pád: motorka s jezdcem leží PAD s, pak znovu na kolech o kus zpátky
    m.pad = PAD; m.padT = 0; m.padStrana = vis.lean >= 0 ? 1 : -1; m.v = 0;
    for (let d = 0.4; d <= 2; d += 0.4) {
      const x = m.x - Math.cos(m.h) * d, y = m.y - Math.sin(m.h) * d;
      if (!api.hitBuilding(x, y, 0.4) && !api.hitBuilding(x + Math.cos(m.h) * 1.0, y + Math.sin(m.h) * 1.0, 0.12)) { m.x = x; m.y = y; break; }
    }
    api.toast?.(`Pád! ${duvod}`); api.zvuk?.('naraz');
  }
  const _g = new THREE.Vector3(), _l = new THREE.Vector3(), _k = new THREE.Vector3(), _c = new THREE.Vector3();
  const RAMENO = [V(-0.1, 1.43, -0.2), V(-0.1, 1.43, 0.2)], KYCEL = [V(-0.3, 1.0, -0.13), V(-0.3, 1.0, 0.13)];
  const KOLENO = [V(0.1, 0.9, -0.21), V(0.1, 0.9, 0.21)], STUPACKA = [V(-0.14, 0.44, -0.22), V(-0.14, 0.44, 0.22)];
  const KOLENO_ZEM = V(0.04, 0.58, -0.36), ZEM = V(0.0, 0.06, -0.44);   // levá noha na zemi, když stojí
  function koncetiny() {
    J.koren.updateMatrixWorld(true);
    for (const i of [0, 1]) {
      J.uchop[i].getWorldPosition(_g); J.jezdec.worldToLocal(_g);
      const s = RAMENO[i]; _l.copy(s).add(_g).multiplyScalar(0.5); _l.y -= 0.1; _l.z += (i ? 1 : -1) * 0.07;   // loket dolů a ven
      natahni(J.paze[i], s, _l); natahni(J.predlokti[i], _l, _g); J.rukavice[i].position.copy(_g);
      const f = i === 0 ? vis.noha : 0;
      _k.lerpVectors(KOLENO[i], KOLENO_ZEM, f); _c.lerpVectors(STUPACKA[i], ZEM, f);
      natahni(J.stehno[i], KYCEL[i], _k); natahni(J.lytko[i], _k, _c);
      J.bota[i].position.set(_c.x + 0.06, _c.y - 0.01, _c.z);
    }
  }
  function kresli(dt, a) {
    const ch = Math.cos(m.h), sh = Math.sin(m.h);
    const fz = api.vyska(m.x + ch * 0.73, m.y + sh * 0.73, m.z).z, bz = api.vyska(m.x - ch * 0.72, m.y - sh * 0.72, m.z).z;
    const f = 1 - Math.exp(-dt * 8);
    vis.pitch += (clamp(a * (a < 0 ? 0.005 : 0.003), -0.05, 0.03) - vis.pitch) * f;   // brzdění: předek se zhoupne dolů
    vis.noha += ((Math.abs(m.v) < 0.8 && !m.pad ? 1 : 0) - vis.noha) * (1 - Math.exp(-dt * 6));
    J.koren.position.set(m.x, (fz + bz) / 2, -m.y);
    J.koren.rotation.set(0, m.h, Math.atan2(fz - bz, ROZVOR) + vis.pitch, 'YXZ');
    let lean = vis.lean + vis.noha * 0.07;                  // stojí: opřený o levou nohu
    if (m.pad) lean = m.padStrana * Math.min(1, m.padT / 0.35) * 1.38;   // leží na boku
    J.telo.rotation.x = -lean;
    J.jezdec.rotation.x = -vis.lean * 0.12;                 // jezdec se do zatáčky vyklání víc než motorka
    J.rizeni.rotation.y = vis.steer;
    m.spin += m.v * dt / R_KOLA; J.koloZ.rotation.z = -m.spin; J.koloP.rotation.z = -m.spin;
    const noc = (api.doba?.() ?? 0) > 0.3;
    J.celni.visible = noc; J.koncove.visible = noc; J.brzda.visible = m.brzdi;
    jezdecHrace(dt);
    if (!loutka) koncetiny();
  }

  return {
    nazev: () => 'na motorce',
    blizko(x, y) { return !m && nejblizsi(x, y, BLIZKO) ? 'E – nasednout: motorka' : null; },
    nastup() {
      const s = nejblizsi(hrac.x, hrac.y, BLIZKO); if (!s) return false;
      if (vlastni.includes(s)) vlastni.splice(vlastni.indexOf(s), 1); else vzato.add(s.key);
      const z = vyskaMista(s);
      m = { x: s.x, y: s.y, z, h: s.h, vh: s.h, v: 0, lean: 0, steer: 0, spin: 0, most: api.vyska(s.x, s.y, z).most, var: s.var, pad: 0, padT: 0, brzdi: true };
      Object.assign(vis, { lean: 0, steer: 0, pitch: 0, noha: 1 });
      obarvi(J, s.var); J.koren.visible = true;
      hrac.x = m.x; hrac.y = m.y; hrac.z = m.z; hrac.most = m.most; hrac.rezim = 'motorka';   // chodec hráče (jizda/ulice.js) se má schovat
      api.toast?.('Motorka: W plyn, S brzda, A/D náklon, mezera smyk, Shift turbo, V pohled, E sesednout');
      obnovaT = -1e9;
      kresli(0, 0);
      return true;
    },
    krok(dt, { k, JOY = { x: 0, y: 0 } }) {
      if (!m) return;
      hlaskaT -= dt; if (hlaskaT <= 0) hlaska = '';
      let a = 0;
      if (m.pad) {
        m.padT += dt; m.pad -= dt; m.brzdi = false;
        if (m.pad <= 0) { m.pad = 0; m.lean = 0; m.steer = 0; vis.lean = 0; rekni('Zase na kolech'); }
      } else {
        const pp = Math.max(k('KeyW', 'ArrowUp') ? 1 : 0, JOY.y > 0.15 ? JOY.y : 0), bb = Math.max(k('KeyS', 'ArrowDown') ? 1 : 0, JOY.y < -0.15 ? -JOY.y : 0);
        const vol = clamp((k('KeyA', 'ArrowLeft') ? 1 : 0) - (k('KeyD', 'ArrowRight') ? 1 : 0) - (JOY.x || 0), -1, 1);
        const turbo = k('ShiftLeft', 'ShiftRight'), smyk = k('Space'), vmax = turbo ? VTURBO : VMAX;
        // plyn: 0–100 km/h asi za 4 s; brzda obě kola; mezera = zablokované zadní (smyk); couvat jen odstrkáváním nohama
        if (pp) a = m.v < -0.2 ? 4 * pp : (turbo ? 6.2 : 5.0) * pp * (1 - Math.pow(Math.max(0, m.v) / (vmax * 1.06), 2));   // 0–100 km/h asi za 6 s
        if (bb) a = m.v > 0.3 ? -9.5 * bb : m.v > -1.3 ? -1.6 * bb : 0;
        if (smyk) a = Math.abs(m.v) > 0.3 ? -Math.sign(m.v) * 6.5 : 0;
        a -= Math.sign(m.v) * (0.2 + 0.00035 * m.v * m.v);   // valivý a vzdušný odpor
        const v0 = m.v; m.v += a * dt; if (!pp && !bb && Math.sign(m.v) !== Math.sign(v0)) m.v = 0;
        m.brzdi = (bb > 0 && m.v > 0.3) || smyk || Math.abs(m.v) < 0.2;
        // řízení: rychle náklonem (zatáčka z náklonu ω = g·tan λ / v), pomalu řídítky (rejd); mezi 2,5 a 7,5 m/s plynule
        const wx = api.pocasi?.() || {}, lmax = NAKLON_MAX * (1 - 0.3 * (wx.dest || 0) - 0.45 * (wx.snih || 0));
        const av = Math.abs(m.v), w = m.v > 0 ? clamp((av - 2.5) / 5, 0, 1) : 0;
        m.lean += (vol * lmax - m.lean) * Math.min(1, dt * 3.5);
        m.steer += (vol * RIDITKA_MAX - m.steer) * Math.min(1, dt * 6);
        const omR = m.v * Math.tan(m.steer) / ROZVOR, omN = av > 0.5 ? G * Math.tan(m.lean) / av : 0;
        const om = (omR * (1 - w) + omN * w) * (smyk && av > 4 ? 1.3 : 1);
        const leanCil = clamp(Math.atan(m.v * om / G), -lmax, lmax);   // skutečný náklon odpovídá zatáčce
        vis.lean += (leanCil - vis.lean) * Math.min(1, dt * 8);
        vis.steer += ((1 - w) * m.steer + w * clamp(om * ROZVOR / Math.max(av, 1), -0.08, 0.08) - vis.steer) * Math.min(1, dt * 8);
        const nh = m.h + om * dt;
        m.vh += wrapA(nh - m.vh) * Math.min(1, dt * (smyk && av > 4 ? 1.6 : 12));   // smyk: směr jízdy zaostává za motorkou
        const nx = m.x + Math.cos(m.vh) * m.v * dt, ny = m.y + Math.sin(m.vh) * m.v * dt;
        const bod = (l) => [nx + Math.cos(nh) * l, ny + Math.sin(nh) * l];
        const zed = [[1.0, 0.12], [-0.95, 0.12], [0, 0.3]].some(([l, r]) => api.hitBuilding(...bod(l), r));
        const nv = api.vyska(nx, ny, m.z), pv = api.vyska(...bod(1.0), m.z);
        const pres = m.most && [nv, pv].some((q) => api.zabradli(m.z, q));
        const auto = !zed && srazkaAuto(nx, ny, nh);
        if (zed || auto || pres || !api.inMap(nx, ny)) {
          if ((zed || auto) && av > NARAZ) pad(zed ? 'Motorka narazila do zdi.' : 'Srážka s autem.');
          else { if (av > 2) { rekni(pres ? 'Zábradlí mostu!' : auto ? 'Pozor, auto!' : 'Bum! Pozor na zdi.'); api.zvuk?.('uder'); } m.v = -m.v * 0.2; m.vh = m.h; }
        } else { m.x = nx; m.y = ny; m.h = nh; m.z = nv.z; m.most = nv.most; }
      }
      hrac.x = m.x; hrac.y = m.y; hrac.z = m.z; hrac.most = m.most; hrac.yaw = m.h;
      const t = tacho(); if (t) t.nodeValue = Math.round(Math.abs(m.v) * 3.6) + ' ';
      kresli(dt, a);
    },
    kamera(camera, fwd, orbit, dt) {
      if (!m) return;
      const lean = J.telo.rotation.x * -1;
      if (hrac.kabina) {                                    // z helmy: oko jezdce, pohled myší (orbit.yaw, orbit.look), obraz nakloněný s motorkou
        J.helma.visible = false; J.hledi.visible = false;   // (postavička: hlavu schová prvniOsoba)
        J.koren.updateMatrixWorld(true);
        const oko = J.jezdec.localToWorld(_g.set(0.08, 1.66, 0));
        camera.position.copy(oko);
        const a = m.h + orbit.yaw, look = orbit.look - 0.06;
        fwd.set(Math.cos(a) * Math.cos(look), Math.sin(look), -Math.sin(a) * Math.cos(look)).normalize();
        camera.lookAt(_l.copy(oko).add(fwd));
        camera.rotateZ(lean * 0.85);
        return;
      }
      J.helma.visible = !loutka; J.hledi.visible = !loutka;
      // zezadu: rameno ~5,5 m (kolečko myši u auta mění orbit.dist, tady v poměru), dům ani strom mezi kamerou a motorkou
      const d = clamp(orbit.dist * 0.65, 4, 14), h = m.h + orbit.yaw, cp = Math.cos(orbit.pitch), tz = m.z + 1.0;
      let px = m.x - Math.cos(h) * cp * d, py = m.y - Math.sin(h) * cp * d, pz = Math.max(tz + Math.sin(orbit.pitch) * d, api.gz(px, py) + 0.8);
      let f = 1;
      for (let i = 1; i <= 14; i++) { const q = i / 14; if (api.hitBuilding(m.x + (px - m.x) * q, m.y + (py - m.y) * q, 0.35)) { f = Math.max(0.15, q - 0.12); break; } }
      const tt = api.stromy?.prekazka?.(m.x, m.y, tz, px, py, pz) ?? 1;
      if (tt < 1) f = Math.min(f, Math.max(3 / d, tt * 0.92));
      if (f < 1) { px = m.x + (px - m.x) * f; py = m.y + (py - m.y) * f; pz = Math.max(tz + (pz - tz) * f, api.gz(px, py) + 0.6); }
      const want = _k.set(px, pz, -py);
      if (orbit.snap || f < 1) { camera.position.copy(want); orbit.snap = false; } else camera.position.lerp(want, 1 - Math.exp(-dt * 10));
      const T = _c.set(m.x, tz, -m.y);
      camera.lookAt(T); fwd.copy(T).sub(camera.position).normalize();
      camera.rotateZ(lean * 0.2);
    },
    vystup() {
      if (!m || m.pad || Math.abs(m.v) > 1.5) return null;
      const ch = Math.cos(m.h), sh = Math.sin(m.h);
      let p = null;
      for (const [sx, sy] of [[-sh, ch], [sh, -ch]]) for (const d of [0.9, 1.4]) {   // vlevo od motorky, jinak vpravo
        if (p) break;
        const x = m.x + sx * d, y = m.y + sy * d;
        if (api.hitBuilding(x, y, 0.35) || !api.inMap(x, y)) continue;
        const v = api.vyska(x, y, m.z); if (m.most && api.zabradli(m.z, v)) continue;
        p = { x, y, z: v.z, yaw: m.h };
      }
      p = p || { x: m.x, y: m.y, z: m.z, yaw: m.h };
      vlastni.push({ key: 'v' + (++idM), x: m.x, y: m.y, z: m.z, h: m.h, var: m.var });   // motorka zůstane stát, kde jsem sesedl
      if (vlastni.length > 3) vlastni.shift();
      J.koren.visible = false; m = null; obnovaT = -1e9; delete hrac.rezim;
      const t = tacho(); if (t) t.nodeValue = '0 ';
      return p;
    },
    stav() {
      if (!m) return '';
      if (m.pad) return 'Motorka leží…';
      return `Motorka · ${Math.round(Math.abs(m.v) * 3.6)} km/h` + (Math.abs(m.v) < 0.5 ? ' · E – sesednout' : '') + (hlaska ? ' · ' + hlaska : '');
    },
    vzduch: () => false,
    update(dt, now) {
      if (now - obnovaT > 500) { obnovaT = now; obnovMista(); }
    },
    get jizda() { return m; },                              // ladění (window.__jizda.REZIMY)
    get mista() { return mista; },
    get loutka() { return loutka; }, SEDLO,
  };
}
