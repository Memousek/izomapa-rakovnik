// Navigace ve 3D jízdě: hledání cíle (adresy, zastávky, ulice), trasa po silnicích (A*), pruh trasy na silnici,
// světelný sloup v cíli, pokyny („za 120 m odboč vlevo“) a minimapa natočená po směru jízdy.
// Svět: x na východ, y na sever, z výška; three = (x, z, -y). Silnice z overlay/<čtverec>.json (overlay.py), adresy ze search.json.
const KMH = { motorway: 110, trunk: 90, primary: 50, secondary: 50, tertiary: 50, unclassified: 40, residential: 30, living_street: 20, service: 15 };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ek = (x, y) => Math.round(x) + ',' + Math.round(y);

export function vytvorNavigaci(THREE, scene, api) {
  // api = { CAM, OV, gz, hrac, chunks: [[i, j]], zastavky: () => [{ nazev, x, y }], panel: Element, mapa: HTMLCanvasElement, jedu: () => 'auto'|'pesky'|'bus' }
  //   volitelně mapaVozidla, mapaTrasa, mapaHraci: () => [{ x, y, barva }] (ostatní hráči na minimapě)
  const { CAM } = api;
  // ---------- obrázek mapy -> svět (inverze promítání z web/app.html toImg, výška z terénu) ----------
  const X = CAM.X, Y = CAM.Y;
  function zObrazu(ix, iy) {
    const u = ix * CAM.mpp + CAM.x0, v = CAM.y1 - iy * CAM.mpp, det = X[0] * -Y[2] - -X[2] * Y[0];
    let h = 0, x = 0, y = 0;
    for (let k = 0; k < 4; k++) {
      const a = u - h * X[1], b = v - h * Y[1];
      x = (a * -Y[2] - -X[2] * b) / det; y = (X[0] * b - Y[0] * a) / det;
      h = api.gz(x, y);
    }
    return [x, y];
  }
  // ---------- hledání ----------
  let INDEX = null;
  async function index() {
    if (INDEX) return INDEX;
    const out = [], seen = new Set();
    const add = (label, kind, x, y) => { const k = kind + label; if (seen.has(k)) return; seen.add(k); out.push({ label, kind, n: norm(label), x, y }); };
    for (const z of api.zastavky()) add(z.nazev, 'zastávka', z.x, z.y);
    for (const s of api.OV.streets || []) { const [x, y] = zObrazu(s.xy[0], s.xy[1]); add(s.name, 'ulice', x, y); }
    try { for (const [a, , cx, cy] of await fetch('search.json').then((r) => r.json())) { const [x, y] = zObrazu(cx, cy); add(a, 'adresa', x, y); } } catch {}
    return (INDEX = out);
  }
  function najdi(q) {
    const n = norm(q.trim()); if (!n) return [];
    const slova = n.split(/\s+/);
    return INDEX.filter((e) => slova.every((w) => e.n.includes(w)))
      .sort((a, b) => (a.n.startsWith(n) ? 0 : 1) - (b.n.startsWith(n) ? 0 : 1) || a.label.length - b.label.length).slice(0, 8);
  }
  // ---------- UI: pole „Kam?“ s návrhy ----------
  const box = document.createElement('div'); box.className = 'nav';
  box.innerHTML = '<label for="navq">Navigace</label><div class="navrow"><input id="navq" type="search" placeholder="Kam? adresa, zastávka, ulice" autocomplete="off"><button id="navx" type="button" title="Zrušit navigaci" hidden>×</button></div><ul id="navl" role="listbox" hidden></ul><div id="navp" class="navp" hidden></div>';
  api.panel.appendChild(box);
  const q = box.querySelector('#navq'), ul = box.querySelector('#navl'), pokyn = box.querySelector('#navp'), zrus = box.querySelector('#navx');
  let navrhy = [], vyber = 0;
  const ukazNavrhy = () => {
    ul.replaceChildren(...navrhy.map((e, i) => { const li = document.createElement('li'); li.role = 'option'; li.className = i === vyber ? 'sel' : ''; li.textContent = e.label; const s = document.createElement('small'); s.textContent = ' ' + e.kind; li.appendChild(s); li.addEventListener('mousedown', (ev) => { ev.preventDefault(); zvol(e); }); return li; }));
    ul.hidden = !navrhy.length;
  };
  q.addEventListener('focus', () => { index(); });
  q.addEventListener('input', async () => { await index(); navrhy = najdi(q.value); vyber = 0; ukazNavrhy(); });
  q.addEventListener('keydown', (e) => {
    e.stopPropagation();                                   // šipky a písmena neřídí auto
    if (e.key === 'ArrowDown') { vyber = Math.min(navrhy.length - 1, vyber + 1); ukazNavrhy(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { vyber = Math.max(0, vyber - 1); ukazNavrhy(); e.preventDefault(); }
    else if (e.key === 'Enter' && navrhy[vyber]) zvol(navrhy[vyber]);
    else if (e.key === 'Escape') { q.blur(); ul.hidden = true; }
  });
  q.addEventListener('keyup', (e) => e.stopPropagation());
  q.addEventListener('blur', () => setTimeout(() => { ul.hidden = true; }, 150));
  zrus.addEventListener('click', () => konec());

  // ---------- silniční síť celé mapy (pro trasu i minimapu) ----------
  let SIT = null, sitLoad = null, UZF = null;            // UZF: je kus uzavřený? (jizda_uzavirky.js)
  function sit() {
    if (sitLoad) return sitLoad;
    sitLoad = Promise.all(api.chunks.map(([i, j]) => fetch(`overlay/c${i}_${j}.json`).then((r) => r.json()).then((d) => d.roads).catch(() => []))).then((all) => {
      const R = [], nodes = new Map(), pos = [];
      const node = (p) => {                                // konec kusu; konce do 6 m od sebe jsou jeden uzel (jako graf aut)
        const X0 = Math.round(p[0]), Y0 = Math.round(p[1]);
        for (let dx = -6; dx <= 6; dx += 2) for (let dy = -6; dy <= 6; dy += 2) { const n = nodes.get((X0 + dx) + ',' + (Y0 + dy)); if (n !== undefined && Math.hypot(pos[n][0] - p[0], pos[n][1] - p[1]) < 6.5) return n; }
        const id = pos.length; pos.push([p[0], p[1]]); nodes.set(ek(p[0], p[1]), id); return id;
      };
      const seen = new Set();
      for (const roads of all) for (const r of roads) {
        if (r.w.length < 2) continue;
        const key = r.w.map((p) => ek(p[0], p[1])).join('|'); if (seen.has(key)) continue; seen.add(key);   // kus na švu je v obou čtvercích
        const len = [0]; for (let i = 1; i < r.w.length; i++) len.push(len[i - 1] + Math.hypot(r.w[i][0] - r.w[i - 1][0], r.w[i][1] - r.w[i - 1][1]));
        const L = len[len.length - 1]; if (L < 0.5) continue;
        R.push({ w: r.w, len, L, c: r.c, o: r.o || 0, a: node(r.w[0]), b: node(r.w[r.w.length - 1]) });
      }
      const adj = pos.map(() => []);
      R.forEach((r, k) => { adj[r.a].push(k); adj[r.b].push(k); });
      const grid = new Map(), G = 100;                     // kusy po buňkách 100 m (minimapa, nejbližší silnice)
      R.forEach((r, k) => { const cells = new Set(r.w.map((p) => Math.floor(p[0] / G) + ',' + Math.floor(p[1] / G))); for (const c of cells) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push(k); } });
      if (UZF) for (const r of R) r.uz = !!UZF(r.w);
      SIT = { R, pos, adj, grid, G };
      return SIT;
    });
    return sitLoad;
  }
  setTimeout(sit, 2500);                                     // síť načíst na pozadí, minimapa ji hned použije
  function kusyKolem(x, y, r) {
    const out = new Set(), G = SIT.G;
    for (let i = Math.floor((x - r) / G); i <= Math.floor((x + r) / G); i++) for (let j = Math.floor((y - r) / G); j <= Math.floor((y + r) / G); j++) for (const k of SIT.grid.get(i + ',' + j) || []) out.add(k);
    return out;
  }
  function nejblizsi(x, y, auto) {                         // nejbližší místo na silnici: {k, s, d, p}
    let best = null;
    for (const rad of [80, 250, 800]) {
      for (const k of kusyKolem(x, y, rad)) {
        const r = SIT.R[k]; if (auto && r.c === 'service' && rad < 800) continue;
        for (let i = 1; i < r.w.length; i++) {
          const a = r.w[i - 1], b = r.w[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
          const px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(px - x, py - y);
          if (!best || d < best.d) best = { k, s: r.len[i - 1] + (r.len[i] - r.len[i - 1]) * t, d, p: [px, py, a[2] + (b[2] - a[2]) * t] };
        }
      }
      if (best) return best;
    }
    return best;
  }
  const cesta = (r, s0, s1) => {                           // body kusu mezi staničeními s0 -> s1 (i pozpátku)
    const out = [], at = (s) => { let i = 1; while (i < r.len.length - 1 && r.len[i] < s) i++; const t = Math.max(0, Math.min(1, (s - r.len[i - 1]) / ((r.len[i] - r.len[i - 1]) || 1))), a = r.w[i - 1], b = r.w[i]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
    out.push(at(s0));
    if (s1 >= s0) { for (let i = 0; i < r.w.length; i++) if (r.len[i] > s0 && r.len[i] < s1) out.push(r.w[i]); }
    else { for (let i = r.w.length - 1; i >= 0; i--) if (r.len[i] < s0 && r.len[i] > s1) out.push(r.w[i]); }
    out.push(at(s1));
    return out;
  };
  // A*: cena = čas jízdy (auto po hlavních silnicích radši, jednosměrky jen po směru), pěšky = vzdálenost bez jednosměrek
  function trasa(x0, y0, x1, y1, auto) {
    const A = nejblizsi(x0, y0, auto), B = nejblizsi(x1, y1, auto);
    if (!A || !B) return null;
    const { R, pos, adj } = SIT, v = (r) => (auto ? (KMH[r.c] || 30) / 3.6 : 1.4);
    const smi = (r, dir) => !auto || !r.o || r.o === dir;    // dir 1 = od a k b
    if (A.k === B.k && smi(R[A.k], B.s >= A.s ? 1 : -1)) return cesta(R[A.k], A.s, B.s);
    const g = new Map(), from = new Map(), open = [];      // binární halda [f, uzel]
    const push = (f, n) => { open.push([f, n]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    const vmax = auto ? 25 : 1.4, hh = (n) => Math.hypot(pos[n][0] - B.p[0], pos[n][1] - B.p[1]) / vmax;
    const ra = R[A.k];                                       // start: z místa na kusu k oběma koncům (podle jednosměrky)
    if (smi(ra, 1)) { const c = (ra.L - A.s) / v(ra); g.set(ra.b, c); from.set(ra.b, [-1, A.k, A.s, ra.L]); push(c + hh(ra.b), ra.b); }
    if (smi(ra, -1)) { const c = A.s / v(ra); if (!g.has(ra.a) || c < g.get(ra.a)) { g.set(ra.a, c); from.set(ra.a, [-1, A.k, A.s, 0]); push(c + hh(ra.a), ra.a); } }
    const rb = R[B.k], cil = new Set([rb.a, rb.b]);
    let konec = null, kc = Infinity, kroku = 0;
    while (open.length && kroku++ < 200000) {
      const [f, n] = pop();
      if (f - hh(n) > (g.get(n) ?? Infinity) + 1e-6) continue;
      if (f >= kc) break;
      if (cil.has(n)) {                                      // dojet po cílovém kusu k místu cíle
        const dir = n === rb.a ? 1 : -1;
        if (smi(rb, dir)) { const c = g.get(n) + Math.abs(B.s - (n === rb.a ? 0 : rb.L)) / v(rb); if (c < kc) { kc = c; konec = n; } }
      }
      for (const k of adj[n]) {
        const r = R[k], dir = r.a === n ? 1 : -1, m = dir > 0 ? r.b : r.a;
        if (!smi(r, dir) || (auto && r.c === 'service' && k !== B.k) || (auto && r.uz && k !== B.k)) continue;   // uzavírku objet
        const c = g.get(n) + r.L / v(r) + (auto ? 2 : 0);   // malá přirážka za křižovatku: radši rovně
        if (c < (g.get(m) ?? Infinity)) { g.set(m, c); from.set(m, [n, k, dir > 0 ? 0 : r.L, dir > 0 ? r.L : 0]); push(c + hh(m), m); }
      }
    }
    if (konec === null) return null;
    const kusy = [cesta(rb, konec === rb.a ? 0 : rb.L, B.s)];
    for (let n = konec; ;) { const [p, k, s0, s1] = from.get(n); kusy.push(cesta(R[k], s0, s1)); if (p < 0) break; n = p; }
    const body = [];
    for (const part of kusy.reverse()) for (const p of part) { const l = body[body.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.5) body.push(p); }
    return body;
  }

  // ---------- trasa ve 3D: pruh nad silnicí a světelný sloup v cíli ----------
  const pruhMat = new THREE.MeshBasicMaterial({ color: 0x29c8ff, transparent: true, opacity: 0.7, depthWrite: false });
  const sloupMat = new THREE.MeshBasicMaterial({ color: 0x29c8ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  let pruh = null; const sloup = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true), sloupMat); sloup.visible = false; scene.add(sloup);
  function postavPruh(body) {
    if (pruh) { scene.remove(pruh); pruh.geometry.dispose(); pruh = null; }
    const p = [], W = 1.1;
    for (let i = 1; i < body.length; i++) {
      const a = body[i - 1], b = body[i], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * W, ny = dx / l * W;
      const za = Math.max(a[2], api.gz(a[0], a[1])) + 0.3, zb = Math.max(b[2], api.gz(b[0], b[1])) + 0.3;
      const A1 = [a[0] + nx, za, -(a[1] + ny)], A2 = [a[0] - nx, za, -(a[1] - ny)], B1 = [b[0] + nx, zb, -(b[1] + ny)], B2 = [b[0] - nx, zb, -(b[1] - ny)];
      p.push(...A1, ...A2, ...B2, ...A1, ...B2, ...B1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    pruh = new THREE.Mesh(g, pruhMat); pruh.frustumCulled = false; pruh.renderOrder = 2; scene.add(pruh);
  }

  // ---------- stav navigace a pokyny ----------
  const N = { cil: null, body: null, delky: null, prepocet: 0, hotovo: 0 };
  async function zvol(e) {
    q.value = e.label; ul.hidden = true; q.blur();
    N.cil = e; pokyn.hidden = false; pokyn.textContent = 'Hledám trasu…'; zrus.hidden = false;
    sloup.position.set(e.x, api.gz(e.x, e.y) + 30, -e.y); sloup.visible = true;
    await sit(); prepocitej();
  }
  function konec() { N.cil = null; N.body = null; if (pruh) { scene.remove(pruh); pruh.geometry.dispose(); pruh = null; } sloup.visible = false; pokyn.hidden = true; zrus.hidden = true; q.value = ''; }
  function prepocitej() {
    if (!N.cil || !SIT) return;
    const h = api.hrac, auto = api.jedu() === 'auto', [x, y] = auto && h.car ? [h.car.x, h.car.y] : [h.x, h.y];
    const body = trasa(x, y, N.cil.x, N.cil.y, auto);
    N.prepocet = performance.now();
    if (!body) { pokyn.textContent = 'Trasu se nepodařilo najít.'; return; }
    body.push([N.cil.x, N.cil.y, api.gz(N.cil.x, N.cil.y)]);
    N.body = body; N.delky = [0]; for (let i = 1; i < body.length; i++) N.delky.push(N.delky[i - 1] + Math.hypot(body[i][0] - body[i - 1][0], body[i][1] - body[i - 1][1]));
    postavPruh(body);
  }
  const fmt = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m');
  function pokyny(x, y) {                                    // kde na trase jsem, kolik zbývá a nejbližší odbočka
    const B = N.body, L = N.delky; let bi = 0, bd = Infinity, bs = 0;
    for (let i = 1; i < B.length; i++) {
      const a = B[i - 1], b = B[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y); if (d < bd) { bd = d; bi = i; bs = L[i - 1] + (L[i] - L[i - 1]) * t; }
    }
    const zbyva = L[L.length - 1] - bs;
    const smer = (s, d) => { const at = (u) => { let i = 1; while (i < L.length - 1 && L[i] < u) i++; const t = Math.max(0, Math.min(1, (u - L[i - 1]) / ((L[i] - L[i - 1]) || 1))); return [B[i - 1][0] + (B[i][0] - B[i - 1][0]) * t, B[i - 1][1] + (B[i][1] - B[i - 1][1]) * t]; }; const p = at(s), q2 = at(s + d); return Math.atan2(q2[1] - p[1], q2[0] - p[0]); };
    let odb = null;
    for (let s = bs + 8; s < L[L.length - 1] - 8; s += 4) {
      const a1 = smer(s - 12, 10), a2 = smer(s + 2, 10), d = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
      if (Math.abs(d) > 0.6) { odb = { s, vlevo: d > 0, ostre: Math.abs(d) > 2.2 }; break; }
    }
    return { bd, zbyva, odb: odb && { ...odb, za: odb.s - bs } };
  }
  // ---------- minimapa ----------
  const ctx = api.mapa.getContext('2d');
  let mapaT = 0;
  function minimapa(x, y, h) {
    const W = api.mapa.width, S = W / 2 / 260;              // poloměr 260 m
    ctx.clearRect(0, 0, W, W);
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 1, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(27,35,51,.85)'; ctx.fill(); ctx.clip();
    ctx.translate(W / 2, W / 2); ctx.rotate(h - Math.PI / 2); // směr jízdy nahoru
    const P = (p) => [(p[0] - x) * S, -(p[1] - y) * S];
    if (SIT) for (const k of kusyKolem(x, y, 270)) {
      const r = SIT.R[k], big = r.c === 'primary' || r.c === 'secondary' || r.c === 'trunk';
      ctx.strokeStyle = r.uz ? '#e5484d' : big ? '#e9d79a' : r.c === 'service' ? '#55617a' : '#c9d1dd'; ctx.lineWidth = big ? 4 : r.c === 'service' ? 1.5 : 2.5;
      ctx.beginPath(); r.w.forEach((p, i) => { const [u, v] = P(p); if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); }); ctx.stroke();
    }
    if (N.body) { ctx.strokeStyle = '#29c8ff'; ctx.lineWidth = 4; ctx.beginPath(); N.body.forEach((p, i) => { const [u, v] = P(p); if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); }); ctx.stroke(); }
    if (N.cil) { const [u, v] = P([N.cil.x, N.cil.y]); ctx.fillStyle = '#29c8ff'; ctx.beginPath(); ctx.arc(u, v, 6, 0, 2 * Math.PI); ctx.fill(); }
    const tr = api.mapaTrasa && api.mapaTrasa();          // trasa sledovaného spoje (čárkovaně)
    if (tr) { ctx.strokeStyle = tr.barva; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); tr.body.forEach((p, i) => { const [u, v] = P(p); if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); }); ctx.stroke(); ctx.setLineDash([]); }
    for (const v of api.mapaVozidla ? api.mapaVozidla() : []) {   // autobusy (modře) a vlaky (zeleně), sledovaný v rámečku
      const [u, w] = P([v.x, v.y]);
      if (u * u + w * w > W * W / 4) continue;
      ctx.fillStyle = v.typ === 2 ? '#3fbf6f' : '#2f8cff'; ctx.strokeStyle = '#0d1220'; ctx.lineWidth = 1.5;
      ctx.fillRect(u - 4, w - 4, 8, 8); ctx.strokeRect(u - 4, w - 4, 8, 8);
      if (v.sel) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.strokeRect(u - 7, w - 7, 14, 14); }
    }
    for (const o of api.mapaHraci ? api.mapaHraci() : []) {   // ostatní hráči: kolečko v jejich barvě
      const [u, w] = P([o.x, o.y]);
      if (u * u + w * w > W * W / 4) continue;
      ctx.fillStyle = o.barva; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(u, w, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#e2643f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W / 2, W / 2 - 9); ctx.lineTo(W / 2 + 6, W / 2 + 7); ctx.lineTo(W / 2, W / 2 + 3); ctx.lineTo(W / 2 - 6, W / 2 + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    const th = h - Math.PI / 2, R = W / 2 - 11;               // sever (S) na okraji: světový sever otočený stejně jako mapa
    ctx.fillStyle = '#eef1f5'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('S', W / 2 + R * Math.sin(th), W / 2 - R * Math.cos(th));
  }


  // ---------- velká mapa (klávesa M ve jizda.html): celé území, sever nahoře, posun a přiblížení, zajímavá místa ----------
  // V: { cx, cy, m } střed a metry na pixel; body: [{ x, y, label, druh, barva, tvar, min }] (min = od jakého přiblížení se kreslí)
  function velkaMapa(cv, V, body, hrac) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, S = 1 / V.m, dpr = cv.dataset.dpr ? +cv.dataset.dpr : 1;
    g.fillStyle = '#1b2333'; g.fillRect(0, 0, W, H);
    const P = (p) => [W / 2 + (p[0] - V.cx) * S, H / 2 - (p[1] - V.cy) * S];
    const R = Math.hypot(W, H) / 2 * V.m + 30;
    if (SIT) {
      const kusy = [...kusyKolem(V.cx, V.cy, R)].map((k) => SIT.R[k]);
      const sirka = (r) => (r.c === 'primary' || r.c === 'trunk' || r.c === 'motorway' ? 9 : r.c === 'secondary' ? 7.5 : r.c === 'tertiary' ? 6 : r.c === 'service' ? 3 : 5);
      for (const vrstva of [0, 1]) for (const r of kusy) {           // obrys, pak výplň (silnice čitelné jako na plánku)
        if (r.c === 'service' && V.m > 2.5) continue;
        const big = r.c === 'primary' || r.c === 'secondary' || r.c === 'trunk' || r.c === 'motorway';
        const w = Math.max(big ? 2.2 : 1.2, sirka(r) * S) * dpr;
        g.strokeStyle = vrstva ? (r.uz ? '#e5484d' : big ? '#e9d79a' : r.c === 'service' ? '#6a7690' : '#c9d1dd') : '#0d1220';
        g.lineWidth = vrstva ? w : w + 2 * dpr; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); r.w.forEach((p, i) => { const [u, v] = P(p); if (i) g.lineTo(u, v); else g.moveTo(u, v); }); g.stroke();
      }
    }
    if (N.body) { g.strokeStyle = '#29c8ff'; g.lineWidth = 5 * dpr; g.lineCap = 'round'; g.beginPath(); N.body.forEach((p, i) => { const [u, v] = P(p); if (i) g.lineTo(u, v); else g.moveTo(u, v); }); g.stroke(); }
    const popisky = [];
    for (const b of body) {
      if (b.min && V.m > b.min) continue;
      const [u, v] = P([b.x, b.y]); if (u < -20 || v < -20 || u > W + 20 || v > H + 20) continue;
      const r = (b.velikost || 6) * dpr;
      g.fillStyle = b.barva; g.strokeStyle = '#0d1220'; g.lineWidth = 2 * dpr;
      g.beginPath();
      if (b.tvar === 'ctverec') g.rect(u - r * 0.8, v - r * 0.8, r * 1.6, r * 1.6);
      else if (b.tvar === 'kosoctverec') { g.moveTo(u, v - r); g.lineTo(u + r, v); g.lineTo(u, v + r); g.lineTo(u - r, v); g.closePath(); }
      else g.arc(u, v, r, 0, 6.283);
      g.fill(); g.stroke();
      if (b.label && (!b.popisekMin || V.m <= b.popisekMin)) popisky.push([u, v + r + 3 * dpr, b.label, b.vyrazny]);
    }
    if (N.cil) { const [u, v] = P([N.cil.x, N.cil.y]); g.fillStyle = '#29c8ff'; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(u, v, 8 * dpr, 0, 6.283); g.fill(); g.stroke(); }
    // popisky: bez překryvu (od nejvýraznějších)
    g.font = `600 ${12 * dpr}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
    const zabrano = [];
    for (const [u, v, t, vyr] of popisky.sort((a, b) => (b[3] ? 1 : 0) - (a[3] ? 1 : 0))) {
      const w = g.measureText(t).width + 8 * dpr, h = 16 * dpr, bx = [u - w / 2, v, u + w / 2, v + h];
      if (zabrano.some((z) => !(bx[2] < z[0] || bx[0] > z[2] || bx[3] < z[1] || bx[1] > z[3]))) continue;
      zabrano.push(bx);
      g.fillStyle = 'rgba(13, 18, 32, .82)'; g.fillRect(bx[0], bx[1], w, h);
      g.fillStyle = vyr ? '#f2c66d' : '#eef1e6'; g.fillText(t, u, v + 2 * dpr);
    }
    if (hrac) {                                             // hráč: šipka ve směru pohledu / jízdy
      const [u, v] = P([hrac.x, hrac.y]), a = -hrac.h, k = 11 * dpr;
      g.save(); g.translate(u, v); g.rotate(a);
      g.fillStyle = '#e2643f'; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(k, 0); g.lineTo(-k * 0.7, k * 0.6); g.lineTo(-k * 0.35, 0); g.lineTo(-k * 0.7, -k * 0.6); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }
  return {
    update(now) {
      const h = api.hrac, mode = api.jedu(), car = mode === 'auto' && h.car, x = car ? h.car.x : h.x, y = car ? h.car.y : h.y, head = car ? h.car.h : mode === 'bus' && h.busH !== undefined ? h.busH : h.yaw;
      if (now - mapaT > 100) { mapaT = now; minimapa(x, y, head); }
      if (!N.cil || !N.body) { N.odb = null; return; }
      const p = pokyny(x, y), dc = Math.hypot(N.cil.x - x, N.cil.y - y);
      N.odb = p.odb || null;                                 // další odbočka (blinkr hráče v jizda.html)
      if (dc < 25 || p.zbyva < 20) { pokyn.textContent = `Jsi v cíli: ${N.cil.label}`; if (!N.hotovo) N.hotovo = now; if (now - N.hotovo > 6000) { konec(); N.hotovo = 0; } return; }
      N.hotovo = 0;
      if (p.bd > 35 && now - N.prepocet > 2500) { prepocitej(); return; }   // sjel z trasy: nová trasa
      const o = p.odb && p.odb.za < 600 ? `za ${fmt(p.odb.za)} ${p.odb.ostre ? 'otoč se' : 'odboč ' + (p.odb.vlevo ? 'vlevo' : 'vpravo')}` : 'pokračuj rovně';
      pokyn.textContent = `${N.cil.label} · ${fmt(p.zbyva)} · ${o}`;
    },
    get aktivni() { return !!N.cil; },
    konec,
    trasa: (x0, y0, x1, y1, auto) => (SIT ? trasa(x0, y0, x1, y1, auto) : null),
    nactiSit: sit,
    velkaMapa, zObrazu,
    get cesta() { return N.body ? { body: N.body, delky: N.delky } : null; },   // body trasy pro FSD
    get hledam() { return !!N.cil && !N.body; },
    uzavirky(fn) { UZF = fn; if (SIT) for (const r of SIT.R) r.uz = !!fn(r.w); },
    get sit() { return SIT; },
    hledej: async (t) => { await index(); return najdi(t); },
    adresy: async () => { await index(); return INDEX; },   // všechna místa pro hledání (adresy, zastávky, ulice) – mise ve hře
    zvol,
    stav: () => ({ odb: N.odb || null, cil: N.cil && N.cil.label, bodu: N.body ? N.body.length : 0, delka: N.delky ? Math.round(N.delky[N.delky.length - 1]) : 0, text: pokyn.textContent }),
  };
}
