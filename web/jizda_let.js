// Letadla a vrtulníky na letišti (3D jízda): stojí na stáních z doplňku letiste (assets/doplnky/letiste.json),
// u letadla E = nastoupit a pilotovat, E na zemi skoro v klidu = vystoupit. Rozhraní režimu viz REZIMY ve web/jizda.html.
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y). Model míří podél lokální +x, lokální +z je pravé křídlo.
//
// Letadlo: rychlost V po dráze letu se sklonem γ a kurzem h, podélný sklon θ (α = θ − γ), náklon φ (+ = vpravo).
//   Vztlak ∝ V²·CL(α), nad ~16° α odtržení proudu (pád), odpor CD0 + k·CL², tah ∝ plyn·(1 − V/Vp).
//   Zatáčka z náklonu: dh = −L·sin φ / (m·V·cos γ). Na zemi: valení po trávě, brzda, příďové kolo (směrovka / křidélka).
// Vrtulník: tah rotoru podél osy trupu (asistence drží svislou rychlost podle kolektivu), cyklika naklání, A/D vrtulka.
// Ovládání letadla: W/S nebo Shift/Ctrl plyn, ↑ potlačit (nos dolů), ↓ přitáhnout, ←/→ nebo A/D křidélka, Z/X směrovka,
//   mezerník brzda. Vrtulník: W/S kolektiv (stoupat / klesat), ↑/↓ cyklika dopředu / dozadu, ←/→ do stran, A/D (Z/X) otáčení.
export function vytvorLetani(api) {
  const { THREE, scene3, gz, hitBuilding, inMap, CAM, hrac, jenVeDne, LETISTE } = api;
  if (!LETISTE || !Array.isArray(LETISTE.stani) || !LETISTE.stani.length) return null;
  const G = 9.81, RHO = 1.2, VYSKA_MAX = 1500, KROK = 1 / 120;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const doSveta = (ll) => [(ll[1] - CAM.lon0) * CAM.kx, (ll[0] - CAM.lat0) * CAM.ky];
  const toast = (t, k = 'info') => { try { api.toast(t, k); } catch {} };
  const zvuk = (n) => { try { api.zvuk?.(n); } catch {} };

  // ---------- dráhy a stání ----------
  const drahy = (LETISTE.drahy || []).map((d) => { const a = doSveta(d.a), b = doSveta(d.b); return { a, b, w: d.sirka || 30 }; });
  const kDraze = (x, y) => {                                   // nejbližší bod osy dráhy a vzdálenost od ní
    let best = null;
    for (const d of drahy) {
      const ex = d.b[0] - d.a[0], ey = d.b[1] - d.a[1], l2 = ex * ex + ey * ey || 1, t = clamp(((x - d.a[0]) * ex + (y - d.a[1]) * ey) / l2, 0, 1);
      const px = d.a[0] + ex * t, py = d.a[1] + ey * t, dd = Math.hypot(px - x, py - y);
      if (!best || dd < best.d) best = { x: px, y: py, d: dd, w: d.w };
    }
    return best;
  };
  const smerKDraze = (x, y) => { const p = kDraze(x, y); return p && p.d > 1 ? Math.atan2(p.y - y, p.x - x) : 0; };
  const stani = LETISTE.stani.map((ll) => { const [x, y] = doSveta(ll); return { x, y, h: smerKDraze(x, y) }; });
  const silniceBlizko = (x, y, r) => {                         // vrtulník nestaví na silnici ani parkoviště
    for (const s of api.roads || []) {
      const w = s.w; if (!w || !w.length || Math.abs(w[0][0] - x) > 900 || Math.abs(w[0][1] - y) > 900) continue;
      for (let i = 0; i + 1 < w.length; i++) {
        const ax = w[i][0], ay = w[i][1], ex = w[i + 1][0] - ax, ey = w[i + 1][1] - ay, l2 = ex * ex + ey * ey || 1;
        const t = clamp(((x - ax) * ex + (y - ay) * ey) / l2, 0, 1);
        if (Math.hypot(ax + ex * t - x, ay + ey * t - y) < r) return true;
      }
    }
    return false;
  };

  // ---------- modely (jednou pro typ, instance jsou klony se sdílenou geometrií) ----------
  const MAT = new Map();
  const lam = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); if (!MAT.has(k)) MAT.set(k, new THREE.MeshLambertMaterial({ color: c, ...o })); return MAT.get(k); };
  const zar = (c) => { const k = 'b' + c; if (!MAT.has(k)) MAT.set(k, new THREE.MeshBasicMaterial({ color: c })); return MAT.get(k); };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
  const box = (sx, sy, sz, m, x, y, z) => mesh(new THREE.BoxGeometry(sx, sy, sz), m, x, y, z);
  // kvádr zúžený podél x: průřez a = [šířka, výška, střed y] v x0, b v x1 (trup, kryt motoru, ocasní kužel)
  const klin = (x0, x1, a, b, m) => {
    const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const e = p.getX(i) < 0 ? a : b;
      p.setXYZ(i, p.getX(i) < 0 ? x0 : x1, e[2] + Math.sign(p.getY(i)) * e[1] / 2, Math.sign(p.getZ(i)) * e[0] / 2);
    }
    g.computeVertexNormals();
    return mesh(g, m);
  };
  const tyc = (a, b, r, m) => {                                 // vzpěra mezi dvěma body
    const A = V3(...a), B = V3(...b), d = B.clone().sub(A), o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m);
    o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return o;
  };
  const kolo = (r, w, x, y, z) => { const o = mesh(new THREE.CylinderGeometry(r, r, w, 12), lam(0x1e1e1e)); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); return o; };
  const plocha = (pts, t, m, z = 0) => {                         // svislá deska z obrysu v rovině xy (kýlovka, směrovka)
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); g.translate(0, 0, z - t / 2); return mesh(g, m);
  };
  const svetlo = (c, x, y, z, r = 0.09) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), zar(c)); o.position.set(x, y, z); o.userData.svetlo = true; return o; };
  // rozmazaný kotouč vrtule / rotoru (průhledný: stín nevrhá)
  const kotouc = (r) => { const o = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshLambertMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); o.userData.kotouc = true; o.userData.bezStinu = true; return o; };

  // vysokoplošník: Cessna 172 (P.ul = false) nebo ultralehké letadlo (P.ul = true)
  function stavLetadlo(P) {
    const g = new THREE.Group(), bila = lam(P.trup), b1 = lam(P.pruh1), b2 = lam(P.pruh2), okno = lam(0x27384a), kov = lam(0x8f969c), tm = lam(0x2b2b2b);
    const s = P.s;                                             // měřítko ultralightu
    const cab = [1.15 * s, 1.25 * s, 1.45 * s], kryt0 = [1.1 * s, 0.9 * s, 1.15 * s], nos = [0.75 * s, 0.65 * s, 1.12 * s];
    g.add(klin(1.5 * s, 2.5 * s, kryt0, nos, bila));                                  // kryt motoru
    const kuz = mesh(new THREE.ConeGeometry(0.17 * s, 0.35 * s, 10), tm, 2.66 * s, 1.12 * s, 0); kuz.rotation.z = -Math.PI / 2; g.add(kuz);
    g.add(klin(-0.4 * s, 1.0 * s, cab, cab, bila));                                    // kabina
    if (P.ul) g.add(klin(-1.4 * s, -0.4 * s, [0.5 * s, 0.6 * s, 1.55 * s], cab, bila), tyc([-1.3 * s, 1.55 * s, 0], [-5.0 * s, 1.6 * s, 0], 0.09, bila));   // ultralight: krátký trup a nosník
    else g.add(klin(-5.3, -0.4, [0.24, 0.42, 1.62], cab, bila));                       // ocasní kužel
    const kab = [];                                             // okna (z kabiny se skryjí, jinak by zakryla výhled)
    for (const sz of [-1, 1]) {
      const o = box(1.25 * s, 0.5 * s, 0.02, okno, 0.55 * s, 1.73 * s, sz * (cab[0] / 2 + 0.012)); kab.push(o); g.add(o);
      if (P.ul) { const o2 = box(0.9 * s, 0.35 * s, 0.02, okno, 0.6 * s, 1.15 * s, sz * (cab[0] / 2 + 0.012)); kab.push(o2); g.add(o2); }
      const o3 = box(0.4 * s, 0.4 * s, 0.02, okno, -0.1 * s, 1.73 * s, sz * (cab[0] / 2 + 0.008)); kab.push(o3); g.add(o3);
      g.add(box(1.4 * s, 0.08, 0.02, b1, 0.3 * s, 1.08 * s, sz * (cab[0] / 2 + 0.006)));    // pruhy na boku kabiny (trup za ní se zužuje)
      g.add(box(1.4 * s, 0.05, 0.02, b2, 0.3 * s, 0.98 * s, sz * (cab[0] / 2 + 0.006)));
    }
    const sklo = klin(1.0 * s, 1.5 * s, cab, [kryt0[0], 0.77 * s, 1.215 * s], okno); kab.push(sklo); g.add(sklo);   // čelní sklo: šikmo dolů ke krytu motoru
    g.add(box(0.1, 0.24 * s, 0.9 * s, tm, 1.3 * s, 1.3 * s, 0));                       // přístrojová deska
    const wy = cab[2] + cab[1] / 2 + 0.07, rozp = P.rozpeti;
    g.add(box(P.hloubka, 0.13, rozp, bila, 0.45 * s, wy, 0));                          // křídlo
    for (const sz of [-1, 1]) {
      g.add(box(P.hloubka * 0.98, 0.135, 0.5, b1, 0.45 * s, wy, sz * (rozp / 2 - 0.25)));   // konce křídel
      g.add(tyc([0.45 * s, 1.0 * s, sz * cab[0] / 2], [0.45 * s, wy - 0.06, sz * rozp * 0.27], 0.035, kov));   // vzpěry
      g.add(tyc([0 * s, 0.9 * s, sz * 0.35 * s], [0, P.kolo, sz * P.rozchod / 2], 0.04, kov), kolo(P.kolo, 0.16, 0, P.kolo, sz * P.rozchod / 2));
    }
    g.add(tyc([1.9 * s, 0.75 * s, 0], [1.9 * s, P.kolo * 0.85, 0], 0.04, kov), kolo(P.kolo * 0.85, 0.13, 1.9 * s, P.kolo * 0.85, 0));   // příďové kolo
    const xo = P.ul ? -5.0 * s : -5.3;                                               // ocasní plochy
    g.add(box(1.0 * s, 0.07, 3.4 * s, bila, xo + 0.2, 1.62 * s, 0));
    g.add(plocha([[xo - 0.25, 1.6 * s], [xo + 1.15 * s, 1.6 * s], [xo + 0.2, 2.95 * s], [xo - 0.4, 2.95 * s]], 0.08, bila));
    g.add(plocha([[xo - 0.27, 2.2 * s], [xo + 0.6 * s, 2.2 * s], [xo + 0.3 * s, 2.55 * s], [xo - 0.33, 2.55 * s]], 0.09, b1));
    const vrt = new THREE.Group(); vrt.position.set(2.86 * s, 1.12 * s, 0);          // vrtule
    const list = box(0.05, P.vrtule * 2, 0.13, tm, 0, 0, 0); vrt.add(list);
    const kt = kotouc(P.vrtule); kt.rotation.y = Math.PI / 2; vrt.add(kt);
    g.add(vrt);
    const sv = {                                                // polohová světla: levé červené, pravé zelené, ocas bílé, zábleskové
      l: svetlo(0xff2a2a, 0.45 * s, wy, -rozp / 2 - 0.05), r: svetlo(0x2aff5a, 0.45 * s, wy, rozp / 2 + 0.05), t: svetlo(0xffffff, xo - 0.42, 1.65 * s, 0),
      z: [svetlo(0xffffff, 0.3 * s, wy, -rozp / 2 - 0.05, 0.12), svetlo(0xffffff, 0.3 * s, wy, rozp / 2 + 0.05, 0.12)], m: [svetlo(0xff1a1a, xo - 0.38, 2.98 * s, 0, 0.1)],
    };
    for (const o of [sv.l, sv.r, sv.t, ...sv.z, ...sv.m]) g.add(o);
    return { g, vrt, list, kt, kab, sv };
  }

  function stavVrtulnik(P) {                                     // Robinson R44: bublina kabiny, nosník, dvoulistý rotor, ližiny
    const g = new THREE.Group(), tr = lam(P.trup), b1 = lam(P.pruh1), okno = lam(0x24323f), kov = lam(0x9aa1a7), tm = lam(0x2b2b2b);
    const telo = mesh(new THREE.SphereGeometry(1, 16, 12), tr, 0.35, 1.32, 0); telo.scale.set(1.3, 0.92, 0.72); g.add(telo);
    const sklo = mesh(new THREE.SphereGeometry(1.025, 16, 12, Math.PI - 1.0, 2.0, 0.25, 1.3), okno, 0.35, 1.32, 0); sklo.scale.copy(telo.scale); g.add(sklo);
    g.add(box(1.3, 0.55, 0.95, tr, -0.75, 1.75, 0), box(0.9, 0.35, 0.7, kov, -0.5, 2.15, 0));   // motor a převodovka za kabinou
    g.add(box(0.12, 0.25, 0.8, tm, 1.15, 1.25, 0));                                    // přístroje
    const nosnik = mesh(new THREE.CylinderGeometry(0.08, 0.17, 5.0, 10), tr, -3.6, 1.6, 0); nosnik.rotation.z = Math.PI / 2; g.add(nosnik);
    g.add(plocha([[-6.15, 1.1], [-5.75, 1.45], [-5.85, 2.55], [-6.35, 2.6], [-6.2, 1.1]], 0.06, b1));   // kýlovka
    g.add(box(0.5, 0.05, 1.3, tr, -5.7, 1.62, 0));
    for (const sz of [-1, 1]) {
      g.add(box(0.5, 0.05, 0.02, b1, -2.2, 1.62, sz * 0.14));
      const liz = mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.9, 6), kov, 0.1, 0.06, sz * 1.05); liz.rotation.z = Math.PI / 2; g.add(liz);
      g.add(tyc([0.85, 0.06, sz * 1.05], [0.75, 0.85, sz * 0.45], 0.04, kov), tyc([-0.7, 0.06, sz * 1.05], [-0.6, 0.95, sz * 0.4], 0.04, kov));
    }
    g.add(tyc([0, 2.3, 0], [0, 2.72, 0], 0.07, kov));                                  // hřídel rotoru
    const rot = new THREE.Group(); rot.position.set(0, 2.75, 0);
    const list = box(P.rotor * 2, 0.05, 0.26, tm, 0, 0, 0); rot.add(list);
    const kt = kotouc(P.rotor); kt.rotation.x = -Math.PI / 2; rot.add(kt); g.add(rot);
    const vrt = new THREE.Group(); vrt.position.set(-6.1, 1.75, -0.12);                 // vyrovnávací vrtulka vlevo
    const vl = box(0.07, 1.45, 0.03, tm, 0, 0, 0); vrt.add(vl);
    const vk = kotouc(0.72); vk.position.z = -0.02; vrt.add(vk); g.add(vrt);
    const sv = {
      l: svetlo(0xff2a2a, -0.6, 1.75, -0.5), r: svetlo(0x2aff5a, -0.6, 1.75, 0.5), t: svetlo(0xffffff, -6.4, 1.6, 0),
      z: [svetlo(0xffffff, -6.35, 2.62, 0, 0.1)], m: [svetlo(0xff1a1a, -0.5, 2.36, 0, 0.11), svetlo(0xff1a1a, 0.4, 0.38, 0, 0.1)],
    };
    for (const o of [sv.l, sv.r, sv.t, ...sv.z, ...sv.m]) g.add(o);
    return { g, rot, list, kt, vrt, vl, vk, kab: [sklo], sv };
  }

  // ---------- typy ----------
  const TYPY = {
    c172: { nazev: 'Cessna 172', m: 1100, S: 16.2, T0: 3800, Vp: 88, cd0: 0.032, k: 0.05, Vr: 28, wb: 1.9, delka: 8.3, rozpeti: 11, oko: [0.55, 1.88, -0.28],
      model: () => stavLetadlo({ s: 1, ul: false, trup: 0xf3f3ef, pruh1: 0x1f4f9a, pruh2: 0xc0262d, rozpeti: 11, hloubka: 1.5, kolo: 0.3, rozchod: 2.5, vrtule: 0.95 }) },
    ul: { nazev: 'ultralight', m: 450, S: 13, T0: 1900, Vp: 70, cd0: 0.04, k: 0.055, Vr: 19, wb: 1.5, delka: 6.3, rozpeti: 9.6, oko: [0.45, 1.66, -0.25],
      model: () => stavLetadlo({ s: 0.88, ul: true, trup: 0xf6f4ea, pruh1: 0xe8a317, pruh2: 0xc6402a, rozpeti: 9.6, hloubka: 1.35, kolo: 0.25, rozchod: 2.0, vrtule: 0.85 }) },
    heli: { nazev: 'Robinson R44', heli: true, m: 1000, rotor: 5.0, delka: 9, rozpeti: 10, oko: [0.75, 1.5, -0.3] },
  };
  const VZORY = new Map();
  const vzor = (typ, barvy) => {
    const k = typ + (barvy ? barvy.trup : '');
    if (!VZORY.has(k)) VZORY.set(k, typ === 'heli' ? stavVrtulnik({ rotor: 5.0, ...barvy }) : TYPY[typ].model());
    return VZORY.get(k);
  };
  // klon modelu: sdílená geometrie a materiály, kotouče vlastní materiál (průhlednost podle otáček)
  function instance(typ, barvy) {
    const v = vzor(typ, barvy), g = v.g.clone(true);
    // clone zachovává pořadí potomků: dohledat odpovídající díly podle cesty v původním stromu
    const cesta = (o) => { const p = []; while (o && o !== v.g) { p.unshift(o.parent.children.indexOf(o)); o = o.parent; } return p; };
    const vem = (o) => { if (!o) return null; let x = g; for (const i of cesta(o)) x = x.children[i]; return x; };
    const d = { g, kab: v.kab.map(vem), sv: { l: vem(v.sv.l), r: vem(v.sv.r), t: vem(v.sv.t), z: v.sv.z.map(vem), m: v.sv.m.map(vem) } };
    for (const k of ['vrt', 'list', 'kt', 'rot', 'vl', 'vk']) d[k] = vem(v[k]);
    for (const k of ['kt', 'vk']) if (d[k]) d[k].material = d[k].material.clone();
    g.traverse((o) => { if (o.isMesh && !o.userData.svetlo) jenVeDne.push(o); });
    return d;
  }

  // ---------- letadla na stáních ----------
  const ACS = [];
  const pridej = (typ, st, barvy) => {
    const T = TYPY[typ] || TYPY.c172, d = instance(TYPY[typ] ? typ : 'c172', barvy);
    const ac = { typ, T, heli: !!T.heli, d, st, x: st.x, y: st.y, z: gz(st.x, st.y), h: st.h, th: 0, fi: 0, ga: 0, V: 0, vx: 0, vy: 0, vz: 0,
      thr: 0, rpm: 0, zem: true, hav: 0, nazev: T.nazev + (barvy?.jmeno ? ' ' + barvy.jmeno : '') };
    scene3.add(d.g); ACS.push(ac); poloz(ac);
    return ac;
  };
  for (const l of LETISTE.letadla || []) { const st = stani[l.stani]; if (st) pridej(l.typ, { ...st }); }
  if (!ACS.length) pridej('c172', { ...stani[0] });
  // vrtulníky: kousek od stání (mimo dráhu, silnice a domy; domy se ověří, až se načte okolí)
  const st0 = stani.reduce((s, p) => [s[0] + p.x / stani.length, s[1] + p.y / stani.length], [0, 0]);
  const pd = kDraze(st0[0], st0[1]), nx = pd && pd.d > 1 ? (st0[0] - pd.x) / pd.d : 0, ny = pd && pd.d > 1 ? (st0[1] - pd.y) / pd.d : 1;   // směr od dráhy
  const KANDIDATI = [];
  for (const [u, n] of [[-35, 0], [35, 0], [-35, 20], [35, 20], [-55, 0], [55, 0], [0, 35], [-30, 40], [30, 40], [-75, 5], [75, 5], [0, -20]])
    KANDIDATI.push([st0[0] - ny * u + nx * n, st0[1] + nx * u + ny * n]);   // u podél řady stání, n od dráhy
  const volneProHeli = (x, y, ja, domy) => {
    const p = kDraze(x, y); if (p && p.d < p.w / 2 + 8) return false;
    if (ACS.some((o) => o !== ja && Math.hypot(o.x - x, o.y - y) < 15)) return false;
    if (silniceBlizko(x, y, 7)) return false;
    return !domy || !hitBuilding(x, y, 7);
  };
  const HELI = [{ trup: 0xb3202a, pruh1: 0xf0f0ea, jmeno: '' }, { trup: 0x1d3c6e, pruh1: 0xe9c43a, jmeno: '' }];
  for (const b of HELI) {
    const k = KANDIDATI.find(([x, y]) => volneProHeli(x, y, null, false)) || KANDIDATI[0];
    const st = { x: k[0], y: k[1], h: smerKDraze(k[0], k[1]) };
    pridej('heli', st, b);
  }
  let heliOvereno = 0;                                          // 0 = čeká na načtení domů kolem letiště
  function overHeli() {                                         // po načtení čtverce: vrtulník v domě přestěhovat
    for (const ac of ACS) if (ac.heli && ac !== aktivni && ac.zem && ac.x === ac.st.x && ac.y === ac.st.y && hitBuilding(ac.x, ac.y, 7)) {
      const k = KANDIDATI.find(([x, y]) => volneProHeli(x, y, ac, true)); if (!k) continue;
      ac.st = { x: k[0], y: k[1], h: smerKDraze(k[0], k[1]) }; ac.x = k[0]; ac.y = k[1]; ac.h = ac.st.h; ac.z = gz(ac.x, ac.y); poloz(ac);
    }
  }

  function poloz(ac) {                                          // model podle stavu
    ac.d.g.position.set(ac.x, ac.z, -ac.y);
    ac.d.g.rotation.set(ac.fi, ac.h, ac.th, 'YZX');
  }

  // ---------- pilotování ----------
  let aktivni = null, cam = null, kamO = new THREE.Vector3(), okrajT = 0, varovani = '';
  const vlevo = (h) => [-Math.sin(h), Math.cos(h)];
  function havarie(ac, proc) {
    if (ac.hav > 0) return;
    ac.hav = 2; ac.V = 0; ac.vx = ac.vy = ac.vz = 0; ac.thr = 0;
    zvuk('naraz'); toast('Havárie' + (proc ? ': ' + proc : ''), 'chyba');
  }
  function zpetNaStani(ac) {
    Object.assign(ac, { x: ac.st.x, y: ac.st.y, h: ac.st.h, th: 0, fi: 0, ga: 0, V: 0, vx: 0, vy: 0, vz: 0, thr: 0, zem: true, hav: 0 });
    ac.z = gz(ac.x, ac.y); if (ac.heli) ac.rpm = Math.min(ac.rpm, 0.3); poloz(ac);
  }
  let kamF = 1;                                                 // zkrácení ramene kamery u hangáru (plynule)
  const vyskaDomu = (x, y) => (typeof api.vrsekBudovy === 'function' ? api.vrsekBudovy(x, y) : null);   // když stránka umí výšku domů
  function narazDum(ac, body, agl) {                            // body [x, y] trupu, křídel, rotoru
    for (const [x, y, r] of body) {
      const t = vyskaDomu(x, y);
      if (t !== null && t !== undefined ? ac.z < t + 0.3 && hitBuilding(x, y, r) : agl < 16 && hitBuilding(x, y, r)) return true;
    }
    return false;
  }
  function okrajMapy(ac, vx, vy, dt) {                         // před okrajem mapy: varovat a stočit zpět
    if (inMap(ac.x + vx * 6, ac.y + vy * 6)) return false;
    if (performance.now() - okrajT > 5000) { okrajT = performance.now(); toast('Okraj mapy – otáčím zpět', 'info'); }
    const hc = Math.atan2(-ac.y, -ac.x);                        // ke středu mapy (čtverec 0, 0)
    if (ac.heli) { const vn = (vx * Math.cos(hc) + vy * Math.sin(hc)); if (vn < 0) { ac.vx -= vn * Math.cos(hc) * 1.2; ac.vy -= vn * Math.sin(hc) * 1.2; } }
    else {
      const e = wrapA(hc - ac.h); ac.fi += (-Math.sign(e) * 0.5 - ac.fi) * Math.min(1, dt * 2);
      if (!inMap(ac.x, ac.y)) ac.h += Math.sign(e) * 0.3 * dt;   // už za okrajem: otočit i proti vůli pilota
    }
    return true;
  }

  function krokLetadlo(ac, dt, k, JOY) {
    const T = ac.T, m = T.m, W = m * G;
    const plyn = (k('KeyW', 'ShiftLeft', 'ShiftRight') ? 1 : 0) - (k('KeyS', 'ControlLeft', 'ControlRight') ? 1 : 0);
    ac.thr = clamp(ac.thr + plyn * 0.5 * dt, 0, 1);
    ac.rpm += (0.22 + 0.78 * ac.thr - ac.rpm) * Math.min(1, dt * 1.5);
    const vysk = clamp((k('ArrowDown') ? 1 : 0) - (k('ArrowUp') ? 1 : 0) - (Math.abs(JOY.y) > 0.12 ? JOY.y : 0), -1, 1);   // + = přitáhnout (nos nahoru)
    const kri = clamp((k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0) + (Math.abs(JOY.x) > 0.12 ? JOY.x : 0), -1, 1);   // + = náklon vpravo
    const smer = (k('KeyX') ? 1 : 0) - (k('KeyZ') ? 1 : 0);   // + = vpravo
    const brzda = k('Space');
    const tah = ac.thr * T.T0 * Math.max(0, 1 - ac.V / T.Vp) * clamp(ac.rpm * 1.2, 0, 1);
    const q = 0.5 * RHO * ac.V * ac.V * T.S;
    const CL = (a) => { const as = 0.279; return a < as ? clamp(0.35 + 5.5 * a, -0.9, 2) : Math.max(0.6, 1.88 - (a - as) * 4); };
    const zg = gz(ac.x, ac.y);
    varovani = '';
    if (ac.zem) {
      // na zemi: rotace jen od rychlosti blízko Vr, jinak nos na příďovém kole
      if (vysk > 0 && ac.V > T.Vr * 0.75) ac.th = Math.min(0.21, ac.th + 0.22 * vysk * dt);
      else ac.th = Math.max(0, ac.th - 0.3 * dt);
      const L = q * CL(ac.th), D = q * (T.cd0 + T.k * CL(ac.th) ** 2);
      const N = Math.max(0, W - L), tr = (brzda ? 0.45 : 0.045) * N;   // tráva: valivý odpor; brzda
      let a = (tah - D) / m;
      if (ac.V > 0.05 || a > tr / m) a -= tr / m; else a = 0;
      ac.V = Math.max(0, ac.V + a * dt);
      const rid = clamp(smer + kri, -1, 1) * 0.6 / (1 + ac.V / 6);   // příďové kolo
      ac.h += ac.V / T.wb * Math.tan(rid) * dt;
      ac.fi = 0; ac.ga = 0;
      const nx = ac.x + Math.cos(ac.h) * ac.V * dt, ny = ac.y + Math.sin(ac.h) * ac.V * dt;
      const body = [[nx + Math.cos(ac.h) * T.delka * 0.32, ny + Math.sin(ac.h) * T.delka * 0.32, 0.3], [nx - Math.sin(ac.h) * T.rozpeti / 2, ny + Math.cos(ac.h) * T.rozpeti / 2, 0.2], [nx + Math.sin(ac.h) * T.rozpeti / 2, ny - Math.cos(ac.h) * T.rozpeti / 2, 0.2]];
      if (narazDum(ac, body, 0)) { if (ac.V > 5) havarie(ac, 'náraz do budovy'); else ac.V = 0; return; }
      if (!inMap(nx, ny)) { ac.V = 0; return; }
      ac.x = nx; ac.y = ny; ac.z = gz(nx, ny);
      if (L > W) { ac.zem = false; ac.ga = 0.02; ac.z += 0.05; }   // vzlet
      return;
    }
    // ve vzduchu
    const agl = ac.z - zg;
    if (vysk) ac.th += vysk * 0.5 * clamp(ac.V / 30, 0.3, 1.3) * dt;
    else ac.th += (ac.ga + 0.05 - ac.th) * Math.min(1, 0.15 * dt);   // podélná stabilita: bez zásahu se nos vrací k dráze letu
    let al = ac.th - ac.ga;
    const pad = al > 0.279;
    if (pad) { ac.th -= 0.6 * dt; ac.fi += Math.sin(performance.now() / 300) * 0.25 * dt; varovani = 'PÁDOVÁ RYCHLOST'; }
    else if (al > 0.22 || ac.V < 1.1 * Math.sqrt(2 * W / (RHO * T.S * 1.88))) varovani = 'PÁDOVÁ RYCHLOST';
    ac.th = clamp(ac.th, -0.8, 0.85); al = ac.th - ac.ga;
    if (kri) ac.fi += kri * 1.2 * clamp(ac.V / 25, 0.2, 1.2) * dt;
    else if (Math.abs(ac.fi) < 0.5) ac.fi -= ac.fi * 0.25 * dt;   // mírná příčná stabilita
    ac.fi = clamp(ac.fi + smer * 0.1 * dt, -1.3, 1.3);
    const cl = CL(al), L = q * cl, D = q * (T.cd0 + T.k * cl * cl) + (pad ? q * 0.12 : 0);
    const V = Math.max(ac.V, 3);
    ac.V = Math.max(0, ac.V + ((tah * Math.cos(al) - D) / m - G * Math.sin(ac.ga)) * dt);
    ac.ga += ((L * Math.cos(ac.fi) + tah * Math.sin(al)) / (m * V) - G * Math.cos(ac.ga) / V) * dt;
    ac.ga = clamp(ac.ga, -1.45, 1.45);
    if (agl > VYSKA_MAX && ac.ga > 0) { ac.ga = Math.max(0, ac.ga - dt); varovani = 'MAXIMÁLNÍ VÝŠKA'; }
    ac.h += (-(L * Math.sin(ac.fi)) / (m * V * Math.max(0.2, Math.cos(ac.ga))) - smer * 0.12) * dt;
    const vh = ac.V * Math.cos(ac.ga);
    if (okrajMapy(ac, Math.cos(ac.h) * vh, Math.sin(ac.h) * vh, dt)) varovani = varovani || 'OKRAJ MAPY';
    ac.x += Math.cos(ac.h) * vh * dt; ac.y += Math.sin(ac.h) * vh * dt; ac.z += ac.V * Math.sin(ac.ga) * dt;
    const z2 = gz(ac.x, ac.y), a2 = ac.z - z2;
    const r = [-Math.sin(ac.h) * Math.cos(ac.fi), Math.cos(ac.h) * Math.cos(ac.fi)], pul = T.rozpeti / 2;
    const body = [[ac.x + Math.cos(ac.h) * T.delka * 0.32, ac.y + Math.sin(ac.h) * T.delka * 0.32, 0.4], [ac.x + r[0] * pul, ac.y + r[1] * pul, 0.2], [ac.x - r[0] * pul, ac.y - r[1] * pul, 0.2], [ac.x, ac.y, 0.6]];
    if (narazDum(ac, body, a2)) { havarie(ac, 'náraz do budovy'); return; }
    const kridlo = Math.abs(Math.sin(ac.fi)) * pul;             // konec křídla v náklonu níž než podvozek
    if (a2 <= 0 || (a2 < kridlo - 0.4 && Math.abs(ac.fi) > 0.2)) {
      const vz = ac.V * Math.sin(ac.ga);
      if (vz < -3 || Math.abs(ac.fi) > 0.26 || ac.th < -0.09) havarie(ac, vz < -3 ? `tvrdý dopad ${(-vz).toFixed(1)} m/s` : Math.abs(ac.fi) > 0.26 ? 'křídlo o zem' : 'příďový podvozek');
      else { ac.zem = true; ac.z = z2; ac.V *= Math.cos(ac.ga); ac.ga = 0; ac.fi = 0; toast(vz > -1.2 ? 'Pěkné přistání' : 'Přistání', 'info'); }
    }
  }

  function krokVrtulnik(ac, dt, k, JOY) {
    const m = ac.T.m, W = m * G;
    ac.rpm = Math.min(1, ac.rpm + dt / 3);                      // roztočení rotoru ~3 s
    const kol = (k('KeyW', 'ShiftLeft', 'ShiftRight') ? 1 : 0) - (k('KeyS', 'ControlLeft', 'ControlRight') ? 1 : 0);
    const cp = clamp((k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0) + (Math.abs(JOY.y) > 0.12 ? JOY.y : 0), -1, 1);   // + = dopředu
    const cr = clamp((k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0) + (Math.abs(JOY.x) > 0.12 ? JOY.x : 0), -1, 1);   // + = doprava
    const yw = (k('KeyA', 'KeyZ') ? 1 : 0) - (k('KeyD', 'KeyX') ? 1 : 0);   // + = doleva
    ac.thr = kol > 0 ? 1 : kol < 0 ? 0.2 : 0.55;
    const ch = Math.cos(ac.h), sh = Math.sin(ac.h), vf = ac.vx * ch + ac.vy * sh, vr = ac.vx * sh - ac.vy * ch;   // dopředná a boční rychlost
    const zg = gz(ac.x, ac.y), agl = ac.z - zg;
    varovani = ac.rpm < 0.95 ? `ROZTÁČENÍ ROTORU ${Math.round(ac.rpm * 100)} %` : '';
    // cyklika: bez zásahu asistence srovná a zvolna brzdí
    const thT = ac.zem ? 0 : cp ? -cp * 0.42 : clamp(vf * 0.01, -0.12, 0.12);
    const fiT = ac.zem ? 0 : cr ? cr * 0.38 : clamp(-vr * 0.015, -0.12, 0.12);
    ac.th += clamp(thT - ac.th, -1.2 * dt, 1.2 * dt); ac.fi += clamp(fiT - ac.fi, -1.2 * dt, 1.2 * dt);
    let dh = yw * 1.1 / (1 + Math.hypot(ac.vx, ac.vy) / 20);
    const vhor = Math.hypot(ac.vx, ac.vy);
    if (vhor > 15 && !ac.zem) dh += -G * Math.tan(ac.fi) / vhor * 0.6;   // v rychlém letu zatáčí náklonem
    ac.h += dh * dt;
    // osa rotoru (nahoru trupu) v pořadí kurz, sklon, náklon
    const ct = Math.cos(ac.th), st = Math.sin(ac.th), cf = Math.cos(ac.fi), sf = Math.sin(ac.fi);
    const ux = -ch * st * cf + sh * sf, uy = -sh * st * cf - ch * sf, uz = ct * cf;
    let vzT = kol > 0 ? 5 : kol < 0 ? (agl < 6 ? -1.5 : -4) : 0;   // u země asistence zpomalí klesání
    if (agl > VYSKA_MAX) { vzT = Math.min(vzT, -1); varovani = 'MAXIMÁLNÍ VÝŠKA'; }
    let T = clamp(m * (G + 2.2 * (vzT - ac.vz)) / Math.max(0.5, uz), 0, 1.8 * W);
    if (ac.zem && kol <= 0) T = 0.5 * W;                         // na zemi bez kolektivu sedí
    T *= ac.rpm < 0.95 ? 0 : 1;
    const v = Math.hypot(ac.vx, ac.vy, ac.vz);
    ac.vx += (T * ux / m - 0.0012 * v * ac.vx - 0.03 * ac.vx) * dt;
    ac.vy += (T * uy / m - 0.0012 * v * ac.vy - 0.03 * ac.vy) * dt;
    ac.vz += (T * uz / m - G - 0.3 * ac.vz) * dt;
    if (!ac.zem && okrajMapy(ac, ac.vx, ac.vy, dt)) varovani = varovani || 'OKRAJ MAPY';
    if (ac.zem) { const f = Math.exp(-5 * dt); ac.vx *= f; ac.vy *= f; }
    const nx = ac.x + ac.vx * dt, ny = ac.y + ac.vy * dt, nz = ac.z + ac.vz * dt, z2 = gz(nx, ny);
    if (narazDum(ac, [[nx, ny, ac.T.rotor]], nz - z2)) {
      if (Math.hypot(ac.vx, ac.vy) > 3 || !ac.zem) { havarie(ac, 'rotor o budovu'); return; }
      ac.vx = ac.vy = 0; return;
    }
    if (!inMap(nx, ny)) { ac.vx = ac.vy = 0; return; }
    ac.x = nx; ac.y = ny; ac.z = nz;
    if (ac.z <= z2) {
      if (!ac.zem) {
        const sv = ac.vz, hv = Math.hypot(ac.vx, ac.vy);
        if (sv < -4 || Math.abs(ac.fi) > 0.4 || Math.abs(ac.th) > 0.4 || hv > 10) { havarie(ac, sv < -4 ? `tvrdý dopad ${(-sv).toFixed(1)} m/s` : 'převrácení na ližinách'); return; }
        if (sv < -0.5) toast(sv > -1.5 ? 'Pěkné přistání' : 'Přistání', 'info');
      }
      ac.z = z2; ac.vz = Math.max(0, ac.vz); ac.zem = true;
    } else if (ac.z > z2 + 0.15) ac.zem = false;
  }

  const blizkoAc = (x, y) => { let b = null, bd = 6.5; for (const ac of ACS) { const d = Math.hypot(ac.x - x, ac.y - y); if (d < bd && ac.hav <= 0) { bd = d; b = ac; } } return b; };
  const rychlost = (ac) => (ac.heli ? Math.hypot(ac.vx, ac.vy, ac.vz) : ac.V);
  const tacho = typeof document !== 'undefined' ? document.getElementById('tacho') : null;
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpT = new THREE.Vector3(), tmpU = new THREE.Vector3();

  return {
    nazev: () => (aktivni?.heli ? 've vrtulníku' : 'v letadle'),
    blizko(x, y) { const ac = blizkoAc(x, y); return ac ? `E – nastoupit: ${ac.nazev}` : null; },
    nastup() {
      const ac = blizkoAc(hrac.x, hrac.y); if (!ac) return false;
      aktivni = ac; ac.thr = 0; if (!ac.heli) ac.rpm = Math.max(ac.rpm, 0.05);
      kamO.set(0, 0, 0); zvuk('nastup'); hrac.vRezimu = true;   // pro jizda/ulice.js: postavu hráče nekreslit
      toast(ac.heli ? 'Vrtulník: W/S kolektiv, ↑↓←→ cyklika, A/D otáčení. Rotor se roztáčí ~3 s. E vystoupit na zemi.'
        : 'Letadlo: W/S plyn, ↓ přitáhnout, ↑ potlačit, A/D nebo ←→ křidélka, Z/X směrovka, mezerník brzda. Vzlet od ~' + Math.round(ac.T.Vr * 3.6) + ' km/h.', 'info');
      hrac.x = ac.x; hrac.y = ac.y; hrac.z = ac.z;
      return true;
    },
    krok(dt, { k, JOY = { x: 0, y: 0 } }) {
      const ac = aktivni; if (!ac) return;
      if (ac.hav > 0) {                                         // po havárii za 2 s zpět na stání, pilot zůstává uvnitř
        ac.hav -= dt; if (ac.hav <= 0) zpetNaStani(ac);
      } else if (dt > 0) {
        const n = Math.ceil(dt / KROK), h = dt / n;
        for (let i = 0; i < n && ac.hav <= 0; i++) (ac.heli ? krokVrtulnik : krokLetadlo)(ac, h, k, JOY);
        ac.h = wrapA(ac.h);
      }
      poloz(ac);
      hrac.x = ac.x; hrac.y = ac.y; hrac.z = ac.z;
      if (tacho?.firstChild) tacho.firstChild.nodeValue = Math.round(rychlost(ac) * 3.6) + ' ';
    },
    kamera(camera, fwd, orbit, dt) {
      const ac = aktivni; if (!ac) return;
      cam = camera;
      const g = ac.d.g; g.updateMatrixWorld(true);
      const kabina = !!hrac.kabina;
      for (const o of ac.d.kab) if (o) o.visible = !kabina;
      if (kabina) {                                            // z kabiny: oči pilota (vlevo), pohled podél nosu, obzor se naklání s letadlem
        const o = ac.T.oko;
        tmpV.set(o[0], o[1], o[2]); g.localToWorld(tmpV); camera.position.copy(tmpV);
        g.getWorldQuaternion(tmpQ);
        const yw = orbit.yaw, lk = orbit.look;
        fwd.set(Math.cos(yw) * Math.cos(lk), Math.sin(lk) - (ac.heli ? 0.12 : 0.04), -Math.sin(yw) * Math.cos(lk)).applyQuaternion(tmpQ).normalize();
        tmpU.set(0, 1, 0).applyQuaternion(tmpQ); camera.up.copy(tmpU);
        const zMin = gz(camera.position.x, -camera.position.z) + 0.3; if (camera.position.y < zMin) camera.position.y = zMin;
        camera.lookAt(tmpT.copy(camera.position).add(fwd));
        return;
      }
      camera.up.set(0, 1, 0);
      // odstup podle velikosti stroje (rozpětí 10–11 m): z bližšího místa zakryje křídlo celý výhled; mírně shora, přes křídlo dopředu
      const vzd = Math.max(orbit.dist * 1.6, ac.T.delka * 1.6 + ac.T.rozpeti * 0.8), hc = ac.h + orbit.yaw;
      const pc = clamp(orbit.pitch * 0.7 + 0.12 - (ac.heli ? 0 : ac.ga * 0.8), -0.4, 1.3);
      tmpT.set(ac.x, ac.z + (ac.heli ? 1.8 : 1.6), -ac.y);           // cíl: nad těžištěm
      const ox = -Math.cos(hc) * Math.cos(pc) * vzd, oy = -Math.sin(hc) * Math.cos(pc) * vzd, oz = Math.sin(pc) * vzd;
      tmpV.set(ox, oz, -oy);
      if (orbit.snap || kamO.lengthSq() === 0) { kamO.copy(tmpV); orbit.snap = false; } else kamO.lerp(tmpV, 1 - Math.exp(-dt * 5));
      camera.position.copy(tmpT).add(kamO);
      if (api.ramenoVolne) {                                  // dům (hangár) mezi letadlem a kamerou: kamera před zeď, plynule (k zdi rychle, zpět pomalu)
        const p = camera.position, tb = api.ramenoVolne(tmpT.x, -tmpT.z, tmpT.y, p.x, -p.z, p.y), f = tb < 1 ? Math.max(0.25, tb - 0.4 / vzd) : 1;
        kamF += (f - kamF) * Math.min(1, dt * (f < kamF ? 14 : 2.5));
        p.set(tmpT.x + (p.x - tmpT.x) * kamF, tmpT.y + (p.y - tmpT.y) * kamF, tmpT.z + (p.z - tmpT.z) * kamF);
      }
      const zMin = gz(camera.position.x, -camera.position.z) + 1.2; if (camera.position.y < zMin) camera.position.y = zMin;
      camera.lookAt(tmpT); fwd.copy(tmpT).sub(camera.position).normalize();
    },
    vystup() {
      const ac = aktivni; if (!ac) return null;
      if (ac.hav > 0 || !ac.zem || rychlost(ac) > (ac.heli ? 1 : 1.5)) { toast('Vystoupit můžeš jen na zemi, skoro v klidu.', 'info'); return null; }
      const bok = ac.heli ? 2.0 : 2.3;
      let [lx, ly] = vlevo(ac.h); let x = ac.x + lx * bok - Math.cos(ac.h) * 0.5, y = ac.y + ly * bok - Math.sin(ac.h) * 0.5;
      if (hitBuilding(x, y, 0.4)) { x = ac.x - lx * bok; y = ac.y - ly * bok; }   // vlevo zeď: vystoupit vpravo
      ac.thr = 0; aktivni = null; hrac.vRezimu = false;
      for (const o of ac.d.kab) if (o) o.visible = true;
      if (cam) cam.up.set(0, 1, 0);
      if (tacho?.firstChild) tacho.firstChild.nodeValue = '0 ';
      return { x, y, z: gz(x, y), yaw: ac.h };
    },
    stav() {
      const ac = aktivni; if (!ac) return '';
      if (ac.hav > 0) return `${ac.nazev} · HAVÁRIE`;
      const agl = Math.max(0, ac.z - gz(ac.x, ac.y)), vs = ac.heli ? ac.vz : ac.V * Math.sin(ac.ga);
      const t = [`${ac.nazev}`, `${Math.round(rychlost(ac) * 3.6)} km/h`, `${Math.round(agl)} m nad zemí`, `↕ ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`,
        ac.heli ? `kolektiv ${Math.round(ac.thr * 100)} %` : `plyn ${Math.round(ac.thr * 100)} %`];
      if (varovani) t.push(varovani);
      else if (ac.zem && rychlost(ac) < (ac.heli ? 1 : 1.5)) t.push('E vystoupit');
      return t.join(' · ');
    },
    vzduch: () => !!aktivni && !aktivni.zem,
    update(dt, now) {
      const noc = (api.doba?.() ?? 0) > 0.3;
      for (const ac of ACS) {
        if (ac !== aktivni) {                                   // bez pilota: motor dobíhá, stojí na zemi
          ac.rpm = Math.max(0, ac.rpm - dt * (ac.heli ? 0.12 : 0.5)); ac.thr = 0;
          if (ac.hav > 0) { ac.hav -= dt; if (ac.hav <= 0) zpetNaStani(ac); }
          if (ac.zem) { const z = gz(ac.x, ac.y); if (Math.abs(z - ac.z) > 0.01) { ac.z = z; poloz(ac); } }
        }
        const d = ac.d, sp = ac.rpm * (ac.heli ? 42 : 90) * dt;   // otáčky: listy viditelné jen pomalu, rychle rozmazaný kotouč
        const rozm = clamp((ac.rpm - 0.15) * 1.6, 0, 1);
        if (ac.heli) { d.rot.rotation.y += sp * 0.6; d.vrt.rotation.z += sp * 3; d.vk.material.opacity = 0.35 * rozm; d.vl.visible = rozm < 0.8; }
        else d.vrt.rotation.x += sp;
        d.kt.material.opacity = (ac.heli ? 0.22 : 0.3) * rozm; d.list.visible = rozm < 0.85;
        // polohová světla za provozu, zábleskové bílé a červený maják blikají
        const zap = ac === aktivni || ac.rpm > 0.05;
        d.sv.l.visible = d.sv.r.visible = d.sv.t.visible = zap && (noc || ac === aktivni);
        const z1 = zap && now % 1200 < 70, m1 = zap && (now + 400) % 1000 < 140;
        for (const o of d.sv.z) o.visible = z1;
        for (const o of d.sv.m) o.visible = m1;
      }
      if (heliOvereno < 2) {                                    // domy kolem letiště se načítají s okolím hráče
        const dd = Math.hypot(hrac.x - st0[0], hrac.y - st0[1]);
        if (dd < 500) { heliOvereno += dt / 3; if (heliOvereno >= 1) { overHeli(); heliOvereno = 2; } }
      }
    },
    // ladění: window.__jizda.REZIMY[0].ladeni
    ladeni: { ACS, get aktivni() { return aktivni; } },
  };
}
