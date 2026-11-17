// 3D stromy kolem kamery (instancované low-poly modely místo billboardů) + test překážky pro kamerové rameno.
// Svět: x východ, y sever, z nahoru; three poloha = (x, z, -y). Barvy podle palet atlasu v render.html.
//
// Skrytí billboardů: uBlizko = Vector4(x, y, z, R) v souřadnicích three. Střed kotvy se mění jen při přestavbě
// (kamera ujela > 8 m), 3D stromy jsou přesně ty, jejichž základna je v kotvě blíž než R (vodorovně), takže mezi
// 3D stromy a billboardy nevznikne mezera ani překryv. Úryvek pro billboardový shader je v hlavičce vytvorStromy.

const KOSTKA = 32;          // mřížka prostorového indexu (m)
const POSUN_PRESTAVBY = 8;  // o kolik se musí kamera posunout, aby se instance přestavěly (m)
const MAX_INSTANCI = 2500;  // nejvíc 3D stromů najednou

const TYP_LISTNAC = 0, TYP_JEHLICNAN = 1, TYP_SLOUP = 2, TYP_KER = 3;

// palety z render.html (G), tóny 2 a 3 stačí, stínování dělá světlo
const PAL = {
  summer: [['#3c6c2d', '#548b3a'], ['#376534', '#4c8043'], ['#4a7a2a', '#65983a']],
  spring: [['#518a32', '#6eaa42'], ['#4c823a', '#68a14b']],
  blossomW: ['#d9ccd1', '#f2e9ed'],
  blossomP: ['#d78ba2', '#efb8c8'],
  autumn: [['#62782a', '#7f923a'], ['#c49a28', '#e2c045'], ['#c46a24', '#e2903a'], ['#a83e22', '#cc5a30'], ['#92743a', '#b29452']],
  conifer: [['#214e33', '#2d6640'], ['#24543b', '#316e4a']],
  kmen: ['#4c3322', '#6a4a30'],
  kmenZima: ['#4a3d34', '#66564a'],
  kerZima: ['#625244', '#d6dde8'],
  snih: ['#d6dde8', '#f4f7fb'],
};

export function vytvorStromy(THREE, scene, opts = {}) {
  /*
   * Napojení billboardů (jizda.html, nactiCtverec), proti stávajícímu patchi navíc:
   *   // jednou po vytvoření: const STROMY = vytvorStromy(THREE, scene3, { obdobi: OBD, blizko: 70 });
   *   o.material.uniforms.uBlizko = STROMY.uBlizko;                       // sdílený uniform (Vector4)
   *   o.material.vertexShader = o.material.vertexShader
   *     .replace('attribute vec2 aTile;', 'uniform vec4 uBlizko; attribute vec2 aTile;')
   *     .replace('gl_Position = projectionMatrix * viewMatrix * w;',
   *       'gl_Position = projectionMatrix * viewMatrix * w;' +
   *       'vec3 wc = (modelMatrix * vec4(c0, 1.0)).xyz; vec2 dq = wc.xz - uBlizko.xz;' +
   *       'if (dot(dq, dq) < uBlizko.w * uBlizko.w) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
   *   // (c0 je střed instance = základna stromu; musí to být za náhradou řádku s `vec4 w`, kde c0 vzniká)
   */
  let blizko = opts.blizko || 70;                           // dohled 3D stromů (m), mění volba kvality (nastavDosah)
  const odstup = opts.odstup === undefined ? 0.4 : opts.odstup;   // rezerva kolem koruny pro kameru (m)
  let obdobi = opts.obdobi || 'summer';
  const kapacita = opts.max || MAX_INSTANCI;               // velikost bufferů instancí
  let cap = Math.min(kapacita, opts.limit || kapacita);

  const uBlizko = { value: new THREE.Vector4(0, -1e9, 0, 0) };   // poloměr 0 = nic se neskryje
  const skupina = new THREE.Group();
  skupina.name = 'stromy3d';
  scene.add(skupina);

  // ---------- pomocné ----------
  const lin = (hex) => new THREE.Color().setStyle(hex);          // setStyle převede sRGB na pracovní prostor
  const palLin = (a) => a.map(lin);
  const L = {
    summer: PAL.summer.map(palLin), spring: PAL.spring.map(palLin), autumn: PAL.autumn.map(palLin), conifer: PAL.conifer.map(palLin),
    blossomW: palLin(PAL.blossomW), blossomP: palLin(PAL.blossomP), kmen: palLin(PAL.kmen), kmenZima: palLin(PAL.kmenZima),
    kerZima: palLin(PAL.kerZima), snih: palLin(PAL.snih),
  };
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };

  // ---------- geometrie (strom o výšce 1, základna v y = 0) ----------
  const hashPos = (x, y, z) => { const v = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453; return v - Math.floor(v); };
  function blob(detail, r, sx, sy, sz, px, py, pz) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {                          // hrbolatý povrch, stejný vrchol = stejný posun
      const k = 1 + (hashPos(p.getX(i), p.getY(i), p.getZ(i)) - 0.5) * 0.2;
      p.setXYZ(i, p.getX(i) * k * r * sx + px, p.getY(i) * k * r * sy + py, p.getZ(i) * k * r * sz + pz);
    }
    return g;
  }
  function kuzel(r, vyska, zakl, seg) {
    const g = new THREE.ConeGeometry(r, vyska, seg, 1);
    g.translate(0, zakl + vyska / 2, 0);
    return g;
  }
  function vetev(dx, dy, dz, delka, r0, r1, ox, oy, oz) {
    const g = new THREE.CylinderGeometry(r1, r0, delka, 4, 1);
    g.translate(0, delka / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    g.applyQuaternion(q); g.translate(ox, oy, oz);
    return g;
  }
  // spojí díly do jedné neindexované geometrie s plochými normálami a barvou vrcholů (svislý přechod tmavá -> světlá)
  function sloz(dily, tmave, svetle) {
    let n = 0;
    const gs = dily.map((g) => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
    const pos = new Float32Array(n * 3);
    let o = 0;
    for (const g of gs) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { if (pos[i] < y0) y0 = pos[i]; if (pos[i] > y1) y1 = pos[i]; }
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = tmave + (svetle - tmave) * ((pos[i * 3 + 1] - y0) / Math.max(1e-6, y1 - y0));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    for (const q of gs) q.dispose();
    return g;
  }
  const kmenG = (() => { const g = new THREE.CylinderGeometry(0.7, 1, 1, 5, 1); g.translate(0, 0.5, 0); return sloz([g], 0.85, 1.05); })();
  const GEO = {
    kmen: kmenG,
    listnac: sloz([blob(1, 0.30, 1.15, 1, 1.15, 0, 0.66, 0), blob(0, 0.20, 1, 0.9, 1, 0.20, 0.55, 0.10), blob(1, 0.21, 1, 1, 1, -0.18, 0.73, -0.12)], 0.78, 1.12),
    jehlicnan: sloz([kuzel(0.24, 0.42, 0.10, 7), kuzel(0.19, 0.38, 0.32, 7), kuzel(0.13, 0.46, 0.54, 7)], 0.8, 1.1),
    snihJehl: sloz([kuzel(0.115, 0.19, 0.335, 7), kuzel(0.092, 0.171, 0.529, 7), kuzel(0.063, 0.207, 0.793, 7)], 1, 1),
    sloup: sloz([blob(1, 1, 0.12, 0.5, 0.12, 0, 0.52, 0)], 0.8, 1.1),
    snihSloup: sloz([blob(0, 1, 0.1, 0.2, 0.1, 0, 0.84, 0)], 1, 1),
    ker: sloz([blob(1, 0.45, 1.2, 0.95, 1.2, 0, 0.45, 0), blob(0, 0.30, 1, 1, 1, 0.3, 0.32, 0.1), blob(1, 0.32, 1, 0.9, 1, -0.28, 0.30, -0.12)], 0.8, 1.1),
    vetve: sloz([
      vetev(0.45, 1, 0.1, 0.5, 0.014, 0.007, 0, 0.4, 0), vetev(-0.5, 1, -0.1, 0.46, 0.014, 0.007, 0, 0.42, 0),
      vetev(0.1, 1, 0.5, 0.42, 0.012, 0.006, 0, 0.45, 0), vetev(-0.1, 1, -0.5, 0.44, 0.012, 0.006, 0, 0.45, 0),
      vetev(0, 1, 0, 0.55, 0.012, 0.005, 0, 0.42, 0), vetev(0.9, 1, -0.4, 0.22, 0.007, 0.004, 0.17, 0.62, 0.0),
      vetev(-0.8, 1, 0.5, 0.22, 0.007, 0.004, -0.18, 0.62, 0.0),
    ], 0.9, 1.05),
  };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const casti = {};      // název -> { mesh, n }
  const telesa = [];
  for (const k of Object.keys(GEO)) {
    const mesh = new THREE.InstancedMesh(GEO[k], mat, kapacita);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(kapacita * 3), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'strom_' + k;
    skupina.add(mesh); telesa.push(mesh);
    casti[k] = { mesh, n: 0, m: mesh.instanceMatrix.array, c: mesh.instanceColor.array };
  }
  function pridejInstanci(cast, x, y, z, yaw, sx, sy, sz, r, g, b) {
    if (cast.n >= cap) return;
    const m = cast.m, o = cast.n * 16, c = Math.cos(yaw), s = Math.sin(yaw);
    m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -s * sx; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = z; m[o + 14] = -y; m[o + 15] = 1;
    const co = cast.n * 3; cast.c[co] = r; cast.c[co + 1] = g; cast.c[co + 2] = b;
    cast.n++;
  }

  // ---------- data stromů a prostorový index ----------
  const cell = (v) => Math.floor(v / KOSTKA);
  const klic = (gx, gy) => (gx + 4096) * 8192 + (gy + 4096);
  const mrizka = new Map();       // klíč buňky -> [strom]
  const ctverce = new Map();      // klíč čtverce -> [strom]
  let maxR = 0;                   // největší poloměr koruny (pro rozšíření hledání)
  let spinave = true, ax = 0, ay = 0, mamKotvu = false;
  let pocetStromu = 0;

  function pridejCtverec(key, trees) {
    odeberCtverec(key);
    const seznam = [];
    for (const t of trees) {
      const kind = t[5] | 0;
      if (kind === 2) continue;                                  // jako billboardy: druh 2 se nekreslí
      const x = t[0], y = t[1], z = t[2], h = t[3];
      const typ = kind === 1 ? TYP_KER : kind === 3 ? TYP_SLOUP : t[4] ? TYP_JEHLICNAN : TYP_LISTNAC;
      const r = hash(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
      const s = { x, y, z, h, typ, r, r2: (r * 7.31) % 1, r3: (r * 53.7) % 1 };
      // tvar překážky: elipsoid (cz, rx, ry) nebo kužel (zb, zt, R)
      if (typ === TYP_LISTNAC) { s.cz = z + 0.66 * h; s.rx = 0.36 * h; s.ry = 0.32 * h; s.R = s.rx; }
      else if (typ === TYP_SLOUP) { s.cz = z + 0.52 * h; s.rx = 0.12 * h; s.ry = 0.5 * h; s.R = s.rx; }
      else if (typ === TYP_JEHLICNAN) { s.zb = z + 0.12 * h; s.zt = z + h; s.R = 0.24 * h; }
      else s.R = 0;
      if (s.R > maxR) maxR = s.R;
      const k = klic(cell(x), cell(y));
      let a = mrizka.get(k); if (!a) { a = []; mrizka.set(k, a); }
      a.push(s); seznam.push(s);
    }
    ctverce.set(key, seznam); pocetStromu += seznam.length; spinave = true;
  }
  function odeberCtverec(key) {
    const seznam = ctverce.get(key); if (!seznam) return;
    for (const s of seznam) {
      const k = klic(cell(s.x), cell(s.y)), a = mrizka.get(k); if (!a) continue;
      const i = a.indexOf(s);
      if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
      if (!a.length) mrizka.delete(k);
    }
    pocetStromu -= seznam.length; ctverce.delete(key); spinave = true;
  }

  // ---------- barvy podle období ----------
  const c0 = new THREE.Color();
  function mix(p, t, v) { c0.copy(p[0]).lerp(p[1], t); return [c0.r * v, c0.g * v, c0.b * v]; }
  function barvaListi(s) {
    const v = 0.92 + 0.16 * s.r3, t = s.r2;
    if (obdobi === 'autumn') { const i = Math.floor(s.r * 8) % 8; return mix(L.autumn[[0, 1, 2, 3, 4, 0, 1, 2][i]], t, v); }
    if (obdobi === 'spring') {
      if (s.r3 > 0.93) return mix(L.blossomW, t, 1);
      if (s.r3 < 0.03) return mix(L.blossomP, t, 1);
      return mix(L.spring[Math.floor(s.r * 2)], t, v);
    }
    return mix(L.summer[Math.floor(s.r * 3)], t, v);
  }

  // ---------- přestavba instancí kolem kotvy ----------
  const kand = [];
  function prestav(cx, cy, camZ) {
    ax = cx; ay = cy; mamKotvu = true; spinave = false;
    const b2 = blizko * blizko, zima = obdobi === 'winter';
    kand.length = 0;
    for (let gx = cell(cx - blizko); gx <= cell(cx + blizko); gx++) for (let gy = cell(cy - blizko); gy <= cell(cy + blizko); gy++) {
      const a = mrizka.get(klic(gx, gy)); if (!a) continue;
      for (const s of a) { const dx = s.x - cx, dy = s.y - cy, d = dx * dx + dy * dy; if (d < b2) { s.d = d; kand.push(s); } }
    }
    if (kand.length > cap) { kand.sort((p, q) => p.d - q.d); kand.length = cap; }
    for (const k in casti) casti[k].n = 0;
    for (const s of kand) {
      const { x, y, z, h } = s, yaw = s.r * 6.2832, w = 0.9 + 0.2 * s.r2;
      const sv = 0.85 + 0.25 * s.r3;
      if (s.typ === TYP_LISTNAC) {
        const km = zima ? L.kmenZima : L.kmen, kc = mix(km, s.r2, sv);
        pridejInstanci(casti.kmen, x, y, z, yaw, Math.min(0.45, Math.max(0.12, 0.035 * h)), (zima ? 0.5 : 0.62) * h, Math.min(0.45, Math.max(0.12, 0.035 * h)), kc[0], kc[1], kc[2]);
        if (zima) pridejInstanci(casti.vetve, x, y, z, yaw, h, h, h, kc[0], kc[1], kc[2]);
        else { const c = barvaListi(s); pridejInstanci(casti.listnac, x, y, z, yaw, h * w, h, h * w, c[0], c[1], c[2]); }
      } else if (s.typ === TYP_JEHLICNAN) {
        const c = mix(L.conifer[Math.floor(s.r * 2)], s.r2, 0.92 + 0.16 * s.r3), kc = mix(L.kmen, s.r2, sv), rr = Math.min(0.3, Math.max(0.1, 0.025 * h));
        pridejInstanci(casti.kmen, x, y, z, yaw, rr, 0.2 * h, rr, kc[0], kc[1], kc[2]);
        pridejInstanci(casti.jehlicnan, x, y, z, yaw, h * w, h, h * w, c[0], c[1], c[2]);
        if (zima) pridejInstanci(casti.snihJehl, x, y, z, yaw, h * w, h, h * w, L.snih[1].r, L.snih[1].g, L.snih[1].b);
      } else if (s.typ === TYP_SLOUP) {
        const c = mix(L.conifer[Math.floor(s.r * 2)], s.r2, 0.92 + 0.16 * s.r3), kc = mix(L.kmen, s.r2, sv);
        pridejInstanci(casti.kmen, x, y, z, yaw, 0.1, 0.15 * h, 0.1, kc[0], kc[1], kc[2]);
        pridejInstanci(casti.sloup, x, y, z, yaw, h, h, h, c[0], c[1], c[2]);
        if (zima) pridejInstanci(casti.snihSloup, x, y, z, yaw, h, h, h, L.snih[1].r, L.snih[1].g, L.snih[1].b);
      } else {
        const c = zima ? mix(L.kerZima, 0.35 + 0.3 * s.r2, 1) : barvaListi(s);
        pridejInstanci(casti.ker, x, y, z, yaw, h * w, h, h * w, c[0], c[1], c[2]);
      }
    }
    for (const k in casti) {
      const c = casti[k];
      c.mesh.count = c.n; c.mesh.instanceMatrix.needsUpdate = true; c.mesh.instanceColor.needsUpdate = true;
    }
    uBlizko.value.set(cx, camZ, -cy, blizko);
  }
  function update(camX, camY, camZ) {
    if (!mamKotvu || spinave || Math.hypot(camX - ax, camY - ay) > Math.max(POSUN_PRESTAVBY, blizko * 0.1)) prestav(camX, camY, camZ);
  }
  function nastavObdobi(o) { if (o !== obdobi) { obdobi = o; spinave = true; } }
  function nastavDosah(m, max) { blizko = m; cap = Math.min(kapacita, max || kapacita); spinave = true; }

  // ---------- test překážky (úsečka A->B proti korunám) ----------
  // vrací t ∈ [0,1], kde úsečka poprvé vstoupí do koruny, jinak 1; stromy, v jejichž koruně začíná A, ignoruje
  function elipsoid(s, px, py, pz, dx, dy, dz, pad) {
    const rx = s.rx + pad, ry = s.ry + pad, ix = 1 / rx, iz = 1 / ry;
    const qx = (px - s.x) * ix, qy = (py - s.y) * ix, qz = (pz - s.cz) * iz, vx = dx * ix, vy = dy * ix, vz = dz * iz;
    const a = vx * vx + vy * vy + vz * vz; if (a < 1e-12) return 1;
    const c = qx * qx + qy * qy + qz * qz - 1; if (c <= 0) return 1;
    const b = qx * vx + qy * vy + qz * vz, disc = b * b - a * c; if (disc < 0) return 1;
    const t = (-b - Math.sqrt(disc)) / a;
    return t >= 0 && t <= 1 ? t : 1;
  }
  function kuzelT(s, px, py, pz, dx, dy, dz, pad) {
    const zb = s.zb - pad, zt = s.zt + pad, R = s.R + pad, k2 = (R / (zt - zb)) ** 2;
    let lo = 0, hi = 1;
    if (Math.abs(dz) < 1e-9) { if (pz < zb || pz > zt) return 1; }
    else { const t1 = (zb - pz) / dz, t2 = (zt - pz) / dz; lo = Math.max(0, Math.min(t1, t2)); hi = Math.min(1, Math.max(t1, t2)); if (lo > hi) return 1; }
    const u = zt - pz, A = dx * dx + dy * dy - k2 * dz * dz, B = 2 * (px - s.x) * dx + 2 * (py - s.y) * dy + 2 * k2 * u * dz;
    const qx = px - s.x, qy = py - s.y, C = qx * qx + qy * qy - k2 * u * u;
    const Q = (t) => (A * t + B) * t + C;
    if (Q(lo) <= 0) return lo === 0 ? 1 : lo;                    // lo = 0: začátek uvnitř, ignorovat
    if (Math.abs(A) < 1e-12) { if (B >= 0) return 1; const t = -C / B; return t > lo && t <= hi ? t : 1; }
    const disc = B * B - 4 * A * C; if (disc < 0) return 1;
    const sq = Math.sqrt(disc);
    let r1 = (-B - sq) / (2 * A), r2 = (-B + sq) / (2 * A); if (r1 > r2) { const q = r1; r1 = r2; r2 = q; }
    for (const r of [r1, r2]) if (r > lo && r <= hi && 2 * A * r + B < 0) return r;
    return 1;
  }
  function prekazka(ax_, ay_, az_, bx, by, bz) {
    const dx = bx - ax_, dy = by - ay_, dz = bz - az_, pad = odstup, m = maxR + pad;
    const x0 = Math.min(ax_, bx) - m, x1 = Math.max(ax_, bx) + m, y0 = Math.min(ay_, by) - m, y1 = Math.max(ay_, by) + m;
    const sx0 = Math.min(ax_, bx), sx1 = Math.max(ax_, bx), sy0 = Math.min(ay_, by), sy1 = Math.max(ay_, by);
    const zima = obdobi === 'winter';
    let best = 1;
    for (let gx = cell(x0); gx <= cell(x1); gx++) for (let gy = cell(y0); gy <= cell(y1); gy++) {
      const a = mrizka.get(klic(gx, gy)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const s = a[i], typ = s.typ;
        if (typ === TYP_KER || (zima && typ === TYP_LISTNAC)) continue;   // keře a holé stromy kameru nezastavují
        const R = s.R + pad;
        if (s.x + R < sx0 || s.x - R > sx1 || s.y + R < sy0 || s.y - R > sy1) continue;   // obálka stromu mimo obálku úsečky
        const t = typ === TYP_JEHLICNAN ? kuzelT(s, ax_, ay_, az_, dx, dy, dz, pad) : elipsoid(s, ax_, ay_, az_, dx, dy, dz, pad);
        if (t < best) best = t;
      }
    }
    return best;
  }

  function zrus() {
    scene.remove(skupina);
    for (const k in casti) { casti[k].mesh.dispose(); GEO[k].dispose(); }
    mat.dispose();
  }

  return {
    pridejCtverec, odeberCtverec, update, telesa, uBlizko, prekazka, nastavObdobi, nastavDosah, zrus,
    skupina,
    get pocetInstanci() { return kand.length; },       // kolik stromů je teď 3D
    get pocetStromu() { return pocetStromu; },
    get kotva() { return [ax, ay]; },
  };
}
