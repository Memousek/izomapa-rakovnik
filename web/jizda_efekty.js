// Pocit z pohybu ve 3D jízdě (Rakovník): zorné pole se s rychlostí ve vozidle rozšíří, ve vysoké rychlosti se kamera
// jemně chvěje, pěšky z očí se pohupuje krok. Na podzim kolem hráče padá a víří listí (jeden InstancedMesh).
// Kamera se posune jen na dobu kreslení snímku (pred / po), aby to neovlivnilo plynulé dotahování kamery.
export function vytvorEfekty(THREE, scene, camera, { obdobi, jenVeDne } = {}) {
  const FOV0 = camera.fov;
  let vHlad = 0, krok = 0, minule = null, naklon = 0;
  const pravo = new THREE.Vector3();
  const posun = new THREE.Vector3();
  // ---------- listí ----------
  const N = obdobi === 'autumn' ? 90 : 0;
  let stromy = [], stromyT = -1e9;
  let listi = null; const L = [];
  if (N) {
    const g = new THREE.PlaneGeometry(0.11, 0.08);
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });   // bez stínování: proti nebi by bylo černé
    listi = new THREE.InstancedMesh(g, m, N); listi.frustumCulled = false; scene.add(listi);
    if (jenVeDne) jenVeDne.push(listi);
    const barvy = [0xc8731e, 0xd99a2b, 0xa8461c, 0xe0b23a, 0x8f5a24, 0xb8862c];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) { L.push({ x: 0, y: 0, z: -1e9, vx: 0, vy: 0, ph: Math.random() * 6.28, rot: Math.random() * 6.28 }); listi.setColorAt(i, c.setHex(barvy[i % barvy.length])); }
    listi.instanceColor.needsUpdate = true;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  return {
    // stav: { veVoze, pesky, zOci, vitr: [dx, dy] }, gz(x, y) výška terénu, hrac {x, y, z}
    update(dt, t, stav, gz, hrac) {
      if (!(dt > 0)) return;
      const p = camera.position, v3 = minule ? Math.hypot(p.x - minule.x, p.z - minule.z) / dt : 0;
      minule = { x: p.x, z: p.z };
      vHlad += (Math.min(v3, 70) - vHlad) * Math.min(1, dt * 3);                          // m/s, vyhlazená
      const kmh = vHlad * 3.6;
      // zorné pole: od 40 km/h se rozšiřuje, při 160 km/h o 14°
      const cil = stav.veVoze ? FOV0 + Math.max(0, Math.min(1, (kmh - 40) / 120)) * 14 : FOV0;
      if (Math.abs(camera.fov - cil) > 0.05) { camera.fov += (cil - camera.fov) * Math.min(1, dt * 2.5); camera.updateProjectionMatrix(); }
      // chvění ve voze od 120 km/h, pohupování kroku pěšky z očí
      posun.set(0, 0, 0); naklon = 0;
      if (stav.veVoze && kmh > 120) { const s = Math.min(1, (kmh - 120) / 80) * 0.03; posun.set(Math.sin(t * 37) * s, Math.sin(t * 53 + 1) * s, Math.sin(t * 29 + 2) * s); }   // chvění až od 120 km/h, plné od 200
      else if (stav.pesky && stav.zOci) {
        // z očí: krok zhoupne hlavu nahoru a dolů (dvakrát za dvojkrok) a do strany na stojnou nohu, hlava se lehce naklání;
        // při běhu víc. Ve stoje jen dech. Boční posun podél pravé osy kamery.
        const bez = Math.min(1, Math.max(0, (vHlad - 0.6) / 4)), sila = 0.6 + Math.min(1.4, vHlad / 3);
        if (vHlad > 0.6) krok += dt * (4.2 + vHlad * 1.1);
        const vy = (Math.abs(Math.cos(krok)) - 0.55) * 0.07 * sila * bez + Math.sin(t * 1.7) * 0.006, bok = Math.sin(krok) * 0.028 * sila * bez;
        pravo.setFromMatrixColumn(camera.matrixWorld, 0);
        posun.set(pravo.x * bok, vy, pravo.z * bok);
        naklon = Math.sin(krok) * 0.011 * sila * bez;
      }
      // listí: vznikne nad hráčem do 25 m, padá s kýváním a větrem, na zemi se zase objeví nahoře
      if (listi) {
        const [wx, wy] = stav.vitr || [0, 0];
        for (let i = 0; i < N; i++) {
          const o = L[i];
          if (o.z < gz(o.x, o.y) || Math.hypot(o.x - hrac.x, o.y - hrac.y) > 40) {
            // nový list jen z koruny listnatého stromu kolem hráče (bez stromů nepadá nic)
            if (t - stromyT > 1.5 && stav.stromy) { stromy = stav.stromy(hrac.x, hrac.y, 35); stromyT = t; }
            if (!stromy.length || Math.random() > 0.03) { o.z = -1e9; o.x = hrac.x + 1e4; continue; }   // řídce: list se neobjeví hned
            const s = stromy[Math.floor(Math.random() * stromy.length)], a = Math.random() * 6.28, d = Math.random() * s.h * 0.3;
            o.x = s.x + Math.cos(a) * d; o.y = s.y + Math.sin(a) * d; o.z = s.z + s.h * (0.45 + Math.random() * 0.4);
            o.vx = wx * 0.6 + (Math.random() - 0.5) * 0.4; o.vy = wy * 0.6 + (Math.random() - 0.5) * 0.4;
          }
          o.ph += dt * 2.2; o.rot += dt * 1.7;
          o.x += (o.vx + Math.sin(o.ph) * 0.45) * dt; o.y += (o.vy + Math.cos(o.ph * 0.8) * 0.35) * dt; o.z -= (0.55 + Math.sin(o.ph * 1.3) * 0.25) * dt;
          e.set(o.rot, o.ph, o.rot * 0.6); q.setFromEuler(e);
          m4.compose(v.set(o.x, o.z, -o.y), q, sc); listi.setMatrixAt(i, m4);
        }
        listi.instanceMatrix.needsUpdate = true;
      }
    },
    pred() { camera.position.add(posun); if (naklon) camera.rotateZ(naklon); camera.updateMatrixWorld(); },
    po() { camera.position.sub(posun); if (naklon) camera.rotateZ(-naklon); },
  };
}
