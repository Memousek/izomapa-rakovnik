// Cloudflare Pages Function: dopravní události z mapy krajského portálu krizového řízení (Středočeský kraj, vrstva
// „Dopravní události“, https://pkr.kr-stredocesky.cz/pkr/mapa-aktualni-situace/; zveřejnění v mapě je se souhlasem portálu).
// Portál dává ke každé události jen bod (S-JTSK), název („Dopravní situace, D6, km 33.4 až 34.1…“, „Dopravní uzavírky
// a omezení, ulice …“), vznik a ukončení; popis je v detailu (?fmt=popup). Zdroj a obdélník mapy jsou v site/uzavirky_zdroj.json
// (nastroje/uzavirky.py z mesto.json "uzavirky_kraj"). Vrací jen platné události v mapě, bez počasí; cache 5 min pro všechny.
// Odpověď: { udalosti: [{ id, nazev, druh: 'kolona'|'nehoda'|'uzavirka', typ?, lat, lon, od, konec, popis }] }.
const CACHE_S = 300, DETAILU = 12;
const json = (d, status = 200, ttl = 60) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${ttl}` } });
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m)).replace(/\s+/g, ' ').trim();

// S-JTSK (Křovák, souřadnice ESRI 102067 = záporné Y, X) -> WGS84 [lat, lon]; přesnost kolem 1 m (Helmert, výška 0)
export function jtskNaWgs(ex, ey) {
  const Y = -ex, X = -ey;
  const n = 0.97992470462083, kUro = 12310230.12797036, sinUQ = 0.863499969506341, cosUQ = 0.504348889819882;
  const sinVQ = 0.420215144586493, cosVQ = 0.907424504992097, alfa = 1.000597498371542, k = 1.003419163966575, eB = 0.081696831215303;
  const ro = Math.hypot(X, Y), eps = 2 * Math.atan(Y / (ro + X)), D = eps / n, S = 2 * Math.atan(Math.exp(Math.log(kUro / ro) / n)) - Math.PI / 2;
  const sinS = Math.sin(S), cosS = Math.cos(S), sinD = Math.sin(D), cosD = Math.cos(D);
  const sinU = sinUQ * sinS - cosUQ * cosS * cosD, cosU = Math.sqrt(1 - sinU * sinU);
  const sinDV = sinD * cosS / cosU, cosDV = Math.sqrt(1 - sinDV * sinDV);
  const sinV = sinVQ * cosDV - cosVQ * sinDV, cosV = cosVQ * cosDV + sinVQ * sinDV;
  const L = 2 * Math.atan(sinV / (1 + cosV)) / alfa, t = Math.exp(2 / alfa * Math.log((1 + sinU) / cosU / k));
  let pom = (t - 1) / (t + 1), sinB;
  for (let i = 0; i < 30; i++) { sinB = pom; pom = t * Math.exp(eB * Math.log((1 + eB * sinB) / (1 - eB * sinB))); pom = (pom - 1) / (pom + 1); if (Math.abs(pom - sinB) < 1e-15) break; }
  const B = Math.atan(pom / Math.sqrt(1 - pom * pom));
  // Bessel -> prostorové souřadnice -> Helmert -> WGS84
  const aB = 6377397.15508, e2B = 1 - (1 - 1 / 299.152812853) ** 2, N = aB / Math.sqrt(1 - e2B * Math.sin(B) ** 2);
  const x = N * Math.cos(B) * Math.cos(L), y = N * Math.cos(B) * Math.sin(L), z = (1 - e2B) * N * Math.sin(B);
  const s = Math.PI / 180 / 3600, wx = -4.99821 * s, wy = -1.58676 * s, wz = -5.2611 * s, m = 3.543e-6;
  const xn = 570.69 + (1 + m) * (x + wz * y - wy * z), yn = 85.69 + (1 + m) * (-wz * x + y + wx * z), zn = 462.84 + (1 + m) * (wy * x - wx * y + z);
  const a = 6378137, f = 1 / 298.257223563, e2 = 1 - (1 - f) ** 2, ab = 1 / (1 - f), p = Math.hypot(xn, yn);
  const th = Math.atan(zn * ab / p), lat = Math.atan((zn + e2 * ab * a * Math.sin(th) ** 3) / (p - e2 * a * Math.cos(th) ** 3)), lon = 2 * Math.atan(yn / (p + xn));
  return [+(lat * 180 / Math.PI).toFixed(6), +(lon * 180 / Math.PI).toFixed(6)];
}

// „27. 11. 2026, 10:40“ (místní čas) -> ISO
function cas(s) {
  const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4}),?\s*(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  const utc = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(utc)).map((q) => [q.type, q.value]));
  return new Date(utc - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - utc)).toISOString();
}

// druh podle názvu a popisu; null = do mapy nepatří (počasí, sjízdnost)
export function druhUdalosti(nazev, popis = '') {
  const t = (nazev + ' ' + popis).toLowerCase();
  if (/srážky|viditelnost|sjízdnost|náledí|sníh|vítr|mlha|povětrnost/.test(t) && !/uzav|omezen|práce/.test(nazev.toLowerCase())) return null;
  if (/nehod/.test(t)) return { druh: 'nehoda' };
  if (/^dopravní situace/i.test(nazev) || /kolon|silný provoz|hustý provoz|pomalý|popojíž|stojí/.test(t)) {
    const typ = /stojí|stojící|stání/.test(t) ? 'stationaryTraffic' : /kolon|popojíž/.test(t) ? 'queuingTraffic' : /pomal/.test(t) ? 'slowTraffic' : 'heavyTraffic';
    return { druh: 'kolona', typ };
  }
  if (/uzav|omezen|práce|zákaz|zúžen/.test(t)) return { druh: 'uzavirka' };
  return null;
}

export function rozeberSeznam(d) {
  return ((d && d.result_items && d.result_items[0] && d.result_items[0].ret) || []).map((x) => {
    const [od, konec] = [/vznik:\s*([^,]+,\s*[\d:]+)/, /ukončení:\s*([^,]+,\s*[\d:]+)/].map((re) => cas((re.exec(x.label_description || '') || [])[1]));
    const [lat, lon] = x.geom ? jtskNaWgs(+x.geom.lon, +x.geom.lat) : [NaN, NaN];
    return { id: String(x.id), nazev: text(x.name || ''), lat, lon, od, konec };
  }).filter((u) => Number.isFinite(u.lat) && u.nazev);
}

async function stahni(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'izomapa (mapa dopravnich udalosti)', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false }, 405);
  const zr = env.ASSETS ? await env.ASSETS.fetch(new URL('/uzavirky_zdroj.json', request.url)) : null;
  const zdroj = zr && zr.ok ? await zr.json().catch(() => null) : null;
  const kraj = zdroj && zdroj.kraj, bbox = zdroj && zdroj.bbox;
  if (!kraj || !kraj.url || !Array.isArray(bbox)) return json({ ok: false, msg: 'Dopravní události kraje nejsou nastavené.' }, 404, 3600);
  const cache = caches.default, key = new Request(new URL('/api/udalosti?v=1', request.url));
  const hit = await cache.match(key);
  if (hit) return hit;
  const ted = Date.now(), uvnitr = (u) => u.lat >= bbox[0] && u.lat <= bbox[2] && u.lon >= bbox[1] && u.lon <= bbox[3];
  let seznam = [];
  try {
    for (let p = 1; p <= 3; p++) {                           // hledání podle okresu (portál hledá i v dotčených obcích a ORP)
      const u = new URL(kraj.url); u.searchParams.set('fmt', 'json'); if (kraj.hledat) u.searchParams.set('q', kraj.hledat); if (p > 1) u.searchParams.set('p', String(p));
      const d = await stahni(u), r = rozeberSeznam(d); seznam.push(...r);
      if (!d.result || (d.result.batch_start || 0) + (d.result.batch_size || 50) >= (d.result.total_items || 0) || !r.length) break;
    }
  } catch (e) { return json({ udalosti: [], chyba: String(e && e.message || e).slice(0, 120) }, 200, 60); }
  seznam = seznam.filter((u) => uvnitr(u) && (!u.konec || Date.parse(u.konec) > ted) && (!u.od || Date.parse(u.od) < ted + 24 * 3600e3));
  const posledni = new Map();                               // portál hlásí trvající kolonu znovu pod novým id: jen nejnovější podle názvu
  for (const u of seznam) { const q = posledni.get(u.nazev); if (!q || String(u.od) > String(q.od)) posledni.set(u.nazev, u); }
  seznam = [...posledni.values()];
  const out = [];
  for (const u of seznam) {
    let popis = '';
    if (out.length < DETAILU) {                               // popis z detailu (jen pár událostí v mapě)
      try { const d = await stahni(new URL(`${u.id}/?fmt=popup`, kraj.url)); popis = text(((/Popis\s*<\/p>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(d.result_items[0].ret[0].popup || '') || [])[1]) || ''); } catch { /* bez popisu */ }
    }
    const dr = druhUdalosti(u.nazev, popis);
    if (dr) out.push({ ...u, ...dr, popis: popis.slice(0, 500) });
  }
  const r = json({ udalosti: out, aktualizace: new Date().toISOString() }, 200, CACHE_S);
  await cache.put(key, r.clone());
  return r;
}
