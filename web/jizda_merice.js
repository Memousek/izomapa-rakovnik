// Ukazatele rychlosti „Vaše rychlost“ ve 3D jízdě (nastroje/merice.py -> merice.json vedle jizda.html, poloha z OSM).
// Tabule na sloupku u okraje silnice ukazuje rychlost hráče, když k ní jede (auto, motorka i pěšky): zeleně do limitu,
// nad limitem červeně a bliká. Měřený úsek (dvojice tabulí se stejným `usek`, mesto.json "merene_useky"): po průjezdu
// oběma tabulemi spočítá průměrnou rychlost jako úsekové měření a ukáže ji v hlášce. Pokutu nedává, jde o informativní tabule.
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
const DOSAH = 90, BLIZ = 5, PRUJEZD = 14, MAX_UHEL = 60, VYDRZ = 2;   // m, m, m, °, s

export function vytvorMerice(THREE, scene, api) {
  const skupina = new THREE.Group(); skupina.name = 'merice'; scene.add(skupina);
  let seznam = [];
  fetch('merice.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((d) => {
    seznam = (d || []).filter((m) => m.typ === 'displej').map((m) => {
      const [la, lo] = m.stoji || [m.lat, m.lon];
      return { m, x: (lo - api.CAM.lon0) * api.CAM.kx, y: (la - api.CAM.lat0) * api.CAM.ky, g: null, cislo: null, do: 0, kresleno: '' };
    });
  });

  const matSloup = new THREE.MeshLambertMaterial({ color: 0xb9bdc2 }), matRam = new THREE.MeshLambertMaterial({ color: 0xffd200 });
  const matZada = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
  function postav(t) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 72;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const lic = new THREE.MeshBasicMaterial({ map: tex });          // svítí sama (i v noci)
    const g = new THREE.Group(), z = api.gz(t.x, t.y);
    g.position.set(t.x, z, -t.y);
    // čelo (místní +z) k autům, která tabule měří; obousměrná tabule má číslo z obou stran a stojí čelem podél silnice
    const b = ((t.m.smer ?? t.m.osa ?? 0) * Math.PI) / 180;
    g.rotation.y = Math.PI - b;
    const sloup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.1, 8), matSloup); sloup.position.y = 1.55; g.add(sloup);
    const ram = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.58, 0.1), [matRam, matRam, matRam, matRam, matRam, matRam]); ram.position.set(0, 3.0, 0); g.add(ram);
    const deska = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.46), lic); deska.position.set(0, 3.0, 0.052); g.add(deska);
    if (t.m.smer == null) { const d2 = deska.clone(); d2.position.z = -0.052; d2.rotation.y = Math.PI; g.add(d2); }
    else { const z2 = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.56), matZada); z2.position.set(0, 3.0, -0.052); z2.rotation.y = Math.PI; g.add(z2); api.jenVeDne.push(z2); }
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.04), matRam); pod.position.set(0, 2.6, 0); g.add(pod);   // štítek „VAŠE RYCHLOST“ jen jako pruh
    api.jenVeDne.push(sloup, ram, pod);
    skupina.add(g); t.g = g; t.c = c; t.tex = tex;
    kresli(t, '');
  }
  function kresli(t, stav) {
    if (stav === t.kresleno) return; t.kresleno = stav;
    const g = t.c.getContext('2d'); g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, 128, 72);
    const [txt, barva] = stav ? stav.split('|') : ['', ''];
    if (txt) {
      g.fillStyle = barva; g.font = '700 58px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 64, 39);
    }
    t.tex.needsUpdate = true;
  }

  // měřený úsek: kdy a u které tabule hráč projel naposledy
  let prujezd = null, px = null, py = null, pt = 0, v = 0, vx = 0, vy = 0;
  function update(now) {
    if (!seznam.length) return;
    const h = api.hrac, ted = now / 1000;
    // rychlost a směr z pohybu hráče (funguje v autě, na motorce i pěšky); ve vzduchu a v autobusu se neměří
    const letí = !h.vAuto && h.z != null && h.z - api.gz(h.x, h.y) > 6, jinde = h.bus !== null && h.bus !== undefined;
    if (px != null && ted > pt) {
      const dt = ted - pt, dx = h.x - px, dy = h.y - py, s = Math.hypot(dx, dy) / dt;
      if (s < 120) { const k = Math.min(1, dt * 4); v += (s - v) * k; if (s > 0.3) { vx = dx / (s * dt); vy = dy / (s * dt); } }   // skok (teleport) ignorovat
    }
    px = h.x; py = h.y; pt = ted;
    for (const t of seznam) {
      const ux = h.x - t.x, uy = h.y - t.y, d = Math.hypot(ux, uy);
      if (!t.g && d < 500 && api.roads.length) postav(t);
      if (!t.g) continue;
      t.g.visible = d < 900;
      if (d > 900) continue;
      let meri = !letí && !jinde && d < DOSAH && d > BLIZ && v > 1 && (-ux * vx - uy * vy) / d > 0.6;
      if (meri && t.m.smer != null) {
        const az = (Math.atan2(ux, uy) * 180 / Math.PI + 360) % 360;
        meri = Math.abs(((az - t.m.smer + 540) % 360) - 180) <= MAX_UHEL;
      }
      if (meri) { t.cislo = Math.round(v * 3.6); t.do = ted + VYDRZ; } else if (ted > t.do) t.cislo = null;
      const nad = t.cislo != null && t.cislo > t.m.limit, blik = nad && Math.floor(ted * 2.5) % 2;
      kresli(t, t.cislo == null || blik ? '' : `${Math.min(199, t.cislo)}|${nad ? '#ff3b30' : '#3cff6a'}`);
      // úsekové měření: čas průjezdu = okamžik, kdy byl hráč tabuli nejblíž (jako kamera v místě tabule)
      if (t.m.usek == null) continue;
      if (d < PRUJEZD && !letí && !jinde) { if (!t.min || d < t.min.d) t.min = { d, cas: ted }; continue; }
      if (!t.min) continue;
      const cas = t.min.cas; t.min = null;                         // hráč tabuli minul
      if (prujezd && prujezd.usek === t.m.usek && prujezd.t !== t && cas - prujezd.cas < 600) {
        const delka = Math.hypot(t.x - prujezd.t.x, t.y - prujezd.t.y), prumer = Math.round(delka / (cas - prujezd.cas) * 3.6), lim = t.m.limit;
        api.toast(`Měřený úsek ${Math.round(delka)} m: průměr ${prumer} km/h${prumer > lim ? `, o ${prumer - lim} víc než ${lim}` : `, limit ${lim} dodržen`}`, 'info');
        prujezd = null;
      } else prujezd = { usek: t.m.usek, t, cas };
    }
  }
  return { update, skupina, get seznam() { return seznam; } };
}
