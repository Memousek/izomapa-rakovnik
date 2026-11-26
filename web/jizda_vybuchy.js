// Výbuchy, oheň a dým pro 3D jízdu: havárie letadla a vrtulníku, zničené auto (jizda.html), cokoli dalšího.
// vybuch(x, y, z, sila): záblesk, ohnivá koule, trosky s gravitací, sloup dýmu a pak chvíli hořící vrak na zemi.
// kour / ohen(x, y, z, hustota): průběžné zdroje (volá se každý snímek, hustota = částic za sekundu).
// Částice jsou sprity s měkkou texturou (kreslená radiální koule), bez vlastního světla v obrazu světel (jenVeDne).
// Svět: x východ, y sever, z nahoru; three = (x, z, -y).
export function vytvorVybuchy(THREE, scene, { zvuk = () => {}, jenVeDne = [], gz = () => 0 } = {}) {
  const tex = (() => {                                       // měkký kruh: střed plný, okraj průhledný
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
  })();
  const MAX = 420;
  const parts = [];                                          // { sp, t, life, vx, vy, vz, s0, s1, a0, druh }
  const volne = [];
  function sprite() {
    const sp = volne.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }));
    sp.visible = true; if (!sp.parent) scene.add(sp); return sp;
  }
  // druh: 0 dým (šedý, roste, stoupá), 1 oheň (oranžový, aditivní, krátký), 2 ohnivá koule (žlutá → oranžová, rychle roste)
  function castice(x, y, z, druh, o = {}) {
    if (parts.length >= MAX) return;
    const sp = sprite(), m = sp.material;
    m.blending = druh === 0 ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.color.setHex(druh === 0 ? (o.barva ?? 0x5a5754) : druh === 1 ? 0xff7a1a : 0xffc040);
    sp.position.set(x, z, -y);
    parts.push({ sp, t: 0, life: o.life ?? (druh === 0 ? 4 + Math.random() * 3 : druh === 1 ? 0.5 + Math.random() * 0.4 : 0.9),
      vx: o.vx ?? (Math.random() - 0.5) * 0.8, vy: o.vy ?? (Math.random() - 0.5) * 0.8, vz: o.vz ?? (druh === 0 ? 1.6 + Math.random() : 2.5),
      s0: o.s0 ?? (druh === 0 ? 0.8 : 0.7), s1: o.s1 ?? (druh === 0 ? 5 + Math.random() * 3 : druh === 1 ? 0.25 : 9), a0: o.a0 ?? (druh === 0 ? 0.55 : 0.95), druh });
  }
  // trosky: tmavé kvádry s gravitací a odrazem od země
  const trosky = [];
  const gT = new THREE.BoxGeometry(1, 1, 1), mT = new THREE.MeshLambertMaterial({ color: 0x2a2724 });
  // hořící místa (vrak): oheň a dým po dobu t
  const hori = [];

  function vybuch(x, y, z, sila = 1) {
    zvuk('vybuch', x, y, z);
    for (let i = 0; i < 14 * sila; i++) {                    // ohnivá koule z několika rychle rostoucích sprajtů
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, v = (3 + Math.random() * 5) * sila;
      castice(x, y, z + 0.8, 2, { vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(a) * Math.cos(e) * v, vz: Math.sin(e) * v + 2, s0: 1.2 * sila, s1: (6 + Math.random() * 4) * sila, life: 0.7 + Math.random() * 0.5 });
    }
    for (let i = 0; i < 18 * sila; i++) castice(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, z + 1, 0,
      { vz: 3 + Math.random() * 4, s0: 2 * sila, s1: (10 + Math.random() * 6) * sila, life: 6 + Math.random() * 4, barva: 0x2f2c2a, a0: 0.7 });   // černý dým
    for (let i = 0; i < 12 * sila && trosky.length < 60; i++) {
      const m = new THREE.Mesh(gT, mT), a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
      const s = 0.15 + Math.random() * 0.45; m.scale.set(s, s * 0.5, s * 0.8); m.castShadow = true; scene.add(m); jenVeDne.push(m);
      m.position.set(x, z + 1, -y);
      trosky.push({ m, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 4 + Math.random() * 8, w: (Math.random() - 0.5) * 12, t: 0 });
    }
    castice(x, y, z + 1.5, 2, { vx: 0, vy: 0, vz: 0, s0: 4 * sila, s1: 16 * sila, life: 0.25, a0: 1 });   // záblesk (bez světla: nové světlo by přeložilo všechny materiály a hra by se zasekla)
    hori.push({ x, y, z, t: 10 + 4 * sila, sila });           // vrak hoří a kouří
  }
  function kour(x, y, z, hustota = 6, dt = 0.016, barva) {
    let n = hustota * dt; while (n > 1 || Math.random() < n) { castice(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z, 0, { s0: 0.4, s1: 3 + Math.random() * 2, life: 2.5 + Math.random() * 1.5, barva, a0: 0.45 }); n--; }
  }
  function ohen(x, y, z, hustota = 18, dt = 0.016) {
    let n = hustota * dt; while (n > 1 || Math.random() < n) { castice(x + (Math.random() - 0.5) * 0.9, y + (Math.random() - 0.5) * 0.9, z, 1, { s0: 0.9, s1: 0.2, vz: 2 + Math.random() * 1.5 }); n--; }
  }

  function update(dt) {
    if (!(dt > 0)) return;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt; const u = p.t / p.life;
      if (u >= 1) { p.sp.visible = false; volne.push(p.sp); parts.splice(i, 1); continue; }
      const tl = p.druh === 2 ? Math.exp(-dt * 3) : p.druh === 0 ? Math.exp(-dt * 0.6) : 1;   // ohnivá koule rychle zpomalí
      p.vx *= tl; p.vy *= tl; if (p.druh === 2) p.vz *= tl;
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vz * dt; p.sp.position.z -= p.vy * dt;
      const s = p.s0 + (p.s1 - p.s0) * (p.druh === 2 ? 1 - (1 - u) ** 3 : u);
      p.sp.scale.setScalar(s);
      p.sp.material.opacity = p.a0 * (p.druh === 0 ? Math.min(1, u * 6) * (1 - u) : 1 - u);
      if (p.druh === 2) p.sp.material.color.setHex(u < 0.3 ? 0xffd060 : u < 0.6 ? 0xff7a1a : 0x7a3a1a);   // dohasíná do tmavě oranžové
    }
    for (let i = trosky.length - 1; i >= 0; i--) {
      const d = trosky[i]; d.t += dt;
      const m = d.m, zg = gz(m.position.x, -m.position.z) + 0.05;
      if (m.position.y > zg || d.vz > 0) {
        d.vz -= 9.81 * dt; m.position.x += d.vx * dt; m.position.y += d.vz * dt; m.position.z -= d.vy * dt;
        m.rotation.x += d.w * dt; m.rotation.z += d.w * 0.7 * dt;
        if (m.position.y < zg) { m.position.y = zg; d.vz = -d.vz * 0.3; d.vx *= 0.5; d.vy *= 0.5; d.w *= 0.5; if (Math.abs(d.vz) < 1) d.vz = 0; }
      }
      if (d.t > 25) { scene.remove(m); const k = jenVeDne.indexOf(m); if (k >= 0) jenVeDne.splice(k, 1); trosky.splice(i, 1); }
    }
    for (let i = hori.length - 1; i >= 0; i--) {
      const h = hori[i]; h.t -= dt;
      if (h.t <= 0) { hori.splice(i, 1); continue; }
      const f = Math.min(1, h.t / 4);                          // na konci jen doutná
      ohen(h.x, h.y, h.z + 0.4, 22 * h.sila * f, dt); kour(h.x, h.y, h.z + 1.2, 7 * h.sila, dt, 0x3a3734);
    }
  }
  return { vybuch, kour, ohen, update, get pocet() { return parts.length; } };
}
