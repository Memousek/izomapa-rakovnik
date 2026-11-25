// Zeleň u země ve 3D jízdě (Rakovník): trsy trávy a keře kolem hráče, ale jen tam, kde je na podkladu terénu
// opravdu tráva (zelený pixel textury ground_<období>.webp) a nestojí budova. Silnice, chodníky a parkoviště zůstanou
// čisté. Podklad se pro každý čtverec načte zmenšený (1024 px, ~2,2 m na pixel) a z něj se čte jen maska zeleně.
// Vše je InstancedMesh (tráva, keře = dvě volání kreslení). Souřadnice: svět x východ, y sever, z nahoru; three = (x, z, -y).
const DOSAH = 70, PRESTAV = 25, MASKA = 1024;
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };

export function vytvorOkraje(THREE, scene, { gz, hitBuilding, obdobi, jenVeDne, HALF }) {
  const MAX_TRAVA = 5000, MAX_KER = 400;
  // trs trávy: vějíř pěti tenkých stébel, u země tmavší, špička světlejší (barva instance se násobí)
  const tg = new THREE.BufferGeometry(), tp = [], tc = [];
  for (let k = 0; k < 5; k++) {
    const a = k * 1.2566, cx = Math.cos(a), cz = Math.sin(a), lean = 0.06 + (k % 2) * 0.05, hgt = 0.22 + (k % 3) * 0.07;
    tp.push(-cz * 0.025, 0, cx * 0.025, cz * 0.025, 0, -cx * 0.025, cx * lean, hgt, cz * lean);
    tc.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1.15, 1.15, 1.1);
  }
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  const trava = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true }), MAX_TRAVA);
  // keř: shluk tří chomáčů různé velikosti (jeden hladký mnohostěn vypadal jako kámen)
  const kg = (() => {
    const casti = [[0, 0.05, 0, 0.5], [0.38, -0.05, 0.12, 0.36], [-0.3, -0.08, -0.2, 0.4]].map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z).toNonIndexed());
    const p = [], nn = [];
    for (const c of casti) { p.push(...c.attributes.position.array); nn.push(...c.attributes.normal.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    return g;
  })();
  const ker = new THREE.InstancedMesh(kg, new THREE.MeshLambertMaterial({ flatShading: true }), MAX_KER);
  for (const m of [trava, ker]) { m.count = 0; m.frustumCulled = false; scene.add(m); if (jenVeDne) jenVeDne.push(m); }
  const BARVY_TRAVA = { spring: [0x7fb04a, 0x92c05a, 0x6fa040], summer: [0x7aa046, 0x8fae4e, 0x9aae58], autumn: [0x8fa04e, 0xa8a858, 0x7f9446], winter: [0x9aa08c, 0xa8ae9a, 0x8d947e] };
  const BARVY_KER = { spring: [0x5f9a3a, 0x6fa646], summer: [0x4f8434, 0x5e903a], autumn: [0x5f8436, 0x6e8a38, 0x8a7a36], winter: [0x6a6a5c, 0x5e5e52] };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), osa = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let bx = 1e9, by = 1e9, spinave = false;

  // ---------- maska zeleně po čtvercích ----------
  const masky = new Map();                                   // 'i_j' -> Uint8Array (1 = tráva) | 'nacita'
  const S2 = 2 * HALF;
  async function nactiMasku(i, j) {
    const k = `${i}_${j}`; masky.set(k, 'nacita');
    try {
      const b = await (await fetch(`jizda/c${i}_${j}/ground_${obdobi}.webp`)).blob();
      const bmp = await createImageBitmap(b, { resizeWidth: MASKA, resizeHeight: MASKA, resizeQuality: 'medium' });
      const cv = new OffscreenCanvas(MASKA, MASKA), g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, MASKA, MASKA).data, m = new Uint8Array(MASKA * MASKA);
      for (let p = 0, o = 0; p < m.length; p++, o += 4) {
        const r = d[o], gg = d[o + 1], bb = d[o + 2], mx = Math.max(r, gg, bb), sat = mx - Math.min(r, gg, bb);
        m[p] = gg >= r && gg >= bb && sat > 18 && mx > 60 ? 1 : 0;          // zelená: tráva, louka, zahrada (ne asfalt, dlažba, holé pole)
      }
      masky.set(k, m); spinave = true;
    } catch { masky.set(k, new Uint8Array(1)); }
  }
  // je bod na trávě? zelený pixel i jeho sousedé (kraj trávníku u silnice se nepočítá)
  function zelene(x, y) {
    const i = Math.floor((x + HALF) / S2), j = Math.floor((y + HALF) / S2), k = `${i}_${j}`, m = masky.get(k);
    if (!m) { nactiMasku(i, j); return false; }
    if (m === 'nacita' || m.length < 2) return false;
    const px = Math.floor(((x - i * S2) + HALF) / S2 * MASKA), py = Math.floor((HALF - (y - j * S2)) / S2 * MASKA);
    if (px < 1 || py < 1 || px >= MASKA - 1 || py >= MASKA - 1) return false;
    const o = py * MASKA + px;
    return !!(m[o] && m[o - 1] && m[o + 1] && m[o - MASKA] && m[o + MASKA]);
  }

  function postav(hx, hy) {
    let nt = 0, nk = 0;
    const ob = BARVY_TRAVA[obdobi] || BARVY_TRAVA.summer, kb = BARVY_KER[obdobi] || BARVY_KER.summer;
    // pevná mřížka 1,6 m ve světě (stejné trsy na stejném místě i po přestavbě), v buňce nejvýš jeden trs
    const C = 1.6, g0x = Math.floor((hx - DOSAH) / C), g1x = Math.floor((hx + DOSAH) / C), g0y = Math.floor((hy - DOSAH) / C), g1y = Math.floor((hy + DOSAH) / C);
    for (let gx = g0x; gx <= g1x && nt < MAX_TRAVA; gx++) for (let gy = g0y; gy <= g1y && nt < MAX_TRAVA; gy++) {
      const h = hash(gx, gy);
      if (h > 0.45) continue;                                // řídce: asi polovina buněk
      const x = (gx + hash(gy, gx)) * C, y = (gy + hash(gx * 1.7, gy)) * C;
      if ((x - hx) ** 2 + (y - hy) ** 2 > DOSAH * DOSAH || !zelene(x, y) || hitBuilding(x, y, 0.6)) continue;
      const z = gz(x, y);
      if (h < 0.006 && nk < MAX_KER) {                       // občas keř
        q.setFromAxisAngle(osa, h * 900); const vel = 0.8 + hash(x, y) * 0.9;
        m4.compose(v.set(x, z + 0.3 * vel, -y), q, sc.set(vel, vel * 0.7, vel)); ker.setMatrixAt(nk, m4);
        ker.setColorAt(nk++, col.setHex(kb[Math.floor(h * 1e4) % kb.length]));
        continue;
      }
      q.setFromAxisAngle(osa, h * 14); const vel = 0.8 + hash(y, x) * 0.7;
      m4.compose(v.set(x, z - 0.02, -y), q, sc.set(vel, vel * (obdobi === 'winter' ? 0.6 : 1), vel)); trava.setMatrixAt(nt, m4);
      trava.setColorAt(nt++, col.setHex(ob[Math.floor(h * 1e3) % ob.length]));
    }
    trava.count = nt; ker.count = nk;
    for (const m of [trava, ker]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  return {
    update(hrac) {
      if (!spinave && Math.hypot(hrac.x - bx, hrac.y - by) < PRESTAV) return;
      spinave = false; bx = hrac.x; by = hrac.y; postav(bx, by);
    },
  };
}
