// Vodorovné dopravní značení ve 3D jízdě (Rakovník): ostré čáry z dat silnic místo rozmazaných z podkladu terénu
// (ten je značení zbavený v shaderu, nastroje/jizda.py). Kolem hráče:
//  - přerušovaná středová čára (V2b, 3 m čára, 6 m mezera) na obousměrných silnicích I.–III. třídy a sběrných ulicích,
//  - plné vodicí čáry (V4) na okrajích silnic I. a II. třídy mimo zástavbu.
// Přechody pro chodce kreslí jizda/znacky.js (z OSM). Na mostech nic (mostovka má vlastní čáru z render.html).
// Jeden InstancedMesh (bílý obdélník). Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
const PUL = { motorway: 9, trunk: 6, primary: 5, secondary: 4.5, tertiary: 4, residential: 3, unclassified: 3, living_street: 3, service: 1.5 };
const STRED = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const VODICI = new Set(['primary', 'secondary', 'trunk']);
const DOSAH = 220, PRESTAV = 60;

export function vytvorZnaceni(THREE, scene, { roads, gz, hitBuilding, jenVeDne }) {
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
    for (const r of roads) {
      const stred = STRED.has(r.c) && !r.o, vod = VODICI.has(r.c);
      if (!stred && !vod) continue;
      const w0 = r.w[0]; if (Math.abs(w0[0] - hx) > DOSAH + r.L || Math.abs(w0[1] - hy) > DOSAH + r.L) continue;
      const pul = r.o ? (PUL[r.c] || 3) * 0.7 : PUL[r.c] || 3;
      const zaMestem = vod && !hitBuilding(w0[0], w0[1], 35) && !hitBuilding(r.w[r.w.length - 1][0], r.w[r.w.length - 1][1], 35);
      let s0 = 0;                                                         // staničení začátku úseku (fáze přerušované čáry navazuje)
      for (let i = 1; i < r.w.length; i++) {
        const a = r.w[i - 1], b = r.w[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 0.3) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const blizko = Math.hypot(mx - hx, my - hy) < DOSAH, most = a[2] - gz(a[0], a[1]) > 0.8 || b[2] - gz(b[0], b[1]) > 0.8;
        if (blizko && !most) {
          const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
          if (stred) for (let t = Math.ceil(s0 / 9) * 9 - s0; t < L; t += 9) {   // čára 3 m každých 9 m
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
