// Cloudflare Pages Function: polohy vozidel MHD v reálném čase (GTFS Realtime, adresa v mesto.json mhd.realtime).
// Prohlížeč se na zdroj přímo nedostane (CORS) a celý feed je pro mapu zbytečně velký, proto ho tady
// stáhneme (cache 10 s pro všechny návštěvníky), rozbalíme protobuf a vrátíme jen vozidla v obdélníku mapy.
// Dotaz: src (URL feedu vehicle_positions), lamin, lamax, lomin, lomax. Odpověď: {t, v: [[trip_id, lat, lon, čas polohy, kurz]]}
const POVOLENE = [/^https:\/\/api\.golemio\.cz\/v2\/vehiclepositions\/gtfsrt\/[a-z_]+\.pb$/];   // jen známé zdroje, ať z funkce není otevřená proxy

// --- minimální čtečka protobufu (jen typy, které GTFS-RT VehiclePosition používá) ---
function fields(buf, from = 0, to = buf.length) {
  const out = []; let i = from;
  const varint = () => { let v = 0, m = 1, b; do { b = buf[i++]; v += (b & 0x7f) * m; m *= 128; } while (b & 0x80); return v; };
  while (i < to) {
    const key = varint(), f = Math.floor(key / 8), w = key & 7;
    if (w === 0) out.push([f, varint()]);
    else if (w === 1) { out.push([f, new DataView(buf.buffer, buf.byteOffset + i, 8).getFloat64(0, true)]); i += 8; }
    else if (w === 2) { const n = varint(); out.push([f, [i, i + n]]); i += n; }
    else if (w === 5) { out.push([f, new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true)]); i += 4; }
    else throw new Error('neznámý typ protobufu ' + w);
  }
  return out;
}
const str = (buf, [a, b]) => new TextDecoder().decode(buf.subarray(a, b));

export function decode(buf) {
  let t = 0; const v = [];
  for (const [f, val] of fields(buf)) {
    if (f === 1) { for (const [g, h] of fields(buf, ...val)) if (g === 3) t = h; continue; }          // header.timestamp
    if (f !== 2) continue;
    for (const [g, ent] of fields(buf, ...val)) {
      if (g !== 4) continue;                                                                           // FeedEntity.vehicle
      let trip = '', lat = null, lon = null, brg = null, ts = 0;
      for (const [k, x] of fields(buf, ...ent)) {
        if (k === 1) { for (const [a, b] of fields(buf, ...x)) if (a === 1) trip = str(buf, b); }     // trip.trip_id
        else if (k === 2) { for (const [a, b] of fields(buf, ...x)) { if (a === 1) lat = b; else if (a === 2) lon = b; else if (a === 3) brg = b; } }
        else if (k === 5) ts = x;
      }
      if (trip && lat !== null && lon !== null) v.push([trip, lat, lon, ts, brg]);
    }
  }
  return { t, v };
}

const json = (body, status = 200, maxAge = 10) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` } });

export async function onRequest({ request }) {
  const q = new URL(request.url).searchParams, src = q.get('src') || '';
  const [la0, la1, lo0, lo1] = ['lamin', 'lamax', 'lomin', 'lomax'].map((k) => Number.parseFloat(q.get(k)));
  if (!POVOLENE.some((re) => re.test(src)) || ![la0, la1, lo0, lo1].every(Number.isFinite)) return json({ t: 0, v: [] }, 400, 0);
  const cache = caches.default, key = new Request(src);
  let r = await cache.match(key);
  if (!r) {
    const up = await fetch(src, { headers: { 'user-agent': 'izomapa' } });
    if (!up.ok) return json({ t: 0, v: [] }, 502, 0);
    r = new Response(await up.arrayBuffer(), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=10' } });
    await cache.put(key, r.clone());
  }
  const { t, v } = decode(new Uint8Array(await r.arrayBuffer()));
  const r5 = (x) => Math.round(x * 1e5) / 1e5;
  return json({ t, v: v.filter(([, la, lo]) => la >= la0 && la <= la1 && lo >= lo0 && lo <= lo1).map(([id, la, lo, ts, b]) => [id, r5(la), r5(lo), ts, b === null ? null : Math.round(b)]) });
}
