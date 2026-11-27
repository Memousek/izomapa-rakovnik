// Uzavírky silnic ve 3D jízdě: ruční z assets/upresneni.json a automatické z webu města (../uzavirky.js, functions/api/uzavirky.js).
// Položka: { line: [[lat, lon], …] (úsek po ose silnice), od, do (YYYY-MM-DD, obojí nepovinné), popis, zdroj, objizdka }.
// Uzavřený kus silnice: navigace ho objede, auta do něj neodbočí. Na obou koncích stojí zábrana Z2 se značkou B1
// (zákaz vjezdu všech vozidel) a oranžovými výstražnými světly, do zábrany se nedá projet.
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
const TOL = 6;                                               // jak daleko od čáry uzavírky smí ležet osa silnice (m)
const PUL = { motorway: 9, trunk: 6, primary: 5, secondary: 4.5, tertiary: 4, residential: 3, unclassified: 3, living_street: 3, service: 1.8 };

export function vytvorUzavirky(THREE, scene, api) {
  const skupina = new THREE.Group(); skupina.name = 'uzavirky'; scene.add(skupina);
  let seznam = [], useky = [], zabrany = [], hotovo = false, pripraveno = null;
  const posluchaci = [];
  const dnes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const platna = (u) => (!u.od || String(u.od) <= dnes()) && (!u.do || String(u.do) >= dnes());

  function nastav(data) {
    seznam = (data || []).filter((u) => u.line && u.line.length > 1 && platna(u)).map((u, i) => ({
      ...u, i, body: u.line.map(([la, lo]) => [(lo - api.CAM.lon0) * api.CAM.kx, (la - api.CAM.lat0) * api.CAM.ky]),
    }));
    useky = [];
    for (const u of seznam) for (let k = 1; k < u.body.length; k++) {
      const [ax, ay] = u.body[k - 1], [bx, by] = u.body[k], L = Math.hypot(bx - ax, by - ay); if (L < 0.5) continue;
      useky.push({ u, ax, ay, bx, by, ux: (bx - ax) / L, uy: (by - ay) / L, L });
    }
    for (const z of zabrany) { skupina.remove(z.g); }
    zabrany = []; hotovo = true;
    for (const f of posluchaci) f();
  }
  // ../uzavirky.js: statický seznam hned, čerstvá oznámení z webu města (api/uzavirky) když dorazí; částečné uzavírky průjezd nezavírají
  const statický = () => fetch('jizda/uzavirky.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then(nastav);
  pripraveno = import('../uzavirky.js').then((m) => new Promise((ok) => {
    let prvni = true;
    m.nactiUzavirky('', (d) => { nastav(d.filter((u) => !u.castecna && !u.druh)); if (prvni) { prvni = false; ok(); } }).catch(() => { if (prvni) { prvni = false; statický().then(ok); } });
  })).catch(statický);

  // je kus silnice (lomená čára w) uzavřený? Počítá se jen délka, která vede podél čáry uzavírky (ne křížící ulice).
  function kryje(w) {
    if (!useky.length || !w || w.length < 2) return null;
    let kryto = 0, L = 0, ktera = null;
    for (let i = 1; i < w.length; i++) {
      const dx = w[i][0] - w[i - 1][0], dy = w[i][1] - w[i - 1][1], l = Math.hypot(dx, dy); if (l < 0.01) continue;
      L += l;
      const n = Math.max(1, Math.ceil(l / 4)), ux = dx / l, uy = dy / l;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, mx = w[i - 1][0] + dx * t, my = w[i - 1][1] + dy * t;
        for (const s of useky) {
          if (Math.abs(ux * s.ux + uy * s.uy) < 0.8) continue;
          const q = Math.max(0, Math.min(s.L, (mx - s.ax) * s.ux + (my - s.ay) * s.uy));
          if (Math.hypot(s.ax + s.ux * q - mx, s.ay + s.uy * q - my) < TOL) { kryto += l / n; ktera = s.u; break; }
        }
      }
    }
    return kryto >= 8 || (L > 0 && kryto >= 0.4 * L) ? ktera : null;
  }

  // ---------- zábrana Z2 + B1 + výstražná světla ----------
  function platno(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }
  const texPruhy = (() => {                                   // Z2: střídavé červené a bílé šikmé pruhy
    const [c, g] = platno(256, 32); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#c8102e';
    for (let x = -32; x < 288; x += 64) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, 32); g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const texB1 = (() => {                                      // B1: bílý kruh s červeným okrajem
    const [c, g] = platno(128, 128);
    g.beginPath(); g.arc(64, 64, 62, 0, 6.3); g.fillStyle = '#c8102e'; g.fill();
    g.beginPath(); g.arc(64, 64, 46, 0, 6.3); g.fillStyle = '#fff'; g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const matNoha = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const matB1 = new THREE.MeshBasicMaterial({ map: texB1, alphaTest: 0.5, color: 0xe6e6e6 });
  const matRub = new THREE.MeshLambertMaterial({ color: 0x9a9ea3 });
  const matSvetlo = new THREE.MeshBasicMaterial({ color: 0xffa21f });
  const geoSvetlo = new THREE.SphereGeometry(0.11, 10, 8);
  const geoNoha = new THREE.BoxGeometry(0.5, 0.06, 0.5);

  function postav(u, konec) {                                 // konec 0 / 1: začátek / konec čáry uzavírky
    const P = u.body, [x0, y0] = konec ? P[P.length - 1] : P[0], [x1, y1] = konec ? P[P.length - 2] : P[1];
    let dx = x0 - x1, dy = y0 - y1, dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;    // ven z uzavírky
    let x = x0, y = y0, z = api.gz(x0, y0), pul = 3.5;
    let best = null;                                          // přichytit na osu nejbližší silnice (výška i na mostě, šířka podle třídy)
    for (const r of api.roads) {
      if (Math.abs(r.w[0][0] - x0) > 1500 || Math.abs(r.w[0][1] - y0) > 1500) continue;
      for (let i = 1; i < r.w.length; i++) {
        const a = r.w[i - 1], b = r.w[i], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x0 - a[0]) * ex + (y0 - a[1]) * ey) / l2)), d = Math.hypot(a[0] + ex * t - x0, a[1] + ey * t - y0);
        if (d < 10 && (!best || d < best.d)) best = { d, r, s: r.len[i - 1] + (r.len[i] - r.len[i - 1]) * t };
      }
    }
    if (best) {
      const o = api.along(best.r, best.s), L = Math.hypot(o.dx, o.dy) || 1, ux = o.dx / L, uy = o.dy / L, sg = ux * dx + uy * dy >= 0 ? 1 : -1;
      x = o.x; y = o.y; z = o.z; dx = ux * sg; dy = uy * sg; pul = (PUL[best.r.c] || 3) * (best.r.o ? 0.7 : 1) + 0.3;
    }
    const g = new THREE.Group(); g.position.set(x, z, -y); g.rotation.y = Math.atan2(dy, dx);    // místní osa x = ven z uzavírky
    const tex = texPruhy.clone(); tex.repeat.set(Math.max(1, Math.round(pul)), 1); tex.needsUpdate = true;
    const deska = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, pul * 2), new THREE.MeshLambertMaterial({ map: tex })); deska.position.set(0, 1.0, 0); g.add(deska);
    const lamp = [];
    for (const sz of [-pul + 0.1, pul - 0.1]) {
      const noha = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), matNoha); noha.position.set(0, 0.5, sz); g.add(noha);
      const pata = new THREE.Mesh(geoNoha, matNoha); pata.position.set(0, 0.03, sz); g.add(pata);
      const s = new THREE.Mesh(geoSvetlo, matSvetlo); s.position.set(0, 1.25, sz); g.add(s); lamp.push(s);
    }
    const tyc = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), matNoha); tyc.position.set(0, 1.55, 0); g.add(tyc);
    const znacka = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), matB1); znacka.position.set(0.03, 2.25, 0); znacka.rotation.y = Math.PI / 2; g.add(znacka);
    const rub = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), matRub); rub.position.set(0.0, 2.25, 0); rub.rotation.y = -Math.PI / 2; g.add(rub);
    skupina.add(g);
    for (const o of g.children) if (!lamp.includes(o)) api.jenVeDne.push(o);   // v obrazu světel svítí jen výstražná světla
    return { u, g, x, y, z, dx, dy, pul, lamp, hlaseno: -1e9 };
  }

  function update(now) {
    if (!hotovo) return;
    if (seznam.length && zabrany.length < seznam.length * 2 && api.roads.length) {
      for (const u of seznam) for (const k of [0, 1]) {
        if (zabrany.some((z) => z.u === u && z.k === k)) continue;
        const [bx, by] = k ? u.body[u.body.length - 1] : u.body[0];
        if (Math.hypot(bx - api.hrac.x, by - api.hrac.y) > 900) continue;
        const z = postav(u, k); z.k = k; zabrany.push(z);
      }
    }
    const blik = Math.floor(now / 500) % 2 === 0;
    for (const z of zabrany) {
      for (const s of z.lamp) s.visible = blik;
      const d = Math.hypot(z.x - api.hrac.x, z.y - api.hrac.y);
      if (d < 70 && now - z.hlaseno > 90000) {
        for (const o of zabrany) if (o.u === z.u) o.hlaseno = now;
        const u = z.u, doKdy = u.do ? ` do ${+u.do.slice(8, 10)}. ${+u.do.slice(5, 7)}.` : '';
        api.toast(`Uzavírka${u.popis ? ': ' + u.popis : ''}${doKdy}${u.objizdka ? ' · Objížďka: ' + u.objizdka : ''}`, 'info');
      }
    }
  }

  // bod v zábraně (hráč pěšky i autem): obdélník 0,4 m × šířka silnice
  function prekazka(x, y) {
    for (const z of zabrany) {
      const rx = x - z.x, ry = y - z.y; if (Math.abs(rx) > 12 || Math.abs(ry) > 12) continue;
      const a = rx * z.dx + ry * z.dy, b = -rx * z.dy + ry * z.dx;
      if (Math.abs(a) < 0.25 && Math.abs(b) < z.pul) return true;
    }
    return false;
  }

  return {
    pripraveno, kryje, update, prekazka, nastav,
    onZmena(f) { posluchaci.push(f); },
    get seznam() { return seznam; },
    get zabrany() { return zabrany; },
    skupina,
  };
}
