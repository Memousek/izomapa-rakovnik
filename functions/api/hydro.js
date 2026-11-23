// Cloudflare Pages Function: vodní stav a průtok z otevřených dat ČHMÚ (opendata.chmi.cz, hydrologie „now“) pro stanice
// ze statického site/hydro_zdroj.json (build_html.py z mesto.json "hydro": {"stanice": ["0-203-1-191800"]}), takže to není
// otevřená proxy. ČHMÚ neposílá CORS, proto prostředník. Data se obnovují po 10 min, metadata (název, povodňové stupně) po 24 h.
const DATA = 'https://opendata.chmi.cz/hydrology/now/data/', META = 'https://opendata.chmi.cz/hydrology/now/metadata/meta1.json';
const UA = 'izomapa-hydro/1.0 (+https://github.com/adamklatovsky/izomapa)';
const json = (o, max = 600) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${max}` } });

async function stahni(url, ttl) {
  const cache = caches.default, klic = new Request('https://izomapa.internal/hydro?' + encodeURIComponent(url));
  const hit = await cache.match(klic);
  if (hit) return hit.json();
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('ČHMÚ ' + r.status);
  const t = await r.text();
  await cache.put(klic, new Response(t, { headers: { 'cache-control': `public, max-age=${ttl}` } }));
  return JSON.parse(t);
}

export async function onRequestGet({ request, env }) {
  const z = env.ASSETS ? await env.ASSETS.fetch(new URL('/hydro_zdroj.json', request.url)) : await fetch(new URL('/hydro_zdroj.json', request.url));
  if (!z.ok) return json({ stanice: [] }, 300);
  const ids = ((await z.json()).stanice || []).filter((s) => /^[0-9-]{6,20}$/.test(s)).slice(0, 4);
  let meta;
  try { meta = await stahni(META, 86400); } catch { return json({ stanice: [], chyba: 'metadata' }, 120); }
  const h = meta.data.data.header.split(','), M = new Map(meta.data.data.values.map((v) => [v[0], Object.fromEntries(h.map((k, i) => [k, v[i]]))]));
  const out = [];
  for (const id of ids) {
    const m = M.get(id); if (!m) continue;
    let d; try { d = await stahni(DATA + id + '.json', 600); } catch { continue; }
    const ts = (d.objList?.[0]?.tsList) || [], rada = (k) => (ts.find((q) => q.tsConID === k)?.tsData || []).filter((q) => q.value !== null);
    const H = rada('H'), Q = rada('Q'), den = Date.now() - 26 * 3600e3;
    const poHodinach = (a) => a.filter((q, i) => i === a.length - 1 || q.dt.endsWith(':00:00Z')).filter((q) => Date.parse(q.dt) >= den).map((q) => [q.dt, q.value]);
    out.push({ id, nazev: m.STATION_NAME, tok: m.STREAM_NAME, lat: m.GEOGR1, lon: m.GEOGR2, jednotka: m.SPAH_UNIT,
      spa: [m.SPA1H, m.SPA2H, m.SPA3H].map((v) => v ?? null), sucho: m.DRYH ?? null, predpoved: !!m.ISFORECAST,
      h: poHodinach(H), q: poHodinach(Q), posledni: H.length ? { t: H[H.length - 1].dt, h: H[H.length - 1].value, q: Q.length ? Q[Q.length - 1].value : null } : null });
  }
  return json({ stazeno: new Date().toISOString(), zdroj: 'ČHMÚ, otevřená data', stanice: out });
}
