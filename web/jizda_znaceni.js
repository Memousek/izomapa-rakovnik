// Vodorovné dopravní značení ve 3D jízdě (Rakovník): ostré čáry z dat silnic místo rozmazaných z podkladu terénu
// (ten je značení zbavený v shaderu, nastroje/jizda.py). Kolem hráče:
//  - přerušovaná středová čára (V2b, 3 m čára, 6 m mezera) na obousměrných silnicích I.–III. třídy a sběrných ulicích,
//  - plné vodicí čáry (V4) na okrajích silnic I. a II. třídy mimo zástavbu,
//  - příčná čára souvislá (V5) u semaforu a příčná čára přerušovaná (V6a) na konci vedlejší silnice před hlavnější,
//    středová čára kus před křižovatkou končí. Jízdní pruhy a šipky data nemají (Overture bez turn:lanes).
// Přechody pro chodce kreslí jizda/znacky.js (z OSM). Na mostech nic (mostovka má vlastní čáru z render.html).
// Jeden InstancedMesh (bílý obdélník). Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
const PUL = { motorway: 9, trunk: 6, primary: 5, secondary: 4.5, tertiary: 4, residential: 3, unclassified: 3, living_street: 3, service: 1.5 };
const STRED = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const VODICI = new Set(['primary', 'secondary', 'trunk']);
const DOSAH = 220, PRESTAV = 60;

const RANK = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 1, living_street: 0, service: -1 };
export function vytvorZnaceni(THREE, scene, { roads, ends, ek, gz, hitBuilding, jenVeDne }) {
  const MAX = 6000;
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);     // vodorovný obdélník 1 × 1 (délka podél x, šířka podél z)
  const mat = new THREE.MeshBasicMaterial({ color: 0xe9e8e2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.InstancedMesh(g, mat, MAX); m.count = 0; m.frustumCulled = false; scene.add(m);
  if (jenVeDne) jenVeDne.push(m);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const osaY = new THREE.Vector3(0, 1, 0), osaZ = new THREE.Vector3(0, 0, 1);
  let bx = 1e9, by = 1e9, n = 0, pocetSilnic = -1;

  const vyska = (x, y, zc) => Math.max(zc, gz(x, y));                   // řídké body silnice: aspoň terén
  function cara(ax, ay, az, bx_, by_, bz, sirka) {                       // jeden obdélník od a do b
    if (n >= MAX) return;
    const dx = bx_ - ax, dy = by_ - ay, L = Math.hypot(dx, dy); if (L < 0.2) return;
    const za = vyska(ax, ay, az), zb = vyska(bx_, by_, bz);
    q.setFromAxisAngle(osaY, Math.atan2(dy, dx)).multiply(q2.setFromAxisAngle(osaZ, Math.atan2(zb - za, L)));
    m4.compose(v.set((ax + bx_) / 2, (za + zb) / 2 + 0.035, -(ay + by_) / 2), q, sc.set(L, 1, sirka));
    m.setMatrixAt(n++, m4);
  }
  function postav(hx, hy) {
    n = 0;
    // příčné čáry: u semaforu souvislá (r.sg: [staničení, x, y, druh, směr]), na konci vedlejší silnice přerušovaná (dej přednost)
    const pricna = (r, s_, dir, prerus) => {
      const L = r.L; s_ = Math.max(0.5, Math.min(L - 0.5, s_));
      let i = 1; while (i < r.len.length - 1 && r.len[i] < s_) i++;
      const a = r.w[i - 1], b = r.w[i], t = (s_ - r.len[i - 1]) / ((r.len[i] - r.len[i - 1]) || 1), seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const ux = (b[0] - a[0]) / seg * dir, uy = (b[1] - a[1]) / seg * dir, nx = uy, ny = -ux;   // vpravo ve směru jízdy
      const pul = r.o ? (PUL[r.c] || 3) * 0.7 : PUL[r.c] || 3, od = r.o ? -pul : 0;               // jednosměrka přes celou šířku
      for (let k = od; k < pul - 0.2; k += prerus ? 1.0 : 99) {
        const k1 = prerus ? Math.min(k + 0.5, pul - 0.2) : pul - 0.2;
        cara(x + nx * (k + 0.1), y + ny * (k + 0.1), z, x + nx * k1, y + ny * k1, z, 0.5);
      }
    };
    const rad = (r) => RANK[r.c] ?? 0;
    const uzelKonec = (r, e) => (ends && ek ? (ends.get(ek(e)) || []).map(([j]) => roads[j]).filter((q) => q && q !== r) : []);
    for (const r of roads) {
      const stred = STRED.has(r.c) && !r.o, vod = VODICI.has(r.c);
      const w0 = r.w[0]; if (Math.abs(w0[0] - hx) > DOSAH + r.L || Math.abs(w0[1] - hy) > DOSAH + r.L) continue;
      const pul = r.o ? (PUL[r.c] || 3) * 0.7 : PUL[r.c] || 3;
      const zaMestem = vod && !hitBuilding(w0[0], w0[1], 35) && !hitBuilding(r.w[r.w.length - 1][0], r.w[r.w.length - 1][1], 35);
      const kr0 = uzelKonec(r, r.w[0]).length >= 2 ? 10 : 0, kr1 = uzelKonec(r, r.w[r.w.length - 1]).length >= 2 ? r.L - 10 : r.L;
      if (Math.hypot(w0[0] - hx, w0[1] - hy) < DOSAH + r.L) {
        for (const z of r.sg || []) for (const d of (z[4] ? [z[4]] : [1, -1])) pricna(r, z[0] - d * 1.5, d, false);   // stop čára u semaforu
        for (const [konec, e, d] of [[0, r.w[0], -1], [1, r.w[r.w.length - 1], 1]]) {                            // dej přednost na konci vedlejší
          if (r.o && r.o !== d) continue;
          const jine = uzelKonec(r, e);
          if (jine.length && jine.some((q) => rad(q) > rad(r)) && !(r.sg || []).length) pricna(r, konec ? r.L - 4 : 4, d, true);
        }
      }
      let s0 = 0;                                                         // staničení začátku úseku (fáze přerušované čáry navazuje)
      for (let i = 1; i < r.w.length; i++) {
        const a = r.w[i - 1], b = r.w[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 0.3) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const blizko = Math.hypot(mx - hx, my - hy) < DOSAH, most = a[2] - gz(a[0], a[1]) > 0.8 || b[2] - gz(b[0], b[1]) > 0.8;
        if (blizko && !most) {
          const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
          if (stred) for (let t = Math.ceil(s0 / 9) * 9 - s0; t < L; t += 9) {   // čára 3 m každých 9 m
            if (s0 + t < kr0 || s0 + t + 3 > kr1) continue;                 // kus před křižovatkou bez středové čáry
            const t1 = Math.min(L, t + 3);
            cara(a[0] + ux * t, a[1] + uy * t, a[2] + (b[2] - a[2]) * t / L, a[0] + ux * t1, a[1] + uy * t1, a[2] + (b[2] - a[2]) * t1 / L, 0.13);
          }
          if (zaMestem) for (const sg of [1, -1]) {                         // vodicí čáry 0,3 m od okraje vozovky, po kusech 6 m
            const o = (pul - 0.3) * sg;
            for (let t = 0; t < L; t += 6) {
              const t1 = Math.min(L, t + 6);
              cara(a[0] + ux * t + nx * o, a[1] + uy * t + ny * o, a[2] + (b[2] - a[2]) * t / L, a[0] + ux * t1 + nx * o, a[1] + uy * t1 + ny * o, a[2] + (b[2] - a[2]) * t1 / L, 0.13);
            }
          }
        }
        s0 += L;
      }
    }
    m.count = n; m.instanceMatrix.needsUpdate = true;
  }
  return {
    update(hrac) {
      if (roads.length === pocetSilnic && Math.hypot(hrac.x - bx, hrac.y - by) < PRESTAV) return;
      pocetSilnic = roads.length; bx = hrac.x; by = hrac.y; postav(bx, by);
    },
  };
}

// ---------- jízdní pruhy a směrové šipky z OSM (assets/pruhy.json z nastroje/pruhy.py: turn:lanes) ----------
// U konce silnice ve směru jízdy (posledních 30 m před křižovatkou): dělicí čáry pruhů (posledních 20 m plné, dál
// přerušované) a v každém pruhu šipky V9a 6 m a 18 m před koncem. Pruhy v turn:lanes jsou zleva doprava ve směru jízdy.
const SIRKA_PRUHU = 3.0;
function sipkaPlatno(druh) {                                // bílá šipka na průhledném plátně 128 × 512 (dopředu = nahoru)
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#ecebe5'; g.strokeStyle = '#ecebe5'; g.lineCap = 'butt'; g.lineJoin = 'miter';
  const rovne = () => { g.fillRect(52, 150, 24, 340); g.beginPath(); g.moveTo(64, 30); g.lineTo(110, 160); g.lineTo(18, 160); g.fill(); };
  const vedle = (s) => {                                     // s = -1 vlevo, 1 vpravo: dřík nahoru a oblouk do strany
    g.fillRect(52, 260, 24, 230); g.lineWidth = 24; g.beginPath(); g.moveTo(64, 272); g.quadraticCurveTo(64, 170, 64 + s * 30, 160); g.stroke();
    g.beginPath(); g.moveTo(64 + s * 60, 160); g.lineTo(64 + s * 22, 110); g.lineTo(64 + s * 22, 210); g.fill();
  };
  const d = new Set(druh.split(';'));
  if (d.has('through') || d.size === 0 || d.has('none') || d.has('')) rovne();
  if (d.has('left') || d.has('slight_left') || d.has('sharp_left')) vedle(-1);
  if (d.has('right') || d.has('slight_right') || d.has('sharp_right')) vedle(1);
  return c;
}
export function vytvorPruhy(THREE, scene, { gz, jenVeDne, doMesta }) {
  const MAX = 600, DOSAH_P = 250;
  const druhy = new Map();                                   // druh šipky -> InstancedMesh
  const geo = new THREE.PlaneGeometry(1.1, 4.4); geo.rotateX(-Math.PI / 2);
  const caraG = new THREE.PlaneGeometry(1, 1); caraG.rotateX(-Math.PI / 2);
  const caraM = new THREE.InstancedMesh(caraG, new THREE.MeshBasicMaterial({ color: 0xe9e8e2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 3000);
  caraM.count = 0; caraM.frustumCulled = false; scene.add(caraM); if (jenVeDne) jenVeDne.push(caraM);
  const mesh = (druh) => {
    if (!druhy.has(druh)) {
      const t = new THREE.CanvasTexture(sipkaPlatno(druh)); t.anisotropy = 8;
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), MAX);
      m.count = 0; m.frustumCulled = false; scene.add(m); if (jenVeDne) jenVeDne.push(m); druhy.set(druh, m);
    }
    return druhy.get(druh);
  };
  let data = [], bx = 1e9, by = 1e9;
  fetch('jizda/pruhy.json').then((r) => (r.ok ? r.json() : [])).then((d) => { data = d.map((w) => ({ ...w, xy: w.p.map(([la, lo]) => doMesta(la, lo)) })); bx = 1e9; }).catch(() => {});
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), osaY = new THREE.Vector3(0, 1, 0);
  // bod ve vzdálenosti s od konce lomené čáry P (směr jízdy ke konci): poloha a jednotkový směr jízdy
  function odKonce(P, s) {
    let acc = 0;
    for (let i = P.length - 1; i > 0; i--) {
      const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + L >= s || i === 1) { const t = L ? Math.min(1, (s - acc) / L) : 0; return { x: b[0] + (a[0] - b[0]) * t, y: b[1] + (a[1] - b[1]) * t, ux: (b[0] - a[0]) / (L || 1), uy: (b[1] - a[1]) / (L || 1), ok: acc + L >= s }; }
      acc += L;
    }
  }
  function postav(hx, hy) {
    for (const m of druhy.values()) m.count = 0;
    let nc = 0;
    const delka = (P) => P.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0), 0);
    for (const w of data) {
      const e = w.xy[w.xy.length - 1], z0 = w.xy[0];
      if (Math.hypot(e[0] - hx, e[1] - hy) > DOSAH_P && Math.hypot(z0[0] - hx, z0[1] - hy) > DOSAH_P) continue;
      for (const [tag, P] of [[w.f, w.xy], [w.b, [...w.xy].reverse()]]) {
        if (!tag) continue;
        const pruhy = tag.split('|'), n = pruhy.length, L = delka(P);
        if (n < 1 || L < 8) continue;
        const o0 = w.o ? -n * SIRKA_PRUHU / 2 : 0;           // jednosměrka: pruhy symetricky kolem osy; obousměrná: vpravo od osy
        const usek = Math.min(30, L - 2);
        // dělicí čáry mezi pruhy
        for (let k = 1; k < n && nc < 2990; k++) {
          const off = o0 + k * SIRKA_PRUHU;
          for (let s = 0.5; s < usek; s += (s < 20 ? 3 : 6)) {
            const s1 = Math.min(usek, s + 3), A = odKonce(P, s), B = odKonce(P, s1);
            if (!A || !B) break;
            if (s >= 20 && (Math.floor((s - 20) / 6) % 2)) continue;   // za 20 m přerušovaná
            const ax = A.x + A.uy * off, ay = A.y - A.ux * off, bx_ = B.x + B.uy * off, by_ = B.y - B.ux * off;   // vpravo = (uy, -ux)
            const L2 = Math.hypot(bx_ - ax, by_ - ay); if (L2 < 0.2) continue;
            q.setFromAxisAngle(osaY, Math.atan2(by_ - ay, bx_ - ax));
            m4.compose(v.set((ax + bx_) / 2, Math.max(gz(ax, ay), gz(bx_, by_)) + 0.04, -(ay + by_) / 2), q, sc.set(L2, 1, 0.13));
            caraM.setMatrixAt(nc++, m4);
          }
        }
        // šipky ve středu pruhů
        for (let k = 0; k < n; k++) {
          const druh = (pruhy[k] || 'through').trim() || 'through', M = mesh(druh), off = o0 + (k + 0.5) * SIRKA_PRUHU;
          for (const s of [6, 18]) {
            if (s > usek || M.count >= MAX) continue;
            const A = odKonce(P, s); if (!A) continue;
            const x = A.x + A.uy * off, y = A.y - A.ux * off;        // vpravo ve směru jízdy
            q.setFromAxisAngle(osaY, Math.atan2(-A.ux, A.uy));       // hrot (sever plátna) natočit do směru jízdy
            m4.compose(v.set(x, gz(x, y) + 0.045, -y), q, sc.set(1, 1, 1)); M.setMatrixAt(M.count++, m4);
          }
        }
      }
    }
    caraM.count = nc; caraM.instanceMatrix.needsUpdate = true;
    for (const m of druhy.values()) m.instanceMatrix.needsUpdate = true;
  }
  return {
    update(hrac) {
      if (!data.length || Math.hypot(hrac.x - bx, hrac.y - by) < 60) return;
      bx = hrac.x; by = hrac.y; postav(bx, by);
    },
  };
}
