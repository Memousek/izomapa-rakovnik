// Uzavírky silnic pro mapu i 3D jízdu.
// 1) site/uzavirky.json: ruční (assets/upresneni.json) + poslední automatické z nastroje/uzavirky.py (stačí bez serveru)
// 2) api/uzavirky (functions/api/uzavirky.js): čerstvá oznámení z webu města -> úseky se dopočítají tady po síti ulic
//    site/uzavirky_sit.json, stejně jako v nastroje/uzavirky.py (změny dělat v obou).
// nactiUzavirky(base, hotovo): hotovo(seznam) se zavolá hned se statickým souborem a znovu, když dorazí čerstvá data.
// Položka: { line: [[lat, lon], …], od, do (YYYY-MM-DD), nazev, popis, objizdka, zdroj, url, castecna, auto }

const L = '[\\p{L}\\d_]';
const B = `(?<!${L})`, E = `(?!${L})`;                      // hranice slova i pro českou diakritiku (\b v JS zná jen ASCII)
const HLAVICKY = '(Termín uzavírky|Rozsah uzavírky|Důvod uzavírky|Objízdná trasa|Objížďka|[Aa] nařizuje|Po celou dobu|DIO' + E + '|Vyznačení|Zbývající jízdní pruh)';
const DATUM = '(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\d{4})?';
const ETAPA = new RegExp(`^(?:([0-9]+|[IVX]+)\\.\\s*)?(etapa|fáze)${E}\\s*[-–:]?\\s*(.*)$`, 'iu');
const REF = new RegExp(`${B}(I{1,3})/(\\d+)`, 'u');

export const bezDiakritiky = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const dnesISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const p2 = (n) => String(n).padStart(2, '0');

function sekce(radky) {
  const out = { '': [] }; let cur = '';
  const re = new RegExp('^' + HLAVICKY + '[^:]{0,40}:?\\s*(.*)$', 'u');
  for (const l of radky) {
    const m = re.exec(l);
    if (m) { cur = m[1].split(/\s+/)[0].toLowerCase(); out[cur] = out[cur] || []; if (m[2].trim()) out[cur].push(m[2].trim()); }
    else (out[cur] = out[cur] || []).push(l);
  }
  return out;
}

function rozsahy(txt) {
  const r = [];
  for (const m of txt.matchAll(new RegExp(DATUM + '\\s*[–—-]\\s*' + DATUM, 'gu'))) {
    const [, a, b, c, d, e, f] = m; if (!f) continue;
    r.push([`${c || f}-${p2(+b)}-${p2(+a)}`, `${f}-${p2(+e)}-${p2(+d)}`]);
  }
  if (!r.length) {
    const m = new RegExp(`${B}od${E}\\D{0,30}?${DATUM}\\D{0,40}?${B}do${E}\\D{0,30}?${DATUM}`, 'u').exec(txt);
    if (m && m[6]) { const [, a, b, c, d, e, f] = m; r.push([`${c || f}-${p2(+b)}-${p2(+a)}`, `${f}-${p2(+e)}-${p2(+d)}`]); }
  }
  return r;
}

function etapy(rozsah) {
  const out = [];
  for (const l of rozsah) {
    const m = ETAPA.exec(l);
    if (m) { out.push([`${m[1] || out.length + 1}. ${m[2].toLowerCase()}`, []]); if (m[3].trim()) out[out.length - 1][1].push(m[3].trim()); }
    else { if (!out.length) out.push(['', []]); out[out.length - 1][1].push(l); }
  }
  return out.filter(([, u]) => u.length);
}

// ---------------------------------------------------------------- síť ulic (site/uzavirky_sit.json)
function pripravSit(d) {
  const n = d.uzly.length / 2, adj = Array.from({ length: n }, () => []);
  const ulice = new Map(d.ulice.map((nm) => [nm, new Set()])), ref = new Map();
  const xy = (i) => [d.uzly[2 * i], d.uzly[2 * i + 1]];
  for (let k = 0; k < d.hrany.length; k += 4) {
    const a = d.hrany[k], b = d.hrany[k + 1], u = d.hrany[k + 2], rr = d.hrany[k + 3] === '' ? [] : String(d.hrany[k + 3]).split('|').map((q) => d.refy[+q]);
    const nm = u >= 0 ? d.ulice[u] : null, [ax, ay] = xy(a), [bx, by] = xy(b), e = { nm, refs: rr, L: Math.hypot(bx - ax, by - ay) };
    adj[a].push([b, e]); adj[b].push([a, e]);
    if (nm) { ulice.get(nm).add(a); ulice.get(nm).add(b); }
    for (const f of rr) { if (!ref.has(f)) ref.set(f, new Set()); ref.get(f).add(a); ref.get(f).add(b); }
  }
  const vzory = new Map(d.ulice.map((nm) => {
    const slova = bezDiakritiky(nm).replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    return [nm, new RegExp(B + slova.map((w) => (w.length >= 6 ? esc(w.slice(0, -2)) + `${L}{0,4}` : esc(w) + E)).join('\\s+'), 'gu')];
  }));
  const kruh = new Map(); for (let k = 0; k < (d.kruh || []).length; k += 2) kruh.set(d.kruh[k], d.kruh[k + 1]);
  return { d, adj, ulice, ref, vzory, xy, kruh, adresy: d.adresy.map(([c, u, x, y]) => [String(c), u >= 0 ? d.ulice[u] : null, x, y]), mista: d.mista };
}

const uzly = (S, nm, rf) => (nm ? S.ulice.get(nm) || new Set() : S.ref.get(rf) || new Set());
const prunik = (A, B_) => new Set([...A].filter((x) => B_.has(x)));

function cesta(S, A, B_, hlavni) {                           // Dijkstra z množiny A do B, mimo hlavní ulici 4× dražší
  const dist = new Map(), prev = new Map(), q = [];
  const push = (d, u) => { q.push([d, u]); let i = q.length - 1; while (i) { const p = (i - 1) >> 1; if (q[p][0] <= q[i][0]) break; [q[p], q[i]] = [q[i], q[p]]; i = p; } };
  const pop = () => { const top = q[0], last = q.pop(); if (q.length) { q[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < q.length && q[l][0] < q[m][0]) m = l; if (r < q.length && q[r][0] < q[m][0]) m = r; if (m === i) break; [q[m], q[i]] = [q[i], q[m]]; i = m; } } return top; };
  for (const a of A) { dist.set(a, 0); push(0, a); }
  while (q.length) {
    const [d, u] = pop();
    if (d > (dist.get(u) ?? 1e18)) continue;
    if (B_.has(u)) { const out = [u]; while (prev.has(out[out.length - 1])) out.push(prev.get(out[out.length - 1])); return out.reverse(); }
    for (const [v, e] of S.adj[u]) {
      const nd = d + e.L * (hlavni(e.nm, e.refs) ? 1 : 4);
      if (nd < (dist.get(v) ?? 1e18)) { dist.set(v, nd); prev.set(v, u); push(nd, v); }
    }
  }
  return null;
}

function nejblizsi(S, mnozina, x, y, maxd) {
  let best = null, bd = Infinity;
  for (const k of mnozina) { const [kx, ky] = S.xy(k), d = Math.hypot(kx - x, ky - y); if (d < bd) { bd = d; best = k; } }
  return best !== null && bd <= maxd ? best : null;
}

function zminky(S, txt) {                                    // ulice v textu: [začátek, konec, název, s „ul.“ před]
  const t = bezDiakritiky(txt), out = [];
  for (const [nm, vz] of S.vzory) {
    vz.lastIndex = 0;
    for (const m of t.matchAll(vz)) {
      const pred = t.slice(Math.max(0, m.index - 8), m.index);
      out.push([m.index, m.index + m[0].length, nm, /(^|[^\p{L}\d])ul(\.|ic[ei])\s*$|(^|[^\p{L}\d])ul\.\s*[\p{L}\d_]*\s*$/u.test(pred)]);
    }
  }
  out.sort((a, b) => a[0] - b[0] || (b[1] - b[0]) - (a[1] - a[0]));
  const res = []; let konec = -1;
  for (const z of out) if (z[0] >= konec) { res.push(z); konec = z[1]; }
  for (let i = 1; i < res.length; i++) if (!res[i][3] && res[i - 1][3] && /^\s*(a|,)\s*$/.test(t.slice(res[i - 1][1], res[i][0]))) res[i] = [...res[i].slice(0, 3), true];
  return res;
}

function kotva(S, fraze, hlNm, hlUzly) {
  let m = /č\.?\s*p\.?\s*(\d+)/u.exec(fraze);
  if (m) {
    const kand = S.adresy.filter((a) => a[0] === m[1]).sort((a, b) => (a[1] !== hlNm) - (b[1] !== hlNm));
    for (const [, , x, y] of kand) { const k = nejblizsi(S, hlUzly, x, y, 90); if (k !== null) return new Set([k]); }
  }
  for (const [, , nm, ul] of zminky(S, fraze)) if (ul && nm !== hlNm) { const s = prunik(hlUzly, uzly(S, nm)); if (s.size) return s; }
  m = REF.exec(fraze);
  if (m) { const s = prunik(hlUzly, uzly(S, null, m[2])); if (s.size) return s; }
  const f = bezDiakritiky(fraze);
  for (const [nm, x, y] of S.mista) if (nm && nm.length >= 5 && f.includes(nm)) { const k = nejblizsi(S, hlUzly, x, y, 200); if (k !== null) return new Set([k]); }
  return null;
}

function retezce(S, hrany) {                                 // hrany ulice -> souvislé lomené čáry (jako shapely linemerge)
  const sous = new Map();
  for (const [a, b] of hrany) { (sous.get(a) || sous.set(a, []).get(a)).push(b); (sous.get(b) || sous.set(b, []).get(b)).push(a); }
  const hk = (a, b) => (a < b ? a + ',' + b : b + ',' + a), hotove = new Set(), out = [];
  const jdi = (a, b) => { const c = [a, b]; hotove.add(hk(a, b)); let p = a, u = b;
    while (sous.get(u).length === 2) { const v = sous.get(u)[0] === p ? sous.get(u)[1] : sous.get(u)[0]; if (hotove.has(hk(u, v))) break; hotove.add(hk(u, v)); c.push(v); p = u; u = v; }
    return c; };
  for (const [a, nb] of sous) if (nb.length !== 2) for (const b of nb) if (!hotove.has(hk(a, b))) out.push(jdi(a, b));
  for (const [a, nb] of sous) for (const b of nb) if (!hotove.has(hk(a, b))) out.push(jdi(a, b));   // zbylé kruhy
  return out;
}

// cesta -> [[lat, lon]]: kusy po prstenci kruhového objezdu na koncích pryč (zábrana patří na odbočku ulice, ne napříč
// okruhem) a krajní bod v křižovatce o 5 m dovnitř uzavřené ulice (jako konce() v nastroje/uzavirky.py)
function konce(S, p) {
  const k = S.kruh;
  while (p.length > 2 && k.has(p[0]) && k.get(p[0]) === k.get(p[1])) p = p.slice(1);
  while (p.length > 2 && k.has(p.at(-1)) && k.get(p.at(-1)) === k.get(p.at(-2))) p = p.slice(0, -1);
  const xy = p.map((q) => S.xy(q)), n = xy.length;
  for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
    if (!k.has(p[i]) && S.adj[p[i]].length < 3) continue;
    const dx = xy[j][0] - xy[i][0], dy = xy[j][1] - xy[i][1], d = Math.hypot(dx, dy);
    if (d > 4) { const t = Math.min(5, d * 0.4) / d; xy[i] = [xy[i][0] + dx * t, xy[i][1] + dy * t]; }
  }
  const { cam } = S.d;
  return xy.map(([x, y]) => [+(y / cam.ky + cam.lat0).toFixed(6), +(x / cam.kx + cam.lon0).toFixed(6)]);
}

function usek(S, radek, nadpisUlice) {
  const zm = zminky(S, radek).filter((z) => z[3]);
  const hl = zm.length ? zm[0][2] : nadpisUlice;
  let hlUzly, hlavni, jmeno;
  if (!hl) {
    const m = REF.exec(radek); if (!m || !uzly(S, null, m[2]).size) return null;
    hlUzly = uzly(S, null, m[2]); hlavni = (nm, refs) => refs.includes(m[2]); jmeno = `${m[1]}/${m[2]}`;
  } else { hlUzly = uzly(S, hl); hlavni = (nm) => nm === hl; jmeno = hl; }
  const zbytek = zm.length && zm[0][2] === hl ? radek.slice(zm[0][1]) : radek;
  const m = new RegExp(`${B}od${E}([\\s\\S]*?)${B}(až\\s+po|až\\s+ke?|po)${E}([\\s\\S]*)`, 'u').exec(zbytek)
    || new RegExp(`${B}od${E}([\\s\\S]*?)${B}(směrem\\s+ke?|ke?)${E}([\\s\\S]*)`, 'u').exec(zbytek);
  const ll = (k) => { const [x, y] = S.xy(k); return [+(y / S.d.cam.ky + S.d.cam.lat0).toFixed(6), +(x / S.d.cam.kx + S.d.cam.lon0).toFixed(6)]; };
  if (m) {
    const A = kotva(S, m[1], hl, hlUzly), Bk = kotva(S, m[3].split(/[,(;]/)[0], hl, hlUzly);
    if (A && Bk && prunik(A, Bk).size) return null;           // oba konce v jedné křižovatce: text je moc obecný
    if (A && Bk) { const p = cesta(S, A, Bk, hlavni); if (p && p.length > 1) return [jmeno, [konce(S, p)], false]; }
  }
  const hrany = new Map();                                   // bez konců (nebo nenalezené): celá ulice v mapě
  for (const a of hlUzly) for (const [b, e] of S.adj[a]) if (hlavni(e.nm, e.refs)) hrany.set(a < b ? a + ',' + b : b + ',' + a, [Math.min(a, b), Math.max(a, b)]);
  if (!hrany.size) return null;
  return [jmeno, retezce(S, [...hrany.values()]).map((c) => c.map(ll)), m !== null];
}

function vMape(S, line) {
  const { cam } = S.d, set = new Set(S.d.ctverce.map(([i, j]) => i + ',' + j));
  let uvnitr = 0;
  for (const [la, lo] of line) {
    const x = (lo - cam.lon0) * cam.kx, y = (la - cam.lat0) * cam.ky;
    if (set.has(Math.floor((x + cam.half) / (2 * cam.half)) + ',' + Math.floor((y + cam.half) / (2 * cam.half)))) uvnitr++;
  }
  return uvnitr >= 0.5 * line.length;
}

export function zpracuj(S, { url, nadpis, text }, dnes = dnesISO()) {
  const nf = bezDiakritiky(nadpis + ' ' + text.split('\n')[0]);
  if (!S.d.obce.some((o) => new RegExp(B + esc(bezDiakritiky(o)) + E, 'u').test(nf))) return [[], 'mimo mapu'];
  const radky = text.split('\n'), Sk = sekce(radky);
  const R = rozsahy((Sk['termín'] || []).join(' ') || text);
  if (!R.length) return [[], 'bez termínu'];
  let Et = etapy(Sk.rozsah || []); if (!Et.length) Et = [['', [radky[0]]]];
  let par;
  if (Et.length === R.length) par = Et.map((e, i) => [e, R[i]]);
  else if (R.length === 1 || Et.length === 1) par = Et.map((e) => [e, R.length === 1 ? R[0] : [R.map((r) => r[0]).sort()[0], R.map((r) => r[1]).sort().at(-1)]]);
  else par = Et.slice(0, Math.min(Et.length, R.length)).map((e, i) => [e, R[i]]);
  const ted = par.filter((p) => p[1][0] <= dnes && dnes <= p[1][1]);
  const pristi = par.filter((p) => p[1][0] > dnes).sort((a, b) => (a[1][0] < b[1][0] ? -1 : 1)).slice(0, 1);
  const vyber = [...ted, ...pristi];
  if (!vyber.length) return [[], 'prošlá'];
  const castecna = /^\s*částečn/iu.test(text);
  const zmN = zminky(S, nadpis).filter((z) => z[3]), nadpisUlice = zmN.length ? zmN[0][2] : null;
  const duvod = (Sk['důvod'] || []).join(' ').slice(0, 200);
  let obj = ((Sk['objízdná'] || []).length ? Sk['objízdná'] : (Sk['objížďka'] || []).length ? Sk['objížďka'] : Sk.a || []).join(' ');
  obj = obj ? obj.split(/(?<=[\p{L}\d_]{4}\.)\s(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/u)[0].slice(0, 220) : null;
  const out = [], pozn = [];
  for (const [[et, useky], [od, do_]] of vyber) for (const radek of useky) for (const cast of radek.split(/;\s*/)) {
    const r = usek(S, cast, nadpisUlice);
    if (!r) { pozn.push('nenalezeno: ' + cast.slice(0, 70)); continue; }
    const [jmeno, cary, odhad] = r;
    for (const line of cary) {
      if (line.length < 2 || !vMape(S, line)) continue;
      const popis = (castecna ? 'Částečná' : 'Úplná') + ' uzavírka' + (et ? `, ${et}` : '') + ': ' + cast.replace(/\.+$/, '') + (duvod ? `. Důvod: ${duvod}` : '');
      out.push({ nazev: jmeno, line, od, do: do_, popis, objizdka: obj, zdroj: S.d.zdroj, url, auto: odhad ? 'odhad' : 1, ...(castecna ? { castecna: true } : {}) });
    }
  }
  return [out, pozn.join('; ') || 'ok'];
}

export const nactiSit = (d) => pripravSit(d);

// ---------------------------------------------------------------- ruční úpravy správce (functions/api/uzavirky.js, KV)
// klíč uzavírky: odkaz na oznámení + ulice + začátek etapy (příští etapa je jiná uzavírka, úprava na ni nepřejde)
export const klic = (u) => (u.jid ? `jsdi#${u.jid}` : `${u.url || ''}#${u.nazev || ''}#${u.od || ''}`);
const POLE = ['line', 'od', 'do', 'nazev', 'popis', 'objizdka', 'castecna', 'zdroj', 'url'];

// seznam + úpravy -> [viditelné, skryté (jen pro editor)]
export function aplikuj(seznam, upravy) {
  const up = new Map((upravy || []).filter((u) => u.typ !== 'nova').map((u) => [u.klic, u]));
  const vid = [], skryte = [];
  for (const u of seznam) {
    const k = klic(u), m = up.get(k);
    if (!m) { vid.push({ ...u, klic: k }); continue; }
    if (m.typ === 'skryt') { skryte.push({ ...u, klic: k, uprava: m }); continue; }
    const o = { ...u, klic: k, uprava: m }; for (const f of POLE) if (f in m) o[f] = m[f];
    if (!m.castecna) delete o.castecna;
    vid.push(o);
  }
  for (const m of upravy || []) if (m.typ === 'nova') vid.push({ zdroj: 'správce mapy', ...m, klic: 'nova#' + m.id, uprava: m });
  return [vid, skryte];
}

// editor: body [[x, y], …] ve světě -> přichycené na nejbližší silnici (do 60 m) a trasa mezi nimi po síti
export function trasaMeziBody(S, body) {
  const n = S.adj.length, uzel = body.map(([x, y]) => {
    let best = -1, bd = 60;
    for (let i = 0; i < n; i++) { if (!S.adj[i].length) continue; const [ix, iy] = S.xy(i), d = Math.hypot(ix - x, iy - y); if (d < bd) { bd = d; best = i; } }
    return best;
  });
  if (uzel.some((u) => u < 0)) return null;
  let p = [uzel[0]];
  for (let i = 1; i < uzel.length; i++) {
    if (uzel[i] === uzel[i - 1]) continue;
    const c = cesta(S, new Set([uzel[i - 1]]), new Set([uzel[i]]), () => true); if (!c) return null;
    p = p.concat(c.slice(1));
  }
  const { cam } = S.d;
  return { line: p.map((k) => { const [x, y] = S.xy(k); return [+(y / cam.ky + cam.lat0).toFixed(6), +(x / cam.kx + cam.lon0).toFixed(6)]; }), body: uzel.map((k) => S.xy(k)) };
}

// ---------------------------------------------------------------- úseky jako GeoJSON (mapa KSÚS, api/uzavirky?geo=i)
// stejné pravidlo jako z_geojson() v nastroje/uzavirky.py: jen s koncem platnosti, v mapě, a ne když už je mezi uzavírkami z webu
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function prekryva(S, line, jine, tol = 15) {
  if (!jine.length) return false;
  const { cam } = S.d, loc = (l) => l.map(([la, lo]) => [(lo - cam.lon0) * cam.kx, (la - cam.lat0) * cam.ky]);
  const seg = jine.flatMap((j) => { const P = loc(j); return P.slice(1).map((b, i) => [P[i], b]); });
  const P = loc(line), body = [];
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], n = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10)); for (let k = 0; k < n; k++) body.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  body.push(P[P.length - 1]);
  const d = (p, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)); return Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]); };
  return body.filter((p) => seg.some(([a, b]) => d(p, a, b) < tol)).length >= 0.6 * body.length;
}
export function zGeojson(S, d, i, cfg, jine, dnes = dnesISO()) {
  const out = [];
  for (const f of (d && d.features) || []) {
    const p = f.properties || {}, g = f.geometry || {}, od = p.dateStart, do_ = p.dateEnd;
    if (typeof do_ !== 'string' || !ISO.test(do_) || do_ < dnes) continue;
    const cary = g.type === 'LineString' ? [g.coordinates || []] : g.type === 'MultiLineString' ? g.coordinates || [] : [];
    for (const c of cary) {
      const line = c.slice(0, 2000).map((q) => [+(+q[1]).toFixed(6), +(+q[0]).toFixed(6)]);
      if (line.length < 2 || !vMape(S, line) || prekryva(S, line, jine)) continue;
      const text = (p.name || '') + ' ' + (p.description || '');
      out.push({ nazev: (p.name || 'Uzavírka').trim().slice(0, 120), line, od: typeof od === 'string' && ISO.test(od) ? od : null, do: do_,
        popis: (p.description || '').trim().slice(0, 500), zdroj: cfg.zdroj, url: cfg.odkaz, auto: 1, puvod: 'geo' + i, ...(/částečn/i.test(text) ? { castecna: true } : {}) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- načtení pro prohlížeč
// hotovo(viditelné, {skryte, upravy, upravyZapnute}) se volá se statickým souborem a znovu s čerstvými daty z api/uzavirky
// (oznámení z webu města -> úseky po síti ulic, úseky z GeoJSON zdrojů přes api/uzavirky?geo=i). Co nejde stáhnout, zůstává ze snímku.
export async function nactiUzavirky(base, hotovo) {
  const j = (u) => fetch(base + u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const stat = (await j('uzavirky.json')) || [];
  const rucni = stat.filter((u) => !u.auto), puvod = (u) => u.puvod || 'web';
  hotovo(aplikuj(stat, [])[0], { skryte: [], upravy: [], upravyZapnute: false });
  const api = await j('api/uzavirky');
  if (!api) return;                                          // bez serveru (náhled): zůstává statický soubor
  let web = stat.filter((u) => u.auto && puvod(u) === 'web');
  const geo = new Map();
  for (const u of stat) if (u.auto && puvod(u) !== 'web') { if (!geo.has(puvod(u))) geo.set(puvod(u), []); geo.get(puvod(u)).push(u); }
  const sd = await j('uzavirky_sit.json');
  if (sd) {
    const S = pripravSit(sd), dnes = dnesISO();
    if (Array.isArray(api.oznameni) && api.oznameni.length) {
      const skryt = new Set([...(sd.skryt || []), ...rucni.map((u) => u.url).filter(Boolean)]);
      web = [];
      for (const o of api.oznameni) { try { if (!skryt.has(o.url)) web.push(...zpracuj(S, o, dnes)[0].map((u) => ({ ...u, puvod: 'web' }))); } catch (e) { console.warn('uzavírka', o.url, e); } }
    }
    const zdroje = sd.geojson || [];
    const data = await Promise.all(zdroje.map((_, i) => j(`api/uzavirky?geo=${i}`)));
    data.forEach((d, i) => { if (d && Array.isArray(d.features)) { try { geo.set('geo' + i, zGeojson(S, d, i, zdroje[i], web.map((u) => u.line), dnes)); } catch (e) { console.warn('uzavírky geojson', i, e); } } });
  }
  // JSDI (ŘSD ČR – NDIC, functions/api/jsdi.js): úsek přímo ze souřadnic, má přednost; stejný úsek z webu města nebo KSÚS se vynechá
  const jsdi = (api.jsdi || []).flatMap((z) => (z.lines || []).map((line) => ({ nazev: z.nazev, line, od: z.od, do: z.do, popis: z.popis,
    zdroj: 'JSDI, ŘSD ČR – NDIC', auto: 1, puvod: 'jsdi', jid: z.id, ...(z.castecna ? { castecna: true } : {}) })));
  if (jsdi.length && sd) {
    const S = pripravSit(sd), jl = jsdi.map((u) => u.line);
    web = web.filter((u) => !prekryva(S, u.line, jl));
    for (const [k, l] of geo) geo.set(k, l.filter((u) => !prekryva(S, u.line, jl)));
  }
  const [vid, skryte] = aplikuj([...rucni, ...jsdi, ...web, ...[...geo.values()].flat()], api.upravy || []);
  hotovo(vid, { skryte, upravy: api.upravy || [], upravyZapnute: !!api.upravyZapnute, zApi: true });
}
