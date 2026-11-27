// Doprava 3D jízdy: silnice ze čtverců (overlay/<čtverec>.json), semafory, přednost, kruhové objezdy, přejezdy
// a auta, která po nich jezdí. Stejná pravidla jako mapa (web/app.html). Nic nekreslí, takže jde pustit i bez
// prohlížeče (tests/test-doprava.mjs) a později ji může simulovat jen jeden hráč a ostatním posílat stav.
// Svět: x na východ, y na sever (m). Silnice i auta mají stabilní uid (`<čtverec>:<pořadí>`), které nezávisí na tom,
// v jakém pořadí se čtverce načetly; vlastnosti a rozhodování auta určuje jeho semínko (c.sd), ne Math.random.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// semínko z textu (FNV-1a) a generátor mulberry32 se stavem v objektu (o.sd): stav je jedno číslo, jde poslat po síti
export function semeno(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// povaha řidiče (násobek limitu) z rovnoměrného u: asi 8 % šneků (60–80 %), většina kolem limitu (90–112 %),
// asi 12 % spěchá (120–145 %, v padesátce 60–72 km/h); stejné rozdělení jako mapa (web/js/70-animace.js)
export function povaha(u) {
  if (u < 0.08) return 0.6 + u / 0.08 * 0.2;
  if (u < 0.88) return 0.9 + (u - 0.08) / 0.8 * 0.22;
  return 1.2 + (u - 0.88) / 0.12 * 0.25;
}
export function nah(o) {
  if (typeof o.sd !== 'number') o.sd = (Math.random() * 4294967296) >>> 0;   // auto bez semínka (např. nehoda v pouličním režimu)
  let t = (o.sd = (o.sd + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// api: HALF (polovina čtverce, m), hrac() (poloha hráče), doba() (0 den … 1 noc), hustota() (podíl aut podle hodiny),
// ted() (ms, cyklus semaforů; výchozí Date.now), nacti(key) (JSON silnic čtverce, výchozí fetch overlay/<key>.json),
// silnice(i0) (nové silnice od indexu i0 jsou v roads, ještě bez aut), hotovo(i0) (auta čtverce jsou v cars)
export function vytvorDopravu(api) {
  api = { ted: () => Date.now(), nacti: (key) => fetch(`overlay/${key}.json`).then((r) => r.json()).catch(() => null),
    silnice: () => {}, hotovo: () => {}, hustota: () => 1, mnozstvi: () => 1, doba: () => 0, ...api };
  const HALF = api.HALF;
  const silniceId = new Map();                              // uid silnice -> index v roads
  const roads = [], ends = new Map(), cars = [], LOADED = [];
  const ULICE_STAV = { on: false };                           // pouliční režim (jizda/ulice.js): drzí řidiči, policie místo pokut
  const ek = (p) => Math.round(p[0]) + ',' + Math.round(p[1]);
  function along(r, s) {
    const L = r.len; let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const t = clamp((s - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1), a = r.w[i - 1], b = r.w[i];
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, dx: b[0] - a[0], dy: b[1] - a[1] };
  }
  const SIG = [], sigPosts = [], SIG_T = 70;
  // OSM má semafor jedné křižovatky často na víc uzlech (nájezd i střed): stejný směr do 12 m = jedna stop čára a jeden sloup
  // (jako nastroje/semafory.py sloucit; tady i pro data postavená dřív). Zůstane ta, ke které auto dojede dřív.
  function slucSig(a) {
    const res = [];
    for (const z of [...a].sort((p, q) => p[0] - q[0])) {
      const i = res.findIndex((q) => (q[4] || 0) === (z[4] || 0) && Math.abs(q[0] - z[0]) < 12);
      if (i < 0) res.push(z); else if (z[4] === -1) res[i] = z;
    }
    return res;
  }
  function addSig(r, z) {
    let g = z[5] !== undefined ? SIG.find((q) => q.id === z[5]) : SIG.find((q) => Math.hypot(q.x - z[1], q.y - z[2]) < 45);
    if (!g) { g = { id: z[5], x: z[1], y: z[2], k: z[3], ax: null, off: Math.abs(Math.round(z[1]) * 7 + Math.round(z[2]) * 13) % SIG_T }; SIG.push(g); }
    if (z[3] === 'k') g.k = 'k';
    const o = along(r, z[0]), a = Math.atan2(o.dy, o.dx);
    if (g.ax === null) g.ax = a;
    let d = Math.abs(((a - g.ax) % Math.PI + Math.PI) % Math.PI); d = Math.min(d, Math.PI - d);
    const ph = d < Math.PI / 4 ? 0 : 1; if (ph) g.cross = true;
    return (z[4] ? [z[4]] : [1, -1]).map((dir) => { const q = [z[0]]; q.sg = g; q.ph = ph; q.d = dir; sigPosts.push([r, q]); return q; });
  }
  function sigState(z) {                                     // stejný cyklus a posun jako mapa: semafor svítí v obou stejně
    if (api.doba() > 0.92) return 'n';                           // hluboká noc: přerušovaná žlutá (auta jedou), jako v mapě
    const t = ((api.ted() / 1000 + z.sg.off) % SIG_T + SIG_T) % SIG_T;
    if (z.sg.k === 'p' || !z.sg.cross) return t < 45 ? 'g' : t < 48 ? 'y' : 'r';
    const u = z.ph ? (t + 35) % SIG_T : t;
    return u < 30 ? 'g' : u < 33 ? 'y' : 'r';
  }
  function yieldZ(r, y) {
    const e = y[0] < 1 ? r.w[0] : r.w[r.w.length - 1], z = [y[0]];
    z.rb = { k: y[1].toFixed(0) + ',' + y[2].toFixed(0), cx: y[1], cy: y[2], R: y[3], an: Math.atan2(e[1] - y[2], e[0] - y[1]) };
    return z;
  }
  function ringFree(g) {
    for (const c of cars) {
      if (roads[c.r].rbk !== g.k) continue;
      const o = along(roads[c.r], c.s), rx = o.x - g.cx, ry = o.y - g.cy, turn = Math.sign((rx * o.dy - ry * o.dx) * c.dir) || 1;
      let d = ((g.an - Math.atan2(ry, rx)) * turn) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI;
      if (d * g.R < 25 || (2 * Math.PI - d) * g.R < 5) return false;
    }
    return true;
  }
  const RANK = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, living_street: 0 };
  const rank = (r) => RANK[r.c] ?? 1;
  function addYields() {
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i]; if (r.c === 'service' || r.rbk) continue;
      r.jy = r.jy.filter((z) => !z.yj);
      for (const [end, dir] of [[r.w[r.w.length - 1], 1], [r.w[0], -1]]) {
        if (r.o && r.o !== dir) continue;
        const others = (ends.get(ek(end)) || []).filter(([j]) => j !== i && roads[j].c !== 'service');
        if (others.length < 2) continue;
        const major = others.filter(([j]) => rank(roads[j]) > rank(r)).map(([j]) => j), s = dir > 0 ? r.L : 0;
        if (!major.length || r.jy.some((z) => (z.sg || z.rb) && Math.abs(z[0] - s) < 25)) continue;
        const z = [s]; z.d = dir; z.yj = { x: end[0], y: end[1], roads: new Set(major) };
        r.jy.push(z);
      }
    }
  }
  function yieldFree(z) {
    const g = z.yj;
    for (const c of cars) {
      if (!g.roads.has(c.r)) continue;
      const r = roads[c.r], e = r.w[r.w.length - 1], toEnd = Math.hypot(e[0] - g.x, e[1] - g.y) < 8 ? 1 : -1, dist = toEnd > 0 ? r.L - c.s : c.s;
      if (c.dir === toEnd ? dist < 30 : dist < 6) return false;
    }
    const hrac = api.hrac();
    if (hrac.vAuto && Math.hypot(hrac.x - g.x, hrac.y - g.y) < 22 && Math.abs(hrac.car.v) > 1) return false;   // hráč v autě na hlavní
    return true;
  }
  // železniční přejezdy (prep.py j: [metry od začátku kusu, x, y]): zavřeno ~40 s před příjezdem vlaku, dokud neprojede poslední vůz;
  // body do 30 m od sebe (silnice přes víc kolejí, šev čtverců) jsou jeden přejezd a zavírají se najednou
  const XC = new Map(), xc3 = [];
  function addXing(r, z) {
    let c = null;
    for (const q of XC.values()) if (q.pts.some(([x, y]) => Math.hypot(x - z[1], y - z[2]) < 30)) { c = q; break; }
    if (!c) { c = { x: z[1], y: z[2], pts: [], closed: false }; XC.set(XC.size, c); }
    if (!c.pts.some(([x, y]) => Math.hypot(x - z[1], y - z[2]) < 1)) c.pts.push([z[1], z[2]]);
    const q = [z[0]]; q.xc = c; xc3.push([r, q]); return q;
  }
  const blocked = (z) => z.xc ? z.xc.closed : z.sg ? ['r', 'y'].includes(sigState(z)) : z.yj ? !yieldFree(z) : z.rb ? !ringFree(z.rb) : false;
  const MINOR = new Set(['residential', 'living_street', 'unclassified', 'tertiary']);
  const VTYP = {
    car: { len: 4.2, wid: 1.76, h: 1.45, vmax: 130, gap: 8 }, van: { len: 5.4, wid: 2.0, h: 2.3, vmax: 110, gap: 9 },
    truck: { len: 9, wid: 2.45, h: 3.3, vmax: 80, gap: 13 }, semi: { len: 6.1, wid: 2.5, h: 3.2, vmax: 80, gap: 25 },
    garbage: { len: 9.2, wid: 2.5, h: 3.2, vmax: 35, gap: 13 }, tractor: { len: 4.3, wid: 2.3, h: 2.8, vmax: 30, gap: 8 },
    moto: { len: 2.1, wid: 0.8, h: 1.75, vmax: 110, gap: 5 },
  };
  const TRAILER = 13.6, TAH = 3.05 - 1.0 + 6.8;
  const CARC = ['#ecebe6', '#b3b8bf', '#2a2c31', '#b8291f', '#33529e', '#62666d', '#3d6b4c', '#cdbd99'];
  const VANC = ['#ecebe6', '#ecebe6', '#ecebe6', '#b3b8bf', '#2f3f6e', '#c23b2a'];
  const TRUCKC = ['#c42a20', '#eceeed', '#2f4f86', '#eceeed', '#d6a13a'];
  const MOTOC = ['#b8201a', '#1d1e22', '#1f4fa0', '#e8701a', '#3d9a2a', '#e8e8e4', '#e2b41c', '#62666d'];
  const CLASS_KMH = { motorway: 110, trunk: 90, primary: 50, secondary: 50, tertiary: 50, unclassified: 40, residential: 30, living_street: 20 };
  const roadSpeed = (r) => (r.x ? Math.min(r.l || 50, 50) : r.l || CLASS_KMH[r.c] || 40) / 3.6;
  const carSpeed = (c, r) => Math.min((c.truck ? Math.min(roadSpeed(r), 22) * 0.85 : roadSpeed(r)) * c.f, c.T.vmax / 3.6) * (ULICE_STAV.on ? (c.drzy ? 1.35 : 1.15) : 1);
  const edgeIn = [];
  const atEdge = (p) => [[24, 0], [-24, 0], [0, 24], [0, -24]].some(([dx, dy]) => !LOADED.some((g) => Math.abs(p[0] + dx - g[0]) <= HALF && Math.abs(p[1] + dy - g[1]) <= HALF));
  function findEdges(i0) {
    for (let i = i0; i < roads.length; i++) {
      const r = roads[i]; if (r.c === 'service' || r.c === 'residential' || r.c === 'living_street') continue;
      for (const [end, dir] of [[r.w[0], 1], [r.w[r.w.length - 1], -1]]) {
        if ((ends.get(ek(end)) || []).length > 1 || !atEdge(end) || (r.o && r.o !== dir)) continue;
        edgeIn.push([i, dir]);
      }
    }
  }
  function enterFromEdge(c) {
    const ok = edgeIn.filter(([i]) => (!c.truck || roads[i].t) && !roads[i].uz);
    if (!ok.length) return false;
    let x = nah(c) * ok.reduce((a, [i]) => a + (roads[i].v || 300), 0);
    for (const [i, dir] of ok) { x -= roads[i].v || 300; if (x <= 0) { c.r = i; c.dir = dir; c.s = dir > 0 ? 0 : roads[i].L; c.pr = -1; return true; } }
    return false;
  }
  function pickExit(all, c) {
    const big = c.truck ? all.filter(([i]) => roads[i].t) : c.t === 'garbage' || c.t === 'tractor' ? all.filter(([i]) => MINOR.has(roads[i].c)) : all, opts = big.length ? big : all;
    const r0 = roads[c.r], e0 = along(r0, c.dir > 0 ? r0.L : 0), hx = e0.dx * c.dir, hy = e0.dy * c.dir, hl = Math.hypot(hx, hy) || 1;
    const w = opts.map(([i, dir]) => {
      const r = roads[i], o = along(r, dir > 0 ? 0 : r.L), ox = o.dx * dir, oy = o.dy * dir, cos = (hx * ox + hy * oy) / (hl * (Math.hypot(ox, oy) || 1));
      const far = dir > 0 ? r.w[r.w.length - 1] : r.w[0], dead = (ends.get(ek(far)) || []).length <= 1 && !atEdge(far);
      return (r.v || 300) * (cos > 0.7 ? 1 : cos > -0.3 ? 0.45 : 0.04) * (dead ? 0.15 : 1);
    });
    let x = nah(c) * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < opts.length; k++) { x -= w[k]; if (x <= 0) return opts[k]; }
    return opts[opts.length - 1];
  }
  async function nactiDopravu(key) {
    const d = await api.nacti(key);
    if (!d) return;
    const i0 = roads.length;
    d.roads.forEach((r, ri) => {
      const len = [0]; for (let i = 1; i < r.w.length; i++) len.push(len[i - 1] + Math.hypot(r.w[i][0] - r.w[i - 1][0], r.w[i][1] - r.w[i - 1][1]));
      if (len[len.length - 1] <= 1) return;
      const rr = { ...r, k: key, uid: key + ':' + ri, len, L: len[len.length - 1] };   // uid: pořadí v souboru čtverce, ne v roads
      silniceId.set(rr.uid, roads.length); roads.push(rr);
      rr.jy = [...(r.y || []).map((y) => yieldZ(rr, y)), ...slucSig(r.sg || []).flatMap((z) => addSig(rr, z)), ...(r.j || []).map((z) => addXing(rr, z))];
      if (r.rb) rr.rbk = r.rb[0].toFixed(0) + ',' + r.rb[1].toFixed(0);
    });
    for (let i = i0; i < roads.length; i++) { const r = roads[i]; for (const [end, dir] of [[r.w[0], 1], [r.w[r.w.length - 1], -1]]) { const q = ek(end); if (!ends.has(q)) ends.set(q, []); ends.get(q).push([i, dir]); } }
    for (let i = i0; i < roads.length; i++) for (const end of [roads[i].w[0], roads[i].w[roads[i].w.length - 1]]) {
      const q = ek(end); if (ends.get(q).length > 1) continue;
      let best = null, bd = 36; const X = Math.round(end[0]), Y = Math.round(end[1]);
      for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) { const dd = dx * dx + dy * dy, l2 = (dx || dy) && dd < bd && ends.get((X + dx) + ',' + (Y + dy)); if (l2) { bd = dd; best = l2; } }
      if (best) { const mine = ends.get(q).slice(); ends.get(q).push(...best.filter((e) => e[0] !== i)); best.push(...mine); }
    }
    for (let k = edgeIn.length - 1; k >= 0; k--) { const [i, dir] = edgeIn[k], e = dir > 0 ? roads[i].w[0] : roads[i].w[roads[i].w.length - 1]; if ((ends.get(ek(e)) || []).length > 1) edgeIn.splice(k, 1); }
    findEdges(i0); addYields();
    api.silnice(i0);                                         // nové silnice: uzavírky, přestavět značky
    // auta podle intenzity (ve 3D o něco hustší než v mapě, ať je ulice živá)
    const main = []; for (let i = i0; i < roads.length; i++) if (roads[i].c !== 'service' && !roads[i].uz) main.push(i);
    const weights = main.map((i) => (roads[i].v || 300) * roads[i].L), wsum = weights.reduce((a, b) => a + b, 0);
    // ve špičce ~1,6 × intenzita / 450 na km (silnice s 10 000 auty za den: ~36 aut na km, ve městě se jede pomalu a v kolonách);
    // mimo špičku část aut zajede do garáže (provozPodleTmy). api.mnozstvi: podíl podle grafiky (slabší zařízení méně aut)
    const n = Math.min(Math.round(520 * api.mnozstvi()), Math.round(wsum / 450 / 1000 * 1.6 * api.mnozstvi()));
    const pick = (u) => { let x = u * wsum; for (let k = 0; k < main.length; k++) { x -= weights[k]; if (x <= 0) return main[k]; } return main[main.length - 1]; };
    // motorky: asi 2 % osobních, v zimě jen výjimečně (api.obdobi: 'winter' … nebo funkce, která ho vrátí)
    const motoPrah = 0.116 + ((typeof api.obdobi === 'function' ? api.obdobi() : api.obdobi) === 'winter' ? 0.004 : 0.018);
    for (let j = 0; j < n && main.length; j++) {
      // vlastnosti z semínka auta: u všech hráčů stejné auto (typ, barva, povaha řidiče), v libovolném pořadí čtverců
      const c = { uid: key + ':' + j, sd: semeno(key + ':' + j), pr: -1 };
      const r_ = pick(nah(c)), u = nah(c), truck = nah(c) * 100 < (roads[r_].t || 0), barva = nah(c);
      const t = truck ? (u < 0.55 && !MINOR.has(roads[r_].c) ? 'semi' : 'truck') : u < 0.1 ? 'van' : u < 0.11 ? 'garbage' : u < 0.116 ? 'tractor' : u < motoPrah ? 'moto' : 'car';
      const z = (a) => a[Math.floor(barva * a.length)];
      Object.assign(c, { r: r_, dir: roads[r_].o || (nah(c) > 0.5 ? 1 : -1), s: nah(c) * roads[r_].L, f: povaha(nah(c)), truck, t, T: VTYP[t], drzy: nah(c) < 0.12,
        col: t === 'van' ? z(VANC) : truck ? z(TRUCKC) : t === 'garbage' ? '#e8742a' : t === 'tractor' ? '#3f7a2e' : t === 'moto' ? z(MOTOC) : z(CARC) });
      if (c.dir < 0) c.s = roads[c.r].L - c.s;
      cars.push(c);
    }
    api.hotovo(i0);
  }
  // čím větší tma, tím méně aut: část zaparkuje do „garáže“ (mimo hru) a ráno se vrátí; mění se jen auta dál než 160 m od hráče,
  // ať nikdo nezmizí před očima. Auta čekající ve frontě na křižovatce zůstávají (drží počty fronty), hlídky a sanitky jezdí i v noci.
  const GARAZ = [];
  let provozT = 0;
  function provozPodleTmy(now) {
    if (now - provozT < 400) return; provozT = now;
    const f = api.hustota(), hrac = api.hrac();
    const cil = Math.round((cars.length + GARAZ.length) * f);
    const daleko = (c) => { const p = carPose(c); return Math.hypot(p.x - hrac.x, p.y - hrac.y) > 160; };
    for (let k = 0; k < 6 && cars.length > cil; k++) { const i = cars.findIndex((c) => !c.sl && !c.hold && !c.cekej && daleko(c)); if (i < 0) break; GARAZ.push(cars.splice(i, 1)[0]); }
    for (let k = 0; k < 6 && cars.length < cil && GARAZ.length; k++) { const i = GARAZ.findIndex(daleko); if (i < 0) break; cars.push(GARAZ.splice(i, 1)[0]); }
  }
  function carGaps() {
    const lanes = new Map();
    for (const c of cars) {
      c.lim = null; const k = c.r * 2 + (c.dir > 0 ? 1 : 0); c.p = c.dir > 0 ? c.s : roads[c.r].L - c.s;
      let a = lanes.get(k); if (!a) lanes.set(k, a = []); a.push(c);
    }
    for (const a of lanes.values()) {
      if (a.length < 2) continue;
      a.sort((u, v) => v.p - u.p);
      for (let i = 1; i < a.length; i++) { const f = a[i - 1]; a[i].lim = f.p - (f.t === 'semi' ? TAH + TRAILER / 2 : f.T.len / 2) - a[i].T.len / 2 - 2.5; }
    }
  }
  function stepCar(c, dt) {
    if (c.hold) { c.hw = (c.hw || 0) + dt; if (blocked(c.hold) && !(c.hold.yj && c.hw > 8)) return; c.hold.q = null; c.hold = null; c.hw = 0; }
    if (c.cekej > 0) { c.cekej -= dt; return; }              // před hráčem
    const r = roads[c.r]; let next = c.s + carSpeed(c, r) * dt * c.dir;
    if (c.lim !== null && c.lim !== undefined) { const lp = c.dir > 0 ? c.lim : r.L - c.lim; if (c.dir * (next - lp) > 0) next = c.dir * (lp - c.s) > 0 ? lp : c.s; }
    for (const z of r.jy) {
      if (z.d && z.d !== c.dir) continue;
      if (c.drzy && ULICE_STAV.on && (z.sg || z.yj)) continue;   // drzý řidič v pouličním režimu jede na červenou i bez přednosti
      if (!blocked(z)) continue;
      const qi = c.dir > 0 ? 0 : 1, stop = z[0] - c.dir * (6 + ((z.q && z.q[qi]) || 0));
      if (c.dir * (stop - c.s) >= 0 && c.dir * (next - stop) > 0) { c.s = stop; c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; return; }
      if (c.dir * (stop - c.s) < 0 && c.dir * (z[0] - c.dir * 6 - c.s) >= 0) { c.hold = z; (z.q = z.q || [0, 0])[qi] += c.T.gap; return; }
    }
    c.s = next;
    if (c.s < 0 || c.s > r.L) {
      const endPt = c.s < 0 ? r.w[0] : r.w[r.w.length - 1];
      c.pr = c.r; c.pdir = c.dir;
      const opts = (ends.get(ek(endPt)) || []).filter(([i, dir]) => i !== c.r && roads[i].c !== 'service' && !roads[i].uz && (!roads[i].o || roads[i].o === dir));
      if (opts.length) { const sel = c.next && opts.find(([i, dir]) => i === c.next[0] && dir === c.next[1]); const [i, dir] = sel || pickExit(opts, c); c.next = null; c.blink = 0; c.r = i; c.dir = dir; c.s = dir > 0 ? 0 : roads[i].L; }
      else if (atEdge(endPt) && enterFromEdge(c)) { /* odjelo z mapy, jiné přijelo */ }
      else if (r.o) { let i = c.r; for (let k = 0; k < 20; k++) { i = Math.floor(nah(c) * roads.length); if (roads[i].c !== 'service' && !roads[i].uz) break; } c.r = i; c.dir = roads[i].o || 1; c.s = c.dir > 0 ? 0 : roads[i].L; c.pr = -1; }
      else { c.dir *= -1; c.s = clamp(c.s, 0, r.L); c.pr = -1; }
    }
  }
  function carPose(c, back = 0) {                            // poloha a směr auta (back: návěs kamionu za tahačem)
    const r = roads[c.r], o = along(r, clamp(c.s - back * c.dir, 0, r.L)), L = Math.hypot(o.dx, o.dy) || 1, lane = r.o ? 0 : 1.6;
    const hx = o.dx / L * c.dir, hy = o.dy / L * c.dir;
    const x = o.x + hy * lane, y = o.y - hx * lane;
    // body silnice jsou řídké: mezi nimi by auto projelo kopcem; aspoň výška terénu (na mostě zůstane mostovka)
    return { x, y, z: api.gz ? Math.max(o.z, api.gz(x, y)) : o.z, h: Math.atan2(hy, hx) };
  }

  return {
    roads, ends, cars, LOADED, ULICE_STAV, ek, along, SIG, sigPosts, sigState, XC, xc3, blocked, MINOR, VTYP, TRAILER, TAH,
    pickExit, nactiDopravu, GARAZ, provozPodleTmy, carGaps, stepCar, carPose, silniceId,
  };
}
