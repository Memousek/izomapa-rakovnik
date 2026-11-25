// Okraje silnic ve 3D jízdě (Rakovník): obrubníky podél silnic v zástavbě, travnatá krajnice s trsy trávy a keři
// podél silnic za městem i ve městě. Staví se jen kolem hráče (do DOSAH m) a přestaví, když hráč popojde.
// Vše je InstancedMesh (obrubníky, trsy trávy, keře = tři volání kreslení). Souřadnice: svět x východ, y sever,
// z nahoru; three pozice = (x, z, -y).
const PUL = { motorway: 9, trunk: 6, primary: 5, secondary: 4.5, tertiary: 4, residential: 3, unclassified: 3, living_street: 3, service: 1.5 };
const DOSAH = 150, PRESTAV = 45;
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };

export function vytvorOkraje(THREE, scene, { roads, gz, hitBuilding, obdobi, jenVeDne }) {
  const MAX_OBR = 1600, MAX_TRAVA = 7000, MAX_KER = 700;
  // obrubník: kvádr 1 × 1 × 1 (škáluje se na délku úseku, výšku 0,14 m a šířku 0,22 m)
  const obrMat = new THREE.MeshBasicMaterial({ color: 0xaaa59b });   // beton bez stínování (Lambert vycházel jako černá čára)
  const obr = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), obrMat, MAX_OBR);
  // trs trávy: vějíř pěti tenkých stébel, u země tmavší, špička světlejší (barva instance se násobí)
  const tg = new THREE.BufferGeometry(), tp = [], tc = [];
  for (let k = 0; k < 5; k++) {
    const a = k * 1.2566, cx = Math.cos(a), cz = Math.sin(a), lean = 0.06 + (k % 2) * 0.05, hgt = 0.22 + (k % 3) * 0.07;
    tp.push(-cz * 0.025, 0, cx * 0.025, cz * 0.025, 0, -cx * 0.025, cx * lean, hgt, cz * lean);
    tc.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1.15, 1.15, 1.1);
  }
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  const trMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true });
  const trava = new THREE.InstancedMesh(tg, trMat, MAX_TRAVA);
  // keř: nízký zploštělý mnohostěn
  const ker = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshLambertMaterial({ flatShading: true }), MAX_KER);
  for (const m of [obr, trava, ker]) { m.count = 0; m.frustumCulled = false; scene.add(m); if (jenVeDne) jenVeDne.push(m); }
  const BARVY_TRAVA = { spring: [0x7fb04a, 0x92c05a, 0x6fa040], summer: [0x7aa046, 0x8fae4e, 0x9aae58], autumn: [0x8fa04e, 0xa8a858, 0x7f9446], winter: [0x9aa08c, 0xa8ae9a, 0x8d947e] };
  const BARVY_KER = { spring: [0x5a8f34, 0x6a9a3e], summer: [0x4a7a30, 0x5a8636], autumn: [0x5a7a32, 0x8a7a34, 0x9a6a30], winter: [0x6a665c, 0x5e5a52] };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), osa = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let bx = 1e9, by = 1e9, pocet = 0;

  function postav(hx, hy) {
    let no = 0, nt = 0, nk = 0;
    const ob = BARVY_TRAVA[obdobi] || BARVY_TRAVA.summer, kb = BARVY_KER[obdobi] || BARVY_KER.summer;
    for (const r of roads) {
      const w0 = r.w[0];
      if (Math.abs(w0[0] - hx) > DOSAH + r.L || Math.abs(w0[1] - hy) > DOSAH + r.L) continue;
      const pul = (r.o ? (PUL[r.c] || 3) * 0.7 : PUL[r.c] || 3);
      const vMeste = hitBuilding(w0[0], w0[1], 30) || hitBuilding(r.w[r.w.length - 1][0], r.w[r.w.length - 1][1], 30);
      const obrubnik = vMeste && r.c !== 'service' && r.c !== 'motorway' && r.c !== 'trunk';
      for (let i = 1; i < r.w.length; i++) {
        const a = r.w[i - 1], b = r.w[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 0.5) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (Math.hypot(mx - hx, my - hy) > DOSAH) continue;
        const most = a[2] - gz(a[0], a[1]) > 0.8 || b[2] - gz(b[0], b[1]) > 0.8;   // na mostě a nájezdu nic
        if (most) continue;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, h = Math.atan2(dy, dx);
        for (const s of [1, -1]) {
          const ex = mx + nx * s * (pul + 0.1), ey = my + ny * s * (pul + 0.1);
          if (obrubnik && no < MAX_OBR && !hitBuilding(ex, ey, 0.3)) {        // obrubník po celé délce úseku
            const z = (a[2] + b[2]) / 2;
            q.setFromAxisAngle(osa, h); m4.compose(v.set(ex, z + 0.05, -ey), q, sc.set(L + 0.05, 0.14, 0.22));
            obr.setMatrixAt(no++, m4);
          }
          // krajnice: trsy trávy a občas keř za obrubníkem nebo přímo u kraje vozovky
          const n = Math.floor(L * (vMeste ? 0.6 : 1.4));
          for (let k = 0; k < n && nt < MAX_TRAVA; k++) {
            const t = (k + hash(i * 7 + k, s)) / Math.max(n, 1), od = pul + (obrubnik ? 0.45 : 0.25) + hash(k, i * 3 + s) * (vMeste ? 0.9 : 1.8);
            const x = a[0] + dx * t + nx * s * od, y = a[1] + dy * t + ny * s * od;
            if (hitBuilding(x, y, 0.4)) continue;
            const z = gz(x, y), hh = hash(x * 0.37, y * 0.53);
            if (hh < 0.025 && nk < MAX_KER && !vMeste) {                         // keř u silnice za městem
              q.setFromAxisAngle(osa, hh * 40); const vel = 0.8 + hh * 16;
              m4.compose(v.set(x, z + 0.35 * vel, -y), q, sc.set(vel, vel * 0.7, vel)); ker.setMatrixAt(nk, m4);
              ker.setColorAt(nk++, col.setHex(kb[Math.floor(hh * 100) % kb.length]));
              continue;
            }
            q.setFromAxisAngle(osa, hh * 6.28); const vel = 0.8 + hash(y, x) * 0.7;
            m4.compose(v.set(x, z - 0.02, -y), q, sc.set(vel, vel * (obdobi === 'winter' ? 0.6 : 1), vel)); trava.setMatrixAt(nt, m4);
            trava.setColorAt(nt++, col.setHex(ob[Math.floor(hh * 1000) % ob.length]));
          }
        }
      }
    }
    obr.count = no; trava.count = nt; ker.count = nk;
    for (const m of [obr, trava, ker]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    pocet = no + nt + nk;
  }
  return {
    update(hrac, zmenaSilnic) {
      if (!zmenaSilnic && Math.hypot(hrac.x - bx, hrac.y - by) < PRESTAV) return;
      bx = hrac.x; by = hrac.y; postav(bx, by);
    },
    get pocet() { return pocet; },
  };
}
