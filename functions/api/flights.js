// Cloudflare Pages Function: aircraft near the map from adsb.lol (ODbL, no key), with adsb.fi open data as a fallback.
// Browsers cannot call adsb.lol or OpenSky directly (no CORS for other origins), so the map asks this endpoint.
// adsb.lol sometimes refuses requests coming from Cloudflare (the endpoint then answered 502 every time),
// so a refused or failed request falls back to adsb.fi (same readsb format, list under "aircraft" instead of "ac").
// Query: lamin, lamax, lomin, lomax (the box the map sends); answer is cached for 15 s for all visitors.
// Header x-zdroj names the source that answered and the upstream status codes (for debugging in the browser).
const ZDROJE = [
  { nazev: 'adsb.lol', url: (lat, lon) => `https://api.adsb.lol/v2/point/${lat}/${lon}/35` },
  { nazev: 'adsb.fi', url: (lat, lon) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/35` },
];

export async function onRequest({ request }) {
  const q = new URL(request.url).searchParams;
  const n = (k) => Number.parseFloat(q.get(k));
  const [la0, la1, lo0, lo1] = ['lamin', 'lamax', 'lomin', 'lomax'].map(n);
  if (![la0, la1, lo0, lo1].every(Number.isFinite)) return new Response('{"ac":[]}', { status: 400, headers: { 'content-type': 'application/json' } });
  const lat = ((la0 + la1) / 2).toFixed(2), lon = ((lo0 + lo1) / 2).toFixed(2);
  const cache = caches.default, key = new Request(`https://izomapa.cache/flights/${lat}/${lon}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const stavy = [];
  for (const z of ZDROJE) {
    try {
      const up = await fetch(z.url(lat, lon), { headers: { 'user-agent': 'izomapa-rakovnik (+https://github.com/Memousek/izomapa-rakovnik)', accept: 'application/json' } });
      stavy.push(`${z.nazev} ${up.status}`);
      if (!up.ok) continue;
      const d = await up.json();
      const ac = Array.isArray(d.ac) ? d.ac : Array.isArray(d.aircraft) ? d.aircraft : null;
      if (!ac) { stavy.push(`${z.nazev} bez seznamu letadel`); continue; }
      const r = new Response(JSON.stringify({ ac, zdroj: z.nazev }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=15', 'x-zdroj': stavy.join(', ') },
      });
      await cache.put(key, r.clone());
      return r;
    } catch (e) {
      stavy.push(`${z.nazev} chyba ${String(e && e.message || e).slice(0, 60)}`);
    }
  }
  // nikdo neodpověděl: prázdný seznam na 15 s pro všechny (zdroje se nezahlcují opakovanými dotazy)
  const r = new Response('{"ac":[]}', { status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=15', 'x-zdroj': stavy.join(', ') } });
  await cache.put(key, r.clone());
  return r;
}
