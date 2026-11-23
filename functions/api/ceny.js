// Cloudflare Pages Function: ceny paliv z mBenzin.cz pro pumpy na mapě (site/pumpy.json z nastroje/pumpy.py).
// Osobní klíč je jen tady na serveru (tajná proměnná MBENZIN_KLIC, lokálně .dev.vars), do prohlížeče se nedostane.
// mBenzin vrací pro jedno palivo celou republiku (cenová mapa: /Mapa-cen/data?fuel=…, klíč v hlavičce X-Mbenzin-Klic);
// funkce si z toho nechá jen stanice v okolí pump na mapě, takže data celé republiky dál nešíří.
// Limit klíče je 20 stránek za hodinu: stahuje se po 6 h, 4 paliva = 16 dotazů denně za všechny návštěvníky.
// Uložení: KV UZAVIRKY_KV (společné pro všechna datacentra), bez něj Cache API. Starší data se vrací, dokud se
// na pozadí stahují nová; po HTTP 429 se čeká podle Retry-After (nejvýš 24 h). Podmínka mBenzinu: u cen viditelně
// „Ceny: mbenzin.cz“ jako odkaz (dělá prohlížeč, web/ceny_paliv.js).
const ZDROJ = 'https://www.mbenzin.cz/Mapa-cen/data';
const PALIVA = { n95: '95', benzinplus: '98', diesel: 'nafta', lpg: 'lpg' };
const CERSTVE = 6 * 3600e3, MAX_STARI = 7 * 86400e3, OKRAJ = 0.02;      // okraj kolem pump ve stupních (~2 km)
const KLIC_KV = 'ceny_mbenzin', UA = 'izomapa-ceny/1.0 (+https://github.com/adamklatovsky/izomapa)';

const json = (d, status = 200, extra = {}) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

async function nacti(env) {
  if (env.UZAVIRKY_KV) { try { return JSON.parse((await env.UZAVIRKY_KV.get(KLIC_KV)) || 'null'); } catch { return null; } }
  const r = await caches.default.match(new Request('https://izomapa.internal/ceny_mbenzin'));
  return r ? r.json() : null;
}
async function uloz(env, d) {
  const telo = JSON.stringify(d);
  if (env.UZAVIRKY_KV) return env.UZAVIRKY_KV.put(KLIC_KV, telo);
  return caches.default.put(new Request('https://izomapa.internal/ceny_mbenzin'), new Response(telo, { headers: { 'cache-control': `public, max-age=${7 * 86400}` } }));
}

// obdélník kolem pump na mapě (statický site/pumpy.json)
async function obdelnik(request, env) {
  const r = env.ASSETS ? await env.ASSETS.fetch(new URL('/pumpy.json', request.url)) : await fetch(new URL('/pumpy.json', request.url));
  if (!r.ok) return null;
  const st = ((await r.json()).stanice || []).filter((p) => p.druh === 'pumpa');
  if (!st.length) return null;
  const la = st.map((p) => p.lat), lo = st.map((p) => p.lon);
  return [Math.min(...la) - OKRAJ, Math.max(...la) + OKRAJ, Math.min(...lo) - OKRAJ, Math.max(...lo) + OKRAJ];
}

async function stahni(env, bb, stare) {
  const st = new Map();
  for (const [kod, pal] of Object.entries(PALIVA)) {
    const u = new URL(ZDROJ); u.searchParams.set('fuel', kod); u.searchParams.set('ccs', '0');
    const r = await fetch(u, { headers: { 'X-Mbenzin-Klic': env.MBENZIN_KLIC, 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) {
      const s = Math.min(86400, Math.max(600, parseInt(r.headers.get('retry-after') || '', 10) || 3 * 3600));
      await uloz(env, { ...(stare || {}), pockat_do: Date.now() + s * 1000 });
      throw new Error('mBenzin: příliš mnoho dotazů (429)');
    }
    if (!r.ok) throw new Error(`mBenzin HTTP ${r.status}`);
    let d; try { d = await r.json(); } catch { throw new Error('mBenzin: odpověď není JSON (klíč nepřijat?)'); }
    for (const m of (d && d.markers) || []) {
      if (typeof m.lat !== 'number' || typeof m.lng !== 'number' || typeof m.price !== 'number' || !isFinite(m.price)) continue;
      if (m.lat < bb[0] || m.lat > bb[1] || m.lng < bb[2] || m.lng > bb[3] || m.price < 5 || m.price > 100) continue;
      const id = String(m.id).slice(0, 12);
      const o = st.get(id) || { id, lat: m.lat, lng: m.lng, nazev: String(m.name || '').slice(0, 80), sit: String(m.chain || '').slice(0, 60),
        adresa: String(m.addr || '').slice(0, 120), url: /^\/[\w\-/.%]*$/.test(m.url || '') ? 'https://www.mbenzin.cz' + m.url : 'https://www.mbenzin.cz', ceny: {}, aktualizace: {} };
      o.ceny[pal] = Math.round(m.price * 100) / 100; o.aktualizace[pal] = String(m.fresh || '').slice(0, 20);
      st.set(id, o);
    }
  }
  const d = { stazeno: Date.now(), bb, stanice: [...st.values()] };
  await uloz(env, d);
  return d;
}

let bezi = null;                                                     // jedno stahování na instanci najednou

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.MBENZIN_KLIC) return json({ chyba: 'chybí MBENZIN_KLIC', stanice: [] }, 200, { 'cache-control': 'no-store' });
  const bb = await obdelnik(request, env);
  if (!bb) return json({ chyba: 'chybí pumpy.json', stanice: [] }, 200, { 'cache-control': 'no-store' });
  let d = await nacti(env);
  const stejne = d && d.bb && d.bb.every((v, i) => Math.abs(v - bb[i]) < 1e-6);
  const muze = !d || !d.pockat_do || Date.now() > d.pockat_do;
  const stare = !d || !d.stazeno || !stejne || Date.now() - d.stazeno > CERSTVE;
  if (stare && muze) {
    // po jakékoli chybě (5xx, odmítnutý klíč, výpadek) 45 min pauza pro všechny, ať se limit klíče nevyčerpá opakováním
    const uloha = bezi || (bezi = stahni(env, bb, d).catch(async (e) => {
      console.log(String(e));
      const nyni = await nacti(env);
      if (!nyni || !nyni.pockat_do || nyni.pockat_do < Date.now()) await uloz(env, { ...(nyni || d || {}), pockat_do: Date.now() + 45 * 60e3 });
      return null;
    }).finally(() => { bezi = null; }));
    if (d && d.stazeno && stejne && Date.now() - d.stazeno < MAX_STARI) waitUntil(uloha);   // starší data hned, nová na pozadí
    else d = (await uloha) || d;
  }
  if (!d || !d.stazeno || Date.now() - d.stazeno > MAX_STARI) return json({ chyba: 'ceny nejsou k dispozici', stanice: [] }, 200, { 'cache-control': 'public, max-age=300' });
  return json({ stazeno: new Date(d.stazeno).toISOString(), zdroj: { nazev: 'mbenzin.cz', url: 'https://www.mbenzin.cz' }, stanice: d.stanice },
    200, { 'cache-control': 'public, max-age=900' });
}
