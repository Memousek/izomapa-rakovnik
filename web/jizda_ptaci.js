// Ptáci nad městem ve 3D jízdě (Rakovník): několik hejn kolem hráče, ve dne. Hejno krouží nebo táhne v klínu,
// každý pták mává křídly vlastním tempem a občas plachtí. Vše je jeden InstancedMesh (jedno volání kreslení).
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
export function vytvorPtaky(THREE, scene, { jenVeDne } = {}) {
  const HEJN = 4, NA_HEJNO = 12, N = HEJN * NA_HEJNO;
  // tělo a dvě křídla jako tenký klín: střed v počátku, křídla do stran (x), letí ve směru -z
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.18, -0.55, 0.0, 0.05, 0, 0, 0.12,                // levé křídlo
    0, 0, -0.18, 0, 0, 0.12, 0.55, 0.0, 0.05,                 // pravé křídlo
  ], 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x23201d, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(g, mat, N);
  mesh.frustumCulled = false; mesh.name = 'ptaci';
  scene.add(mesh);
  if (jenVeDne) jenVeDne.push(mesh);                        // v obrazu světel (noc) černé: nesvítí
  let sd = 4242; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const hejna = Array.from({ length: HEJN }, (_, k) => ({
    cx: 0, cy: 0, init: false, r: 60 + rnd() * 140, a: rnd() * 6.28, w: (0.04 + rnd() * 0.05) * (rnd() < 0.5 ? -1 : 1),
    h: 28 + rnd() * 45, klin: k % 2 === 0,                  // sudá hejna táhnou v klínu (husy, kachny), lichá krouží v hloučku (holubi, kavky)
    b: Array.from({ length: NA_HEJNO }, (_, i) => ({ ox: (rnd() - 0.5) * 18, oy: (rnd() - 0.5) * 18, oz: (rnd() - 0.5) * 6, f: 7 + rnd() * 5, ph: rnd() * 6.28, i })),
  }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  let vid = 1;
  return {
    // n: denní doba (0 den, 1 noc), zat: zataženo 0..1, dest: déšť 0..1
    update(dt, t, hrac, n, zat = 0, dest = 0) {
      const cil = n > 0.55 || dest > 0.6 ? 0 : 1;           // v noci a v dešti ptáci nelétají (plynule zmizí)
      vid += (cil - vid) * Math.min(1, dt * 0.5);
      mesh.visible = vid > 0.02;
      if (!mesh.visible) return;
      for (const H of hejna) {
        if (!H.init || Math.hypot(H.cx - hrac.x, H.cy - hrac.y) > 700) {   // hejno daleko: přeletí k hráči z okraje dohledu
          const a = rnd() * 6.28, d = 250 + rnd() * 250; H.cx = hrac.x + Math.cos(a) * d; H.cy = hrac.y + Math.sin(a) * d; H.init = true;
        }
        H.a += H.w * dt;
        if (H.klin) { H.cx += Math.cos(H.a) * 9 * dt; H.cy += Math.sin(H.a) * 9 * dt; }   // klín táhne a pomalu stáčí
        const px = H.cx + (H.klin ? 0 : Math.cos(H.a) * H.r), py = H.cy + (H.klin ? 0 : Math.sin(H.a) * H.r);
        const smer = H.klin ? H.a : H.a + Math.sign(H.w) * Math.PI / 2;       // směr letu
        const fx = Math.cos(smer), fy = Math.sin(smer);
        for (const b of H.b) {
          let x, y, z;
          if (H.klin) {                                     // klín: dvě ramena za vůdcem
            const rad = Math.ceil(b.i / 2), str = b.i % 2 ? 1 : -1;
            x = px - fx * rad * 2.2 - fy * str * rad * 1.8; y = py - fy * rad * 2.2 + fx * str * rad * 1.8; z = hrac.z + H.h + Math.sin(t * 0.3 + b.ph) * 0.4;
          } else {                                          // hlouček: každý pták kolem středu po vlastní dráze
            x = px + b.ox + Math.sin(t * 0.7 + b.ph) * 4; y = py + b.oy + Math.cos(t * 0.6 + b.ph) * 4; z = hrac.z + H.h + b.oz + Math.sin(t * 0.9 + b.ph) * 1.5;
          }
          const plach = Math.sin(t * 0.25 + b.ph) > 0.55;    // občas plachtí s roztaženými křídly
          const mav = plach ? 0.05 : Math.sin(t * b.f + b.ph);
          e.set(0, Math.atan2(-fx, -fy), mav * 0.5 * (H.klin ? 0.6 : 1), 'YXZ'); q.setFromEuler(e);
          const vel = (H.klin ? 1.6 : 1.0) * vid;            // husa větší než holub
          sc.set(vel, vel * (1 + mav * 0.5), vel);
          m4.compose(v.set(x, z, -y), q, sc);
          mesh.setMatrixAt(H === hejna[0] ? b.i : hejna.indexOf(H) * NA_HEJNO + b.i, m4);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mat.color.setRGB(0.14 + zat * 0.08, 0.13 + zat * 0.08, 0.12 + zat * 0.08);
    },
  };
}
