// Pocit z pohybu ve 3D jízdě (Rakovník): zorné pole se s rychlostí ve vozidle rozšíří, ve vysoké rychlosti se kamera
// jemně chvěje, pěšky z očí se pohupuje krok. Na podzim kolem hráče padá a víří listí (jeden InstancedMesh).
// Kamera se posune jen na dobu kreslení snímku (pred / po), aby to neovlivnilo plynulé dotahování kamery.
export function vytvorEfekty(THREE, scene, camera, { obdobi, jenVeDne } = {}) {
  const FOV0 = camera.fov;
  let vHlad = 0, krok = 0, minule = null;
  const posun = new THREE.Vector3();
  // ---------- listí ----------
  const N = obdobi === 'autumn' ? 260 : 0;
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
      // chvění ve voze od 60 km/h, pohupování kroku pěšky z očí
      posun.set(0, 0, 0);
      if (stav.veVoze && kmh > 60) { const s = Math.min(1, (kmh - 60) / 100) * 0.03; posun.set(Math.sin(t * 37) * s, Math.sin(t * 53 + 1) * s, Math.sin(t * 29 + 2) * s); }
      else if (stav.pesky && stav.zOci && vHlad > 0.6) { krok += dt * vHlad * 1.9; posun.set(0, Math.abs(Math.sin(krok)) * 0.045 - 0.02, 0); }
      // listí: vznikne nad hráčem do 25 m, padá s kýváním a větrem, na zemi se zase objeví nahoře
      if (listi) {
        const [wx, wy] = stav.vitr || [0, 0];
        for (let i = 0; i < N; i++) {
          const o = L[i];
          if (o.z < gz(o.x, o.y) || Math.hypot(o.x - hrac.x, o.y - hrac.y) > 30) {
            const a = Math.random() * 6.28, d = Math.random() * 25;
            o.x = hrac.x + Math.cos(a) * d; o.y = hrac.y + Math.sin(a) * d; o.z = gz(o.x, o.y) + 3 + Math.random() * 9;
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
    pred() { camera.position.add(posun); camera.updateMatrixWorld(); },
    po() { camera.position.sub(posun); },
  };
}
